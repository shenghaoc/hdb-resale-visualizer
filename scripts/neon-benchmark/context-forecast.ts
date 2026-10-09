/** Offline original-input provenance and captured-current-context plan. No network/database credentials. */
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { canonicalJson } from "../lib/sync/neon";
import { TRANSACTION_COLUMNS, type StoredTransaction } from "../lib/sync/incremental";
import {
  requireApprovedNeonReview,
  planNeonReconciliation,
  sourceFactsSHA256,
  type NeonManifest,
} from "../lib/sync/neon-reconciliation";
import {
  normalizeResaleRows,
  normalizePropertyRows,
  normalizeMrtFeatures,
  normalizeSchoolRows,
  normalizeSupermarketRows,
  normalizeAmenityGeoJson,
} from "../lib/sync/normalization";
import { toTransactionRow, buildMrtStationsGeoJson, type GeocodeEntry } from "../lib/pipeline";
import { prepareCacheOnlyStage } from "./prepare-cache-only";
import { forecastRetainedContext } from "./forecast-reconciliation";

const [flag, directory, ...rest] = process.argv.slice(2);
if (
  flag !== "--context-capture" ||
  (rest.length && (rest.length !== 1 || rest[0] !== "--prepare-cache-only")) ||
  !/^\.neon-benchmark\/official-context-[0-9TZ.-]+$/.test(directory ?? "")
)
  throw new Error("Exact retained public context directory required");
globalThis.fetch = async () => {
  throw new Error("Offline forecast prohibits every network call");
};
const receipt = JSON.parse(readFileSync(`${directory}/receipt.json`, "utf8")) as {
  success: boolean;
  contextMetadataStableDuringCapture: boolean;
  startedAtUTC: string;
  finishedAtUTC: string;
  receivedResponseBytes: number;
  requests: unknown[];
  credentialsUsed: boolean;
  OneMapCalls: number;
  NeonCalls: number;
  D1Calls: number;
  captures: {
    kind: string;
    datasetId: string;
    format: string;
    path: string;
    SHA256: string;
    bytes: number;
    rawRows: number;
    retrievedAtUTC: string;
  }[];
  before: { datasetId: string; lastUpdatedAt: string }[];
};
if (
  !receipt.success ||
  !receipt.contextMetadataStableDuringCapture ||
  receipt.captures.length !== 6 ||
  receipt.credentialsUsed ||
  receipt.OneMapCalls ||
  receipt.NeonCalls ||
  receipt.D1Calls
)
  throw new Error("Incomplete or unbounded context capture");
const review = requireApprovedNeonReview(
  JSON.parse(readFileSync("docs/evidence/neon-reconciliation-review-2026-10-04.json", "utf8")),
);
const prepare = rest[0] === "--prepare-cache-only";
const bodies = new Map<string, Buffer>();
for (const capture of receipt.captures) {
  if (
    capture.path !== `${directory}/${capture.datasetId}.${capture.format}` ||
    !/^d_[a-f0-9]{32}$/.test(capture.datasetId)
  )
    throw new Error("Unexpected retained context input path");
  const body = readFileSync(capture.path);
  if (
    body.length !== capture.bytes ||
    createHash("sha256").update(body).digest("hex") !== capture.SHA256
  )
    throw new Error("Retained context body/hash mismatch");
  if (bodies.has(capture.kind)) throw new Error("Duplicate context source");
  bodies.set(capture.kind, body);
}
function csv(kind: string) {
  const parsed = Papa.parse<Record<string, string>>(bodies.get(kind)!.toString(), {
    header: true,
    skipEmptyLines: true,
  });
  if (
    parsed.errors.length ||
    parsed.data.length !== receipt.captures.find((c) => c.kind === kind)!.rawRows
  )
    throw new Error("Retained context CSV changed");
  return parsed.data;
}
function geo(kind: string) {
  return JSON.parse(bodies.get(kind)!.toString()) as {
    type: "FeatureCollection";
    features: unknown[];
  };
}
const activePath =
  ".neon-benchmark/official-resale-2026-10-04T06-02-33-354Z/d_8b84c4ee58e3cfc0ece0d773c8ca6abc.csv";
const activeBody = readFileSync(activePath);
if (
  createHash("sha256").update(activeBody).digest("hex") !==
  review.oneTimeAllowance?.rawCSVBodySHA256
)
  throw new Error("Pinned approved active snapshot changed");
const activeParsed = Papa.parse<Record<string, string>>(activeBody.toString(), {
  header: true,
  skipEmptyLines: true,
});
const active = normalizeResaleRows(activeParsed.data);
if (activeParsed.errors.length || active.length !== activeParsed.data.length)
  throw new Error("Pinned active normalization changed");
