/** Local PG18 only: reconstruct retained current-head facts, then measure actual handler reads. */
import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import {
  CREATE_STAGE_SQL,
  COPY_STAGE_SQL,
  STAGE_UNIQUE_SQL,
  STAGE_TABLES,
  STAGE_DESCRIPTOR,
  stageKeyJoin,
  stagedDml,
} from "./staged-plan";
import { localWitness, localTables } from "./local-pg18.mts";
import { createNeonReadDb } from "../../worker/neon-read-db";
import { onRequestPost } from "../../functions/api/comparable-transactions";

const root = ".neon-benchmark/comparable-local";
mkdirSync(root, { recursive: true });
const evidence: Record<string, unknown> = {
  startedAtUTC: new Date().toISOString(),
  remoteSQL: 0,
  target: "local container hdb-neon-comparable-pg / 192.168.64.63:5432/hdb_verify",
  sourceState: "retained baseline plus verified current-head stage",
};
const save = () =>
  writeFileSync(`${root}/measurement.json`, JSON.stringify(evidence, null, 2) + "\n");
const password = readFileSync(".neon-benchmark/local-pg18.env", "utf8")
  .split("\n")
  .find((s) => s.startsWith("POSTGRES_PASSWORD="))
  ?.slice(18);
if (!password) throw Error("Missing test-only local credential");
const c = new pg.Client({
  // Address verified from this investigation's dedicated Apple container, not a provider endpoint.
  host: "192.168.64.63",
  port: 5432,
  database: "hdb_verify",
  user: "postgres",
  password,
  application_name: "hdb-comparable-local-only",
  statement_timeout: 120000,
});
const remote = JSON.parse(
  readFileSync(".neon-benchmark/portability-proof/remote-run.json", "utf8"),
);
await c.connect();
try {
  const existing = (await c.query("SELECT to_regclass('public.transactions') AS t")).rows[0].t;
  if (!existing) {
    await c.query(readFileSync("scripts/neon-benchmark/schema.sql", "utf8"));
    const source = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
    try {
      for (const table of localTables.filter((s) => s !== "shortlists")) {
        const columns = source
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((r) => String(r.name));
        const csv = (v: unknown) => {
          if (v === null) return "";
          if (typeof v !== "string" && typeof v !== "number")
            throw Error("Unexpected SQLite scalar");
          return `"${String(v).replaceAll('"', '""')}"`;
        };
        function* rows() {
          let buffer = "";
          for (const row of source.prepare(`SELECT ${columns.join(",")} FROM ${table}`).iterate()) {
            buffer += columns.map((k) => csv(row[k])).join(",") + "\n";
            if (buffer.length > 65536) {
              yield buffer;
              buffer = "";
            }
          }
          if (buffer) yield buffer;
        }
        await pipeline(
          Readable.from(rows()),
          c.query(
            copyFrom(`COPY public.${table}(${columns.join(",")}) FROM STDIN WITH(FORMAT csv)`),
          ),
        );
        console.log(`Local fixture loaded: ${table}`);
      }
    } finally {
      source.close();
    }
    await c.query("BEGIN");
    try {
      await c.query(CREATE_STAGE_SQL);
      await c.query(STAGE_UNIQUE_SQL);
      await pipeline(
        createReadStream(".neon-benchmark/local-pg18/stage.copy-text"),
        c.query(copyFrom(COPY_STAGE_SQL)),
      );
      await c.query("ANALYZE pg_temp.neon_publication_stage");
      for (const table of STAGE_TABLES)
        for (const op of ["insert", "update"] as const) {
          const planned = (
            await c.query(
              "SELECT count(*)::int AS n FROM pg_temp.neon_publication_stage WHERE item->>'table'=$1 AND item->>'operation'=$2",
              [table, op],
            )
          ).rows[0].n;
          if (planned) {
            const receipt = (await c.query(stagedDml(table, op))).rows[0];
            if (Number(receipt.affected_rows) !== planned || !receipt.results_match)
              throw Error("Local retained-stage mismatch");
          }
        }
      const manifest =
        typeof remote.afterSuccess.manifest === "string"
          ? remote.afterSuccess.manifest
          : JSON.stringify(remote.afterSuccess.manifest);
      await c.query("UPDATE manifest SET json=$1::jsonb,updated_at=$2 WHERE id=1", [
        manifest,
        JSON.parse(manifest).generatedAt,
      ]);
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    }
    await c.query("ANALYZE");
  }
  evidence.witness = await localWitness(c);
  // Compare precisely the same affected-key witness as the saved successful remote publication.
  const items = JSON.parse(readFileSync(".neon-benchmark/local-pg18/stageItems.json", "utf8")) as {
    table: string;
    key: unknown;
  }[];
  const keyItems = items.map(({ table, key }) => ({ table, key }));
  const witnessParts = STAGE_TABLES.map(
    (table) =>
      `SELECT '${table}' AS table_name,count(b.${STAGE_DESCRIPTOR[table].keys[0]}) AS present,encode(sha256(convert_to(COALESCE(string_agg(b.row_hash,E'\\n' ORDER BY ${STAGE_DESCRIPTOR[table].keys[0] === "address_key" ? "(s.item->'key')::text COLLATE \"C\"" : "s.item->'key'"}),'empty'),'UTF8')),'hex') AS row_set_sha256 FROM keys s LEFT JOIN LATERAL (SELECT b.${STAGE_DESCRIPTOR[table].keys[0]},encode(sha256(convert_to(to_jsonb(b)::text,'UTF8')),'hex') AS row_hash FROM public.${table} b WHERE ${stageKeyJoin(table)}) b ON true WHERE s.item->>'table'='${table}'`,
  ).join(" UNION ALL ");
  evidence.remoteAffectedWitness = (
    await c.query(
      `WITH keys AS (SELECT value AS item FROM jsonb_array_elements($1::jsonb)),w AS (${witnessParts}) SELECT table_name,present,row_set_sha256 FROM w ORDER BY table_name`,
      [JSON.stringify(keyItems)],
    )
  ).rows;
  const normalizeWitness = (value: unknown) =>
    JSON.stringify(
      (value as { table_name: string; present: unknown; row_set_sha256: string }[])
        .map((r) => ({
          table_name: r.table_name,
          present: Number(r.present),
          row_set_sha256: r.row_set_sha256,
        }))
        .sort((a, b) => a.table_name.localeCompare(b.table_name)),
    );
  evidence.remoteAffectedWitnessMatches =
    normalizeWitness(evidence.remoteAffectedWitness) ===
    normalizeWitness(remote.afterSuccess.witness);
  save();
  if (!evidence.remoteAffectedWitnessMatches)
    throw Error("Local current-head affected-row witness differs from saved remote state");
  const tx = (evidence.witness as Record<string, { rows: number }>).transactions.rows;
  if (tx !== 988128) throw Error("Local current-head fixture is not verified 988128 state");
  evidence.manifest = (
    await c.query(
      "SELECT encode(sha256(convert_to(json::text,'UTF8')),'hex') AS sha256 FROM manifest",
    )
  ).rows[0];
  evidence.engine = (
    await c.query(
      "SELECT version() AS version,pg_database_size(current_database())::text AS database_bytes",
    )
  ).rows[0];
  const scenarios = (
    await c.query(`WITH b AS (SELECT town,block,street_name,flat_type,count(*) AS n FROM transactions GROUP BY 1,2,3,4),
    s AS (SELECT street_name,flat_type,count(*) AS n FROM transactions GROUP BY 1,2)
    SELECT DISTINCT ON (scope) scope,b.* FROM b JOIN s USING(street_name,flat_type)
    CROSS JOIN LATERAL (SELECT CASE WHEN b.n>=8 THEN 'block' WHEN s.n>=8 THEN 'street' ELSE 'town' END AS scope) x
    ORDER BY scope,b.n DESC`)
  ).rows;
  scenarios.push({
    scope: "empty",
    town: "UNKNOWN",
    block: "none",
    street_name: "none",
    flat_type: "4 ROOM",
  });
  const measured = [];
  for (const sample of scenarios)
    for (const adjust of [false, true]) {
      const queries: {
        sql: string;
        params: readonly unknown[];
        rows: number;
        jsonBytes: number;
        wallMs: number;
        plan?: unknown;
      }[] = [];
      let queryTail: Promise<unknown> = Promise.resolve();
      const query = (sql: string, params: readonly unknown[]) => {
        const operation = queryTail.then(async () => {
          const began = performance.now();
          const rows = (await c.query(sql, [...params])).rows;
          queries.push({
            sql,
            params,
            rows: rows.length,
            jsonBytes: Buffer.byteLength(JSON.stringify(rows)),
            wallMs: performance.now() - began,
          });
          return rows;
        });
        queryTail = operation.catch(() => undefined);
        return operation;
      };
      const body = JSON.stringify({
        town: sample.town,
        block: sample.block,
        streetName: sample.street_name,
        flatType: sample.flat_type,
        storeyRange: "07 TO 09",
        floorAreaSqm: 93,
        leaseCommenceYear: 1990,
        referenceMonth: "2026-09",
      });
      const socket = (c as unknown as { connection: { stream: { bytesRead: number } } }).connection
        .stream;
      const initial = socket.bytesRead;
      const start = performance.now();
      await c.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const response = await onRequestPost({
        request: new Request(
          `https://local/api/comparable-transactions${adjust ? "?adjust=time" : ""}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "content-length": String(Buffer.byteLength(body)),
            },
            body,
          },
        ),
        env: { DB: createNeonReadDb(query) },
        params: {},
        data: {},
        waitUntil: () => {},
        next: async () => new Response(),
      } as unknown as Parameters<typeof onRequestPost>[0]);
      await c.query("COMMIT");
      const wallMs = performance.now() - start;
      const receivedBytes = socket.bytesRead - initial;
      const result = (await response.json()) as {
        comparables: unknown[];
        sameBlockCount: number;
        sameStreetCount: number;
        sameTownCount: number;
      };
      for (const q of queries)
        q.plan = (
          await c.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + q.sql, [...q.params])
        ).rows[0]["QUERY PLAN"][0];
      measured.push({
        scope: sample.scope,
        adjust,
        wallMs,
        receivedBytes,
        status: response.status,
        appSQL: queries.length,
        controlSQL: 2,
        returnedComparables: result.comparables.length,
        counts: [result.sameBlockCount, result.sameStreetCount, result.sameTownCount],
        queries,
      });
      save();
    }
  evidence.scenarios = measured;
  // Whole-corpus engineering upper bound: any selected 150 facts and up to 30 full trend histories.
  const bounds = (
    await c.query(`WITH tx AS (
    SELECT octet_length(row_to_json(t)::text) AS bytes FROM transactions t ORDER BY bytes DESC LIMIT 150),
    tr AS (SELECT town,flat_type,sum(octet_length(row_to_json(t)::text)) AS bytes,count(*) AS rows FROM
      (SELECT town,flat_type,month,median_price_per_sqm,transaction_count FROM town_flat_type_trends) t
      GROUP BY 1,2 ORDER BY bytes DESC LIMIT 30)
    SELECT (SELECT sum(bytes)::text FROM tx) AS transaction_json_upper,
      (SELECT sum(bytes)::text FROM tr) AS trend_json_upper,(SELECT sum(rows)::text FROM tr) AS trend_rows_upper`)
  ).rows[0];
  evidence.currentCorpusBounds = {
    ...bounds,
    countQueries: 3,
    countRows: 3,
    transactionRows: 150,
    trendPairs: 30,
    protocolAndManifestReserveBytes: 100000,
    totalBytes: Number(bounds.transaction_json_upper) + Number(bounds.trend_json_upper) + 100000,
  };
  evidence.completedAtUTC = new Date().toISOString();
  evidence.artifactSHA256 = Object.fromEntries(
    [
      "scripts/neon-benchmark/schema.sql",
      ".neon-benchmark/local-pg18/stage.copy-text",
      "worker/neon-read-db.ts",
    ].map((p) => [p, createHash("sha256").update(readFileSync(p)).digest("hex")]),
  );
  save();
  console.log(
    JSON.stringify({
      rows: tx,
      scenarios: measured.map(
        ({ scope, adjust, wallMs, receivedBytes, appSQL, returnedComparables }) => ({
          scope,
          adjust,
          wallMs,
          receivedBytes,
          appSQL,
          returnedComparables,
        }),
      ),
      bounds: evidence.currentCorpusBounds,
    }),
  );
} finally {
  await c.end();
}
