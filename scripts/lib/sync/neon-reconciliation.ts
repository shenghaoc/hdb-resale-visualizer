/** Isolated Neon policy only. The D1 exact planner and its default guards stay unchanged. */
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assignStableTransactionIds,
  planTransactionDelta,
  transactionTuple,
  TRANSACTION_COLUMNS,
  type StoredTransaction,
} from "./incremental";
import { toTransactionRow, type ResaleTransaction } from "../pipeline";
import type { TransactionRow } from "../schemas";
import type { Manifest, StoredManifest } from "../../../shared/data-types";
import { NEON_REFRESH_BRANCH, NEON_REFRESH_PROJECT, canonicalJson } from "./neon";

const DAY_MS = 86_400_000;
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
// SQLite affinity permits fractional prices; never coerce them to integers.
const factSchema = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    town: z.string().min(1),
    block: z.string().min(1),
    street_name: z.string().min(1),
    address_key: z.string().min(1),
    flat_type: z.string().min(1),
    storey_range: z.string().min(1),
    floor_area_sqm: z.number().positive(),
    lease_commence_year: z.number().int().nullable(),
    resale_price: z.number().positive(),
    flat_model: z.string(),
  })
  .strict();
const retentionSchema = z
  .object({
    id: z.number().int().positive().safe(),
    fact: factSchema,
    disposition: z.literal("retain-unresolved"),
    evidence: z.string().min(1),
    remainingLease: z.string().min(1),
    possibleReplacementTuples: z.array(factSchema).max(10),
  })
  .strict();
/** Most stored occurrences one review may delete, and most absent IDs an allowance may pin. */
export const MAX_REVIEWED_REMOVALS = 25;
// A removal deletes one stored occurrence that is absent from the reviewed source.
const removalSchema = z
  .object({
    id: z.number().int().positive().safe(),
    fact: factSchema,
    disposition: z.literal("remove-absent-upstream"),
    evidence: z.string().min(1),
  })
  .strict();
const growthSchema = z
  .object({
    scopeDatasetId: z.literal("d_8b84c4ee58e3cfc0ece0d773c8ca6abc"),
    scopeMinMonth: z.literal("2017-01"),
    evidenceQuality: z.literal("uncalibrated-recurring-policy"),
    independentSnapshotIntervals: z.literal(0),
    relativeCeiling: z.literal(0.005),
    absoluteCeiling: z.literal(1000),
    maxMonthlyElapsedDays: z.number().positive().max(35),
    maxManualElapsedDays: z.number().positive().max(35),
  })
  .strict();
const oneTimeAllowanceSchema = z
  .object({
    baselineScopedFactsSHA256: digestSchema,
    incomingScopedFactsSHA256: digestSchema,
    rawCSVBodySHA256: digestSchema,
    positiveFactsSHA256: digestSchema,
    baselineScopedRows: z.number().int().positive().safe(),
    incomingScopedRows: z.number().int().positive().safe(),
    exactInserts: z.number().int().positive().max(5000),
    exactMissingIds: z.array(z.number().int().positive().safe()).max(5 + MAX_REVIEWED_REMOVALS),
    maxElapsedDays: z.number().positive().max(62),
    rationale: z.string().min(1),
  })
  .strict();
export const neonReconciliationReviewSchema = z
  .object({
    version: z.literal(1),
    projectId: z.literal(NEON_REFRESH_PROJECT),
    branchId: z.literal(NEON_REFRESH_BRANCH),
    reviewStatus: z.enum(["proposed", "approved"]),
    decisionReference: z.string().min(1),
    initialSourceFactsSHA256: digestSchema,
    initialBaselineManifestSHA256: digestSchema,
    maxNewRetentions: z.number().int().min(0).max(5),
    maxOutstandingRetentions: z.number().int().min(0).max(5),
    maxCorrections: z.literal(0),
    maxRemovals: z.number().int().min(0).max(MAX_REVIEWED_REMOVALS),
    retentions: z.array(retentionSchema).max(5),
    removals: z.array(removalSchema).max(MAX_REVIEWED_REMOVALS).optional(),
    growth: growthSchema,
    oneTimeAllowance: oneTimeAllowanceSchema.optional(),
  })
  .strict();
