/** Explicit local-engine verification. The fixed localhost transport cannot reach Neon/D1. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import type { Socket } from "node:net";
import { localClient, localSave, localWitness, localRoot } from "./local-pg18.mts";
import { canonicalJson } from "../lib/sync/neon";
import { materializeDetailStage } from "./materialized-details";
import { executionCodeSHA256 } from "./staged-code-identity";
import {
  assertExecutionInput,
  type StageExecutionInput,
  type SequenceLimits,
} from "./staged-execution";
import {
  PublicationSequenceBudget,
  publishStaged,
  recoverStagedOutcome,
  publicationSQLSHA256,
  AmbiguousStagedCommitError,
  type TransportFactory,
} from "./staged-publisher";
import {
  packStage,
  stageIdentity,
  stagePublicationId,
  sha256,
  STAGE_TABLES,
  CREATE_STAGE_SQL,
  COPY_STAGE_SQL,
  STAGE_UNIQUE_SQL,
  STAGE_DIGEST_SQL,
  stagedDml,
  statementShape,
  verifyMutationReceipt,
  expectedModeReceipt,
  type PackedStage,
} from "./staged-plan";
import {
  SCHEMA_CATALOG_SQL,
  PRECONDITIONS_SQL,
  POSTCONDITIONS_SQL,
  MANIFEST_WRITE_SQL,
} from "./staged-validation";
import { textKey } from "./text-key";

mkdirSync(localRoot, { recursive: true });
const readJSON = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const requireTrue = (v: unknown, message: string) => {
  if (!v) throw Error(message);
};
const priorPath = `${localRoot}/verification.json`;
const finalOnly = process.argv.includes("--final-only");
const report: Record<string, unknown> = finalOnly
  ? readJSON(priorPath)
  : {
      startedAtUTC: new Date().toISOString(),
      target: "127.0.0.1:55432/hdb_verify",
      status: "RUNNING",
      remoteCalls: 0,
      faultMatrix: [],
      plans: [],
      caveats: [
        "Local tmpfs/ARM/two-CPU results are not Neon latency or billing.",
        "Finite pinned-input observations do not prove a universal PostgreSQL memory bound.",
      ],
    };
if (finalOnly) {
  const priorFaults = report.faultMatrix as {
    fault: string;
    status: string;
    injectedFaultReached?: boolean;
    sequence: { commands: { label: string; success: boolean }[] };
  }[];
  requireTrue(
    priorFaults.length === 11 &&
      priorFaults.every((r) => r.status === "PASS" && r.injectedFaultReached === true) &&
      report.cacheFixtureRollback === "PASS",
    "Core matrix must pass before a final-only local continuation",
  );
  report.priorFinalFailure = report.failure;
  report.preservedProtocolCodeSHA256 = report.codeSHA256;
  report.preservedProtocolSQLSHA256 = report.publisherSQLSHA256;
  delete report.failure;
  report.status = "LOCAL FINAL CONTINUATION";
}
const persist = () => localSave("verification", report);
const admin = localClient("postgres"),
  reader = localClient();
await admin.connect();
await reader.connect();
const source = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
const limits: SequenceLimits = {
  maxCommands: 100,
  maxConnections: 8,
  maxReceivedProxyBytes: 20000000,
  maxSentProxyBytes: 300000000,
  maxWallMs: 1500000,
  maxComputeCUHoursProxy: 0.6,
  endpointMaximumCU: 1,
  endpointIdleTailMs: 600000,
  connectionTimeoutMs: 10000,
  twoPassReconciliationReceivedProxyReserve: 987415848,
  providerTransferUsed: "UNKNOWN",
  providerComputeUsed: "UNKNOWN",
};
const injectedFaults = new Set<string>();
function repin(input: StageExecutionInput) {
  input.pins.publisherSQLSHA256 = publicationSQLSHA256(input.plan);
  input.pins.builderCodeSHA256 = executionCodeSHA256();
  input.pins.publicationCommands = statementShape(input.plan.groups).sqlStatements;
  input.pins.sequenceLimitsSHA256 = sha256(canonicalJson(limits));
  input.envelope.stage = stageIdentity(input.plan);
  input.envelope.limits.exactCopyBytes = input.plan.copyBytes;
  input.envelope.limits.exactRows = input.plan.rows;
  input.envelope.executionPinsSHA256 = sha256(canonicalJson(input.pins));
  input.nextManifest.neonPublication = { publicationId: stagePublicationId(input.envelope) };
  input.envelope.nextManifestSHA256 = sha256(canonicalJson(input.nextManifest));
}
function transport(fault = "none"): TransportFactory {
  return async (budget) => {
    budget.beginConnection();
    const c = localClient();
    c.on("error", () => {});
    budget.armConnectionAbort(() => c.connection.stream.destroy());
    await c.connect();
    const socket = (c as unknown as { connection: { stream: Socket } }).connection.stream;
    const observe = budget.attachSocket(socket);
    return {
      query: async (sql, params = []) => {
        if (fault === "manifest-failure" && sql === MANIFEST_WRITE_SQL) {
          injectedFaults.add(fault);
          return c.query("SELECT 1/0");
        }
        if (fault === "commit-not-accepted" && sql === "COMMIT") {
          injectedFaults.add(fault);
          socket.destroy();
          throw Error("Injected pre-dispatch transport abort");
        }
        const result = await c.query(sql, params);
        const points: Record<string, string> = {
          "after-stage": CREATE_STAGE_SQL,
          "after-transactions": stagedDml("transactions", "insert"),
          "after-blocks": stagedDml("blocks", "update"),
          "after-details": stagedDml("block_details", "update"),
          "after-comparisons": stagedDml("comparisons", "update"),
          "after-trends": stagedDml("town_flat_type_trends", "update"),
          "after-manifest": MANIFEST_WRITE_SQL,
          "commit-accepted-lost": "COMMIT",
        };
        if (points[fault] === sql) {
          injectedFaults.add(fault);
          throw Error("Injected response-path failure at " + fault);
        }
        return result;
      },
      copy: async (sql, chunks) => {
        const stream = c.query(copyFrom(sql));
        async function* data() {
          let bytes = 0;
          for await (const chunk of chunks) {
            yield chunk;
            bytes += chunk.length;
            if (fault === "during-copy" && bytes >= 65536) {
              injectedFaults.add(fault);
              throw Error("Injected COPY interruption");
            }
          }
        }
        await pipeline(Readable.from(data()), stream);
        return stream.rowCount;
      },
      sample: () => {
        observe();
        return {
          receivedProxyBytes: budget.receipt.receivedProxyBytes,
          sentProxyBytes: budget.receipt.sentProxyBytes,
        };
      },
      destroy: () => socket.destroy(),
      close: async () => {
        observe();
        await c.end();
        budget.releaseConnection();
      },
    };
  };
}
async function copyStage(c: ReturnType<typeof localClient>, plan: PackedStage) {
  await c.query(CREATE_STAGE_SQL);
  await c.query(STAGE_UNIQUE_SQL);
  await pipeline(Readable.from([Buffer.from(plan.copyText)]), c.query(copyFrom(COPY_STAGE_SQL)));
  await c.query("ANALYZE pg_temp.neon_publication_stage");
}
async function vacuumDerivedLocalOnly() {
  for (const table of [
    "blocks",
    "block_details",
    "comparisons",
    "town_flat_type_trends",
    "transactions",
  ])
    await admin.query(`VACUUM FULL public.${table}`);
  await admin.query("ANALYZE");
}
try {
  report.engine = (
    await reader.query(
      "SELECT version(),current_database(),current_user,current_setting('server_encoding') AS encoding,current_setting('work_mem') AS work_mem,current_setting('temp_file_limit') AS temp_file_limit,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,has_parameter_privilege(current_user,'temp_file_limit','SET') AS can_set_temp_file_limit",
    )
  ).rows[0];
  const engine = report.engine as Record<string, unknown>;
  requireTrue(
    engine.current_database === "hdb_verify" &&
      engine.current_user === "hdb_local_ingestion" &&
      engine.superuser === false &&
      engine.can_set_temp_file_limit === false,
    "Local restricted-role identity mismatch",
  );
  const patch = packStage(readJSON(".neon-benchmark/staged-inputs/cache-only/stageItems.json"));
  const captured = new Map(
    source
      .prepare("SELECT address_key,json FROM block_details ORDER BY address_key")
      .all()
      .map((r) => [String(r.address_key), JSON.parse(String(r.json))]),
  );
  const oldTargets = patch.items
    .filter((r) => r.table === "block_details")
    .map((r) => ({
      address_key: textKey(r.key.address_key, "address_key"),
      json: captured.get(textKey(r.key.address_key, "address_key")),
    }));
  // The digest is computed by PostgreSQL from its own JSONB text. Equality validates captured input.
  const hashes = (
    await reader.query(
      `SELECT b.address_key,b.json=r.json AS matches,
    encode(sha256(convert_to(b.json::text,'UTF8')),'hex') AS digest
    FROM jsonb_to_recordset($1::jsonb) r(address_key text,json jsonb)
    JOIN public.block_details b USING(address_key) ORDER BY b.address_key`,
      [canonicalJson(oldTargets)],
    )
  ).rows;
  requireTrue(
    hashes.length === oldTargets.length && hashes.every((r) => r.matches === true),
    "Captured old document does not equal local PostgreSQL snapshot",
  );
  const materialized = materializeDetailStage(
    patch,
    captured,
    new Map(hashes.map((r) => [r.address_key, r.digest])),
  );
  const input = {
    ...readJSON(".neon-benchmark/staged-executable-input.json"),
    plan: materialized.plan,
    detailDerivations: materialized.derivations,
  } as StageExecutionInput;
  input.pins.materializedDetailIdentity = materialized.identity;
  input.pins.schemaCatalog = (await reader.query(SCHEMA_CATALOG_SQL)).rows[0].schema_catalog;
  input.pins.schemaCatalogSHA256 = sha256(canonicalJson(input.pins.schemaCatalog));
  // Exact existing ceilings; local engine size is independently pinned for this local-only input.
  input.pins.maximumDatabaseBytesBeforeStage =
    Math.ceil(
      Number(
        (await reader.query("SELECT pg_database_size(current_database()) AS bytes")).rows[0].bytes,
      ) / 1048576,
    ) *
      1048576 +
    16 * 1048576;
  // Only the local multi-case matrix reserves catalog churn from repeated temporary
  // relation creation. Absolute 256 MiB stage and 1 GiB project checks stay intact.
  report.localCatalogChurnReserveBytes = 16 * 1048576;
  input.pins.estimatedTemporaryUpperBytes = 268435456;
  input.envelope.decisionReference = "LOCAL ENGINE VERIFICATION ONLY; NOT REMOTE ADMISSION";
  repin(input);
  assertExecutionInput(input, publicationSQLSHA256(input.plan));
  report.materializedIdentity = materialized.identity;
  report.stage = stageIdentity(input.plan);
  report.originalFiveRetentions = input.envelope.unresolvedOccurrences.map((r) => r.id);
  report.publisherSQLSHA256 = publicationSQLSHA256(input.plan);
  report.codeSHA256 = executionCodeSHA256();
  report.commands = input.pins.publicationCommands;
  localSave("server-digests", hashes);
  localSave("local-executable-input", { ...input, plan: undefined });
  writeFileSync(`${localRoot}/stageItems.json`, JSON.stringify(input.plan.items));
  writeFileSync(`${localRoot}/stage.copy-text`, input.plan.copyText);
  const baseline = await localWitness(reader);
  if (finalOnly)
    requireTrue(
      same(baseline, report.baselineWitness),
      "Final-only continuation is not the exact baseline",
    );
  report.baselineWitness = baseline;
  persist();

  if (!finalOnly) {
    // Exact generated SQL is explained with execution inside a rollback, over full-scale captured tables.
    await reader.query("BEGIN");
    await copyStage(reader, input.plan);
    const stageSize = (
      await reader.query(`SELECT pg_relation_size('pg_temp.neon_publication_stage') AS heap,
    pg_indexes_size('pg_temp.neon_publication_stage') AS indexes,
    pg_total_relation_size('pg_temp.neon_publication_stage') AS total,
    sum(octet_length(wire)) AS wire_bytes,sum(pg_column_size(item)) AS stored_item_bytes,
    max(pg_column_size(item)) AS maximum_item_bytes,pg_database_size(current_database()) AS database_bytes
    FROM pg_temp.neon_publication_stage`)
    ).rows[0];
    report.stagePhysical = stageSize;
    persist();
    const statements = [
      ["stage-digest", STAGE_DIGEST_SQL, []],
      [
        "preconditions",
        PRECONDITIONS_SQL,
        [
          canonicalJson(
            input.envelope.unresolvedOccurrences.map((r) => ({ id: r.id, ...r.tuple })),
          ),
          canonicalJson(input.pins.cacheInputs),
        ],
      ],
      ...STAGE_TABLES.flatMap((t) =>
        (["insert", "update"] as const)
          .filter((m) => input.plan.groups[t][m] > 0)
          .map((m) => [`${t}-${m}`, stagedDml(t, m), []]),
      ),
      [
        "postconditions",
        POSTCONDITIONS_SQL,
        [
          canonicalJson(
            input.envelope.unresolvedOccurrences.map((r) => ({ id: r.id, ...r.tuple })),
          ),
        ],
      ],
      [
        "manifest-last",
        MANIFEST_WRITE_SQL,
        [
          canonicalJson(input.nextManifest),
          input.pins.targetUpdatedAtUTC,
          canonicalJson(input.baselineManifest),
        ],
      ],
    ] as [string, string, unknown[]][];
    for (const [name, sql, params] of statements) {
      const began = performance.now();
      const plan = (await reader.query("EXPLAIN (ANALYZE,BUFFERS,WAL,FORMAT JSON) " + sql, params))
        .rows[0]["QUERY PLAN"][0];
      const record = { name, wallMs: performance.now() - began, explain: plan };
      (report.plans as unknown[]).push(record);
      persist();
      console.log(JSON.stringify({ phase: "explain", name, executionMs: plan["Execution Time"] }));
    }
    await reader.query("ROLLBACK");
    requireTrue(
      same(await localWitness(reader), baseline),
      "EXPLAIN ANALYZE rollback logical mismatch",
    );
    report.planRollback = "PASS";
    persist();
    await vacuumDerivedLocalOnly();

    for (const fault of [
      "after-stage",
      "during-copy",
      "after-transactions",
      "after-blocks",
      "after-details",
      "after-comparisons",
      "after-trends",
      "before-manifest",
      "manifest-failure",
      "after-manifest",
      "commit-not-accepted",
    ]) {
      const budget = new PublicationSequenceBudget(limits);
      const began = performance.now();
      let failure: unknown;
      try {
        await publishStaged(
          input,
          budget,
          transport(fault),
          fault === "before-manifest" ? "failure-before-manifest" : "success",
        );
      } catch (e) {
        failure = e;
      }
      requireTrue(failure instanceof Error, "Fault was not observed: " + fault);
      requireTrue(
        fault === "before-manifest"
          ? (failure as Error).message === "Injected failure before manifest publication"
          : injectedFaults.has(fault),
        "Intended injection was not executed: " + fault,
      );
      const labels: Record<string, string> = {
        "after-stage": "create-stage",
        "during-copy": "copy-stage",
        "after-transactions": "transactions-insert",
        "after-blocks": "blocks-update",
        "after-details": "block_details-update",
        "after-comparisons": "comparisons-update",
        "after-trends": "town_flat_type_trends-update",
        "manifest-failure": "manifest-last",
        "after-manifest": "manifest-last",
        "commit-not-accepted": "commit",
      };
      if (fault === "before-manifest")
        requireTrue(
          budget.receipt.commands.some((r) => r.label === "postconditions" && r.success) &&
            !budget.receipt.commands.some((r) => r.label === "manifest-last"),
          "Wrong stopping point for before-manifest fault",
        );
      else
        requireTrue(
          budget.receipt.commands.some((r) => r.label === labels[fault] && !r.success),
          "Intended fault point was not reached: " + fault,
        );
      const recovery =
        failure instanceof AmbiguousStagedCommitError
          ? await recoverStagedOutcome(input, budget, transport())
          : undefined;
      requireTrue(
        !recovery || recovery === "baseline-retry-eligible",
        "Precommit abort unexpectedly published",
      );
      const witness = await localWitness(reader);
      requireTrue(same(witness, baseline), "Fault altered complete logical state: " + fault);
      const record = {
        fault,
        status: "PASS",
        wallMs: performance.now() - began,
        fullStateMatchesBaseline: true,
        error: (failure as Error).name,
        injectedFaultReached: true,
        recovery,
        sequence: budget.finish(),
      };
      (report.faultMatrix as unknown[]).push(record);
      persist();
      console.log(JSON.stringify({ phase: "fault", fault, status: "PASS", wallMs: record.wallMs }));
      await vacuumDerivedLocalOnly();
    }

    // Caches have zero mutations in the genuine candidate; prove their DML path with a compact local fixture.
    const oldGeo = input.pins.cacheInputs.geocode_cache[0],
      cachePlan = packStage([
        {
          table: "geocode_cache",
          operation: "update",
          key: { cache_key: oldGeo.cache_key },
          before: { lat: oldGeo.lat },
          after: { lat: Number(oldGeo.lat) + 0.00001 },
        },
        {
          table: "walking_time_cache",
          operation: "insert",
          key: { cache_key: "local-fault-only" },
          before: null,
          after: {
            cache_key: "local-fault-only",
            walking_time_seconds: 1,
            walking_distance_meters: 1,
            updated_at: input.pins.targetUpdatedAtUTC,
          },
        },
      ]);
    await reader.query("BEGIN");
    await copyStage(reader, cachePlan);
    for (const [table, op] of [
      ["geocode_cache", "update"],
      ["walking_time_cache", "insert"],
    ] as const) {
      const row = (await reader.query(stagedDml(table, op))).rows[0];
      verifyMutationReceipt(row, expectedModeReceipt(cachePlan, table, op));
    }
    try {
      await reader.query("SELECT 1/0");
    } catch {
      /* deliberate server fault */
    }
    await reader.query("ROLLBACK");
    requireTrue(same(await localWitness(reader), baseline), "Cache fixture rollback mismatch");
    report.cacheFixtureRollback = "PASS";
    persist();
  }

  // Full candidate final success with loss of the COMMIT response, then fresh recovery and replay.
  const finalBudget = new PublicationSequenceBudget(limits);
  let ambiguous: unknown;
  try {
    await publishStaged(input, finalBudget, transport("commit-accepted-lost"), "success");
  } catch (e) {
    ambiguous = e;
  }
  report.finalAttempt = {
    error: ambiguous instanceof Error ? { name: ambiguous.name, message: ambiguous.message } : null,
    sequence: structuredClone(finalBudget.receipt),
  };
  persist();
  requireTrue(
    ambiguous instanceof AmbiguousStagedCommitError && injectedFaults.has("commit-accepted-lost"),
    "Missing typed ambiguous-COMMIT outcome",
  );
  const recovered = await recoverStagedOutcome(input, finalBudget, transport());
  requireTrue(recovered === "already-published", "Accepted COMMIT was not recoverable");
  const published = await localWitness(reader);
  const replay = await publishStaged(input, finalBudget, transport(), "replay");
  requireTrue(
    replay.state === "already-published" && replay.mutations === 0 && replay.commands === 1,
    "Replay mutated data",
  );
  requireTrue(same(await localWitness(reader), published), "Replay full-state mismatch");
  requireTrue(
    (published.transactions as { rows: number }).rows === 988128,
    "Published transaction multiplicity mismatch",
  );
  report.acceptedCommitRecovery = {
    status: "PASS",
    recovered,
    replay,
    finalWitness: published,
    sequence: finalBudget.finish(),
  };
  report.status = "LOCAL ENGINE CORE MATRIX PASS; CONCURRENCY/DRIFT/REVIEW/BUDGET GATES PENDING";
  report.finishedAtUTC = new Date().toISOString();
  persist();
} catch (e) {
  await reader.query("ROLLBACK").catch(() => {});
  report.status = "FAIL";
  report.failure = {
    name: e instanceof Error ? e.name : "unknown",
    message: e instanceof Error ? e.message : "Local verification failure",
  };
  persist();
  process.exitCode = 1;
} finally {
  source.close();
  await reader.end();
  await admin.end();
}
console.log(
  JSON.stringify({
    status: report.status,
    failure: report.failure,
    evidence: `${localRoot}/verification.json`,
  }),
);
