// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { buildSuggestions, type SuggestDb } from "../../functions/_lib/suggest";
import { compileRuntimeRead, createNeonReadDb } from "../../worker/neon-read-db";

/**
 * /api/suggest takes "the first 20 matches" with no ORDER BY, so on D1 the answer is whatever order SQLite
 * walks the table or an index. Neon has no such order, so the shim spells it out. This runs the legacy
 * implementation against a SQLite copy of D1's schema and indexes (rows inserted the way the pipeline
 * writes them) and against the Neon shim over a database with NO suggest indexes and rows stored in a
 * scrambled order, and requires identical suggestions for every query.
 */
const TOWNS = ["ANG MO KIO", "BEDOK", "BISHAN", "JURONG EAST", "JURONG WEST", "YISHUN"];
let seed = 20261007;
const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) as number;

type Row = {
  address_key: string;
  town: string;
  block: string;
  street_name: string;
  median_price: number;
  transaction_count: number;
  postal_code: string | null;
};
function buildRows(): Row[] {
  const rows: Row[] = [];
  let postal = 100000;
  for (const town of TOWNS) {
    const streets = [
      `${town} AVE 1`,
      `${town} AVE 3`,
      `${town} ST 11`,
      `${town} ST 22`,
      `${town} CTRL 1`,
      `${town} RING RD`,
      `${town} NTH ST 5`,
      `LOR 4 ${town}`,
    ];
    for (const street of streets)
      for (let i = 0; i < 16; i++) {
        const block = String(1 + Math.floor(random() * 320)) + (random() < 0.15 ? "A" : "");
        const address_key = `${town}-${block}-${street}`.toLowerCase().replaceAll(" ", "-");
        if (rows.some((r) => r.address_key === address_key)) continue;
        rows.push({
          address_key,
          town,
          block,
          street_name: street,
          // Few distinct values on purpose: plenty of ties on (median_price, transaction_count).
          median_price: 300000 + Math.floor(random() * 12) * 25000,
          transaction_count: 1 + Math.floor(random() * 3),
          postal_code: random() < 0.04 ? null : String(postal++),
        });
      }
  }
  return rows;
}
const rows = buildRows();

const COLUMNS = `address_key TEXT PRIMARY KEY, town TEXT NOT NULL, block TEXT NOT NULL, street_name TEXT NOT NULL,
  median_price INTEGER NOT NULL, transaction_count INTEGER NOT NULL, postal_code TEXT`;