const db = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
try {
  const previous = db
    .prepare(`SELECT id,${TRANSACTION_COLUMNS.join(",")} FROM transactions ORDER BY id`)
    .all() as StoredTransaction[];
  const manifest = JSON.parse(
    String(db.prepare("SELECT json FROM manifest WHERE id=1").get()!.json),
  ) as NeonManifest;
  const incoming = [
    ...previous.filter((row) => row.month < "2017-01"),
    ...active.map((row) => toTransactionRow(row)!),
  ];
  if (sourceFactsSHA256(incoming) !== review.initialSourceFactsSHA256)
    throw new Error("Approved full conditional source facts changed");
  const reconciliation = planNeonReconciliation({
    previous,
    incoming,
    manifest,
    review,
    capturedAtUTC: "2026-10-04T06:03:06.149Z",
    intent: "manual",
    csvs: [
      {
        datasetId: review.growth.scopeDatasetId,
        bodySHA256: review.oneTimeAllowance.rawCSVBodySHA256,
        bytes: activeBody.length,
        rows: activeParsed.data.length,
      },
    ],
  });
  const baseEntries: Record<string, GeocodeEntry> = Object.fromEntries(
    db
      .prepare("SELECT * FROM geocode_cache")
      .all()
      .map((row) => [
        String(row.cache_key),
        {
          lat: Number(row.lat),
          lng: Number(row.lng),
          postalCode: row.postal_code as string | null,
          displayName: row.display_name as string | null,
          searchValue: String(row.search_value),
        },
      ]),
  );
  const missing = new Set<string>();
  const entries = new Proxy(baseEntries, {
    get(target, key, receiver) {
      if (typeof key === "string" && !Object.hasOwn(target, key)) missing.add(key);
      return Reflect.get(target, key, receiver);
    },
  });
  const cache = { version: 1 as const, updatedAt: manifest.generatedAt!, entries };
  const normalizationOptions = {
    skipGeocoding: true,
    geocodeEndpoint: new URL("https://invalid.local/offline-no-geocoding"),
  };
  const schoolRows = csv("schools"),
    supermarketRows = csv("supermarkets");
  const schools = await normalizeSchoolRows(schoolRows, cache, normalizationOptions);
  const supermarkets = await normalizeSupermarketRows(supermarketRows, cache, normalizationOptions);
  const rawMrt = geo("mrt"),
    mrtExits = normalizeMrtFeatures(rawMrt);
  const hawkers = normalizeAmenityGeoJson(geo("hawkers")),
    parks = normalizeAmenityGeoJson(geo("parks"));
  const propertyRows = csv("property"),
    propertyInfo = normalizePropertyRows(propertyRows);
  // The forecast rekeys this real inventory against its full effective source.
  const properties = propertyInfo;
  const retainedInventory = JSON.parse(
    readFileSync(".neon-benchmark/manual-upstream-inventory.json", "utf8"),
  ) as { hints: Record<string, string>; metadata: { lastUpdatedAt: string } };
  const hints = {
    ...retainedInventory.hints,
    ...Object.fromEntries(receipt.before.map((row) => [row.datasetId, row.lastUpdatedAt])),
  };
  const capturedContext = {
    propertyInfo: properties,
    mrtExits,
    schools: schools.schools,
    hawkers,
    supermarkets: supermarkets.supermarkets,
    parks,
    metadata: { ...manifest.sources, lastUpdatedAt: retainedInventory.metadata.lastUpdatedAt },
    sourceVersionHints: hints,
    exitsGeoJson: JSON.parse(canonicalJson(rawMrt)) as typeof rawMrt,
    stationsGeoJson: JSON.parse(canonicalJson(buildMrtStationsGeoJson(mrtExits))) as ReturnType<
      typeof buildMrtStationsGeoJson
    >,
    missingAmenityCacheKeys: [...missing].sort(),
    capturedNormalizedContextComplete: true, // Complete normalization under the supported cache-only policy.
  };
  let prepared: ReturnType<typeof prepareCacheOnlyStage> | undefined;
  const plan = await forecastRetainedContext({
    local: db,
    previous,
    active,
    reconciliation,
    manifest,
    capturedContext,
    onPreparedArtifacts: prepare
      ? (material) => {
          prepared = prepareCacheOnlyStage({
            ...material,
            local: db,
            capturedContext,
            review,
            transactionInserts: reconciliation.delta.inserts,
            rawHashes: Object.fromEntries(receipt.captures.map((c) => [c.kind, c.SHA256])),
          });
        }
      : undefined,
  });
  const retainedMrt = JSON.parse(
    String(db.prepare("SELECT json FROM mrt_geojson WHERE kind='exits'").get()!.json),
  );
  const normalizedCounts = {
    properties: properties.length,
    mrtExits: mrtExits.length,
    primarySchools: schools.schools.length,
    hawkers: hawkers.length,
    supermarkets: supermarkets.supermarkets.length,
    parks: parks.length,
  };
  const oldMonths = [...new Set(previous.map((row) => row.month))].sort();
  const newMonths = [...new Set(incoming.map((row) => row.month))].sort();
  const output = {
    analyzedAtUTC: new Date().toISOString(),
    mode: "offline-current-context-provenance-forecast",
    newDatabaseCalls: 0,
    newOneMapCalls: 0,
    remotePublication: false,
    pinnedActiveCSVUnchanged: true,
    sourcePolicyApproved: true,
    decisionReference: review.decisionReference,
    approvedInsertedFacts: reconciliation.delta.inserts.length,
    approvedRetainedIds: reconciliation.missing.map((row) => row.id),
    originalInputProvenance: {
      retainedBaseline: ".neon-benchmark/source.sqlite",
      originalPropertyCSV: null,
      originalSchoolCSV: null,
      originalSupermarketCSV: null,
      originalHawkerGeoJSON: null,
      originalParkGeoJSON: null,
      originalMrtGeoJSON: "mrt_geojson.exits in retained source.sqlite",
      originalContextDigest: null,
      baselineSyncBuildStatePresent: !!manifest.syncBuildState,
      originalHistoricalTransactionCSV: null,
      historicalFactsReused: previous.filter((row) => row.month < "2017-01").length,
      originalInputByteIdentityEstablished: false,
    },
    publicCapture: {
      directory,
      startedAtUTC: receipt.startedAtUTC,
      finishedAtUTC: receipt.finishedAtUTC,
      requestCount: receipt.requests.length,
      receivedResponseBytes: receipt.receivedResponseBytes,
      bodies: receipt.captures,
      metadataStableDuringCapture: true,
      credentialsUsed: false,
      transactionBodyDownloads: 0,
    },
    currentContext: {
      normalizedCounts,
      propertyRejectedRows: propertyRows.length - properties.length,
      mrtRejectedFeatures: rawMrt.features.length - mrtExits.length,
      currentMrtLogicallyEqualsRetained: canonicalJson(rawMrt) === canonicalJson(retainedMrt),
      missingAmenityCacheKeys: [...missing].sort(),
      newGeocodesProduced: schools.geocodedCount + supermarkets.geocodedCount,
      fullGeocodingEnabledOutcomeKnown: false,
      newSuccessfulAddressGeocodes: null,
      authenticatedRoutingOutcomeKnown: false,
    },
    sourceWindow: {
      baselineMaxMonth: oldMonths.at(-1),
      pinnedSourceMaxMonth: newMonths.at(-1),
      baseline24ObservedMonthThreshold: oldMonths.at(-24),
      pinnedSource24ObservedMonthThreshold: newMonths.at(-24),
    },
    plan,
    supportedCacheOnlySnapshot: true,
    requiredNewGeocodeRequests: 0,
    legacyPublicationForecast: plan.forecastWriteUpperBound,
    authoritativeFullPublicationForecast: null,
    stopReason: !plan.mutationBreakdown.mandatoryPinnedSourceSubset.passesWriteGuard
      ? "Required pinned transaction inserts plus existing-block own-source median/count writes already exceed the unchanged 25000 guard, before other artifacts. The exact cache-only output is supported; native staged publication needs separate schema/resource/envelope admission. No guard increase or remote retry."
      : "Exact original raw context/historical source inputs not retained; current-context cache-only candidate is reproducible under supported omission/fallback semantics. No new geocode or authenticated route outcomes are required. Guards remain unchanged and native remote admission is pending.",
  };
  if (prepare) {
    console.log(
      JSON.stringify(
        {
          prepared,
          forecast: { changedRows: plan.changedRows, legacyForecast: plan.forecastWriteUpperBound },
        },
        null,
        2,
      ),
    );
  } else {
    writeFileSync(
      "docs/evidence/neon-context-provenance-forecast-2026-10-04.json",
      JSON.stringify(output, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          ...output,
          publicCapture: { ...output.publicCapture, bodies: undefined },
          plan: {
            ...plan,
            missingGeocodeAddresses: plan.missingGeocodeAddresses.length,
            declaredIndexInventory: undefined,
          },
        },
        null,
        2,
      ),
    );
  }
} finally {
  db.close();
}
