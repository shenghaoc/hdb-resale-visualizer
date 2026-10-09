/** Transport faults/model receipts only. These tests make no PostgreSQL or upstream calls. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { canonicalJson } from "../../scripts/lib/sync/neon";
import {
  sourceFactsSHA256,
  type NeonReconciliationReview,
} from "../../scripts/lib/sync/neon-reconciliation";
import {
  packStage,
  sha256,
  stageIdentity,
  stagePublicationId,
  expectedModeReceipt,
  STAGE_TABLES,
  type StageEnvelope,
  type StageItem,
} from "../../scripts/neon-benchmark/staged-plan";
import {
  assertExecutionInput,
  type StageExecutionInput,
  type ExecutionPins,
  type SequenceLimits,
} from "../../scripts/neon-benchmark/staged-execution";
import {
  PublicationSequenceBudget,
  publishStaged,
  publicationSQLSHA256,
  recoverStagedOutcome,
  AmbiguousStagedCommitError,
  type PublicationTransport,
} from "../../scripts/neon-benchmark/staged-publisher";
import {
  PRECONDITIONS_SQL,
  POSTCONDITIONS_SQL,
  SCHEMA_CATALOG_SQL,
} from "../../scripts/neon-benchmark/staged-validation";
import type { TransactionRow } from "../../scripts/lib/schemas";
import { deriveCacheOnlyInputs } from "../../scripts/neon-benchmark/cache-only-context";
import { executionCodeSHA256 } from "../../scripts/neon-benchmark/staged-code-identity";
import { materializeDetailStage } from "../../scripts/neon-benchmark/materialized-details";

const timestamp = "2026-10-04T06:03:06.149Z";
const fact: TransactionRow = {
  month: "2026-09",
  town: "TEST",
  block: "1",
  street_name: "TEST ST",
  address_key: "test-1",
  flat_type: "4 ROOM",
  storey_range: "01 TO 03",
  floor_area_sqm: 92,
  lease_commence_year: 2019,
  resale_price: 625000,
  flat_model: "MODEL A",
};
function fixture(): StageExecutionInput {
  const review = JSON.parse(
    readFileSync("docs/evidence/neon-reconciliation-review-2026-10-04.json", "utf8"),
  ) as NeonReconciliationReview;
  const baselineManifest = { generatedAt: "2026-08-29T00:00:00.000Z" };
  review.initialBaselineManifestSHA256 = sha256(canonicalJson(baselineManifest));
  review.initialSourceFactsSHA256 = sha256("model-only full source");
  review.oneTimeAllowance!.positiveFactsSHA256 = sourceFactsSHA256(
    Array.from({ length: 2595 }, () => fact),
  );
  const items: StageItem[] = [
    ...Array.from(
      { length: 2595 },
      (_, i): StageItem => ({
        table: "transactions",
        operation: "insert",
        key: { id: 985534 + i },
        before: null,
        after: { id: 985534 + i, ...fact },
      }),
    ),
    {
      table: "blocks",
      operation: "update",
      key: { address_key: "test-1" },
      before: { median_price: 600000 },
      after: { median_price: 625000 },
    },
    {
      table: "block_details",
      operation: "update",
      key: { address_key: "test-1" },
      before: {},
      after: {},
      detailPatches: [{ path: ["summary", "medianPrice"], before: 600000, after: 625000 }],
    },
    {
      table: "comparisons",
      operation: "update",
      key: { address_key: "test-1" },
      before: { json: { old: true } },
      after: { json: { new: true } },
    },
    {
      table: "town_flat_type_trends",
      operation: "insert",
      key: { town: "TEST", flat_type: "4 ROOM", month: "2026-09" },
      before: null,
      after: {
        town: "TEST",
        flat_type: "4 ROOM",
        month: "2026-09",
        median_price: 625000,
        median_price_per_sqm: 6793,
        transaction_count: 1,
      },
    },
    {
      table: "town_flat_type_trends",
      operation: "update",
      key: { town: "TEST", flat_type: "4 ROOM", month: "2026-08" },
      before: { median_price: 600000 },
      after: { median_price: 625000 },
    },
  ];
  const materialized = materializeDetailStage(
    packStage(items),
    new Map([["test-1", { summary: { medianPrice: 600000 } }]]),
    new Map([["test-1", sha256("mock PostgreSQL old-detail encoding")]]),
  );
  const plan = materialized.plan;
  const schemaCatalog = {
    tables: [...STAGE_TABLES, "manifest"].sort().map((name) => ({
      name,
      kind: "r",
      rls: false,
      forcedRls: false,
      columns: [],
      constraints: [],
      indexes: [],
      triggers: [],
      rules: [],
    })),
  };
  const normalizedContext = {
    sourceAddressKeys: ["test-1"],
    mrtExits: [],
    skippedSupermarketKeys: [],
    skippedSchoolKeys: [],
  };
  const cacheInputs = { geocode_cache: [], walking_time_cache: [] };
  const resolutionInputs: ExecutionPins["resolutionInputs"] = deriveCacheOnlyInputs({
    ...normalizedContext,
    cacheInputs,
  });
  const rawContextHashes = {
    property: sha256("property"),
    mrt: sha256("mrt"),
    schools: sha256("schools"),
    hawkers: sha256("hawkers"),
    supermarkets: sha256("supermarkets"),
    parks: sha256("parks"),
  };
  const allowance = review.oneTimeAllowance!;
  const envelope: StageEnvelope = {
    version: 1,
    status: "approved",
    intent: "manual-snapshot",
    decisionReference: "local transport fixture only",
    projectId: review.projectId,
    branchId: review.branchId,
    sourceIdentity: {
      rawCSVBodySHA256: allowance.rawCSVBodySHA256,
      canonicalScopedFactsSHA256: allowance.incomingScopedFactsSHA256,
      baselineScopedFactsSHA256: allowance.baselineScopedFactsSHA256,
      positiveFactsSHA256: allowance.positiveFactsSHA256,
      reconciliationReviewSHA256: sha256(canonicalJson(review)),
      baselineScopedRows: allowance.baselineScopedRows,
      incomingScopedRows: allowance.incomingScopedRows,
      exactIncomingOccurrences: allowance.exactInserts,
      unresolvedCount: 5,
      historicalInputs: "retained-baseline-not-recaptured",
    },
    baselineManifestSHA256: review.initialBaselineManifestSHA256,
    baselineHasBuildState: false,
    context: {
      rawHashes: rawContextHashes,
      normalizedSHA256: sha256(canonicalJson(normalizedContext)),
      missingGeocodeKeys: ["test-1"],
      missingRoutingKeys: [],
      resolution: "cache-only-pinned",
    },
    unresolvedOccurrences: review.retentions.map((r) => ({
      id: r.id,
      tuple: r.fact,
      occurrenceCount: 1,
      remainingLease: r.remainingLease,
      disposition: r.disposition,
    })),
    detailOwnedPaths: [["summary", "medianPrice"]],
    stage: stageIdentity(plan),
    nextManifestSHA256: sha256("pending-fixture-manifest"),
    limits: {
      exactCopyBytes: plan.copyBytes,
      exactRows: plan.rows,
      maxTemporaryBytes: 10_000_000,
      reservedDatabaseGrowthBytes: 10_000_000,
      maxStatementMs: 120000,
      maxTransactionMs: 600000,
      maxLockWaitMs: 5000,
    },
  };
  const nextManifest = {
    generatedAt: timestamp,
    neonPublication: { publicationId: stagePublicationId(envelope) },
    neonReconciliation: {
      version: 1,
      entries: review.retentions.map((r) => ({
        ...r,
        occurrenceCount: 1,
        firstObservedMissingAt: timestamp,
        lastObservedMissingAt: timestamp,
        lastSourceFactsSHA256: review.initialSourceFactsSHA256,
        status: "unresolved-retained",
        decisionReference: "model only",
        possibleReplacementRowIds: [],
      })),
      acceptedSource: {
        capturedAtUTC: timestamp,
        factsSHA256: review.initialSourceFactsSHA256,
        sourceFactRows: 988123,
        sourceNormalizedRows: 988123,
        storedFactRows: 988128,
        outstandingRetainedOccurrences: 5,
        csvs: [
          {
            datasetId: review.growth.scopeDatasetId,
            bodySHA256: allowance.rawCSVBodySHA256,
            bytes: 23928760,
            rows: 241920,
          },
        ],
        scopedSourceRows: allowance.incomingScopedRows,
        scopedSourceFactsSHA256: allowance.incomingScopedFactsSHA256,
      },
      appliedOneTimeAllowance: allowance,
    },
  };
  envelope.nextManifestSHA256 = sha256(canonicalJson(nextManifest));
  const input: StageExecutionInput = {
    plan,
    envelope,
    baselineManifest,
    nextManifest,
    reconciliationReview: review,
    detailDerivations: materialized.derivations,
    observedBinding: {
      sourceIdentity: envelope.sourceIdentity,
      baselineManifestSHA256: envelope.baselineManifestSHA256,
      baselineHasBuildState: false,
      context: envelope.context,
      unresolvedOccurrences: envelope.unresolvedOccurrences,
    },
    pins: {
      baselineMaximumTransactionId: 985533,
      schemaCatalogSHA256: sha256(canonicalJson(schemaCatalog)),
      schemaCatalog,
      cacheInputSHA256: sha256(canonicalJson(cacheInputs)),
      cacheInputs,
      resolutionInputs,
      resolutionInputsSHA256: sha256(canonicalJson(resolutionInputs)),
      normalizedContext,
      normalizedContextSHA256: sha256(canonicalJson(normalizedContext)),
      rawContextHashes,
      sourceFullFactsSHA256: review.initialSourceFactsSHA256,
      sourceRawBytes: 23928760,
      builderCodeSHA256: executionCodeSHA256(),
      publisherSQLSHA256: publicationSQLSHA256(plan),
      sequenceLimitsSHA256: sha256(canonicalJson(limits)),
      estimatedTemporaryUpperBytes: 5_000_000,
      maximumDatabaseBytesBeforeStage: 450_000_000,
      projectOtherBranchStorageUpperBytes: 10_000_000,
      minimumRemainingProjectBytes: 268_435_456,
      targetUpdatedAtUTC: timestamp,
      materializedDetailIdentity: materialized.identity,
      publicationCommands: 20,
    },
  };
  repin(input);
  return input;
}
function repin(input: StageExecutionInput, sequence = limits) {
  input.pins.sequenceLimitsSHA256 = sha256(canonicalJson(sequence));
  input.envelope.executionPinsSHA256 = sha256(canonicalJson(input.pins));
  input.nextManifest.neonPublication = { publicationId: stagePublicationId(input.envelope) };
  input.envelope.nextManifestSHA256 = sha256(canonicalJson(input.nextManifest));
}
const limits: SequenceLimits = {
  maxCommands: 80,
  maxConnections: 6,
  maxReceivedProxyBytes: 20_000_000,
  maxSentProxyBytes: 40_000_000,
  maxWallMs: 1_500_000,
  maxComputeCUHoursProxy: 1,
  endpointMaximumCU: 1,
  endpointIdleTailMs: 300000,
  connectionTimeoutMs: 30000,
  twoPassReconciliationReceivedProxyReserve: 987415848,
  providerTransferUsed: "UNKNOWN",
  providerComputeUsed: "UNKNOWN",
};
type Fault =
  | "none"
  | "copy"
  | "schema"
  | "target"
  | "receipt"
  | "commit-accepted-lost"
  | "commit-not-accepted"
  | "stale-manifest"
  | "missing-meta"
  | "lock-race"
  | "lock-already-published"
  | "storage-growth";
function model(input: StageExecutionInput, fault: Fault = "none") {
  let durable = input.baselineManifest,
    working = durable;
  let durableMutations = 0,
    pendingMutations = 0,
    received = 0,
    sent = 0,
    closed = 0;
  const commands: string[] = [],
    chunks: number[] = [];
  const checks = () =>
    STAGE_TABLES.map((table) => ({
      table_name: table,
      staged_rows: input.plan.groups[table].insert + input.plan.groups[table].update,
      mismatches: fault === "target" && table === "blocks" ? 1 : 0,
    }));
  const transport: PublicationTransport = {
    query: async (sql, params = []) => {
      commands.push(sql);
      sent += Buffer.byteLength(sql) + Buffer.byteLength(canonicalJson(params));
      received += 128;
      const result = (row: Record<string, unknown>) => ({ rows: [row], rowCount: 1 });
      if (sql === "BEGIN") {
        working = durable;
        pendingMutations = 0;
      }
      if (sql === "ROLLBACK") {
        working = durable;
        pendingMutations = 0;
      }
      if (sql === "COMMIT") {
        if (fault === "commit-not-accepted")
          throw new Error("model response lost before acceptance");
        durable = working;
        durableMutations += pendingMutations;
        pendingMutations = 0;
        if (fault === "commit-accepted-lost")
          throw new Error("model response lost after acceptance");
      }
      if (sql.startsWith("SELECT json FROM public.manifest")) {
        if (fault === "lock-already-published" && sql.endsWith("FOR UPDATE"))
          durable = working = input.nextManifest;
        return result({
          json:
            fault === "stale-manifest" || (fault === "lock-race" && sql.endsWith("FOR UPDATE"))
              ? { other: true }
              : durable,
        });
      }
      if (sql.includes("AS root_sha256"))
        return result({
          rows: input.plan.rows,
          payload_bytes: input.plan.payloadBytes,
          root_sha256: input.plan.rootSHA256,
          temporary_bytes: 1_000_000,
          database_bytes: 420_000_000,
        });
      if (sql === PRECONDITIONS_SQL)
        return result({
          target_checks: checks(),
          retained_mismatches: 0,
          maximum_transaction_id: 985533,
          cache_inputs_match: true,
          schema_catalog: fault === "schema" ? {} : input.pins.schemaCatalog,
        });
      if (sql === POSTCONDITIONS_SQL)
        return result({
          target_checks: checks(),
          retained_mismatches: 0,
          maximum_transaction_id: 988128,
          database_bytes: fault === "storage-growth" ? 450_000_000 : 421_000_000,
          temporary_bytes: 1_000_000,
        });
      if (sql.startsWith("WITH changed AS")) {
        const table = STAGE_TABLES.find((t) => sql.includes(`s.item->>'table'='${t}'`))!;
        const operation = sql.includes("s.item->>'operation'='insert'") ? "insert" : "update";
        const expected = expectedModeReceipt(input.plan, table, operation);
        pendingMutations += expected.rows;
        if (fault === "missing-meta") return result({});
        return result({
          affected_rows: expected.rows,
          ordinal_sha256: fault === "receipt" ? sha256("wrong") : expected.ordinalSHA256,
          results_match: true,
        });
      }
      if (sql.startsWith("UPDATE public.manifest")) {
        working = JSON.parse(String(params[0]));
        pendingMutations++;
        return result({ json: working, database_bytes: 421_010_000, temporary_bytes: 1_000_000 });
      }
      return { rows: [], rowCount: null };
    },
    copy: async (_sql, source) => {
      commands.push("COPY");
      let bytes = 0;
      for await (const chunk of source) {
        bytes += chunk.length;
        sent += chunk.length;
        chunks.push(chunk.length);
        if (fault === "copy") throw new Error("model COPY interruption");
      }
      expect(bytes).toBe(input.plan.copyBytes);
      return input.plan.rows;
    },
    sample: () => ({ receivedProxyBytes: received, sentProxyBytes: sent }),
    destroy: () => {},
    close: async () => {
      closed++;
    },
  };
  return {
    factory: async () => transport,
    commands,
    chunks,
    state: () => ({ durable, durableMutations, pendingMutations, closed }),
  };
}

describe("staged publisher admission — offline only", () => {
  it("binds the exact approved source allowance, five retained tuples and final ledger", () => {
    const input = fixture();
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).not.toThrow();
    const changed = structuredClone(input);
    changed.envelope.unresolvedOccurrences[0].remainingLease = "invented";
    expect(() => assertExecutionInput(changed, publicationSQLSHA256(changed.plan))).toThrow();
  });
  it("rejects tampered packed bytes before a connection", async () => {
    const input = fixture();
    input.plan.copyText += "1,changed\n";
    const fake = model(input),
      budget = new PublicationSequenceBudget(limits);
    await expect(publishStaged(input, budget, fake.factory, "success")).rejects.toThrow(
      "COPY/input identity",
    );
    expect(fake.commands).toEqual([]);
    budget.finish();
  });
  it("does not default missing context/cache/schema fields", () => {
    const input = fixture();
    const bad = structuredClone(input);
    delete (bad.pins as Partial<ExecutionPins>).resolutionInputs;
    expect(() => assertExecutionInput(bad, publicationSQLSHA256(bad.plan))).toThrow();
    input.pins.resolutionInputs.omittedAddressKeys = [];
    input.pins.resolutionInputsSHA256 = sha256(canonicalJson(input.pins.resolutionInputs));
    repin(input);
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow(
      "omitted/fallback set drift",
    );
  });
  it("blocks mutation modes that differ from the exact approved command count", () => {
    const input = fixture();
    input.plan = packStage([
      ...input.plan.items,
      {
        table: "geocode_cache",
        operation: "insert",
        key: { cache_key: "new" },
        before: null,
        after: {
          cache_key: "new",
          lat: 1.3,
          lng: 103.8,
          postal_code: null,
          display_name: null,
          search_value: "NEW",
          updated_at: timestamp,
        },
      },
    ]);
    input.envelope.stage = stageIdentity(input.plan);
    input.envelope.limits.exactRows = input.plan.rows;
    input.envelope.limits.exactCopyBytes = input.plan.copyBytes;
    input.nextManifest.neonPublication = { publicationId: stagePublicationId(input.envelope) };
    input.envelope.nextManifestSHA256 = sha256(canonicalJson(input.nextManifest));
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow(
      "approved command shape",
    );
  });
  it("never blesses triggers or RLS via a matching hash", () => {
    const input = fixture();
    const tables = input.pins.schemaCatalog.tables as { triggers: unknown[] }[];
    tables[0].triggers = ["new trigger"];
    input.pins.schemaCatalogSHA256 = sha256(canonicalJson(input.pins.schemaCatalog));
    repin(input);
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow("trigger");
  });
  it("includes temp, other branch, growth and remaining project reserve", () => {
    const input = fixture();
    input.pins.projectOtherBranchStorageUpperBytes = 600_000_000;
    repin(input);
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow(
      "storage admission",
    );
  });
  it("cannot remove accepted byte ceilings or project headroom by repinning an envelope", () => {
    const input = fixture();
    input.envelope.limits.exactCopyBytes = 90_000_001;
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow();
    input.envelope.limits.exactCopyBytes = input.plan.copyBytes;
    input.envelope.limits.maxTemporaryBytes = 268_435_457;
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow();
    input.envelope.limits.maxTemporaryBytes = 268_435_456;
    input.pins.minimumRemainingProjectBytes = 0;
    repin(input);
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow();
  });
  it.each(Object.keys(fixture().pins))(
    "rejects drift in every frozen execution pin: %s",
    (field) => {
      const input = fixture();
      const mutable = input.pins as unknown as Record<string, unknown>;
      const value = mutable[field];
      mutable[field] =
        typeof value === "number"
          ? value + 1
          : typeof value === "string"
            ? sha256("changed and self-hashed inputs")
            : { ...(value as Record<string, unknown>), drift: true };
      expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow();
    },
  );
  it("verifies source code bytes and CSV byte count even if an envelope is repinned", () => {
    const input = fixture();
    input.pins.builderCodeSHA256 = sha256("wrong source code");
    repin(input);
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow(
      "pin drift",
    );
    input.pins.builderCodeSHA256 = executionCodeSHA256();
    input.pins.sourceRawBytes = 1;
    repin(input);
    expect(() => assertExecutionInput(input, publicationSQLSHA256(input.plan))).toThrow(
      "checkpoint",
    );
  });
});

describe("transport/model fault witnesses — no PostgreSQL execution", () => {
  it("accounts completed COPY when a concurrent winner is found at the manifest lock", async () => {
    const input = fixture(),
      fake = model(input, "lock-already-published"),
      budget = new PublicationSequenceBudget(limits);
    const result = await publishStaged(input, budget, fake.factory, "success");
    expect(result).toMatchObject({
      state: "already-published",
      mutations: 0,
      commands: 9,
      copyBytes: input.plan.copyBytes,
    });
    expect(fake.commands).toContain("COPY");
    expect(fake.commands.at(-1)).toBe("ROLLBACK");
    expect(fake.state().durableMutations).toBe(0);
    budget.finish();
  });
  it("sends exactly 20 commands with manifest last and bounded COPY frames", async () => {
    const input = fixture(),
      fake = model(input),
      budget = new PublicationSequenceBudget(limits);
    const result = await publishStaged(input, budget, fake.factory, "success");
    expect(result).toMatchObject({ state: "published", commands: 20, mutations: 2601 });
    expect(fake.commands).toHaveLength(20);
    expect(fake.commands.at(-2)).toMatch(/^UPDATE public.manifest/);
    expect(fake.commands.at(-1)).toBe("COMMIT");
    expect(Math.max(...fake.chunks)).toBeLessThanOrEqual(65536);
    expect(fake.state().durableMutations).toBe(2601);
    budget.finish();
  });
  it("uses a single cheap durable manifest read for zero-mutation rerun", async () => {
    const input = fixture(),
      fake = model(input),
      budget = new PublicationSequenceBudget(limits);
    await publishStaged(input, budget, fake.factory, "success");
    const result = await publishStaged(input, budget, fake.factory, "replay");
    expect(result).toMatchObject({
      state: "already-published",
      commands: 1,
      mutations: 0,
      copyBytes: 0,
    });
    expect(fake.state().durableMutations).toBe(2601);
    budget.finish();
  });
  it.each([
    "copy",
    "schema",
    "target",
    "receipt",
    "missing-meta",
    "stale-manifest",
    "lock-race",
    "storage-growth",
  ] as const)("aborts %s and never commits a partial publication", async (fault) => {
    const input = fixture(),
      fake = model(input, fault),
      budget = new PublicationSequenceBudget(limits);
    await expect(publishStaged(input, budget, fake.factory, "success")).rejects.toThrow();
    expect(fake.commands).not.toContain("COMMIT");
    expect(fake.state().durable).toEqual(input.baselineManifest);
    expect(fake.state().durableMutations).toBe(0);
    budget.finish();
  });
  it("injects a snapshot rejection before durable DML", async () => {
    const input = fixture(),
      fake = model(input),
      budget = new PublicationSequenceBudget(limits);
    await expect(publishStaged(input, budget, fake.factory, "snapshot-rejection")).rejects.toThrow(
      "Injected snapshot",
    );
    expect(fake.commands.some((c) => c.startsWith("WITH changed AS"))).toBe(false);
    expect(fake.commands.at(-1)).toBe("ROLLBACK");
    budget.finish();
  });
  it("rolls back an injected pre-manifest failure, then permits exactly one successful step", async () => {
    const input = fixture(),
      fake = model(input),
      budget = new PublicationSequenceBudget(limits);
    await expect(
      publishStaged(input, budget, fake.factory, "failure-before-manifest"),
    ).rejects.toThrow("Injected failure");
    expect(fake.state().durableMutations).toBe(0);
    expect(fake.state().pendingMutations).toBe(0);
    await publishStaged(input, budget, fake.factory, "success");
    expect(fake.state().durableMutations).toBe(2601);
    await expect(publishStaged(input, budget, fake.factory, "success")).rejects.toThrow(
      "already consumed",
    );
    budget.finish();
  });
  it.each(["commit-accepted-lost", "commit-not-accepted"] as const)(
    "requires bounded fresh recovery after %s, without blind retry",
    async (fault) => {
      const input = fixture(),
        fake = model(input, fault),
        budget = new PublicationSequenceBudget(limits);
      await expect(publishStaged(input, budget, fake.factory, "success")).rejects.toBeInstanceOf(
        AmbiguousStagedCommitError,
      );
      const outcome = await recoverStagedOutcome(input, budget, fake.factory);
      expect(outcome).toBe(
        fault === "commit-accepted-lost" ? "already-published" : "baseline-retry-eligible",
      );
      expect(fake.commands.filter((c) => c === "COMMIT")).toHaveLength(1);
      budget.finish();
    },
  );
  it("fails closed if replay has no durable publication receipt", async () => {
    const input = fixture(),
      fake = model(input),
      budget = new PublicationSequenceBudget(limits);
    await expect(publishStaged(input, budget, fake.factory, "replay")).rejects.toThrow(
      "replay cannot publish",
    );
    expect(fake.commands).toHaveLength(1);
    budget.finish();
  });
  it("does not reset shared command/transfer/time reserves on another step", async () => {
    const input = fixture(),
      fake = model(input),
      budget = new PublicationSequenceBudget({ ...limits, maxCommands: 20 });
    repin(input, budget.limits);
    await publishStaged(input, budget, fake.factory, "success");
    await expect(publishStaged(input, budget, fake.factory, "replay")).rejects.toThrow("reserve");
    expect(fake.commands).toHaveLength(20);
    budget.finish();
  });
  it("closes fresh recovery transport when the shared command reserve is exhausted", async () => {
    const input = fixture(),
      fake = model(input),
      budget = new PublicationSequenceBudget({ ...limits, maxCommands: 20 });
    repin(input, budget.limits);
    await publishStaged(input, budget, fake.factory, "success");
    await expect(recoverStagedOutcome(input, budget, fake.factory)).rejects.toThrow("reserve");
    expect(fake.state().closed).toBe(2);
    budget.finish();
  });
  it("requires a wall-time plus idle-tail compute reserve and preserves unknown usage", () => {
    expect(() => new PublicationSequenceBudget({ ...limits, connectionTimeoutMs: 0 })).toThrow();
    expect(() => new PublicationSequenceBudget({ ...limits, maxComputeCUHoursProxy: 0.1 })).toThrow(
      "compute upper proxy",
    );
    const budget = new PublicationSequenceBudget(limits);
    const receipt = budget.finish();
    expect(receipt.providerComputeUsed).toBe("UNKNOWN");
    expect(receipt.providerTransferUsed).toBe("UNKNOWN");
    expect(budget.limits.twoPassReconciliationReceivedProxyReserve).toBe(987415848);
  });
  it("preserves counters and elapsed time when resuming only read-only admission", () => {
    const previous = new PublicationSequenceBudget(limits);
    previous.reserveCommand("admit-schema", 1024);
    const receipt = previous.finish();
    receipt.startedAtUTC = new Date(Date.now() - 60_000).toISOString();
    receipt.receivedProxyBytes = 120;
    receipt.sentProxyBytes = 240;
    receipt.connections = 1;
    const resumed = new PublicationSequenceBudget(limits, receipt);
    expect(resumed.remainingWallMs()).toBeLessThanOrEqual(limits.maxWallMs - 60_000);
    const final = resumed.finish();
    expect(final.commands).toHaveLength(1);
    expect(final.connections).toBe(1);
    expect(final.receivedProxyBytes).toBe(120);
    expect(final.sentProxyBytes).toBe(240);
  });
  it("refuses to resume a receipt that dispatched publication commands", () => {
    const previous = new PublicationSequenceBudget(limits);
    previous.reserveCommand("copy-stage", 1024);
    expect(() => new PublicationSequenceBudget(limits, previous.finish())).toThrow(
      "no mutation retry",
    );
  });
});

describe("server validation SQL shape only — syntax/execution pending remote gate", () => {
  it("validates typed before values, absent leaves, complete caches and retained tuples without a full corpus scan", () => {
    expect(PRECONDITIONS_SQL).toContain("jsonb_populate_record");
    expect(PRECONDITIONS_SQL).toContain("CASE WHEN s.item->>'operation'='insert' THEN '{}'::jsonb");
    expect(PRECONDITIONS_SQL).toContain("detailBeforePgSHA256");
    expect(PRECONDITIONS_SQL).not.toContain("WITH RECURSIVE");
    expect(PRECONDITIONS_SQL).toContain("public.geocode_cache");
    expect(PRECONDITIONS_SQL).toContain("public.walking_time_cache");
    expect(PRECONDITIONS_SQL).toContain("ORDER BY id DESC LIMIT 1");
    expect(PRECONDITIONS_SQL).not.toContain("count(*) FROM public.transactions");
    expect(POSTCONDITIONS_SQL).toContain("retained_mismatches");
    expect(SCHEMA_CATALOG_SQL).toContain("pg_get_triggerdef");
  });
});
