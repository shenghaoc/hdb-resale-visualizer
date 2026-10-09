/** Local retained-public-data investigation ONLY. No connection, fetch, mutation or approval. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { normalizeResaleRows } from "../lib/sync/normalization";
import { toTransactionRow } from "../lib/pipeline";
import { compareSourceOccurrences } from "./source-diagnostic";
import {
  TRANSACTION_COLUMNS,
  transactionTuple,
  type StoredTransaction,
} from "../lib/sync/incremental";
import {
  planNeonReconciliation,
  sourceFactsSHA256,
  neonManifestSHA256,
  type NeonManifest,
  type NeonReconciliationReview,
  requireApprovedNeonReview,
} from "../lib/sync/neon-reconciliation";
import { NEON_REFRESH_PROJECT, NEON_REFRESH_BRANCH, canonicalJson } from "../lib/sync/neon";
import type { AddressDetail } from "../../shared/data-types";
import { forecastRetainedContext } from "./forecast-reconciliation";

const captureDirectory = ".neon-benchmark/official-resale-2026-10-04T06-02-33-354Z";
const receipt = JSON.parse(readFileSync(`${captureDirectory}/receipt.json`, "utf8")) as {
  captures: {
    datasetId: string;
    responseBodySHA256: string;
    normalizedMultisetSHA256: string;
    savedAtUTC?: string;
    rawSavedAtUTC?: string;
    file: string;
    bytes: number;
    factRows: number;
    rawRows: number;
  }[];
};
const activeId = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc";
const capture = receipt.captures.find((entry) => entry.datasetId === activeId)!;
const bytes = readFileSync(`${captureDirectory}/${activeId}.csv`);
if (createHash("sha256").update(bytes).digest("hex") !== capture.responseBodySHA256)
  throw new Error("Retained official bytes changed");
const parsed = Papa.parse<Record<string, string>>(bytes.toString("utf8"), {
  header: true,
  skipEmptyLines: true,
});
const normalized = normalizeResaleRows(parsed.data);
const incomingActive = normalized.map((row) => toTransactionRow(row)!);
if (
  parsed.errors.length ||
  parsed.data.length !== normalized.length ||
  incomingActive.some((row) => !row) ||
  sourceFactsSHA256(incomingActive) !== capture.normalizedMultisetSHA256
)
  throw new Error("Retained normalization/multiset checksum changed");
const local = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
try {
  const previous = local
    .prepare(`SELECT id,${TRANSACTION_COLUMNS.join(",")} FROM transactions ORDER BY id`)
    .all() as StoredTransaction[];
  const manifest = JSON.parse(
    local.prepare("SELECT json FROM manifest WHERE id=1").get()!.json as string,
  ) as NeonManifest;
  const oldActive = previous.filter((row) => row.month >= "2017-01");
  const difference = compareSourceOccurrences(oldActive, incomingActive);
  // Historical retained facts are a reconstruction assumption, NOT a current recapture.
  const incoming = [...previous.filter((row) => row.month < "2017-01"), ...incomingActive];
  const capturedAtUTC = "2026-10-04T06:03:06.149Z";

  const retentions = difference.missingOccurrences.map((row) => {
    const detail = JSON.parse(
      local.prepare("SELECT json FROM block_details WHERE address_key=?").get(row.address_key)!
        .json as string,
    ) as AddressDetail;
    const presentations = detail.recentTransactions.filter(
      (tx) =>
        tx.month === row.month &&
        tx.flatType === row.flat_type &&
        tx.storeyRange === row.storey_range &&
        tx.floorAreaSqm === row.floor_area_sqm &&
        tx.leaseCommenceDate === row.lease_commence_year &&
        tx.resalePrice === row.resale_price &&
        tx.flatModel === row.flat_model,
    );
    if (presentations.length !== 1)
      throw new Error("Exact retained lease presentation requires review");
    const { id, ...fact } = row;
    return {
      id,
      fact,
      disposition: "retain-unresolved" as const,
      evidence:
        "Exact old multiplicity 1 / active current multiplicity 0; no upstream transaction/unit identifier or confirmed removal/correction notice. See neon-source-offline-capture-2026-10-04.json.",
      remainingLease: presentations[0].remainingLease,
      possibleReplacementTuples: difference.oneFieldCandidates
        .find((entry) => entry.oldId === id)!
        .candidates.map((entry) => entry.incomingTuple),
    };
  });
  let review: NeonReconciliationReview = {
    version: 1,
    projectId: NEON_REFRESH_PROJECT,
    branchId: NEON_REFRESH_BRANCH,
    reviewStatus: "proposed",
    decisionReference:
      "PENDING explicit disposition and risk-envelope approval; this file is not remote execution authorization",
    initialSourceFactsSHA256: sourceFactsSHA256(incoming),
    initialBaselineManifestSHA256: neonManifestSHA256(manifest),
    maxNewRetentions: 5,
    maxOutstandingRetentions: 5,
    maxCorrections: 0,
    maxRemovals: 0,
    retentions,
    growth: {
      scopeDatasetId: activeId,
      scopeMinMonth: "2017-01",
      evidenceQuality: "uncalibrated-recurring-policy",
      independentSnapshotIntervals: 0,
      relativeCeiling: 0.005,
      absoluteCeiling: 1000,
      maxMonthlyElapsedDays: 35,
      maxManualElapsedDays: 35,
    },
    oneTimeAllowance: {
      baselineScopedFactsSHA256: sourceFactsSHA256(oldActive),
      incomingScopedFactsSHA256: sourceFactsSHA256(incomingActive),
      rawCSVBodySHA256: capture.responseBodySHA256,
      positiveFactsSHA256: "",
      baselineScopedRows: oldActive.length,
      incomingScopedRows: incomingActive.length,
      exactInserts: difference.unmatchedIncomingOccurrenceCount,
      exactMissingIds: difference.missingOccurrences.map((row) => row.id),
      maxElapsedDays: 62,
      rationale:
        "Proposed explicit one-time manual exception for this exact reviewed snapshot/diff, not a calibrated recurring growth threshold. Active-scoped 2595/239330 exceeds 0.5%; the 1000 recurring guard is unchanged. All publication/resource budgets remain independently mandatory.",
    },
  };
  const positiveCounts = new Map<string, number>();
  for (const row of incomingActive) {
    const key = transactionTuple(row);
    positiveCounts.set(key, (positiveCounts.get(key) ?? 0) + 1);
  }
  for (const row of oldActive) {
    const key = transactionTuple(row),
      n = positiveCounts.get(key) ?? 0;
    if (n) positiveCounts.set(key, n - 1);
  }
  const positiveRows = incomingActive.filter((row) => {
    const key = transactionTuple(row),
      n = positiveCounts.get(key) ?? 0;
    if (!n) return false;
    positiveCounts.set(key, n - 1);
    return true;
  });
  review.oneTimeAllowance!.positiveFactsSHA256 = sourceFactsSHA256(positiveRows);
  const reviewPath = "docs/evidence/neon-reconciliation-review-2026-10-04.json";
  if (existsSync(reviewPath)) {
    const saved = JSON.parse(readFileSync(reviewPath, "utf8")) as NeonReconciliationReview;
    if (saved.reviewStatus === "approved") {
      requireApprovedNeonReview(saved);
      if (
        canonicalJson({
          ...review,
          reviewStatus: "approved",
          decisionReference: saved.decisionReference,
        }) !== canonicalJson(saved)
      )
        throw new Error("Local analysis cannot replace an approved exact snapshot policy");
      review = saved;
    }
  }
  // Source-policy approval never grants publication past independent resource/plan guards.
  const hypothetical = planNeonReconciliation({
    previous,
    incoming,
    manifest,
    review: { ...review, reviewStatus: "approved" },
    capturedAtUTC,
    intent: "manual",
    csvs: [
      {
        datasetId: activeId,
        bodySHA256: capture.responseBodySHA256,
        bytes: bytes.length,
        rows: parsed.data.length,
      },
    ],
  });
  const replay = planNeonReconciliation({
    previous: [...previous, ...hypothetical.delta.inserts],
    incoming,
    manifest: { ...manifest, neonReconciliation: hypothetical.state },
    review: { ...review, reviewStatus: "approved" },
    capturedAtUTC: "2026-10-04T06:04:06.149Z",
    intent: "manual",
    csvs: hypothetical.state.acceptedSource.csvs,
  });
  const prospectiveByMonth = Object.fromEntries(
    [...new Set(hypothetical.delta.inserts.map((row) => row.month))]
      .sort()
      .map((month) => [
        month,
        hypothetical.delta.inserts.filter((row) => row.month === month).length,
      ]),
  );
  const allMonths = [...new Set(incoming.map((row) => row.month))].sort();
  const recentThreshold = allMonths[Math.max(0, allMonths.length - 24)];
  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values.length
      ? values.length % 2
        ? values[Math.floor(values.length / 2)]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
      : null;
  };
  const downstream = retentions.map((entry) => {
    const allCurrent = incoming.filter((row) => row.address_key === entry.fact.address_key);
    const current = incoming.filter(
      (row) => row.address_key === entry.fact.address_key && row.month >= recentThreshold,
    );
    const retained = hypothetical.missing.filter(
      (row) => row.address_key === entry.fact.address_key && row.month >= recentThreshold,
    );
    return {
      id: entry.id,
      addressKey: entry.fact.address_key,
      sourceOnlyWindowOccurrences: current.length,
      effectiveWindowOccurrences: current.length + retained.length,
      sourceOnlyWindowMedian: median(current.map((row) => row.resale_price)),
      retainedWindowMedian: median([...current, ...retained].map((row) => row.resale_price)),
      sourceOnlySummaryUsesHistoricalFallback: current.length === 0,
      sourceOnlySummaryOccurrences: current.length ? current.length : allCurrent.length,
      sourceOnlySummaryMedian: median(
        (current.length ? current : allCurrent).map((row) => row.resale_price),
      ),
      possibleReplacementRowIds: hypothetical.state.entries.find((row) => row.id === entry.id)!
        .possibleReplacementRowIds,
    };
  });
  const output = {
    capturedAtUTC: new Date().toISOString(),
    scope: "Retained local public SQLite and saved official CSV only",
    NeonCalls: 0,
    D1Calls: 0,
    sourceAcquisitions: 0,
    remotePublication: false,
    proposalApproved: review.reviewStatus === "approved",
    sourceProvenance: {
      baselineSourceGeneratedAt: manifest.generatedAt,
      baselineCaptureTime:
        "Original raw source capture not retained; generatedAt is successful-source checkpoint proxy, not API ingest time",
      activeCSVStoredAtUTC: capturedAtUTC,
      activeRawSHA256: capture.responseBodySHA256,
      activeNormalizedMultisetSHA256: capture.normalizedMultisetSHA256,
      oldActiveRows: oldActive.length,
      incomingActiveRows: incomingActive.length,
      grossPositiveMultisetOccurrences: difference.unmatchedIncomingOccurrenceCount,
      missingOccurrences: difference.missingOccurrences.length,
      netActiveGrowth: incomingActive.length - oldActive.length,
      historicalRowsReused: previous.length - oldActive.length,
      historicalPartitionsRevalidated: false,
      fullCurrentSourceCountVerified: false,
      conditionalReconstructedSourceFacts: incoming.length,
      conditionalEffectiveStoredFacts: hypothetical.storedFacts,
      baselineSourceFactsSHA256: sourceFactsSHA256(previous),
      conditionalSourceFactsSHA256: review.initialSourceFactsSHA256,
      snapshotIntervals: 1,
      independentEarlierSnapshotIntervals: 0,
      activeRelativeGrossChange: difference.unmatchedIncomingOccurrenceCount / oldActive.length,
      withdrawnCircularEnvelope: {
        allowedInsertions: 3893,
        withdrawn: true,
        reason:
          "Candidate-derived rate multiplied by candidate elapsed time admitted itself by construction; full-corpus denominator diluted unrecaptured active-scope growth.",
      },
    },
    growth: hypothetical.growth,
    prospective: {
      inserts: hypothetical.delta.inserts.length,
      updates: hypothetical.delta.updates.length,
      deletes: 0,
      retainedMissing: hypothetical.retainedOccurrences,
      newlyMissingIds: hypothetical.newlyMissingIds,
      affectedBlocks: hypothetical.delta.affectedBlocks.size,
      affectedTownTypes: hypothetical.delta.affectedTownTypes.size,
      retentionLedgerBytes: Buffer.byteLength(JSON.stringify(hypothetical.state)),
      transactionInsertIndexOperationLowerBound: hypothetical.delta.inserts.length * 5,
      derivedPublicationForecast: null,
      forecastReason:
        "Current official property/amenity/MRT context not reacquired; retained-only source diagnosis cannot forecast full derived mutations. Unchanged 25000 guard may reject a window/context catch-up before writes.",
      incomingRegistrationMonths: prospectiveByMonth,
      registrationMonthDistributionIsHistoricalSnapshotGrowth: false,
    },
    dispositions: retentions,
    downstream: {
      recentThreshold,
      blocks: downstream,
      uncertainty:
        "Both July retained and September incoming candidate remain counted; possible duplication of one real registration is unresolved and exposed in ledger. Existing UI has no per-row discrepancy badge; no production migration authorized.",
    },
    localReplay: {
      inserts: replay.delta.inserts.length,
      updates: replay.delta.updates.length,
      retained: replay.retainedOccurrences,
      newlyMissing: replay.newlyMissingIds.length,
      stateUnchanged: JSON.stringify(replay.state) === JSON.stringify(hypothetical.state),
    },
    policy: review,
    completeLocalForecast: await forecastRetainedContext({
      local,
      previous,
      active: normalized,
      reconciliation: hypothetical,
      manifest,
    }),
  };
  writeFileSync(reviewPath, JSON.stringify(review, null, 2) + "\n");
  writeFileSync(
    "docs/evidence/neon-reconciliation-policy-analysis-2026-10-04.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...output, policy: undefined, dispositions: undefined }, null, 2));
} finally {
  local.close();
}