export type NeonReconciliationReview = z.infer<typeof neonReconciliationReviewSchema>;
export function requireApprovedNeonReview(value: unknown): NeonReconciliationReview {
  const review = neonReconciliationReviewSchema.parse(value);
  if (review.reviewStatus !== "approved")
    throw new Error(
      "Proposed Neon reconciliation policy requires an explicit reviewed decision before network activity",
    );
  if (new Set(review.retentions.map((entry) => entry.id)).size !== review.retentions.length)
    throw new Error("Duplicate retention review row IDs");
  const removalIds = (review.removals ?? []).map((entry) => entry.id);
  if (new Set(removalIds).size !== removalIds.length)
    throw new Error("Duplicate removal review row IDs");
  if (removalIds.length > review.maxRemovals)
    throw new Error("Reviewed removals exceed the review's own maxRemovals");
  if (review.retentions.some((entry) => removalIds.includes(entry.id)))
    throw new Error("A row ID cannot be both retained and removed by one review");
  return review;
}

const ledgerEntrySchema = retentionSchema
  .extend({
    occurrenceCount: z.literal(1),
    firstObservedMissingAt: z.iso.datetime(),
    lastObservedMissingAt: z.iso.datetime(),
    lastSourceFactsSHA256: digestSchema,
    status: z.enum(["unresolved-retained", "reappeared"]),
    decisionReference: z.string().min(1),
    possibleReplacementRowIds: z.array(z.number().int().positive().safe()),
  })
  .strict();
const sourceCheckpointSchema = z
  .object({
    capturedAtUTC: z.iso.datetime(),
    factsSHA256: digestSchema,
    sourceFactRows: z.number().int().nonnegative().safe(),
    sourceNormalizedRows: z.number().int().nonnegative().safe(),
    storedFactRows: z.number().int().nonnegative().safe(),
    outstandingRetainedOccurrences: z.number().int().nonnegative().safe(),
    csvs: z
      .array(
        z
          .object({
            datasetId: z.string().min(1),
            bodySHA256: digestSchema,
            bytes: z.number().int().nonnegative().safe(),
            rows: z.number().int().nonnegative().safe(),
          })
          .strict(),
      )
      .max(10),
    scopedSourceRows: z.number().int().nonnegative().safe(),
    scopedSourceFactsSHA256: digestSchema,
  })
  .strict();
// The record of a deleted occurrence. Its row is gone, so nothing later rewrites it.
const removedRecordSchema = removalSchema
  .extend({
    removedAt: z.iso.datetime(),
    decisionReference: z.string().min(1),
    sourceFactsSHA256: digestSchema,
    previouslyRetained: z.boolean(),
  })
  .strict();
export const neonReconciliationStateSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(ledgerEntrySchema),
    removed: z.array(removedRecordSchema).max(500).optional(),
    acceptedSource: sourceCheckpointSchema,
    appliedOneTimeAllowance: oneTimeAllowanceSchema.optional(),
  })
  .strict();
export type NeonReconciliationState = z.infer<typeof neonReconciliationStateSchema>;
export type NeonSourceCheckpoint = z.infer<typeof sourceCheckpointSchema>;
export type NeonManifest = StoredManifest & { neonReconciliation?: NeonReconciliationState };
export class NeonReconciliationPolicyError extends Error {
  constructor(
    message: string,
    readonly discrepancy: {
      factsSHA256: string;
      missingOccurrences: StoredTransaction[];
      newlyMissingIds: number[];
    },
  ) {
    super(message);
  }
}