function load(db: DatabaseSync, ordered: Row[]) {
  db.exec(`CREATE TABLE blocks (${COLUMNS})`);
  const insert = db.prepare("INSERT INTO blocks VALUES (?,?,?,?,?,?,?)");
  for (const r of ordered)
    insert.run(
      r.address_key,
      r.town,
      r.block,
      r.street_name,
      r.median_price,
      r.transaction_count,
      r.postal_code,
    );
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// D1 as deployed: migrations 0001/0005/0006 indexes, rows in pipeline order.
const d1 = new DatabaseSync(":memory:");
load(
  d1,
  [...rows].sort(
    (a, b) =>
      b.median_price - a.median_price ||
      b.transaction_count - a.transaction_count ||
      compare(a.address_key, b.address_key),
  ),
);
d1.exec(`CREATE INDEX idx_blocks_town ON blocks(town);
  CREATE INDEX idx_blocks_sort ON blocks(median_price DESC, transaction_count DESC);
  CREATE INDEX idx_blocks_town_nocase ON blocks(town COLLATE NOCASE);
  CREATE INDEX idx_blocks_street_name ON blocks(street_name COLLATE NOCASE);
  CREATE INDEX idx_blocks_postal_code ON blocks(postal_code COLLATE NOCASE);
  CREATE INDEX idx_blocks_block_street_nocase ON blocks((block || ' ' || street_name) COLLATE NOCASE);`);

// Stand-in for Neon: no suggest indexes, rows stored in an unrelated order.
const neon = new DatabaseSync(":memory:");
load(
  neon,
  [...rows].sort((a, b) => compare(b.address_key, a.address_key)),
);
afterAll(() => {
  d1.close();
  neon.close();
});

let limitReached = 0;
const d1Db: SuggestDb = {
  prepare: (sql) => ({
    bind: (...args) => ({
      all: async () => {
        const results = d1.prepare(sql).all(...(args as (string | number | null)[]));
        if (results.length === 20) limitReached++;
        return { results };
      },
    }),
  }),
};
const nativeSql: string[] = [];
const neonDb = createNeonReadDb(async (sql, params) => {
  nativeSql.push(sql);
  const sqlite = sql
    .replaceAll("public.", "")
    .replace(/\$(\d+)/g, "?$1")
    .replaceAll('COLLATE "C"', "COLLATE BINARY")
    .replaceAll(" NOT ILIKE ", " NOT LIKE ")
    .replaceAll(" ILIKE ", " LIKE ");
  return neon.prepare(sqlite).all(...(params as (string | number | null)[])) as Record<
    string,
    unknown
  >[];
}) as unknown as SuggestDb;

function queries(): string[] {
  const out = new Set<string>();
  for (const street of new Set(rows.map((r) => r.street_name.toLowerCase())))
    for (let n = 2; n <= 8; n++) out.add(street.slice(0, n).trim());
  for (const town of TOWNS)
    for (let n = 2; n <= town.length; n++) out.add(town.toLowerCase().slice(0, n).trim());
  for (const word of [
    "ave",
    "st",
    "ctrl",
    "ring",
    "rd",
    "lor",
    "nth",
    "east",
    "west",
    "mo kio",
    "bis",
    "jur",
  ])
    out.add(word);
  for (const r of rows.filter((_, i) => i % 3 === 0)) {
    out.add(r.block.toLowerCase());
    out.add(`${r.block} ${r.street_name.toLowerCase().split(" ")[0]}`.toLowerCase());
  }
  for (const code of ["10", "100", "1001", "10002", "100123", "10099", "104"]) out.add(code);
  return [...out].filter((q) => q.length >= 2);
}

describe("Neon suggest keeps the legacy D1 semantics", () => {
  const list = queries();
  const compared: { q: string; legacy: string; viaNeon: string }[] = [];
  beforeAll(async () => {
    for (const q of list)
      compared.push({
        q,
        legacy: JSON.stringify(await buildSuggestions(d1Db, q, [])),
        viaNeon: JSON.stringify(await buildSuggestions(neonDb, q, [])),
      });
  });

  it("returns exactly the legacy suggestions for every query, whatever the physical row order", () => {
    expect(compared.length).toBeGreaterThan(300);
    expect(compared.filter((c) => c.viaNeon !== c.legacy).map((c) => c.q)).toEqual([]);
    expect(compared.filter((c) => c.legacy !== "[]").length).toBeGreaterThan(250);
  });

  it("actually exercises the 20-row limit and the tie-break, so the ordering is what is being tested", () => {
    expect(limitReached).toBeGreaterThan(50);
    const ties = rows.filter(
      (row) =>
        rows.filter(
          (o) =>
            o.median_price === row.median_price && o.transaction_count === row.transaction_count,
        ).length > 3,
    );
    expect(ties.length).toBeGreaterThan(50);
  });

  it("sends explicit, deterministic native SQL for every legacy suggest query", () => {
    expect(new Set(nativeSql).size).toBeGreaterThanOrEqual(6);
    for (const sql of new Set(nativeSql)) {
      expect(sql).toMatch(/ORDER BY .* LIMIT 20$/);
      expect(sql).toContain("ILIKE");
      expect(sql).not.toMatch(/(?<!I)LIKE/);
      expect(sql).toContain("public.blocks");
    }
  });

  it("still refuses suggest-shaped SQL that is not exactly the legacy text", () => {
    for (const sql of [
      "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' LIMIT 21",
      "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' LIMIT 20; DROP TABLE blocks",
      "SELECT DISTINCT town, lat FROM blocks WHERE town LIKE ? ESCAPE '\\' LIMIT 20",
    ])
      expect(() => compileRuntimeRead(sql, ["jur%"])).toThrow();
    expect(() =>
      compileRuntimeRead(
        "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' LIMIT 20",
        [],
      ),
    ).toThrow();
  });
});
