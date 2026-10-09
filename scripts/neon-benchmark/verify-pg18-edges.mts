/** Additional actual-engine races and live snapshot drift. Fixed localhost test DB only. */
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { from as copyFrom } from "pg-copy-streams";
import type { Socket } from "node:net";
import { localClient, localWitness, localSave } from "./local-pg18.mts";
import { canonicalJson } from "../lib/sync/neon";
import {
  packStage,
  stageIdentity,
  stagePublicationId,
  sha256,
  statementShape,
} from "./staged-plan";
import { materializedDetailIdentity } from "./materialized-details";
import { executionCodeSHA256 } from "./staged-code-identity";
import {
  publishStaged,
  publicationSQLSHA256,
  PublicationSequenceBudget,
  type TransportFactory,
} from "./staged-publisher";
import { textKey } from "./text-key";
import {
  assertExecutionInput,
  type StageExecutionInput,
  type SequenceLimits,
} from "./staged-execution";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const demand = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
const core = json(".neon-benchmark/local-pg18/verification.json");
demand(
  core.acceptedCommitRecovery?.status === "PASS",
  "Complete core matrix before running edge fixtures",
);
const report: Record<string, unknown> = {
  startedAtUTC: new Date().toISOString(),
  target: "127.0.0.1:55432/hdb_verify",
  status: "RUNNING",
  remoteCalls: 0,
  fixtures: [],
  scope:
    "Reduced derived fixture retains all exact 2595 inserts and five retention identities, on full baseline corpus. Not a remote-approved artifact publication.",
};
const save = () => localSave("edges", report);
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
async function resetLocalDerived() {
  await admin.query("DELETE FROM public.transactions WHERE id>985533");
  for (const table of [
    "blocks",
    "block_details",
    "comparisons",
    "town_flat_type_trends",
    "manifest",
  ]) {
    const cols = source
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => String(r.name));
    await admin.query(`TRUNCATE public.${table}`);
    const cell = (v: unknown) => {
      if (v === null || v === undefined) return "";
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "bigint")
        throw new Error("Unexpected SQLite scalar");
      return `"${String(v).replaceAll('"', '""')}"`;
    };
    function* data() {
      let s = "";
      for (const r of source.prepare(`SELECT ${cols.join(",")} FROM ${table}`).iterate()) {
        s += cols.map((k) => cell(r[k])).join(",") + "\n";
        if (s.length >= 65536) {
          yield s;
          s = "";
        }
      }
      if (s) yield s;
    }
    await pipeline(
      Readable.from(data()),
      admin.query(copyFrom(`COPY public.${table}(${cols.join(",")}) FROM STDIN WITH(FORMAT csv)`)),
    );
  }
  await admin.query("VACUUM FULL public.transactions");
  await admin.query("ANALYZE");
}
function factory(
  hook?: (
    sql: string,
    result: { rows: Record<string, unknown>[]; rowCount: number | null },
  ) => Promise<void>,
): TransportFactory {
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
        const r = await c.query(sql, params);
        await hook?.(sql, r);
        return r;
      },
      copy: async (sql, chunks) => {
        const s = c.query(copyFrom(sql));
        await pipeline(Readable.from(chunks), s);
        return s.rowCount;
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
try {
  await resetLocalDerived();
  demand(
    same(await localWitness(reader), core.baselineWitness),
    "Local reset differs from full captured baseline",
  );
  const original = json(
    ".neon-benchmark/local-pg18/local-executable-input.json",
  ) as StageExecutionInput;
  const whole = packStage(json(".neon-benchmark/local-pg18/stageItems.json"));
  const seen = new Set<string>();
  const items = whole.items.filter(
    (r) =>
      r.table === "transactions" ||
      (!seen.has(r.table + ":" + r.operation) && !!seen.add(r.table + ":" + r.operation)),
  );
  const input = { ...original, plan: packStage(items) };
  input.detailDerivations = original.detailDerivations.filter((r) =>
    items.some((i) => i.table === "block_details" && i.key.address_key === r.addressKey),
  );
  input.pins.materializedDetailIdentity = materializedDetailIdentity(
    input.plan,
    input.detailDerivations,
  );
  input.pins.maximumDatabaseBytesBeforeStage =
    Math.ceil(
      Number((await reader.query("SELECT pg_database_size(current_database()) AS n")).rows[0].n) /
        1048576,
    ) *
      1048576 +
    16 * 1048576;
  input.pins.estimatedTemporaryUpperBytes = 32 * 1048576;
  input.pins.builderCodeSHA256 = executionCodeSHA256();
  input.pins.publisherSQLSHA256 = publicationSQLSHA256(input.plan);
  input.pins.publicationCommands = statementShape(input.plan.groups).sqlStatements;
  input.pins.sequenceLimitsSHA256 = sha256(canonicalJson(limits));
  input.envelope.decisionReference = "LOCAL CONCURRENCY/DRIFT FIXTURE ONLY";
  input.envelope.stage = stageIdentity(input.plan);
  input.envelope.limits.exactRows = input.plan.rows;
  input.envelope.limits.exactCopyBytes = input.plan.copyBytes;
  input.envelope.executionPinsSHA256 = sha256(canonicalJson(input.pins));
  input.nextManifest.neonPublication = { publicationId: stagePublicationId(input.envelope) };
  input.envelope.nextManifestSHA256 = sha256(canonicalJson(input.nextManifest));
  assertExecutionInput(input, publicationSQLSHA256(input.plan));
  report.fixture = {
    rows: input.plan.rows,
    COPYBytes: input.plan.copyBytes,
    identity: stageIdentity(input.plan),
  };
  save();

  const detail = items.find((r) => r.table === "block_details")!,
    block = items.find((r) => r.table === "blocks")!;
  const detailOld = source
    .prepare("SELECT json FROM block_details WHERE address_key=?")
    .get(textKey(detail.key.address_key, "address_key"))!.json;
  const geo = input.pins.cacheInputs.geocode_cache[0];
  const blockOld = source
    .prepare("SELECT median_price FROM blocks WHERE address_key=?")
    .get(textKey(block.key.address_key, "address_key"))!.median_price;
  const probes = [
    {
      name: "unknown-detail-root",
      change: () =>
        admin.query(
          "UPDATE public.block_details SET json=jsonb_set(json,'{unknownVerification}', 'true'::jsonb) WHERE address_key=$1",
          [detail.key.address_key],
        ),
      restore: () =>
        admin.query("UPDATE public.block_details SET json=$1::jsonb WHERE address_key=$2", [
          detailOld,
          detail.key.address_key,
        ]),
    },
    {
      name: "nested-unowned-detail-sibling",
      change: () =>
        admin.query(
          "UPDATE public.block_details SET json=jsonb_set(json,'{summary,unknownVerification}', 'null'::jsonb) WHERE address_key=$1",
          [detail.key.address_key],
        ),
      restore: () =>
        admin.query("UPDATE public.block_details SET json=$1::jsonb WHERE address_key=$2", [
          detailOld,
          detail.key.address_key,
        ]),
    },
    {
      name: "block-before-field",
      change: () =>
        admin.query("UPDATE public.blocks SET median_price=median_price+1 WHERE address_key=$1", [
          block.key.address_key,
        ]),
      restore: () =>
        admin.query("UPDATE public.blocks SET median_price=$1 WHERE address_key=$2", [
          blockOld,
          block.key.address_key,
        ]),
    },
    {
      name: "cache-input",
      change: () =>
        admin.query(
          "UPDATE public.geocode_cache SET updated_at=updated_at+interval '1 second' WHERE cache_key=$1",
          [geo.cache_key],
        ),
      restore: () =>
        admin.query(
          "UPDATE public.geocode_cache SET updated_at=$1::timestamptz WHERE cache_key=$2",
          [geo.updated_at, geo.cache_key],
        ),
    },
    {
      name: "stale-manifest",
      change: () =>
        admin.query(
          "UPDATE public.manifest SET json=jsonb_set(json,'{unknownVerification}','true'::jsonb) WHERE id=1",
        ),
      restore: () =>
        admin.query("UPDATE public.manifest SET json=$1::jsonb WHERE id=1", [
          canonicalJson(input.baselineManifest),
        ]),
    },
  ];
  for (const probe of probes) {
    await probe.change();
    const before = await localWitness(reader);
    demand(
      !same(before, core.baselineWitness),
      "Drift injection changed no logical data: " + probe.name,
    );
    const budget = new PublicationSequenceBudget(limits);
    let failure: unknown;
    try {
      await publishStaged(input, budget, factory(), "success");
    } catch (e) {
      failure = e;
    }
    report.currentProbe = {
      name: probe.name,
      error: failure instanceof Error ? failure.message : null,
      sequence: structuredClone(budget.receipt),
    };
    save();
    demand(failure instanceof Error, "Live stale fixture unexpectedly published: " + probe.name);
    const message = (failure as Error).message;
    if (probe.name === "stale-manifest")
      demand(
        message.startsWith("Stale manifest") && budget.receipt.commands.length === 1,
        "Stale manifest was rejected at an unrelated gate",
      );
    else
      demand(
        budget.receipt.commands.some((r) => r.label === "preconditions" && r.success) &&
          (probe.name === "cache-input"
            ? message.startsWith("Schema or cached context")
            : message.startsWith("Stale target")),
        "Intended live stale check was not reached: " + probe.name,
      );
    demand(
      !budget.receipt.commands.some((r) => r.label === "transactions-insert"),
      "Stale fixture reached durable DML",
    );
    demand(same(await localWitness(reader), before), "Stale fixture changed full logical state");
    (report.fixtures as unknown[]).push({
      name: probe.name,
      status: "PASS",
      noDML: true,
      fullStateUnchanged: true,
      error: (failure as Error).message,
      sequence: budget.finish(),
    });
    save();
    console.log(JSON.stringify({ phase: "drift", name: probe.name, status: "PASS" }));
    await probe.restore();
  }
  demand(
    same(await localWitness(reader), core.baselineWitness),
    "Drift fixture restoration mismatch",
  );
  // Two actual publisher connections must both read the predecessor before either proceeds.
  let arrived = 0,
    release: () => void = () => {};
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const hook = async (sql: string) => {
    if (sql === "SELECT json FROM public.manifest WHERE id=1") {
      arrived++;
      if (arrived === 2) release();
      await barrier;
    }
  };
  const one = new PublicationSequenceBudget(limits),
    two = new PublicationSequenceBudget(limits);
  const results = await Promise.all([
    publishStaged(input, one, factory(hook), "success"),
    publishStaged(input, two, factory(hook), "success"),
  ]);
  demand(
    results.filter((r) => r.state === "published").length === 1 &&
      results.filter((r) => r.state === "already-published").length === 1,
    "Concurrent publishers did not reconcile exactly once",
  );
  demand(
    results.every((r) => r.copyBytes === input.plan.copyBytes),
    "Concurrent loser undercounts completed COPY",
  );
  report.codeSHA256 = input.pins.builderCodeSHA256;
  report.publisherSQLSHA256 = input.pins.publisherSQLSHA256;
  const after = await localWitness(reader);
  demand(
    (after.transactions as { rows: number }).rows === 988128,
    "Concurrent logical inserts duplicated",
  );
  const third = new PublicationSequenceBudget(limits),
    replay = await publishStaged(input, third, factory(), "replay");
  demand(
    replay.mutations === 0 && same(await localWitness(reader), after),
    "Concurrent replay full state drift",
  );
  report.concurrency = {
    status: "PASS",
    results,
    replay,
    wholeState: after,
    sequences: [one.finish(), two.finish(), third.finish()],
  };
  save();
  await resetLocalDerived();
  demand(same(await localWitness(reader), core.baselineWitness), "Final local reset mismatch");
  report.finalState = "Original public baseline restored locally; remote state untouched";
  report.status = "PASS";
  report.finishedAtUTC = new Date().toISOString();
  save();
} catch (e) {
  report.status = "FAIL";
  report.failure = {
    name: e instanceof Error ? e.name : "unknown",
    message: e instanceof Error ? e.message : "unknown",
  };
  save();
  process.exitCode = 1;
} finally {
  source.close();
  await reader.end();
  await admin.end();
}
console.log(JSON.stringify({ status: report.status, failure: report.failure }));