/** Exact sorted tuple multiset; repeated identical occurrences contribute repeatedly. */
export function sourceFactsSHA256(rows: TransactionRow[]): string {
  const hash = createHash("sha256");
  for (const tuple of rows.map(transactionTuple).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    hash.update(`${Buffer.byteLength(tuple)}:${tuple}`);
  }
  return hash.digest("hex");
}
export function neonManifestSHA256(manifest: Manifest): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function checkCadenceGrowth(input: {
  policy: NeonReconciliationReview["growth"];
  intent: "monthly" | "manual";
  baselineSourceRows: number;
  baselineCapturedAtUTC: string;
  capturedAtUTC: string;
  insertions: number;
}) {
  const { policy, intent, baselineSourceRows, insertions } = input;
  growthSchema.parse(policy);
  if (
    !Number.isSafeInteger(baselineSourceRows) ||
    baselineSourceRows < 1 ||
    !Number.isSafeInteger(insertions) ||
    insertions < 0
  )
    throw new Error("Invalid cadence growth counts");
  const elapsedDays =
    (Date.parse(input.capturedAtUTC) - Date.parse(input.baselineCapturedAtUTC)) / DAY_MS;
  if (
    !Number.isFinite(elapsedDays) ||
    elapsedDays < 0 ||
    elapsedDays >
      (intent === "monthly" ? policy.maxMonthlyElapsedDays : policy.maxManualElapsedDays)
  )
    throw new Error(
      "Cadence checkpoint gap requires separate manual review; no unbounded elapsed-time scaling",
    );
  const relativeCeiling = Math.floor(baselineSourceRows * policy.relativeCeiling);
  const allowedInsertions = Math.min(relativeCeiling, policy.absoluteCeiling);
  if (insertions > allowedInsertions)
    throw new Error(
      `Cadence insertion guard rejected ${insertions} > ${allowedInsertions}; reviewed source policy required`,
    );
  return {
    intent,
    elapsedDays,
    relativeCeiling,
    absoluteCeiling: policy.absoluteCeiling,
    allowedInsertions,
    insertions,
    relativeChange: insertions / baselineSourceRows,
    evidenceQuality: policy.evidenceQuality,
    independentSnapshotIntervals: policy.independentSnapshotIntervals,
    acceptance: "recurring-guard" as "recurring-guard" | "exact-reviewed-one-time-allowance",
  };
}

/**
 * Retention adds only the approved absent occurrences to the effective source.
 * Every stored occurrence, including previously retained ones, consumes real incoming
 * multiplicity FIRST. Reappearance cannot insert a second copy of a retained row.
 * No correction is inferred or executable through this policy, and no removal is inferred: a row is deleted
 * only when the review names it with its exact tuple, it is absent from the source, and the source and the
 * baseline are exactly the reviewed ones.
 */
