import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { onRequestPost } from "../../functions/api/comparable-transactions";
import type { PublicData } from "../../functions/_lib/public-data";
import { createPublicReadScope } from "../../worker/public-read-backend";
import { createD1PublicData } from "../../worker/public-data-d1";
import { createNeonPublicData } from "../../worker/public-data-neon";

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
function fixture() {
  const source = new DatabaseSync(":memory:");
  opened.push(source);
  source.exec(`CREATE TABLE transactions(id INTEGER PRIMARY KEY,month TEXT,town TEXT,block TEXT,
    street_name TEXT,address_key TEXT,flat_type TEXT,storey_range TEXT,floor_area_sqm REAL,
    lease_commence_year INTEGER,resale_price REAL,flat_model TEXT);
    CREATE INDEX tx_block_flat_month ON transactions(town,block,flat_type,month DESC);
    CREATE INDEX tx_street_flat_month ON transactions(street_name,flat_type,month DESC);
    CREATE INDEX tx_town_flat_month ON transactions(town,flat_type,month DESC);
    CREATE TABLE town_flat_type_trends(town TEXT,flat_type TEXT,month TEXT,
      median_price_per_sqm REAL,transaction_count INTEGER);`);
  const insert = source.prepare("INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  let id = 1;
  for (const [town, block, street, count] of [
    ["BEDOK", "1", "BEDOK NORTH", 20],
    ["BEDOK", "2", "BEDOK NORTH", 4],
    ["BEDOK", "3", "RARE STREET", 3],
    ["YISHUN", "4", "YISHUN RING", 160],
  ] as const)
    for (let i = 0; i < count; i++)
      insert.run(
        id++,
        "2026-09",
        town,
        block,
        street,
        `${block}-${street}`,
        "4 ROOM",
        "07 TO 09",
        93,
        1990,
        500000.75,
        "Model A",
      );
  for (const town of ["BEDOK", "YISHUN"])
    for (const [month, price] of [
      ["2026-08", 5000],
      ["2026-09", 5500],
    ] as const)
      source
        .prepare("INSERT INTO town_flat_type_trends VALUES(?,?,?,?,?)")
        .run(town, "4 ROOM", month, price, 10);
  const d1 = {
    prepare: (sql: string) => {
      const statement = (params: unknown[]) => ({
        bind: (...bindings: unknown[]) => statement(bindings),
        first: async () =>
          source.prepare(sql).get(...(params as (string | number | null)[])) ?? null,
        all: async () => ({
          results: source.prepare(sql).all(...(params as (string | number | null)[])),
        }),
      });
      return statement([]);
    },
  } as unknown as D1Database;
  const native = vi.fn(async (sql: string, params: readonly unknown[]) => {
    const testSql = sql
      .replaceAll("public.", "")
      .replaceAll("::integer", "")
      .replace(/\$(\d+)/g, "?$1")
      .replaceAll('COLLATE "C"', "COLLATE BINARY");
    const rows = source.prepare(testSql).all(...(params as (string | number | null)[]));
    return rows.map((r) => ({ ...r, ...("id" in r ? { id: String(r.id) } : {}) }));
  });
  return { d1, sqlite: createD1PublicData(d1), native, neon: createNeonPublicData(native) };
}
const candidate = {
  town: "BEDOK",
  block: "1",
  streetName: "BEDOK NORTH",
  flatType: "4 ROOM",
  storeyRange: "07 TO 09",
  floorAreaSqm: 93,
  leaseCommenceYear: 1990,
  referenceMonth: "2026-09",
};
async function invoke(
  publicData: PublicData,
  changes: Partial<typeof candidate> = {},
  adjust = false,
) {
  const body = JSON.stringify({ ...candidate, ...changes });
  return onRequestPost({
    request: new Request(
      `https://test/api/comparable-transactions${adjust ? "?adjust=time" : ""}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(body.length) },
        body,
      },
    ),
    params: {},
    publicData,
  } as unknown as Parameters<typeof onRequestPost>[0]);
}

describe("faithful Neon comparable reads", () => {
  // The handler reads the three scope counts, then every non-empty narrower scope whose rows the
  // recency LIMIT could otherwise drop, so quiet blocks keep their own evidence. At most
  // 3 counts + 3 scope reads + 1 trend read = 7 SELECTs (9 commands with BEGIN/COMMIT).
  it.each([
    ["block", {}, false, 4],
    ["street, quiet block merged in", { block: "2" }, false, 5],
    ["town, quiet block and street merged in", { block: "3", streetName: "RARE STREET" }, false, 6],
    ["street without any block rows", { block: "9" }, false, 4],
    ["town without block or street rows", { block: "9", streetName: "NO SUCH STREET" }, false, 4],
    ["empty", { town: "UNKNOWN", block: "none", streetName: "none" }, true, 3],
    ["time adjustment", {}, true, 5],
    ["all scopes merged with time adjustment", { block: "3", streetName: "RARE STREET" }, true, 7],
    ["150-row boundary", { town: "YISHUN", block: "4", streetName: "YISHUN RING" }, true, 5],
  ] as const)(
    "preserves the %s response against SQLite",
    async (_name, changes, adjust, queries) => {
      const f = fixture();
      const expected = await invoke(f.sqlite, changes, adjust);
      const actual = await invoke(f.neon, changes, adjust);
      expect(actual.status).toBe(expected.status);
      expect(await actual.json()).toEqual(await expected.json());
      expect(actual.headers.get("cache-control")).toContain("no-store");
      expect(f.native).toHaveBeenCalledTimes(queries);
    },
  );
  it("keeps duplicate-looking occurrences with distinct stable IDs", async () => {
    const f = fixture();
    const body = (await (await invoke(f.neon)).json()) as {
      comparables: { transactionId: string }[];
      sameBlockCount: number;
    };
    expect(body.sameBlockCount).toBe(20);
    expect(body.comparables.map((c) => c.transactionId)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    );
  });
  it("preserves the trend-failure caveat and raw comparable fallback", async () => {
    const f = fixture();
    const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
      if (sql.includes("town_flat_type_trends")) throw Error("Controlled trend failure");
      return f.native(sql, params);
    });
    const body = await (await invoke(createNeonPublicData(query), {}, true)).json();
    expect(body).toMatchObject({
      adjustmentApplied: false,
      adjustmentCaveats: ["Time adjustment could not be applied — trend data query failed."],
    });
  });
  it("rejects invalid input before any native SQL", async () => {
    const f = fixture();
    expect((await invoke(f.neon, { floorAreaSqm: -1 })).status).toBe(400);
    expect(f.native).not.toHaveBeenCalled();
  });
  it("binds every request value, and reads nothing for an empty trend request", async () => {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const neon = createNeonPublicData(async (sql, params) => {
      calls.push({ sql, params });
      return [];
    });
    const hostile = "x' OR 1=1; DELETE FROM manifest --";
    await neon.countTransactions({ kind: "town", town: hostile, flatType: "4 ROOM" });
    await neon.recentTransactions({ kind: "street", streetName: hostile, flatType: hostile });
    await neon.trendHistory([{ town: hostile, flatType: "4 ROOM" }]);
    expect(calls).toHaveLength(3);
    for (const { sql, params } of calls) {
      expect(sql).not.toContain("OR 1=1");
      expect(sql).toMatch(/^SELECT /);
      expect(params).toContain(hostile);
    }
    expect(calls[1]?.sql).toMatch(/ LIMIT 150$/);
    calls.length = 0;
    expect(await neon.trendHistory([])).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("captures the backend for all public reads and restores every read to D1 on rollback", async () => {
    const f = fixture();
    const snapshot = vi.fn(async <T>(respond: () => Promise<T>) => respond());
    const env = {
      DB: f.d1,
      PUBLIC_DATA_BACKEND: "neon",
      HDB_PUBLIC_NEON: { connectionString: "test" },
    } as Env;
    const scope = createPublicReadScope(env, () => ({
      query: f.native,
      snapshot: <T>(respond: () => Promise<T>) => snapshot(respond) as Promise<T>,
      close: async () => {},
    }));
    env.PUBLIC_DATA_BACKEND = "d1";
    await scope.comparableSnapshot(() => invoke(scope.data));
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(f.native).toHaveBeenCalledTimes(4);
    expect(scope.backend).toBe("neon");
    f.native.mockClear();
    const rollback = createPublicReadScope(env, () => {
      throw Error("Neon must not open");
    });
    const rolledBack = await invoke(rollback.data);
    expect(f.native).not.toHaveBeenCalled();
    expect(rollback.backend).toBe("d1");
    // Served from the D1 binding: the same response the D1 implementation gives directly.
    expect(await rolledBack.json()).toEqual(await (await invoke(f.sqlite)).json());
  });
});
