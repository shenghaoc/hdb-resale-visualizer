import { connect, save } from "./common.mjs";
import { planTransactionDelta, type StoredTransaction } from "../lib/sync/incremental";
const { client, connectionMs } = await connect();
const evidence: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  connectionMs,
  queryCount: 0,
  returnedPayloadBytes: 0,
  rowsByTable: {},
};
const records: {
  table: string;
  queries: number;
  rows: number;
  wallMs: number;
  jsonBytes: number;
}[] = [];
const started = performance.now();
const receivedBefore = (client.connection.stream as import("node:net").Socket).bytesRead;
try {
  await client.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
  const statsBefore = (
    await client.query(
      "SELECT COALESCE(sum(total_exec_time),0) AS sql_ms FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND userid=(SELECT usesysid FROM pg_user WHERE usename=current_user)",
    )
  ).rows[0];
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const rows: StoredTransaction[] = [];
  const tables = [
    "transactions",
    "blocks",
    "block_details",
    "comparisons",
    "town_flat_type_trends",
    "mrt_geojson",
    "geocode_cache",
    "walking_time_cache",
    "manifest",
  ];
  for (const table of [
    ...tables,
    ...tables.filter((t) =>
      ["blocks", "block_details", "comparisons", "town_flat_type_trends", "mrt_geojson"].includes(
        t,
      ),
    ),
  ]) {
    const t = performance.now();
    let queries = 0,
      total = 0,
      bytes = 0;
    let cursor: unknown = table === "transactions" ? 0 : "";
    const key =
      table === "transactions"
        ? "id"
        : table === "geocode_cache" || table === "walking_time_cache"
          ? "cache_key"
          : table === "mrt_geojson"
            ? "kind"
            : "address_key";
    while (true) {
      const sql =
        table === "town_flat_type_trends" || table === "manifest"
          ? `SELECT * FROM ${table}`
          : `SELECT * FROM ${table} WHERE ${key}>$1 ORDER BY ${key} LIMIT 5000`;
      const params = table === "town_flat_type_trends" || table === "manifest" ? [] : [cursor];
      const result = await client.query(sql, params);
      queries++;
      total += result.rows.length;
      bytes += Buffer.byteLength(JSON.stringify(result.rows));
      if (table === "transactions")
        rows.push(...result.rows.map((row) => ({ ...row, id: Number(row.id) })));
      if (params.length === 0 || result.rows.length < 5000) break;
      cursor = result.rows.at(-1)[key];
    }
    records.push({ table, queries, rows: total, wallMs: performance.now() - t, jsonBytes: bytes });
    console.log(JSON.stringify(records.at(-1)));
  }
  const planStart = performance.now();
  const delta = planTransactionDelta(rows, rows);
  evidence.plannerMs = performance.now() - planStart;
  evidence.delta = { inserts: delta.inserts.length, updates: delta.updates.length };
  if (delta.inserts.length || delta.updates.length)
    throw new Error("Stored baseline idempotency failed");
  await client.query("COMMIT");
  const statsAfter = (
    await client.query(
      "SELECT COALESCE(sum(total_exec_time),0) AS sql_ms FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND userid=(SELECT usesysid FROM pg_user WHERE usename=current_user)",
    )
  ).rows[0];
  evidence.sqlMs = Number(statsAfter.sql_ms) - Number(statsBefore.sql_ms);
  evidence.sqlProvenance =
    "pg_stat_statements cumulative delta for this database and role; isolated benchmark only";
  evidence.wallMs = performance.now() - started;
  evidence.queryCount = records.reduce((s, r) => s + r.queries, 0);
  evidence.returnedPayloadBytes = records.reduce((s, r) => s + r.jsonBytes, 0);
  evidence.wireReceivedBytes =
    (client.connection.stream as import("node:net").Socket).bytesRead - receivedBefore;
  evidence.records = records;
  evidence.finishedAt = new Date().toISOString();
  evidence.limitations = [
    "Duplicate artifact reads reproduce existing read pattern; per-field artifact diff is separately exercised by publisher",
    "Application JSON and TLS stream bytes are measured proxies, not final Neon billing analytics",
  ];
  save("reconciliation", evidence);
  console.log(JSON.stringify({ ...evidence, records: undefined }));
} finally {
  await client.end();
}