export function planNeonReconciliation(input: {
  previous: StoredTransaction[];
  incoming: TransactionRow[];
  manifest: NeonManifest;
  review: NeonReconciliationReview;
  capturedAtUTC: string;
  csvs?: NeonSourceCheckpoint["csvs"];
  sourceNormalizedRows?: number;
  intent: "monthly" | "manual";
}) {
  const { incoming, manifest, capturedAtUTC } = input;
  z.iso.datetime().parse(capturedAtUTC);
  const previous = [...input.previous].sort((a, b) => a.id - b.id);
  const review = requireApprovedNeonReview(input.review);
  if (input.intent !== "monthly" && input.intent !== "manual")
    throw new Error("Explicit monthly or manual intent required; no automatic stale-gap fallback");
  const prior = manifest.neonReconciliation
    ? neonReconciliationStateSchema.parse(manifest.neonReconciliation)
    : undefined;
  const digest = sourceFactsSHA256(incoming);
  const rowsById = new Map(previous.map((row) => [row.id, row]));
  const ledgerById = new Map(prior?.entries.map((entry) => [entry.id, entry]) ?? []);
  if (ledgerById.size !== (prior?.entries.length ?? 0))
    throw new Error("Duplicate durable ledger row IDs");
  const removedBefore = new Map(prior?.removed?.map((record) => [record.id, record]) ?? []);
  if (removedBefore.size !== (prior?.removed?.length ?? 0))
    throw new Error("Duplicate durable removal record IDs");
  for (const id of removedBefore.keys())
    if (rowsById.has(id) || ledgerById.has(id))
      throw new Error("A removed occurrence's integer row ID is stored or retained again");
  for (const entry of ledgerById.values()) {
    const stored = rowsById.get(entry.id);
    if (!stored || transactionTuple(stored) !== transactionTuple(entry.fact))
      throw new Error("Durable retained occurrence no longer matches its stored integer row ID");
  }
  if (
    prior &&
    (prior.acceptedSource.storedFactRows !== previous.length ||
      prior.acceptedSource.outstandingRetainedOccurrences !==
        prior.entries.filter((entry) => entry.status === "unresolved-retained").length ||
      prior.acceptedSource.sourceFactRows + prior.acceptedSource.outstandingRetainedOccurrences !==
        previous.length)
  )
    throw new Error("Durable source checkpoint/retained-count mismatch");
  const counts = new Map<string, number>();
  for (const row of incoming) {
    const tuple = transactionTuple(row);
    counts.set(tuple, (counts.get(tuple) ?? 0) + 1);
  }
  const missing: StoredTransaction[] = [];
  for (const row of previous) {
    const key = transactionTuple(row),
      count = counts.get(key) ?? 0;
    if (count) counts.set(key, count - 1);
    else missing.push(row);
  }
  const missingIds = new Set(missing.map((row) => row.id));
  const newlyMissing = missing.filter((row) => !ledgerById.has(row.id));
  const reject = (message: string): never => {
    throw new NeonReconciliationPolicyError(message, {
      factsSHA256: digest,
      missingOccurrences: missing,
      newlyMissingIds: newlyMissing.map((row) => row.id),
    });
  };
  // Reviewed removals. A row qualifies only while it is stored with the exact reviewed tuple and absent from the
  // source, so a fact that is present upstream is never deleted.
  const removalDecisions = new Map<
    number,
    NonNullable<NeonReconciliationReview["removals"]>[number]
  >();
  for (const decision of review.removals ?? []) {
    const done = removedBefore.get(decision.id);
    if (done) {
      // Applied by an earlier publication; replaying the same review changes nothing.
      if (transactionTuple(done.fact) !== transactionTuple(decision.fact))
        reject("Reviewed removal names a row ID that was removed with a different tuple");
      continue;
    }
    const row = rowsById.get(decision.id);
    if (!row || transactionTuple(row) !== transactionTuple(decision.fact))
      reject("Reviewed removal lacks a stored occurrence with the exact tuple");
    if (!missingIds.has(decision.id))
      reject("Reviewed removal refused: the occurrence is present in the source");
    if (
      digest !== review.initialSourceFactsSHA256 ||
      neonManifestSHA256(manifest) !== review.initialBaselineManifestSHA256
    )
      reject("Reviewed removal lacks exact reviewed source/baseline evidence");
    removalDecisions.set(decision.id, decision);
  }
  if (removalDecisions.size > review.maxRemovals) reject("Reviewed removal guard exceeded");
  const removed = missing.filter((row) => removalDecisions.has(row.id));
  const retained = missing.filter((row) => !removalDecisions.has(row.id));
  const kept = removed.length ? previous.filter((row) => !removalDecisions.has(row.id)) : previous;
  // New rows take IDs above the highest kept one, so a removed ID below it is never bound to another fact.
  const highestKeptId = kept.reduce((max, row) => Math.max(max, row.id), 0);
  if (removed.some((row) => row.id > highestKeptId))
    reject("Reviewed removal of the newest stored row would let its ID be reused");
  const newlyRetained = newlyMissing.filter((row) => !removalDecisions.has(row.id));
  if (
    newlyRetained.length > review.maxNewRetentions ||
    retained.length > review.maxOutstandingRetentions
  )
    reject("Independent disappearance/retention guard exceeded; no deletion or widening allowed");
  const decisions = new Map(review.retentions.map((entry) => [entry.id, entry]));
  for (const row of newlyRetained) {
    const decision = decisions.get(row.id);
    if (
      !decision ||
      transactionTuple(row) !== transactionTuple(decision.fact) ||
      digest !== review.initialSourceFactsSHA256 ||
      neonManifestSHA256(manifest) !== review.initialBaselineManifestSHA256
    )
      reject("New missing occurrence lacks exact reviewed tuple/source evidence");
    ledgerById.set(row.id, {
      ...decision!,
      occurrenceCount: 1,
      firstObservedMissingAt: capturedAtUTC,
      lastObservedMissingAt: capturedAtUTC,
      lastSourceFactsSHA256: digest,
      status: "unresolved-retained",
      decisionReference: review.decisionReference,
      possibleReplacementRowIds: [],
    });
  }
  const removedRecords = removed.map((row) => {
    const decision = removalDecisions.get(row.id)!;
    return {
      ...decision,
      removedAt: capturedAtUTC,
      decisionReference: review.decisionReference,
      sourceFactsSHA256: digest,
      previouslyRetained: ledgerById.delete(row.id),
    };
  });
  const reappeared = Array.from(ledgerById.values())
    .filter((entry) => entry.status === "unresolved-retained" && !missingIds.has(entry.id))
    .map((entry) => entry.id);
  const entries = Array.from(ledgerById.values())
    .sort((a, b) => a.id - b.id)
    .map((entry) => {
      const absent = missingIds.has(entry.id);
      if (absent)
        return entry.status === "unresolved-retained" && entry.lastSourceFactsSHA256 === digest
          ? entry
          : {
              ...entry,
              status: "unresolved-retained" as const,
              lastObservedMissingAt: capturedAtUTC,
              lastSourceFactsSHA256: digest,
            };
      return entry.status === "reappeared"
        ? entry
        : { ...entry, status: "reappeared" as const, lastSourceFactsSHA256: digest };
    });
  const priorRetainedIds = new Set(
    prior?.entries
      .filter((entry) => entry.status === "unresolved-retained")
      .map((entry) => entry.id) ?? [],
  );
  const baselineScopedRows = previous.filter(
    (row) => row.month >= review.growth.scopeMinMonth && !priorRetainedIds.has(row.id),
  );
  const incomingScopedRows = incoming.filter((row) => row.month >= review.growth.scopeMinMonth);
  if (
    prior &&
    (prior.acceptedSource.scopedSourceRows !== baselineScopedRows.length ||
      prior.acceptedSource.scopedSourceFactsSHA256 !== sourceFactsSHA256(baselineScopedRows))
  )
    throw new Error("Durable scoped source checkpoint mismatch");
  const baselineSourceRows = baselineScopedRows.length;
  const baselineCapturedAtUTC =
    prior?.acceptedSource.capturedAtUTC ??
    manifest.syncBuildState?.reconciledAt ??
    manifest.generatedAt;
  if (!baselineCapturedAtUTC)
    throw new Error("Dated accepted source checkpoint required for cadence policy");
  const insertedOccurrences = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);
  const positiveRows: TransactionRow[] = [];
  for (const [tuple, count] of counts) {
    if (!count) continue;
    const row = JSON.parse(tuple) as unknown[];
    // Reuse the exact planner's public tuple columns; no historical partition allowance exists.
    const fact = Object.fromEntries(
      TRANSACTION_COLUMNS.map((column, i) => [column, row[i]]),
    ) as TransactionRow;
    if (fact.month < review.growth.scopeMinMonth)
      reject("Historical-source additions require separate scoped review");
    for (let occurrence = 0; occurrence < count; occurrence++) positiveRows.push(fact);
  }
  const growthInput = {
    policy: review.growth,
    intent: input.intent,
    baselineSourceRows,
    baselineCapturedAtUTC,
    capturedAtUTC,
    insertions: insertedOccurrences,
  };
  let appliedAllowance = prior?.appliedOneTimeAllowance;
  let growth: ReturnType<typeof checkCadenceGrowth>;
  try {
    growth = checkCadenceGrowth(growthInput);
  } catch (error) {
    const allowance = review.oneTimeAllowance;
    const elapsedDays = (Date.parse(capturedAtUTC) - Date.parse(baselineCapturedAtUTC)) / DAY_MS;
    if (
      !allowance ||
      // Each allowance is pinned to one exact baseline and source, so it can be applied once. A later review may
      // carry a new one; the allowance already recorded is never accepted again.
      (prior?.appliedOneTimeAllowance &&
        canonicalJson(prior.appliedOneTimeAllowance) === canonicalJson(allowance)) ||
      input.intent !== "manual" ||
      !Number.isFinite(elapsedDays) ||
      elapsedDays < 0 ||
      elapsedDays > allowance.maxElapsedDays ||
      allowance.baselineScopedRows !== baselineScopedRows.length ||
      allowance.incomingScopedRows !== incomingScopedRows.length ||
      allowance.exactInserts !== insertedOccurrences ||
      allowance.baselineScopedFactsSHA256 !== sourceFactsSHA256(baselineScopedRows) ||
      allowance.incomingScopedFactsSHA256 !== sourceFactsSHA256(incomingScopedRows) ||
      allowance.positiveFactsSHA256 !== sourceFactsSHA256(positiveRows) ||
      allowance.rawCSVBodySHA256 !==
        input.csvs?.find((csv) => csv.datasetId === review.growth.scopeDatasetId)?.bodySHA256 ||
      canonicalJson(allowance.exactMissingIds.slice().sort((a, b) => a - b)) !==
        canonicalJson(missing.map((row) => row.id)) ||
      digest !== review.initialSourceFactsSHA256 ||
      neonManifestSHA256(manifest) !== review.initialBaselineManifestSHA256
    )
      throw error;
    const relativeCeiling = Math.floor(baselineSourceRows * review.growth.relativeCeiling);
    growth = {
      intent: input.intent,
      elapsedDays,
      relativeCeiling,
      absoluteCeiling: review.growth.absoluteCeiling,
      allowedInsertions: allowance.exactInserts,
      insertions: insertedOccurrences,
      relativeChange: insertedOccurrences / baselineSourceRows,
      evidenceQuality: review.growth.evidenceQuality,
      independentSnapshotIntervals: 0,
      acceptance: "exact-reviewed-one-time-allowance",
    };
    appliedAllowance = allowance;
  }
  // Retained facts are preserved at their existing row IDs, never transaction inserts. Removed rows leave the
  // baseline before planning, so they are neither matched nor re-inserted.
  const delta = planTransactionDelta(kept, [...incoming, ...retained], {
    maxChangedRows: growth.allowedInsertions,
  });
  if (delta.updates.length)
    throw new Error("Independent correction guard permits zero inferred updates");
  if (removed.length) {
    delta.deletes = removed;
    for (const row of removed) {
      delta.affectedBlocks.add(row.address_key);
      delta.affectedTownTypes.add(JSON.stringify([row.town, row.flat_type]));
    }
    // A block is compared within the cohort of its newest sale (`buildArtifacts`). Removing that sale can leave
    // a sale of another flat type newest, so the block joins that cohort and changes its percentiles too. The
    // cohort it leaves is the removed row's own, added above.
    const removedBlocks = new Set(removed.map((row) => row.address_key));
    const newestRemaining = new Map<string, TransactionRow>();
    for (const collection of [kept, delta.inserts])
      for (const row of collection) {
        if (!removedBlocks.has(row.address_key)) continue;
        const best = newestRemaining.get(row.address_key);
        if (
          !best ||
          row.month > best.month ||
          (row.month === best.month && row.flat_type < best.flat_type)
        )
          newestRemaining.set(row.address_key, row);
      }
    for (const row of newestRemaining.values())
      delta.affectedTownTypes.add(JSON.stringify([row.town, row.flat_type]));
  }
  const wantedCandidates = new Set(
    entries.flatMap((entry) => entry.possibleReplacementTuples.map(transactionTuple)),
  );
  const candidatesByTuple = new Map<string, number[]>();
  for (const collection of [kept, delta.inserts])
    for (const row of collection) {
      const tuple = transactionTuple(row),
        ids = candidatesByTuple.get(tuple) ?? [];
      if (!wantedCandidates.has(tuple)) continue;
      ids.push(row.id);
      candidatesByTuple.set(tuple, ids);
    }
  const finalEntries = entries.map((entry) => ({
    ...entry,
    possibleReplacementRowIds: entry.possibleReplacementTuples.flatMap(
      (row) => candidatesByTuple.get(transactionTuple(row)) ?? [],
    ),
  }));
  const state: NeonReconciliationState = {
    version: 1,
    entries: finalEntries,
    acceptedSource: {
      capturedAtUTC,
      factsSHA256: digest,
      sourceFactRows: incoming.length,
      sourceNormalizedRows: input.sourceNormalizedRows ?? incoming.length,
      storedFactRows: kept.length + delta.inserts.length,
      outstandingRetainedOccurrences: retained.length,
      csvs: input.csvs ?? [],
      scopedSourceRows: incomingScopedRows.length,
      scopedSourceFactsSHA256: sourceFactsSHA256(incomingScopedRows),
    },
    ...(prior?.removed || removedRecords.length
      ? { removed: [...(prior?.removed ?? []), ...removedRecords] }
      : {}),
    ...(appliedAllowance ? { appliedOneTimeAllowance: appliedAllowance } : {}),
  };
  // Exact replay preserves ledger/checkpoint bytes; bookkeeping never fabricates another observation.
  if (
    prior?.acceptedSource.factsSHA256 === digest &&
    !delta.inserts.length &&
    !removed.length &&
    canonicalJson(prior.entries) === canonicalJson(finalEntries) &&
    canonicalJson(prior.acceptedSource.csvs) === canonicalJson(state.acceptedSource.csvs) &&
    prior.acceptedSource.sourceNormalizedRows === state.acceptedSource.sourceNormalizedRows &&
    prior.acceptedSource.capturedAtUTC.slice(0, 7) === capturedAtUTC.slice(0, 7)
  )
    state.acceptedSource = prior.acceptedSource;
  sourceCheckpointSchema.parse(state.acceptedSource);
  if (state.acceptedSource.sourceNormalizedRows < state.acceptedSource.sourceFactRows)
    throw new Error("Incomplete normalized source checkpoint");
  if (Buffer.byteLength(JSON.stringify(state)) > 1_000_000)
    throw new Error("Durable discrepancy state exceeds bounded manifest value");
  // The next run parses this state before it reads anything else. A state it would refuse (for example more
  // recorded removals than the ledger holds) must never be published, or every later refresh stops there.
  if (!neonReconciliationStateSchema.safeParse(state).success)
    throw new Error(
      "Outgoing reconciliation state is not a valid durable ledger; nothing is planned or published",
    );
  return {
    delta,
    /** Absent occurrences kept in the effective source; reviewed removals are not among them. */
    missing: retained,
    newlyMissingIds: newlyRetained.map((row) => row.id),
    reappearedIds: reappeared,
    removedIds: removed.map((row) => row.id),
    state,
    growth,
    sourceFacts: incoming.length,
    storedFacts: state.acceptedSource.storedFactRows,
    retainedOccurrences: retained.length,
  };
}

