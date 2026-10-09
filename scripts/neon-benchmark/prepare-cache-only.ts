/** Offline prepared publication using the retained public snapshot and actual builder output. */
import { mkdirSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { canonicalJson } from "../lib/sync/neon";
import type { GeneratedArtifacts } from "../lib/pipeline";
import type { StoredTransaction } from "../lib/sync/incremental";
import type { NeonReconciliationReview } from "../lib/sync/neon-reconciliation";
import type { CapturedForecastContext } from "./forecast-reconciliation";
import { compileNativeArtifactStage, type NativeArtifactSnapshot } from "./stage-artifacts";
import { deriveCacheOnlyInputs } from "./cache-only-context";
import { executionCodeSHA256 } from "./staged-code-identity";
import { publicationSQLSHA256 } from "./staged-publisher";
import {
  sha256,
  stageIdentity,
  STAGE_DESCRIPTOR,
  statementShape,
  applyDetailPaths,
} from "./staged-plan";

const object = z.record(z.string(), z.json());
const hash = (value: unknown) => sha256(canonicalJson(value));
const directory = ".neon-benchmark/staged-inputs/cache-only";
export function prepareCacheOnlyStage(input: {
  local: DatabaseSync;
  artifacts: GeneratedArtifacts;
  effectiveSourceAddressKeys: string[];
  baselineSourceAddressKeys: string[];
  capturedContext: CapturedForecastContext;
  review: NeonReconciliationReview;
  transactionInserts: StoredTransaction[];
  rawHashes: Record<string, string>;
}) {
  const snapshot = {} as NativeArtifactSnapshot;
  for (const table of Object.keys(STAGE_DESCRIPTOR).filter(
    (t) => t !== "transactions",
  ) as (keyof NativeArtifactSnapshot)[]) {
    snapshot[table] = input.local
      .prepare(`SELECT * FROM ${table}`)
      .all()
      .map((row) =>
        object.parse(
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              (key === "json" || key.endsWith("_json")) && typeof value === "string"
                ? JSON.parse(value)
                : value,
            ]),
          ),
        ),
      )
      .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  }
  const cacheInputs = {
    geocode_cache: snapshot.geocode_cache,
    walking_time_cache: snapshot.walking_time_cache,
  };
  const timestamp = "2026-10-04T15:30:00.000Z";
  input.artifacts.manifest.generatedAt = timestamp;
  if (input.artifacts.manifest.syncBuildState)
    input.artifacts.manifest.syncBuildState.reconciledAt = timestamp;
  const oldComparisons = new Map(
    snapshot.comparisons.map((r) => [String(r.address_key), object.parse(r.json)]),
  );
  for (const [key, comparison] of Object.entries(input.artifacts.comparisons ?? {})) {
    const prior = oldComparisons.get(key);
    comparison.generatedAt =
      prior && hash(prior) === hash({ ...comparison, generatedAt: prior.generatedAt })
        ? String(prior.generatedAt)
        : timestamp;
  }
  const owned = new Map<string, string[]>();
  const visit = (value: unknown, path: string[]) => {
    if (path.length > 1) owned.set(canonicalJson(path), path);
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    else owned.set(canonicalJson(path), path);
  };
  for (const detail of Object.values(input.artifacts.details)) visit(detail.summary, ["summary"]);
  owned.set("monthlyTrend", ["monthlyTrend"]);
  owned.set("recentTransactions", ["recentTransactions"]);
  const detailOwnedPaths = [...owned.values()].sort((a, b) =>
    canonicalJson(a).localeCompare(canonicalJson(b)),
  );
  const plan = compileNativeArtifactStage({
    previous: snapshot,
    artifacts: input.artifacts,
    transactionInserts: input.transactionInserts,
    exitsGeoJson: input.capturedContext.exitsGeoJson,
    stationsGeoJson: input.capturedContext.stationsGeoJson,
    stagedCaches: { geocode_cache: [], walking_time_cache: [] },
    updatedAtUTC: timestamp,
    detailOwnedPaths,
  });
  const normalizedContext = {
    ...input.capturedContext,
    sourceAddressKeys: input.effectiveSourceAddressKeys,
    skippedSupermarketKeys: input.capturedContext.missingAmenityCacheKeys.filter((k) =>
      k.startsWith("supermarket:"),
    ),
    skippedSchoolKeys: input.capturedContext.missingAmenityCacheKeys.filter((k) =>
      k.startsWith("school:"),
    ),
  };
  const resolutionInputs = deriveCacheOnlyInputs({ ...normalizedContext, cacheInputs });
  const baseline = deriveCacheOnlyInputs({
    ...normalizedContext,
    sourceAddressKeys: input.baselineSourceAddressKeys,
    cacheInputs,
  });
  const priorUnresolved = new Set(baseline.omittedAddressKeys),
    nowUnresolved = new Set(resolutionInputs.omittedAddressKeys);
  const newUnresolvedAddressKeys = resolutionInputs.omittedAddressKeys.filter(
    (k) => !priorUnresolved.has(k),
  );
  const resolvedPriorAddressKeys = baseline.omittedAddressKeys.filter((k) => !nowUnresolved.has(k));
  const detailItems = new Map(
    plan.items
      .filter((r) => r.table === "block_details")
      .map((r) => [String(r.key.address_key), r]),
  );
  const artifactHashes = {
    blockSummaries: hash(input.artifacts.blockSummaries),
    rawBuilderDetailsBeforePresentationIdRetention: hash(input.artifacts.details),
    details: hash(
      Object.fromEntries(
        snapshot.block_details.map((row) => {
          const item = detailItems.get(String(row.address_key));
          return [
            String(row.address_key),
            item ? applyDetailPaths(row.json, item.detailPatches!) : row.json,
          ];
        }),
      ),
    ),
    comparisons: hash(input.artifacts.comparisons),
    trends: hash(input.artifacts.townFlatTypeTrend),
    manifestBeforeExecutionPins: hash(input.artifacts.manifest),
    mrtExits: hash(input.capturedContext.exitsGeoJson),
    mrtStations: hash(input.capturedContext.stationsGeoJson),
  };
  const routeKeys = [...new Set(resolutionInputs.routePairs.map((r) => r.cacheKey))].sort();
  const output = {
    preparedAtUTC: new Date().toISOString(),
    status: "LOCAL CACHE-ONLY MATERIAL PREPARED; REMOTE ADMISSION PENDING",
    projectId: input.review.projectId,
    branchId: input.review.branchId,
    productionUntouched: true,
    externalCalls: { Neon: 0, D1: 0, OneMap: 0, Cloudflare: 0 },
    policyCorrection:
      "Zero-unresolved/geocode-token requirement withdrawn; supported SKIP_GEOCODING=1 semantics pinned without new network calls.",
    sourceReviewSHA256: hash(input.review),
    sourceIdentity: input.review.oneTimeAllowance,
    retainedOccurrences: input.review.retentions,
    baselineManifestSHA256: input.review.initialBaselineManifestSHA256,
    baselineHasBuildState: false,
    baselineMaximumTransactionId: Number(
      input.local.prepare("SELECT max(id) AS n FROM transactions").get()!.n,
    ),
    rawContextHashes: input.rawHashes,
    cacheInputSHA256: hash(cacheInputs),
    normalizedContextSHA256: hash(normalizedContext),
    resolutionInputsSHA256: hash(resolutionInputs),
    builderCodeSHA256: executionCodeSHA256(),
    publisherSQLSHA256: publicationSQLSHA256(plan),
    artifactHashes,
    cacheCounts: {
      geocode_cache: cacheInputs.geocode_cache.length,
      walking_time_cache: cacheInputs.walking_time_cache.length,
    },
    addresses: {
      baseline: {
        source: baseline.sourceAddressKeys.length,
        located: baseline.locatedAddressKeys.length,
        unresolved: baseline.omittedAddressKeys.length,
      },
      candidate: {
        source: resolutionInputs.sourceAddressKeys.length,
        located: resolutionInputs.locatedAddressKeys.length,
        unresolved: resolutionInputs.omittedAddressKeys.length,
      },
      newUnresolvedAddressKeys,
      resolvedPriorAddressKeys,
      unresolvedSHA256: hash(resolutionInputs.omittedAddressKeys),
      locatedSHA256: hash(resolutionInputs.locatedAddressKeys),
      newFactsAtUnlocatedAddresses: input.transactionInserts.filter((r) =>
        nowUnresolved.has(r.address_key),
      ).length,
      incomingUnlocatedAddressKeys: [
        ...new Set(
          input.transactionInserts
            .filter((r) => nowUnresolved.has(r.address_key))
            .map((r) => r.address_key),
        ),
      ].sort(),
      incomingFactsAtNewUnlocatedAddresses: input.transactionInserts.filter((r) =>
        newUnresolvedAddressKeys.includes(r.address_key),
      ).length,
      omittedFactsRemainInTransactionsAndTrends: true,
    },
    amenities: {
      skippedSupermarketKeys: resolutionInputs.skippedSupermarketKeys,
      skippedSchoolKeys: resolutionInputs.skippedSchoolKeys,
      normalizedSupermarkets: input.capturedContext.supermarkets?.length,
      normalizedSchools: input.capturedContext.schools?.length,
      historicalSkippedSupermarkets:
        "21/478 from historical successful refresh receipts; original raw skipped-key set not retained",
      historicalSkippedKeyIdentity: "UNKNOWN",
    },
    routing: {
      addressStationPairs: resolutionInputs.routePairs.length,
      distinctKeys: routeKeys.length,
      cacheHits: resolutionInputs.routePairs.filter((r) => r.source === "cache").length,
      fallbackPairs: resolutionInputs.routePairs.filter(
        (r) => r.source === "straight-line-fallback",
      ).length,
      newRequests: 0,
      policy: resolutionInputs.routingPolicy,
    },
    detailOwnedPaths,
    stage: stageIdentity(plan),
    commandShape: statementShape(plan.groups),
    artifactRowCounts: {
      transactions: input.artifacts.manifest.counts.transactions,
      blocks: input.artifacts.blockSummaries.length,
      details: Object.keys(input.artifacts.details).length,
      comparisons: Object.keys(input.artifacts.comparisons ?? {}).length,
      trends: input.artifacts.townFlatTypeTrend.length,
    },
    targetTimestamp: timestamp,
    missingRemoteAdmissionPins: [
      "schema/writer fingerprint",
      "physical temp peak and database growth/project storage reserve",
      "endpoint CU and whole-sequence limits/persistent receipt",
      "final publication identity after execution pins",
    ],
    localMaterialDirectory: directory,
  };
  mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries({
    cacheInputs,
    normalizedContext,
    resolutionInputs,
    artifactHashes,
    stageItems: plan.items,
    manifest: input.artifacts.manifest,
    detailOwnedPaths,
  }))
    writeFileSync(`${directory}/${name}.json`, canonicalJson(value) + "\n");
  writeFileSync(`${directory}/stage.copy-text`, plan.copyText);
  writeFileSync(`${directory}/receipt.json`, JSON.stringify(output, null, 2) + "\n");
  writeFileSync(
    "docs/evidence/neon-cache-only-stage-2026-10-04.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  return output;
}
