/** Manual, exact-snapshot admission. This module never opens a connection. */
import { z } from "zod";
import { assertCacheOnlyInputs, cacheOnlyInputsSchema } from "./cache-only-context";
import type { MrtExit } from "../lib/pipeline";
import { executionCodeSHA256 } from "./staged-code-identity";
import { assertMaterializedDetails, type DetailDerivation } from "./materialized-details";
import { canonicalJson } from "../lib/sync/neon";
import {
  requireApprovedNeonReview,
  neonReconciliationStateSchema,
} from "../lib/sync/neon-reconciliation";
import {
  assertStageEnvelope,
  sha256,
  statementShape,
  STAGE_DESCRIPTOR,
  packStage,
  stageIdentity,
  STAGE_MIN_PROJECT_HEADROOM_BYTES,
  type StageEnvelope,
  type PackedStage,
} from "./staged-plan";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().safe();
const jsonObject = z.record(z.string(), z.json());
const cacheRows = z.array(jsonObject);
export const executionPinsSchema = z
  .object({
    baselineMaximumTransactionId: count,
    schemaCatalogSHA256: hash,
    schemaCatalog: jsonObject,
    cacheInputSHA256: hash,
    cacheInputs: z.object({ geocode_cache: cacheRows, walking_time_cache: cacheRows }).strict(),
    // Established cache-only pipeline outputs; missing coordinates are pinned omissions.
    resolutionInputs: cacheOnlyInputsSchema,
    resolutionInputsSHA256: hash,
    normalizedContext: jsonObject,
    normalizedContextSHA256: hash,
    rawContextHashes: z
      .object({
        property: hash,
        mrt: hash,
        schools: hash,
        hawkers: hash,
        supermarkets: hash,
        parks: hash,
      })
      .strict(),
    sourceFullFactsSHA256: hash,
    sourceRawBytes: count,
    builderCodeSHA256: hash,
    publisherSQLSHA256: hash,
    sequenceLimitsSHA256: hash,
    // This is an admission reserve, not a promise that temp_file_limit limits temp tables.
    estimatedTemporaryUpperBytes: count,
    maximumDatabaseBytesBeforeStage: count,
    projectOtherBranchStorageUpperBytes: count,
    minimumRemainingProjectBytes: count.min(STAGE_MIN_PROJECT_HEADROOM_BYTES),
    targetUpdatedAtUTC: z.iso.datetime(),
    materializedDetailIdentity: jsonObject,
    publicationCommands: count.positive().max(100),
  })
  .strict();
export type ExecutionPins = z.infer<typeof executionPinsSchema>;

export const sequenceLimitsSchema = z
  .object({
    maxCommands: count.max(100),
    maxConnections: count.max(8),
    maxReceivedProxyBytes: count,
    maxSentProxyBytes: count,
    maxWallMs: count.max(25 * 60_000),
    maxComputeCUHoursProxy: z.number().positive().max(1),
    endpointMaximumCU: z.number().positive().max(1),
    endpointIdleTailMs: count.max(10 * 60_000),
    connectionTimeoutMs: count.positive().max(30_000),
    // Reserve existing two complete reconciliation passes unchanged, even though this
    // execution path uses prepared local rows and performs neither corpus scan.
    twoPassReconciliationReceivedProxyReserve: z.literal(987_415_848),
    providerTransferUsed: z.literal("UNKNOWN"),
    providerComputeUsed: z.literal("UNKNOWN"),
  })
  .strict();
export type SequenceLimits = z.infer<typeof sequenceLimitsSchema>;
export type StageExecutionInput = {
  plan: PackedStage;
  envelope: StageEnvelope;
  baselineManifest: Record<string, unknown>;
  nextManifest: Record<string, unknown>;
  observedBinding: unknown;
  reconciliationReview: unknown;
  pins: ExecutionPins;
  detailDerivations: DetailDerivation[];
};
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const sorted = (values: number[]) => values.toSorted((a, b) => a - b);

