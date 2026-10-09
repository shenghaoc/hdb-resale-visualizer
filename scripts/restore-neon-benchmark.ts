// One-time faithful baseline recovery, isolated benchmark only. Never uses D1 or Neon production.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import type { Socket } from "node:net";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import {
  canonicalJson,
  AmbiguousNeonPublicationError,
  createNeonRefreshClient,
  NEON_REFRESH_BRANCH,
  validateNeonRefreshUrl,
  readNeonSqlTime,
  safeNeonError,
} from "./lib/sync/neon";
import { checkNeonPilotBudget } from "./lib/sync/neon-usage";

const sourcePath = ".neon-benchmark/source.sqlite",
  priorPath = ".neon-benchmark/planner.sqlite";
const keys: Record<string, string[]> = {
  transactions: ["id"],
  blocks: ["address_key"],
  block_details: ["address_key"],
  comparisons: ["address_key"],
  town_flat_type_trends: ["town", "flat_type", "month"],
  mrt_geojson: ["kind"],
  geocode_cache: ["cache_key"],
  walking_time_cache: ["cache_key"],
  manifest: ["id"],
};
const source = new DatabaseSync(sourcePath, { readOnly: true });
source.prepare("ATTACH DATABASE ? AS prior").run(priorPath);
const priorManifest = JSON.parse(
  source.prepare("SELECT json FROM prior.manifest WHERE id=1").get()!.json as string,
);
const faithfulManifest = JSON.parse(
  source.prepare("SELECT json FROM main.manifest WHERE id=1").get()!.json as string,
);
const tables = Object.entries(keys).map(([table, pk]) => {
  const columns = source
    .prepare(`PRAGMA main.table_info(${table})`)
    .all()
    .map((row) => String(row.name));
  const join = pk.map((key) => `s.${key} IS p.${key}`).join(" AND ");
  const equal = columns.map((column) => `s.${column} IS p.${column}`).join(" AND ");
  const changedSql = `SELECT s.* FROM main.${table} s LEFT JOIN prior.${table} p ON ${join} WHERE p.${pk[0]} IS NULL OR NOT (${equal})`;
  const extraSql = `SELECT p.* FROM prior.${table} p LEFT JOIN main.${table} s ON ${join} WHERE s.${pk[0]} IS NULL`;
  return {
    table,
    pk,
    columns,
    changedSql,
    extraSql,
    changed: Number(source.prepare(`SELECT count(*) AS n FROM (${changedSql})`).get()!.n),
    extra: Number(source.prepare(`SELECT count(*) AS n FROM (${extraSql})`).get()!.n),
  };
});
const receipt: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  branchId: NEON_REFRESH_BRANCH,
  source: "retained faithful production public source.sqlite",
  prior: "post-synthetic planner.sqlite; not a fresh upstream snapshot",
  tables: tables.map(({ table, changed, extra }) => ({
    table,
    upsert: changed,
    deleteSynthetic: extra,
  })),
  mode: process.argv.includes("--apply") ? "apply-benchmark-recovery" : "local-plan-only",
};
function csv(value: unknown) {
  if (value === null) return "";
  if (!["string", "number", "bigint"].includes(typeof value))
    throw new Error("Unsupported retained SQLite value");
  return `"${String(value as string | number | bigint).replaceAll('"', '""')}"`;
}
try {
  if (!process.argv.includes("--apply")) {
    writeFileSync(".neon-benchmark/faithful-recovery-plan.json", JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } else {
    const usageIndex = process.argv.indexOf("--usage-before"),
      usagePath = process.argv[usageIndex + 1];
    if (usageIndex < 0 || !usagePath)
      throw new Error("Captured provider baseline required for benchmark recovery");
    receipt.budgetBefore = checkNeonPilotBudget(JSON.parse(readFileSync(usagePath, "utf8")));
    const url = validateNeonRefreshUrl(
      readFileSync(".neon-benchmark/connection.txt", "utf8").trim(),
      NEON_REFRESH_BRANCH,
    );
    const client = createNeonRefreshClient(url);
    const connectionStart = performance.now();
    await client.connect();
    receipt.connectionMs = performance.now() - connectionStart;
    const wallStart = performance.now();
    const stream = (client as unknown as { connection: { stream: Socket } }).connection.stream;
    const receivedBefore = stream.bytesRead,
      sentBefore = stream.bytesWritten;
    const queryAwait: {
      sql: string;
      elapsedMs: number;
      returnedRows: number;
      affectedRows: number | null;
      success: boolean;
    }[] = [];
    const query = async (sql: string, params?: unknown[]) => {
      const started = performance.now();
      try {
        const result = await client.query(sql, params);
        queryAwait.push({
          sql: sql.slice(0, 120),
          elapsedMs: performance.now() - started,
          returnedRows: result.rows.length,
          affectedRows: result.rowCount,
          success: true,
        });
        return result;
      } catch (error) {
        queryAwait.push({
          sql: sql.slice(0, 120),
          elapsedMs: performance.now() - started,
          returnedRows: 0,
          affectedRows: null,
          success: false,
        });
        throw error;
      }
    };
    const sqlBefore = await readNeonSqlTime(query);
    let copyStreams = 0;
    let inTransaction = false,
      commitAttempted = false;
    const deadline = setTimeout(() => void client.end(), 20 * 60 * 1000);
    try {
      await query("BEGIN");
      inTransaction = true;
      const lock = await query("SELECT pg_try_advisory_xact_lock(724921,1) AS acquired");
      if (lock.rows[0].acquired !== true)
        throw new Error("Another benchmark ingestion is in progress");
      const guard = await query(
        "SELECT json=$1::jsonb AS matches FROM manifest WHERE id=1 FOR UPDATE",
        [canonicalJson(priorManifest)],
      );
      if (guard.rows[0]?.matches !== true)
        throw new Error("Preserve a changed benchmark; baseline recovery guard failed");
      // Small returned digests attest the known previous benchmark snapshot; no full corpus export.
      // These empirical fingerprints are NOT used by the exact transaction reconciliation algorithm.
      const fidelity = JSON.parse(readFileSync(".neon-benchmark/fidelity.json", "utf8")) as {
        measurements: {
          table: string;
          rows: number;
          logicalColumns: string[];
          sourceHash: string;
        }[];
      };
      if (
        fidelity.measurements.length !== Object.keys(keys).length ||
        new Set(fidelity.measurements.map((entry) => entry.table)).size !== Object.keys(keys).length
      )
        throw new Error("Incomplete retained fidelity receipt");
      for (const old of fidelity.measurements) {
        const pk = keys[old.table];
        if (
          !pk ||
          !/^[a-f0-9]{32}$/.test(old.sourceHash) ||
          !Number.isSafeInteger(old.rows) ||
          old.rows < 0 ||
          !old.logicalColumns.length ||
          old.logicalColumns.some((column) => !/^[a-z_]+$/.test(column))
        )
          throw new Error("Invalid retained fidelity receipt");
        const columns = old.logicalColumns
          .map((column) => `COALESCE(${column}::text,chr(30))`)
          .join(",");
        const actual = (
          await query(
            `SELECT count(*) AS n,md5(COALESCE(string_agg(md5(concat_ws(chr(31),${columns})),'' ORDER BY ${pk.join(",")}),'')) AS hash FROM ${old.table}`,
          )
        ).rows[0];
        if (Number(actual.n) !== old.rows || actual.hash !== old.sourceHash)
          throw new Error("Benchmark differs from retained synthetic snapshot; recovery stopped");
      }
      for (const entry of tables.filter((table) => table.table !== "manifest")) {
        const stage = `hdb_recover_${entry.table}`;
        // COPY only known changed artifacts/facts. No million-row reimport or table truncation.
        if (entry.extra) {
          const extras = source.prepare(entry.extraSql).all();
          for (const row of extras) {
            const deletion = await query(
              `DELETE FROM ${entry.table} WHERE ${entry.pk.map((key, i) => `${key}=$${i + 1}`).join(" AND ")}`,
              entry.pk.map((key) => row[key]),
            );
            if (deletion.rowCount !== 1) throw new Error("Synthetic recovery deletion mismatch");
          }
        }
        if (!entry.changed) continue;
        await query(
          `CREATE TEMP TABLE ${stage} (LIKE public.${entry.table} INCLUDING DEFAULTS) ON COMMIT DROP`,
        );
        function* rows() {
          for (const row of source.prepare(entry.changedSql).iterate())
            yield entry.columns.map((column) => csv(row[column])).join(",") + "\n";
        }
        const copyStarted = performance.now();
        copyStreams++;
        await pipeline(
          Readable.from(rows()),
          client.query(
            copyFrom(`COPY ${stage} (${entry.columns.join(",")}) FROM STDIN WITH (FORMAT csv)`),
          ),
        );
        queryAwait.push({
          sql: `COPY ${stage} FROM STDIN`,
          elapsedMs: performance.now() - copyStarted,
          returnedRows: 0,
          affectedRows: entry.changed,
          success: true,
        });
        const result = await query(
          `INSERT INTO ${entry.table} (${entry.columns.join(",")}) SELECT ${entry.columns.join(",")} FROM ${stage} WHERE true ON CONFLICT(${entry.pk.join(",")}) DO UPDATE SET ${entry.columns
            .filter((column) => !entry.pk.includes(column))
            .map((column) => `${column}=excluded.${column}`)
            .join(",")}`,
        );
        if (result.rowCount !== entry.changed)
          throw new Error("Faithful recovery affected-row mismatch");
        await query(`DROP TABLE ${stage}`);
      }
      const manifestResult = await query(
        "UPDATE manifest SET json=$1::jsonb,updated_at=now() WHERE id=1",
        [canonicalJson(faithfulManifest)],
      );
      if (manifestResult.rowCount !== 1) throw new Error("Faithful manifest boundary missing");
      commitAttempted = true;
      await query("COMMIT");
      inTransaction = false;
      receipt.success = true;
      const sqlAfter = await readNeonSqlTime(query);
      receipt.sqlExecutionMs =
        sqlBefore !== null && sqlAfter !== null && sqlAfter >= sqlBefore
          ? sqlAfter - sqlBefore
          : null;
    } catch (error) {
      receipt.success = false;
      receipt.error = safeNeonError(error, [
        new URL(url).password,
        decodeURIComponent(new URL(url).password),
      ]);
      receipt.outcome = commitAttempted
        ? "commit-unknown-reconciliation-required"
        : "failed-before-commit";
      if (commitAttempted)
        throw new AmbiguousNeonPublicationError(
          "Benchmark recovery commit outcome unknown; inspect the manifest before any retry",
        );
      throw error;
    } finally {
      clearTimeout(deadline);
      if (inTransaction) await query("ROLLBACK").catch(() => {});
      receipt.wallMs = performance.now() - wallStart;
      receipt.wireReceivedProxyBytes = stream.bytesRead - receivedBefore;
      receipt.wireSentProxyBytes = stream.bytesWritten - sentBefore;
      receipt.queryCount = queryAwait.length;
      receipt.copyStreams = copyStreams;
      receipt.queryAwait = queryAwait;
      receipt.providerPublicTransferBytes = null;
      receipt.providerComputeCUHours = null;
      receipt.limitation =
        "Changed-only faithful recovery measured separately. Wire/client timings are proxies; SQL is current-role cumulative pg_stat_statements delta including instrumentation/concurrent same-role work. Provider usage as-of is unknown.";
      await client.end();
      receipt.finishedAt = new Date().toISOString();
      writeFileSync(".neon-benchmark/faithful-recovery.json", JSON.stringify(receipt, null, 2));
      console.log(JSON.stringify({ ...receipt, queryAwait: undefined }));
    }
  }
} finally {
  source.close();
}
