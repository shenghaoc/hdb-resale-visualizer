/** Small owned localhost fixture only; no provider credentials or remote database selection. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { isDeepStrictEqual } from "node:util";
import { compilePublicRead } from "./runtime-read-sql";
import { createPublicReadAdapter } from "./runtime-read-adapter.mjs";
import { buildSearchQuery, parseSearchRequest } from "../../functions/_lib/search";
import { townToFilename } from "../../shared/geo";

const root = ".neon-benchmark/runtime-canary";
const password = /^POSTGRES_PASSWORD=(.+)$/m.exec(
  readFileSync(`${root}/local-pg18.env`, "utf8"),
)?.[1];
if (!password) throw Error("Missing owned local fixture credential");
const client = new pg.Client({
  host: "127.0.0.1",
  port: 55439,
  database: "hdb_runtime_verify",
  user: "postgres",
  password,
  ssl: false,
  connectionTimeoutMillis: 10000,
  statement_timeout: 10000,
});
const source = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
const sqlite = new DatabaseSync(":memory:");
const tables = [
  "blocks",
  "block_details",
  "comparisons",
  "town_flat_type_trends",
  "manifest",
  "mrt_geojson",
];
const receipt: Record<string, unknown> = {
  startedAtUTC: new Date().toISOString(),
  target: "localhost:55439/hdb_runtime_verify",
  remoteCalls: 0,
  cases: [],
};
await client.connect();
try {
  const engine = (await client.query("SELECT version(), current_database()")).rows[0];
  assert.equal(engine.current_database, "hdb_runtime_verify");
  assert.match(engine.version, /^PostgreSQL 18\./);
  assert.equal(
    (await client.query("SELECT to_regclass('public.blocks') AS existing")).rows[0].existing,
    null,
  );
  receipt.engine = engine;
  await client.query("BEGIN");
  await client.query(readFileSync("scripts/neon-benchmark/schema.sql", "utf8"));
  for (const table of tables) {
    const definition = source
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (typeof definition?.sql !== "string") throw Error("Missing local source schema");
    sqlite.exec(definition.sql);
  }
  const rows = new Map<string, Record<string, unknown>>();
  for (const row of source.prepare("SELECT * FROM blocks ORDER BY address_key LIMIT 60").all())
    rows.set(String(row.address_key), row);
  for (const town of ["BEDOK", "TOA PAYOH"])
    for (const row of source
      .prepare("SELECT * FROM blocks WHERE town=? ORDER BY address_key LIMIT 8")
      .all(town))
      rows.set(String(row.address_key), row);
  const first = [...rows.values()][0];
  assert.ok(first);
  const edge = {
    ...first,
    address_key: "zz-runtime-edge",
    town: "BEDOK",
    median_price: 500000.75,
    median_price_by_flat_type_json: '{"4 ROOM":500000.75}',
    flat_types_json: '["4 ROOM"]',
    flat_models_json: '["Model A","Ä"]',
    flat_type_cohorts_json:
      '{"4 ROOM":{"transactionCount":5,"floorAreaRange":[80,110],"flatModels":["Model A","Ä"],"latestMonth":"2026-09"}}',
    nearest_mrt_json: '{"distanceMeters":900}',
    lease_commence_year: 1990,
  };
  rows.set(edge.address_key, edge);
  rows.set("zz-runtime-null", {
    ...edge,
    address_key: "zz-runtime-null",
    median_price_by_flat_type_json: null,
    flat_type_cohorts_json: null,
    nearest_mrt_json: null,
  });
  async function insert(table: string, row: Record<string, unknown>) {
    const columns = Object.keys(row);
    sqlite
      .prepare(
        `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
      )
      .run(...columns.map((k) => row[k] as string | number | null));
    await client.query(
      `INSERT INTO public.${table}(${columns.join(",")}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(",")})`,
      columns.map((k) => row[k]),
    );
  }
  for (const row of rows.values()) await insert("blocks", row);
  for (const table of ["block_details", "comparisons"])
    for (const key of [...rows.keys()].slice(0, 3)) {
      const row = source.prepare(`SELECT * FROM ${table} WHERE address_key=?`).get(key);
      if (row) await insert(table, row);
    }
  for (const row of source
    .prepare("SELECT * FROM town_flat_type_trends ORDER BY town,flat_type,month LIMIT 50")
    .all())
    await insert("town_flat_type_trends", row);
  await insert("manifest", {
    id: 1,
    json: JSON.stringify({ generatedAt: "local-runtime-v1", counts: { blocks: rows.size } }),
    updated_at: "2026-10-05T00:00:00Z",
  });
  for (const kind of ["stations", "exits"])
    await insert("mrt_geojson", {
      kind,
      json: JSON.stringify({ type: "FeatureCollection", features: [] }),
      updated_at: "2026-10-05T00:00:00Z",
    });
  const normalize = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === "string" && (k === "json" || k.endsWith("_json"))
          ? (JSON.parse(v) as unknown)
          : v,
      ]),
    );
  async function compare(name: string, sql: string, params: readonly unknown[] = []) {
    const native = compilePublicRead(sql, params);
    let expected = sqlite
      .prepare(sql)
      .all(...(params as (string | number | null)[]))
      .map(normalize);
    let actual = (await client.query(native.sql, native.params)).rows.map(normalize);
    if (sql.endsWith("ORDER BY median_price DESC, transaction_count DESC")) {
      // The existing contract has two sort keys. Equal keys have no defined cross-engine order.
      for (let i = 1; i < actual.length; i++) {
        const previous = actual[i - 1],
          current = actual[i];
        assert.ok(
          Number(previous.median_price) > Number(current.median_price) ||
            (previous.median_price === current.median_price &&
              Number(previous.transaction_count) >= Number(current.transaction_count)),
          "Defined summary sort keys",
        );
      }
      const tieOrder = (a: Record<string, unknown>, b: Record<string, unknown>) =>
        Number(b.median_price) - Number(a.median_price) ||
        Number(b.transaction_count) - Number(a.transaction_count) ||
        String(a.address_key).localeCompare(String(b.address_key));
      expected = expected.sort(tieOrder);
      actual = actual.sort(tieOrder);
    }
    if (!isDeepStrictEqual(actual, expected))
      throw Error(
        `Differential mismatch: ${name}; expected ${expected.length} rows, actual ${actual.length}`,
      );
    (receipt.cases as unknown[]).push({ name, rows: actual.length });
  }
  await compare(
    "all summaries",
    "SELECT * FROM blocks ORDER BY median_price DESC, transaction_count DESC",
  );
  await compare(
    "town summaries",
    "SELECT blocks.* FROM blocks WHERE town = ? ORDER BY median_price DESC, transaction_count DESC",
    ["BEDOK"],
  );
  await compare(
    "trend contract",
    "SELECT town, flat_type, month, median_price, median_price_per_sqm, transaction_count FROM town_flat_type_trends ORDER BY town, flat_type, month",
  );
  await compare(
    "dictionary keyset",
    "SELECT town, street_name, address_key, block, postal_code FROM blocks WHERE address_key > ? ORDER BY address_key LIMIT ?",
    [String(first.address_key), 5],
  );
  await compare(
    "cohort readiness",
    "SELECT COUNT(*) AS total_count, COUNT(NULLIF(TRIM(flat_type_cohorts_json), '')) AS populated_count FROM blocks",
  );
  for (const table of ["block_details", "comparisons"])
    await compare(table, `SELECT json FROM ${table} WHERE address_key = ?`, [
      String(first.address_key),
    ]);
  await compare("manifest", "SELECT json FROM manifest WHERE id = 1");
  for (const kind of ["stations", "exits"])
    await compare(kind, `SELECT json FROM mrt_geojson WHERE kind = '${kind}'`);
  const searches = [
    "",
    "town=BEDOK",
    "budgetMin=500000.5&budgetMax=600000",
    "flatType=4%20ROOM&budgetMin=500000.5",
    "flatType=4%20ROOM&budgetMax=500000",
    "flatModel=model+a",
    "flatModel=%C3%A4",
    "flatType=4%20ROOM&flatModel=%C3%A4",
    "areaMin=90&areaMax=105",
    "flatType=4%20ROOM&areaMin=90&areaMax=105",
    "mrtMax=1000",
    "remainingLeaseMin=50",
    "startMonth=2025-01&endMonth=2026-09",
    "flatType=4%20ROOM&startMonth=2025-01&endMonth=2026-09",
    "town=BEDOK&flatType=4%20ROOM&budgetMin=450000.5&budgetMax=600000&flatModel=model+a&areaMin=90&areaMax=105&mrtMax=1000&remainingLeaseMin=50&startMonth=2025-01&endMonth=2026-09",
  ];
  for (const query of searches) {
    const parsed = parseSearchRequest(new URL(`https://local.example/api/search?${query}`));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw Error("Invalid controlled search fixture");
    const plan = buildSearchQuery(parsed.request, 2026);
    await compare(
      `search: ${query || "all"}`,
      `SELECT blocks.* FROM blocks ${plan.whereSql} ORDER BY address_key LIMIT ?`,
      [...plan.bindings, 2001],
    );
  }
  let queryCount = 0;
  const adapter = createPublicReadAdapter(async (sql, params) => {
    queryCount++;
    return (await client.query(sql, [...params])).rows;
  }, null);
  const paths = [
    "/api/manifest",
    "/api/block-summaries",
    `/api/blocks/${townToFilename(String(first.town))}`,
    `/api/details/${String(first.address_key)}`,
    `/api/comparisons/${String(first.address_key)}`,
    "/api/mrt-stations",
    "/api/mrt-exits",
    "/api/trends/town-flat-type",
    "/api/search?town=BEDOK&flatType=4%20ROOM&budgetMax=500000",
    "/api/suggest?q=bedok",
  ];
  for (const path of paths) {
    const before = queryCount;
    const response = await adapter(new Request(`https://local.example${path}`));
    assert.equal(response.status, 200, path);
    const body: unknown = await response.json();
    assert.ok(body !== undefined);
    (receipt.cases as unknown[]).push({
      name: `actual handler ${path}`,
      status: response.status,
      queries: queryCount - before,
    });
  }
  receipt.fixture = { blocks: rows.size, trends: 50, mrtRows: 2, syntheticEdges: 2 };
  receipt.finishedAtUTC = new Date().toISOString();
  receipt.passed = true;
  writeFileSync(`${root}/local-read-verification.json`, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      passed: true,
      cases: (receipt.cases as unknown[]).length,
      fixture: receipt.fixture,
      remoteCalls: 0,
    }),
  );
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  sqlite.close();
  source.close();
  await client.end();
}