/** Bind retained presentation to its approved row ID even when real duplicates have different lease text. */
export function assignNeonTransactionIds(
  effective: ResaleTransaction[],
  stored: StoredTransaction[],
  plan: ReturnType<typeof planNeonReconciliation>,
  sourceLength: number,
): void {
  const removedIds = new Set(plan.delta.deletes?.map((row) => row.id));
  assignStableTransactionIds(
    effective,
    removedIds.size ? stored.filter((row) => !removedIds.has(row.id)) : stored,
    plan.delta,
    toTransactionRow,
  );
  if (effective.length !== sourceLength + plan.missing.length)
    throw new Error("Retained source occurrence boundary mismatch");
  const retained = effective.slice(sourceLength);
  const reservedByTuple = new Map<string, Set<string>>();
  for (const [index, row] of retained.entries()) {
    const key = transactionTuple(toTransactionRow(row)!),
      ids = reservedByTuple.get(key) ?? new Set<string>();
    const id = `d1:${String(plan.missing[index].id).padStart(16, "0")}`;
    ids.add(id);
    reservedByTuple.set(key, ids);
  }
  const groups = new Map<string, { all: ResaleTransaction[]; real: ResaleTransaction[] }>();
  for (const [index, row] of effective.entries()) {
    const fact = toTransactionRow(row);
    if (!fact) continue;
    const key = transactionTuple(fact);
    if (!reservedByTuple.has(key)) continue;
    const group = groups.get(key) ?? { all: [], real: [] };
    group.all.push(row);
    if (index < sourceLength) group.real.push(row);
    groups.set(key, group);
  }
  for (const [key, reserved] of reservedByTuple) {
    const group = groups.get(key)!;
    const pool = group.all
      .map((row) => row.id)
      .filter((id) => !reserved.has(id))
      .sort((a, b) => a.localeCompare(b));
    const real = group.real.sort((a, b) => a.id.localeCompare(b.id));
    if (real.length !== pool.length)
      throw new Error("Retained integer identity allocation mismatch");
    real.forEach((row, index) => {
      row.id = pool[index];
    });
  }
  retained.forEach((row, index) => {
    row.id = `d1:${String(plan.missing[index].id).padStart(16, "0")}`;
  });
}

