/** Local verification only. No URLs, environment database selection, or remote credentials. */
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";

export const localTables = [
  "transactions",
  "blocks",
  "block_details",
  "comparisons",
  "town_flat_type_trends",
  "manifest",
  "mrt_geojson",
  "geocode_cache",
  "walking_time_cache",
  "shortlists",
];
export const localRoot = ".neon-benchmark/local-pg18";
function localPassword() {
  const password = readFileSync(".neon-benchmark/local-pg18.env", "utf8")
    .split("\n")
    .find((l) => l.startsWith("POSTGRES_PASSWORD="))
    ?.slice(18);
  if (!password) throw Error("Missing isolated test-only credential");
  return password;
}
export function localClient(user = "hdb_local_ingestion") {
  return new pg.Client({
    host: "127.0.0.1",
    port: 55432,
    database: "hdb_verify",
    user,
    password: localPassword(),
    ssl: false,
    connectionTimeoutMillis: 10000,
    application_name: "hdb-local-pg18-verification",
    statement_timeout: 120000,
  });
}
export function localSave(name: string, data: unknown) {
  writeFileSync(`${localRoot}/${name}.json`, JSON.stringify(data, null, 2) + "\n");
}
export async function localWitness(client: pg.Client) {
  const result: Record<string, unknown> = {};
  for (const table of localTables) {
    // Includes every row and column. Byte text is PostgreSQL-native on one pinned engine.
    result[table] = (
      await client.query(`SELECT count(*)::int AS rows,
      encode(sha256(convert_to(COALESCE(string_agg(leaf,',' ORDER BY leaf),''),'UTF8')),'hex') AS sha256
      FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS leaf
        FROM public.${table} t) x`)
    ).rows[0];
  }
  return result;
}
export async function seedLocal() {
  mkdirSync(localRoot, { recursive: true });
  const c = localClient("postgres"),
    source = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
  const evidence: Record<string, unknown> = {
    startedAtUTC: new Date().toISOString(),
    target: "localhost:55432/hdb_verify",
    remoteCalls: 0,
    tables: [],
  };
  await c.connect();
  try {
    const identity = (
      await c.query(
        "SELECT version(),current_database(),inet_server_addr()::text AS address,current_user,pg_postmaster_start_time() AS started",
      )
    ).rows[0];
    if (
      identity.current_database !== "hdb_verify" ||
      identity.current_user !== "postgres" ||
      !identity.version.startsWith("PostgreSQL 18.")
    )
      throw Error("Local engine identity mismatch");
    evidence.engine = identity;
    if ((await c.query("SELECT to_regclass('public.transactions') AS existing")).rows[0].existing)
      throw Error(
        "Local seeded database already exists; preserve it and run verification separately",
      );
    await c.query(readFileSync("scripts/neon-benchmark/schema.sql", "utf8"));
    const csv = (v: unknown) =>
      v === null || v === undefined ? "" : `"${String(v).replaceAll('"', '""')}"`;
    for (const table of localTables.filter((t) => t !== "shortlists")) {
      const columns = source
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => String(r.name));
      let bytes = 0,
        rows = 0;
      const began = performance.now();
      function* data() {
        let buffer = "";
        for (const row of source.prepare(`SELECT ${columns.join(",")} FROM ${table}`).iterate()) {
          const line = columns.map((k) => csv(row[k])).join(",") + "\n";
          bytes += Buffer.byteLength(line);
          rows++;
          buffer += line;
          if (buffer.length >= 65536) {
            yield buffer;
            buffer = "";
          }
        }
        if (buffer) yield buffer;
      }
      await pipeline(
        Readable.from(data()),
        c.query(copyFrom(`COPY public.${table}(${columns.join(",")}) FROM STDIN WITH(FORMAT csv)`)),
      );
      const record = { table, rows, bytes, wallMs: performance.now() - began };
      (evidence.tables as unknown[]).push(record);
      localSave("setup", evidence);
      console.log(JSON.stringify(record));
    }
    await c.query(
      "SELECT setval(pg_get_serial_sequence('transactions','id'),(SELECT max(id) FROM transactions),true)",
    );
    // Only this ephemeral local server receives a test role. No remote privilege changes.
    const roleSQL = (
      await c.query(
        "SELECT format('CREATE ROLE hdb_local_ingestion LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',$1::text) AS sql",
        [localPassword()],
      )
    ).rows[0].sql;
    await c.query(roleSQL);
    await c.query(
      "GRANT USAGE ON SCHEMA public TO hdb_local_ingestion; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO hdb_local_ingestion; GRANT TEMPORARY ON DATABASE hdb_verify TO hdb_local_ingestion",
    );
    await c.query("ANALYZE");
    evidence.databaseBytes = Number(
      (await c.query("SELECT pg_database_size(current_database()) AS bytes")).rows[0].bytes,
    );
    evidence.finishedAtUTC = new Date().toISOString();
    localSave("setup", evidence);
  } finally {
    source.close();
    await c.end();
  }
}