export function assertExecutionInput(input: StageExecutionInput, sqlSHA256: string) {
  const { plan, envelope, baselineManifest, nextManifest } = input;
  const rebuilt = packStage(plan.items);
  if (
    !same(stageIdentity(rebuilt), stageIdentity(plan)) ||
    rebuilt.copyText !== plan.copyText ||
    !same(rebuilt.wires, plan.wires)
  )
    throw new Error("Packed COPY/input identity drift");
  const publicationId = assertStageEnvelope(plan, envelope, input.observedBinding, nextManifest);
  const pins = executionPinsSchema.parse(input.pins);
  assertMaterializedDetails(
    plan,
    input.detailDerivations,
    envelope.detailOwnedPaths,
    pins.materializedDetailIdentity,
  );
  if (envelope.executionPinsSHA256 !== sha256(canonicalJson(pins)))
    throw new Error("Execution pins differ from the approved publication identity");
  const review = requireApprovedNeonReview(input.reconciliationReview);
  const allowance = review.oneTimeAllowance;
  if (!allowance || allowance.exactInserts !== 2595 || review.retentions.length !== 5)
    throw new Error("Only the exact approved catch-up snapshot can use this executor");
  const expectedSourceIdentity = {
    rawCSVBodySHA256: allowance.rawCSVBodySHA256,
    canonicalScopedFactsSHA256: allowance.incomingScopedFactsSHA256,
    baselineScopedFactsSHA256: allowance.baselineScopedFactsSHA256,
    positiveFactsSHA256: allowance.positiveFactsSHA256,
    reconciliationReviewSHA256: sha256(canonicalJson(review)),
    baselineScopedRows: allowance.baselineScopedRows,
    incomingScopedRows: allowance.incomingScopedRows,
    exactIncomingOccurrences: allowance.exactInserts,
    unresolvedCount: allowance.exactMissingIds.length,
    historicalInputs: "retained-baseline-not-recaptured",
  };
  if (
    !same(expectedSourceIdentity, envelope.sourceIdentity) ||
    envelope.baselineManifestSHA256 !== review.initialBaselineManifestSHA256 ||
    sha256(canonicalJson(baselineManifest)) !== envelope.baselineManifestSHA256 ||
    Boolean(baselineManifest.syncBuildState) !== envelope.baselineHasBuildState ||
    !same(
      envelope.unresolvedOccurrences.toSorted((a, b) => a.id - b.id),
      review.retentions
        .map((r) => ({
          id: r.id,
          tuple: r.fact,
          occurrenceCount: 1,
          remainingLease: r.remainingLease,
          disposition: r.disposition,
        }))
        .toSorted((a, b) => a.id - b.id),
    ) ||
    !same(
      sorted(envelope.unresolvedOccurrences.map((r) => r.id)),
      sorted(allowance.exactMissingIds),
    )
  )
    throw new Error("Reviewed source/baseline/retained tuple drift");
  const ids = sorted(
    plan.items.filter((r) => r.table === "transactions").map((r) => Number(r.key.id)),
  );
  if (ids.some((id, i) => id !== pins.baselineMaximumTransactionId + i + 1))
    throw new Error("Stable integer allocation drift");
  if (pins.baselineMaximumTransactionId < Math.max(...allowance.exactMissingIds))
    throw new Error("Invalid retained identity boundary");
  if (statementShape(plan.groups).sqlStatements !== pins.publicationCommands)
    throw new Error(
      "Resolved mutation modes differ from the approved command shape; review required",
    );
  if (
    pins.publisherSQLSHA256 !== sqlSHA256 ||
    pins.builderCodeSHA256 !== executionCodeSHA256() ||
    pins.schemaCatalogSHA256 !== sha256(canonicalJson(pins.schemaCatalog)) ||
    pins.cacheInputSHA256 !== sha256(canonicalJson(pins.cacheInputs)) ||
    pins.resolutionInputsSHA256 !== sha256(canonicalJson(pins.resolutionInputs)) ||
    pins.normalizedContextSHA256 !== sha256(canonicalJson(pins.normalizedContext)) ||
    pins.normalizedContextSHA256 !== envelope.context.normalizedSHA256 ||
    !same(pins.rawContextHashes, envelope.context.rawHashes)
  )
    throw new Error("Schema/SQL/cache/context pin drift");
  const catalogTables = z.array(jsonObject).parse(pins.schemaCatalog.tables);
  const expectedTables = [...Object.keys(STAGE_DESCRIPTOR), "manifest"].sort();
  if (
    !same(catalogTables.map((t) => z.string().parse(t.name)).sort(), expectedTables) ||
    catalogTables.some(
      (t) =>
        t.kind !== "r" ||
        t.rls !== false ||
        t.forcedRls !== false ||
        !same(t.triggers, []) ||
        !same(t.rules, []),
    )
  )
    throw new Error("Unreviewed table kind, trigger, rule or RLS semantics");
  for (const [table, rows] of Object.entries(pins.cacheInputs)) {
    const expected =
      STAGE_DESCRIPTOR[table as "geocode_cache" | "walking_time_cache"].columns.toSorted();
    if (
      new Set(rows.map((r) => r.cache_key)).size !== rows.length ||
      rows.some(
        (r) =>
          typeof r.cache_key !== "string" ||
          !r.cache_key.length ||
          !same(Object.keys(r).sort(), expected),
      )
    )
      throw new Error("Incomplete or duplicated cache input rows");
  }
  const contextKeys = z.array(z.string().min(1));
  const cacheOnly = assertCacheOnlyInputs(pins.resolutionInputs, {
    sourceAddressKeys: contextKeys.parse(pins.normalizedContext.sourceAddressKeys),
    cacheInputs: pins.cacheInputs,
    mrtExits: z
      .array(
        z.object({ stationName: z.string(), lat: z.number().finite(), lng: z.number().finite() }),
      )
      .parse(pins.normalizedContext.mrtExits) as MrtExit[],
    skippedSupermarketKeys: contextKeys.parse(pins.normalizedContext.skippedSupermarketKeys),
    skippedSchoolKeys: contextKeys.parse(pins.normalizedContext.skippedSchoolKeys),
  });
  if (
    !same(
      envelope.context.missingGeocodeKeys,
      [
        ...cacheOnly.omittedAddressKeys,
        ...cacheOnly.skippedSchoolKeys,
        ...cacheOnly.skippedSupermarketKeys,
      ].sort(),
    ) ||
    !same(
      envelope.context.missingRoutingKeys,
      [
        ...new Set(
          cacheOnly.routePairs
            .filter((r) => r.source === "straight-line-fallback")
            .map((r) => r.cacheKey),
        ),
      ].sort(),
    )
  )
    throw new Error("Envelope cache-only omission/fallback drift");
  const state = neonReconciliationStateSchema.parse(nextManifest.neonReconciliation);
  if (
    state.acceptedSource.factsSHA256 !== review.initialSourceFactsSHA256 ||
    state.acceptedSource.csvs.filter((r) => r.datasetId === review.growth.scopeDatasetId).length !==
      1 ||
    state.acceptedSource.csvs.find((r) => r.datasetId === review.growth.scopeDatasetId)?.bytes !==
      pins.sourceRawBytes ||
    state.acceptedSource.csvs.find((r) => r.datasetId === review.growth.scopeDatasetId)
      ?.bodySHA256 !== allowance.rawCSVBodySHA256 ||
    pins.sourceFullFactsSHA256 !== review.initialSourceFactsSHA256 ||
    state.acceptedSource.scopedSourceFactsSHA256 !== allowance.incomingScopedFactsSHA256 ||
    state.acceptedSource.scopedSourceRows !== allowance.incomingScopedRows ||
    !same(state.appliedOneTimeAllowance, allowance) ||
    !same(
      state.entries
        .map((r) => ({
          id: r.id,
          fact: r.fact,
          remainingLease: r.remainingLease,
          status: r.status,
        }))
        .toSorted((a, b) => a.id - b.id),
      review.retentions
        .map((r) => ({
          id: r.id,
          fact: r.fact,
          remainingLease: r.remainingLease,
          status: "unresolved-retained",
        }))
        .toSorted((a, b) => a.id - b.id),
    )
  )
    throw new Error("Final durable source checkpoint/retention ledger drift");
  if (!same(nextManifest.generatedAt, pins.targetUpdatedAtUTC))
    throw new Error("Frozen manifest timestamp drift");
  if (
    pins.estimatedTemporaryUpperBytes < plan.copyBytes ||
    pins.estimatedTemporaryUpperBytes > envelope.limits.maxTemporaryBytes ||
    pins.maximumDatabaseBytesBeforeStage +
      pins.estimatedTemporaryUpperBytes +
      envelope.limits.reservedDatabaseGrowthBytes +
      pins.projectOtherBranchStorageUpperBytes +
      pins.minimumRemainingProjectBytes >
      1_073_741_824
  )
    throw new Error("Staging/project storage admission reserve exceeded");
  return {
    publicationId,
    pins,
    retainedRows: review.retentions.map((r) => ({ id: r.id, ...r.fact })),
  };
}