/** Exact data replay may skip a redundant manifest write within the same UTC month. */
export function isNeonPublicationReplay(
  previous: NeonManifest,
  next: NeonManifest,
  statementCount: number,
): boolean {
  if (
    statementCount ||
    !previous.neonReconciliation ||
    !next.neonReconciliation ||
    previous.neonReconciliation.acceptedSource.factsSHA256 !==
      next.neonReconciliation.acceptedSource.factsSHA256
  )
    return false;
  const oldAt = previous.syncBuildState?.reconciledAt ?? previous.generatedAt;
  const newAt = next.syncBuildState?.reconciledAt ?? next.generatedAt;
  if (!oldAt || !newAt || oldAt.slice(0, 7) !== newAt.slice(0, 7)) return false;
  const comparable = {
    ...next,
    generatedAt: previous.generatedAt,
    syncBuildState: next.syncBuildState
      ? { ...next.syncBuildState, reconciledAt: previous.syncBuildState?.reconciledAt }
      : undefined,
  };
  return canonicalJson(previous) === canonicalJson(comparable);
}

/** Preserve the old recorded lease presentation; never invent month-precision lease text. */
export function includeRetainedSourceRows(
  source: ResaleTransaction[],
  plan: ReturnType<typeof planNeonReconciliation>,
): ResaleTransaction[] {
  const byId = new Map(plan.state.entries.map((entry) => [entry.id, entry]));
  return [
    ...source,
    ...plan.missing.map((row) => {
      const entry = byId.get(row.id)!;
      const pricePerSqm = row.resale_price / row.floor_area_sqm;
      const retained: ResaleTransaction = {
        id: `retained:${row.id}`,
        month: row.month,
        town: row.town,
        block: row.block,
        streetName: row.street_name,
        addressKey: row.address_key,
        flatType: row.flat_type,
        storeyRange: row.storey_range,
        floorAreaSqm: row.floor_area_sqm,
        leaseCommenceDate: row.lease_commence_year ?? 0,
        resalePrice: row.resale_price,
        flatModel: row.flat_model,
        remainingLease: entry.remainingLease,
        pricePerSqm: Number(pricePerSqm.toFixed(2)),
        pricePerSqft: Number((pricePerSqm / 10.7639).toFixed(2)),
      };
      if (transactionTuple(toTransactionRow(retained)!) !== transactionTuple(row))
        throw new Error("Retained artifact presentation changed its exact fact");
      return retained;
    }),
  ];
}
