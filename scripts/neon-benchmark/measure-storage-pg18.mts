/** Local storage measurement only. Frozen publisher SQL; fixed localhost; no remote URL. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import { localClient, localWitness } from "./local-pg18.mts";
import { canonicalJson } from "../lib/sync/neon";
import { executionCodeSHA256 } from "./staged-code-identity";
import { publicationSQLSHA256 } from "./staged-publisher";
import {
  packStage,
  CREATE_STAGE_SQL,
  STAGE_UNIQUE_SQL,
  COPY_STAGE_SQL,
  STAGE_DIGEST_SQL,
  STAGE_TABLES,
  stagedDml,
  expectedModeReceipt,
  verifyMutationReceipt,
  sha256,
} from "./staged-plan";
import {
  MANIFEST_READ_SQL,
  MANIFEST_LOCK_SQL,
  INGESTION_LOCK_SQL,
  PRECONDITIONS_SQL,
  POSTCONDITIONS_SQL,
  MANIFEST_WRITE_SQL,
} from "./staged-validation";

const root = ".neon-benchmark/storage-proof";
mkdirSync(root, { recursive: true });
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const frozen = json(`${root}/frozen.json`);
const input = json(".neon-benchmark/local-pg18/local-executable-input.json");
const plan = packStage(json(".neon-benchmark/local-pg18/stageItems.json"));
if (
  executionCodeSHA256() !== frozen.codeSHA256 ||
  publicationSQLSHA256(plan) !== frozen.publisherSQLSHA256
)
  throw Error("Frozen publisher identity changed");
const settings = readFileSync("scripts/neon-benchmark/staged-publisher.ts", "utf8").match(
  /const SETTINGS_SQL = `([\s\S]*?)`;/,
)?.[1];
if (!settings) throw Error("Missing frozen settings SQL");
const retained = input.envelope.unresolvedOccurrences.map((r: { id: number; tuple: object }) => ({
  id: r.id,
  ...r.tuple,
}));
const admin = localClient("postgres"),
  observer = localClient("postgres");
await admin.connect();
await observer.connect();
const report: Record<string, unknown> = {
  startedAtUTC: new Date().toISOString(),
  target: "127.0.0.1:55432/hdb_verify",
  remoteCalls: 0,
  frozen,
  stage: { rows: plan.rows, copyBytes: plan.copyBytes, payloadBytes: plan.payloadBytes },
  scope:
    "Measurement driver executes frozen SQL and exact inputs locally. It does not modify publisher/admission guards or authorize remote execution.",
  maintenanceBetweenFailureAndSuccess: false,
  phases: [],
};
const save = () =>
  writeFileSync(`${root}/measurement.json`, JSON.stringify(report, null, 2) + "\n");
const sizesSQL = `SELECT c.relname AS name,pg_relation_size(c.oid) AS heap,
  pg_indexes_size(c.oid) AS indexes,
  CASE WHEN c.reltoastrelid=0 THEN 0 ELSE pg_total_relation_size(c.reltoastrelid) END AS toast,
  pg_total_relation_size(c.oid) AS total
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`;
async function snapshot() {
  await admin.query("SELECT pg_stat_clear_snapshot()");
  const state = (
    await admin.query(`SELECT pg_current_wal_insert_lsn()::text AS insert_lsn,
    pg_current_wal_lsn()::text AS write_lsn,pg_current_wal_flush_lsn()::text AS flush_lsn,
    pg_database_size(current_database()) AS database_bytes,
    (SELECT temp_files FROM pg_stat_database WHERE datname=current_database()) AS temp_files,
    (SELECT temp_bytes FROM pg_stat_database WHERE datname=current_database()) AS temp_bytes`)
  ).rows[0];
  return { ...state, relations: (await admin.query(sizesSQL)).rows };
}
try {
  report.engine = (
    await admin.query(`SELECT version(),current_setting('autovacuum') AS autovacuum,
    current_setting('wal_compression') AS wal_compression,current_setting('full_page_writes') AS full_page_writes,
    current_setting('default_toast_compression') AS toast_compression,current_setting('work_mem') AS work_mem,
    current_setting('checkpoint_timeout') AS checkpoint_timeout,current_setting('data_checksums') AS data_checksums`)
  ).rows[0];
  const engine = report.engine as { autovacuum: string; wal_compression: string };
  if (engine.autovacuum !== "off" || engine.wal_compression !== "off")
    throw Error("Measurement settings mismatch");
  report.baselineWitness = await localWitness(admin);
  // Before either publication only: force first-dirty-page images into raw WAL measurement.
  await admin.query("CHECKPOINT");
  report.before = await snapshot();
  save();
  for (const fail of [true, false]) {
    const name = fail ? "failed-before-manifest" : "successful-after-failure";
    const before = await snapshot(),
      c = localClient();
    await c.connect();
    const commands: object[] = [],
      explains: object[] = [];
    let reachedFault = false,
      sampledTempPeak = 0,
      maxStage = 0,
      maxPublic = 0,
      sampling = false;
    const sample = async () => {
      if (sampling) return;
      sampling = true;
      try {
        const row = (
          await observer.query("SELECT COALESCE(sum(size),0)::bigint AS bytes FROM pg_ls_tmpdir()")
        ).rows[0];
        sampledTempPeak = Math.max(sampledTempPeak, Number(row.bytes));
      } finally {
        sampling = false;
      }
    };
    const timer = setInterval(() => {
      void sample().catch(() => {});
    }, 20);
    const query = async (label: string, sql: string, params: unknown[] = []) => {
      const start = performance.now();
      let succeeded = false;
      let rows: number | null = null;
      let result;
      try {
        result = await c.query(sql, params);
        succeeded = true;
        rows = result.rowCount;
      } finally {
        commands.push({ label, rows, success: succeeded, wallMs: performance.now() - start });
      }
      if (label === "preconditions" || label === "postconditions") {
        // Extra read-only instrumentation is included in raw WAL/temp totals conservatively.
        const explain = (await c.query("EXPLAIN (ANALYZE,BUFFERS,WAL,FORMAT JSON) " + sql, params))
          .rows[0]["QUERY PLAN"][0];
        explains.push({ label, explain });
      }
      if (["stage-digest", "postconditions", "manifest-last"].includes(label)) {
        const row = result.rows[0];
        maxStage = Math.max(maxStage, Number(row.temporary_bytes));
        maxPublic = Math.max(maxPublic, Number(row.database_bytes) - Number(row.temporary_bytes));
      }
      return result;
    };
    let error = "";
    try {
      const initial = (await query("manifest-read", MANIFEST_READ_SQL)).rows[0].json;
      if (canonicalJson(initial) !== canonicalJson(input.baselineManifest))
        throw Error("Baseline manifest drift");
      await query("begin", "BEGIN");
      await query("settings", settings, ["120000ms", "5000ms", "30000ms", "600000ms"]);
      await query("create-stage", CREATE_STAGE_SQL);
      await query("stage-unique-index", STAGE_UNIQUE_SQL);
      const start = performance.now();
      const stream = c.query(copyFrom(COPY_STAGE_SQL));
      await pipeline(Readable.from([Buffer.from(plan.copyText)]), stream);
      commands.push({
        label: "copy-stage",
        rows: stream.rowCount,
        bytes: plan.copyBytes,
        wallMs: performance.now() - start,
      });
      if (stream.rowCount !== plan.rows) throw Error("COPY cardinality mismatch");
      await query("analyze-stage", "ANALYZE pg_temp.neon_publication_stage");
      await query("manifest-lock", MANIFEST_LOCK_SQL);
      await query("ingestion-locks", INGESTION_LOCK_SQL);
      const stage = (await query("stage-digest", STAGE_DIGEST_SQL)).rows[0];
      if (stage.root_sha256 !== plan.rootSHA256) throw Error("Stage digest mismatch");
      const pre = (
        await query("preconditions", PRECONDITIONS_SQL, [
          canonicalJson(retained),
          canonicalJson(input.pins.cacheInputs),
        ])
      ).rows[0];
      if (
        !pre.cache_inputs_match ||
        Number(pre.retained_mismatches) !== 0 ||
        Number(pre.maximum_transaction_id) !== 985533 ||
        sha256(canonicalJson(pre.schema_catalog)) !== input.pins.schemaCatalogSHA256 ||
        pre.target_checks.some((r: { mismatches: number }) => Number(r.mismatches) !== 0)
      )
        throw Error("Precondition mismatch");
      for (const table of STAGE_TABLES)
        for (const operation of ["insert", "update"] as const) {
          const expected = expectedModeReceipt(plan, table, operation);
          if (expected.rows)
            verifyMutationReceipt(
              (await query(`${table}-${operation}`, stagedDml(table, operation))).rows[0],
              expected,
            );
        }
      const post = (await query("postconditions", POSTCONDITIONS_SQL, [canonicalJson(retained)]))
        .rows[0];
      if (
        Number(post.retained_mismatches) !== 0 ||
        Number(post.maximum_transaction_id) !== 988128 ||
        post.target_checks.some((r: { mismatches: number }) => Number(r.mismatches) !== 0)
      )
        throw Error("Postcondition mismatch");
      if (fail) {
        reachedFault = true;
        await query("injected-server-failure", "SELECT 1/0");
      }
      const final = (
        await query("manifest-last", MANIFEST_WRITE_SQL, [
          canonicalJson(input.nextManifest),
          input.pins.targetUpdatedAtUTC,
          canonicalJson(input.baselineManifest),
        ])
      ).rows[0];
      if (canonicalJson(final.json) !== canonicalJson(input.nextManifest))
        throw Error("Final manifest mismatch");
      await query("commit", "COMMIT");
    } catch (ex) {
      error = ex instanceof Error ? ex.message : "Local measurement failure";
      await query("rollback", "ROLLBACK");
      if (!fail || !reachedFault || error !== "division by zero") throw ex;
    } finally {
      clearInterval(timer);
      await c.end();
      await observer.query("SELECT 1");
    }
    const after = await snapshot();
    const walBytes = Number(
      (
        await admin.query("SELECT pg_wal_lsn_diff($1::pg_lsn,$2::pg_lsn) AS bytes", [
          after.insert_lsn,
          before.insert_lsn,
        ])
      ).rows[0].bytes,
    );
    const witness = await localWitness(admin);
    const unchanged = canonicalJson(witness) === canonicalJson(report.baselineWitness);
    if (fail && !unchanged) throw Error("Failed phase changed visible permanent state");
    const phase = {
      name,
      reachedFault,
      error,
      before,
      after,
      walBytes,
      sampledExecutorTempPeakBytes: sampledTempPeak,
      maxStageRelationBytes: maxStage,
      maxPermanentDatabaseBytesDuringPhase: maxPublic,
      visibleBaselineUnchanged: unchanged,
      witness,
      commands,
      explains,
      commandCount: commands.length,
      extraReadOnlyExplainCount: explains.length,
      tempBytesDelta: Number(after.temp_bytes) - Number(before.temp_bytes),
      tempFilesDelta: Number(after.temp_files) - Number(before.temp_files),
    };
    (report.phases as object[]).push(phase);
    save();
    console.log(
      JSON.stringify({
        phase: name,
        walBytes,
        tempBytes: phase.tempBytesDelta,
        permanentDatabaseBytes: after.database_bytes,
        visibleBaselineUnchanged: unchanged,
        commands: commands.length,
      }),
    );
  }
  report.final = await snapshot();
  if (executionCodeSHA256() !== frozen.codeSHA256)
    throw Error("Publisher changed during measurement");
  report.finishedAtUTC = new Date().toISOString();
  report.status = "PASS LOCAL STORAGE MEASUREMENT";
  save();
} catch (ex) {
  report.status = "MEASUREMENT FAILED";
  report.error = ex instanceof Error ? ex.message : "Unknown local error";
  save();
  throw ex;
} finally {
  await observer.end();
  await admin.end();
}
