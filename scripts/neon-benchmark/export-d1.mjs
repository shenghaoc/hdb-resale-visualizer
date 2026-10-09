// Explicit read-only public-corpus export for the Neon benchmark; never reads shortlists.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
const account = "059214b3bd95f4adf743d960c23936dc";
const database = "df06858c-8fd3-4cf5-9080-dbd9a9f49250";
const target = ".neon-benchmark";
mkdirSync(target, { recursive: true });
if (existsSync(`${target}/source.sqlite`))
  throw new Error("Existing snapshot must be preserved; export is one-shot");
const authPath = [
  `${os.homedir()}/.wrangler/config/default.toml`,
  `${os.homedir()}/Library/Preferences/.wrangler/config/default.toml`,
].find(existsSync);
if (!authPath) throw new Error("Existing Wrangler authentication missing");
const auth = readFileSync(authPath, "utf8");
const token = JSON.parse(auth.match(/^oauth_token\s*=\s*(".*")/m)?.[1] ?? "null");
if (!token) throw new Error("Existing Wrangler authentication missing");
const db = new DatabaseSync(`${target}/source.sqlite`);
const evidence = {
  startedAt: new Date().toISOString(),
  database,
  readOnly: true,
  readCeiling: 1400000,
  rowsRead: 0,
  rowsWritten: 0,
  sqlMs: 0,
  responseBytes: 0,
  requests: [],
  counts: {},
};
function save() {
  writeFileSync(`${target}/d1-export-receipts.json`, JSON.stringify(evidence, null, 2));
}
async function query(sql, params = []) {
  if (!/^SELECT\b/.test(sql) || sql.includes(";") || /\bshortlists\b/i.test(sql))
    throw new Error("Read-only public SQL guard");
  if (evidence.rowsRead + 5000 > evidence.readCeiling)
    throw new Error("Read reserve reached before request");
  const started = performance.now();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = await response.text();
  const result = JSON.parse(body);
  const statement = result.result?.[0];
  evidence.requests.push({
    sql,
    params,
    at: new Date().toISOString(),
    status: response.status,
    elapsedMs: performance.now() - started,
    meta: statement?.meta ?? null,
  });
  evidence.responseBytes += Buffer.byteLength(body);
  if (!response.ok || !result.success || !statement?.success) {
    save();
    throw new Error(`D1 export rejected: HTTP ${response.status}`);
  }
  const meta = statement.meta;
  if (!Number.isFinite(meta?.rows_read) || meta.rows_written !== 0) {
    save();
    throw new Error("Incomplete or non-read-only metadata");
  }
  evidence.rowsRead += meta.rows_read;
  evidence.rowsWritten += meta.rows_written;
  evidence.sqlMs += meta.duration;
  save();
  if (evidence.rowsRead > evidence.readCeiling) throw new Error("Read ceiling exceeded");
  return statement.results;
}
try {
  const manifest = await query("SELECT json FROM manifest WHERE id=1");
  const schema = await query(
    "SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name",
  );
  for (const item of schema) if (item.sql) db.exec(item.sql);
  const tables = [
    "transactions",
    "blocks",
    "block_details",
    "comparisons",
    "town_flat_type_trends",
    "manifest",
    "mrt_geojson",
    "geocode_cache",
    "walking_time_cache",
  ];
  for (const table of tables) {
    const columns = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name);
    const insert = db.prepare(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
    );
    let cursor = 0,
      count = 0;
    const limit = table === "block_details" ? 250 : 5000;
    while (true) {
      const rows = await query(
        `SELECT rowid AS _cursor,${columns.join(",")} FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
        [cursor, limit],
      );
      db.exec("BEGIN");
      for (const row of rows) insert.run(...columns.map((c) => row[c]));
      db.exec("COMMIT");
      count += rows.length;
      if (rows.length < limit) break;
      cursor = rows.at(-1)._cursor;
      if (table === "transactions" && count % 100000 === 0)
        console.log(JSON.stringify({ table, count, reads: evidence.rowsRead }));
    }
    evidence.counts[table] = count;
    save();
    console.log(JSON.stringify({ table, count, reads: evidence.rowsRead }));
  }
  const after = await query("SELECT json FROM manifest WHERE id=1");
  if (manifest[0].json !== after[0].json)
    throw new Error("Manifest changed during export; snapshot not valid");
  if (
    evidence.counts.transactions !== 985533 ||
    evidence.counts.blocks !== 9730 ||
    evidence.counts.block_details !== 9730 ||
    evidence.counts.comparisons !== 9730
  )
    throw new Error("Production baseline count mismatch");
  evidence.manifestStable = true;
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      done: true,
      counts: evidence.counts,
      reads: evidence.rowsRead,
      writes: evidence.rowsWritten,
      sqlMs: evidence.sqlMs,
      responseBytes: evidence.responseBytes,
    }),
  );
} finally {
  db.close();
}
