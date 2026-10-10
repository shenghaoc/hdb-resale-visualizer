import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildArtifacts,
  excludedTransactionDigest,
  toTransactionRow,
  buildMrtStationsGeoJson,
  pickNearestStations,
  walkingTimeLookupKey,
  type AmenityLocation,
  type GeocodeCacheFile,
  type ResaleTransaction,
  type SchoolLocation,
} from "./lib/pipeline";
import { collectionMetadataSchema } from "./lib/schemas";
import { fetchCsvRows, fetchGeoJson, fetchJson } from "./lib/sync/fetchers";
import { geocodeAddress, loadGeocodeCache, saveGeocodeCacheEntries } from "./lib/sync/geocode";
import {
  buildRoutingCacheKey,
  loadRoutingCache,
  resolveOneMapToken,
  routeMissingPairs,
  saveRoutingCacheEntries,
  type RoutingCacheFile,
} from "./lib/sync/routing";
import {
  normalizeAmenityGeoJson,
  normalizeMrtFeatures,
  normalizePropertyRows,
  normalizeResaleRows,
  normalizeSchoolRows,
  normalizeSupermarketRows,
  rekeyPropertyInfo,
} from "./lib/sync/normalization";
import {
  MOE_SCHOOL_DATASET_ID,
  MRT_DATASET_ID,
  NEA_HAWKER_DATASET_ID,
  NPARKS_PARKS_DATASET_ID,
  PROPERTY_DATASET_ID,
  RESALE_COLLECTION_ID,
  SFA_SUPERMARKET_DATASET_ID,
} from "./lib/sync/constants";
import {
  resolveOneMapRoutingEndpoint,
  resolveOneMapSearchEndpoint,
  resolveOneMapTokenEndpoint,
  validateGeneratedArtifacts,
} from "./lib/syncGuards";
import { D1Client, resolveD1ConfigFromEnv } from "./lib/sync/d1";
import { fetchSourceVersionHints, sourceVersionHintsChanged } from "./lib/sync/source-version";
import {
  requiresSourceReconciliation,
  resolveReconciliationTrigger,
} from "./lib/sync/refresh-policy";
import type { StoredManifest } from "../shared/data-types";
import {
  assertNoUnfinishedPublication,
  readManifestUpdatedAt,
  readPublishedArtifacts,
  writeArtifactsToD1,
  writeIncrementalArtifactsToLocalD1,
} from "./lib/sync/store";
import {
  assignStableTransactionIds,
  planTransactionDelta,
  readTransactionSnapshot,
} from "./lib/sync/incremental";

type CollectionMetadata = { childDatasets: string[]; lastUpdatedAt: string };
type TimestampFactory = () => string;
type GeocodeDependencies = {
  geocodeAddressFn?: typeof geocodeAddress;
  now?: TimestampFactory;
};
type AmenityFetchDependencies = {
  fetchCsvRowsFn?: typeof fetchCsvRows;
  fetchGeoJsonFn?: typeof fetchGeoJson;
  normalizeSchoolRowsFn?: typeof normalizeSchoolRows;
  normalizeAmenityGeoJsonFn?: typeof normalizeAmenityGeoJson;
  normalizeSupermarketRowsFn?: typeof normalizeSupermarketRows;
};

const nowTimestamp: TimestampFactory = () => new Date().toISOString();

async function fetchCollectionMetadata(): Promise<CollectionMetadata> {
  const payload = await fetchJson<unknown>(
    `https://api-production.data.gov.sg/v2/public/api/collections/${RESALE_COLLECTION_ID}/metadata`,
  );
  const parsed = collectionMetadataSchema.parse(payload);
  return {
    childDatasets: parsed.data.collectionMetadata.childDatasets,
    lastUpdatedAt: parsed.data.collectionMetadata.lastUpdatedAt,
  };
}

function warnAmenityStep(step: string, error: unknown) {
  console.warn(
    `Amenity step "${step}" failed: ${error instanceof Error ? error.message : "unknown error"}.`,
  );
}

export async function fetchAmenityData(
  geocodeCache: GeocodeCacheFile,
  options: { skipGeocoding: boolean; geocodeEndpoint: URL },
  deps: AmenityFetchDependencies = {},
) {
  const fetchCsvRowsFn = deps.fetchCsvRowsFn ?? fetchCsvRows;
  const fetchGeoJsonFn = deps.fetchGeoJsonFn ?? fetchGeoJson;
  const normalizeSchoolRowsFn = deps.normalizeSchoolRowsFn ?? normalizeSchoolRows;
  const normalizeAmenityGeoJsonFn = deps.normalizeAmenityGeoJsonFn ?? normalizeAmenityGeoJson;
  const normalizeSupermarketRowsFn = deps.normalizeSupermarketRowsFn ?? normalizeSupermarketRows;

  console.log("Fetching amenity data...");
  let schools: SchoolLocation[] = [];
  let hawkers: AmenityLocation[] = [];
  let supermarkets: AmenityLocation[] = [];
  let parks: AmenityLocation[] = [];
  let geocodedCount = 0;
  const failedSources: string[] = [];

  try {
    const schoolRows = await fetchCsvRowsFn(MOE_SCHOOL_DATASET_ID);
    const schoolResult = await normalizeSchoolRowsFn(schoolRows, geocodeCache, options);
    schools = schoolResult.schools;
    geocodedCount += schoolResult.geocodedCount;
    console.log(`Processed ${schools.length} primary schools.`);
  } catch (error) {
    failedSources.push("schools");
    warnAmenityStep("schools", error);
  }

  try {
    const hawkerGeoJson = await fetchGeoJsonFn(NEA_HAWKER_DATASET_ID);
    hawkers = normalizeAmenityGeoJsonFn(hawkerGeoJson);
    console.log(`Processed ${hawkers.length} hawker centres.`);
  } catch (error) {
    failedSources.push("hawkers");
    warnAmenityStep("hawkers", error);
  }

  try {
    const supermarketRows = await fetchCsvRowsFn(SFA_SUPERMARKET_DATASET_ID);
    const supermarketResult = await normalizeSupermarketRowsFn(
      supermarketRows,
      geocodeCache,
      options,
    );
    supermarkets = supermarketResult.supermarkets;
    geocodedCount += supermarketResult.geocodedCount;
    console.log(`Processed ${supermarkets.length} supermarkets.`);
  } catch (error) {
    failedSources.push("supermarkets");
    warnAmenityStep("supermarkets", error);
  }

  try {
    const parksGeoJson = await fetchGeoJsonFn(NPARKS_PARKS_DATASET_ID);
    parks = normalizeAmenityGeoJsonFn(parksGeoJson);
    console.log(`Processed ${parks.length} parks.`);
  } catch (error) {
    failedSources.push("parks");
    warnAmenityStep("parks", error);
  }

  console.log(
    `Loaded ${schools.length} schools, ${hawkers.length} hawkers, ${supermarkets.length} supermarkets, ${parks.length} parks.`,
  );

  return {
    schools,
    hawkers,
    supermarkets,
    parks,
    geocodedCount,
    failedSources,
  };
}

export async function geocodeMissingAddresses(
  options: {
    missingAddresses: [string, string][];
    geocodeCache: GeocodeCacheFile;
    geocodeEndpoint: URL;
    skipGeocoding: boolean;
    concurrency: number;
    flushCacheFn: (newKeys: string[]) => Promise<void>;
  },
  deps: GeocodeDependencies = {},
) {
  const geocodeAddressFn = deps.geocodeAddressFn ?? geocodeAddress;
  const now = deps.now ?? nowTimestamp;
  const { missingAddresses, geocodeCache, geocodeEndpoint, skipGeocoding, concurrency } = options;
  let geocodeFailureCount = 0;
  const geocodeFailureSamples: string[] = [];

  if (skipGeocoding) {
    console.log(
      `Skipping geocoding and using ${Object.keys(geocodeCache.entries).length} cached coordinates.`,
    );
    return { geocodeFailureCount, geocodeFailureSamples };
  }

  if (missingAddresses.length === 0) {
    return { geocodeFailureCount, geocodeFailureSamples };
  }

  let nextIndex = 0;
  let completed = 0;
  let flushedAt = 0;
  let pendingFlushKeys: string[] = [];
  let flushInFlight: Promise<void> | null = null;
  console.log(`Geocoding ${missingAddresses.length} addresses with concurrency ${concurrency}...`);

  async function worker() {
    while (nextIndex < missingAddresses.length) {
      const currentIndex = nextIndex++;
      const [addressKey, searchValue] = missingAddresses[currentIndex];
      try {
        const geocode = await geocodeAddressFn(searchValue, geocodeEndpoint);
        if (geocode) {
          geocodeCache.entries[addressKey] = geocode;
          pendingFlushKeys.push(addressKey);
        } else {
          geocodeFailureCount += 1;
          if (geocodeFailureSamples.length < 5)
            geocodeFailureSamples.push(`${searchValue}: no geocode result`);
        }
      } catch (error) {
        geocodeFailureCount += 1;
        if (geocodeFailureSamples.length < 5)
          geocodeFailureSamples.push(
            `${searchValue}: ${error instanceof Error ? error.message : "unknown error"}`,
          );
      }
      completed += 1;
      if (completed % 200 === 0 || completed === missingAddresses.length)
        console.log(`Geocoded ${completed}/${missingAddresses.length}`);
      if (completed - flushedAt >= 250 || completed === missingAddresses.length) {
        flushedAt = completed;
        geocodeCache.updatedAt = now();
        const keys = pendingFlushKeys;
        pendingFlushKeys = [];
        const flush = flushInFlight ? flushInFlight.catch(() => {}) : Promise.resolve();
        flushInFlight = flush.then(() => options.flushCacheFn(keys));
        await flushInFlight;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, missingAddresses.length) }, () => worker()),
  );

  return { geocodeFailureCount, geocodeFailureSamples };
}

export async function computeWalkingTimes(
  options: {
    geocodes: Record<string, import("./lib/pipeline").GeocodeEntry>;
    addressKeys: Iterable<string>;
    mrtExits: import("./lib/pipeline").MrtExit[];
    routingCache: RoutingCacheFile;
    skipRouting: boolean;
    routingEndpoint: URL;
    tokenEndpoint: URL;
    concurrency: number;
    flushCacheFn: (newKeys: string[]) => Promise<void>;
  },
  deps: {
    resolveOneMapTokenFn?: typeof resolveOneMapToken;
    routeMissingPairsFn?: typeof routeMissingPairs;
    now?: TimestampFactory;
  } = {},
): Promise<{ walkingTimes: Map<string, number>; fallbackCount: number; failureCount: number }> {
  const resolveOneMapTokenFn = deps.resolveOneMapTokenFn ?? resolveOneMapToken;
  const routeMissingPairsFn = deps.routeMissingPairsFn ?? routeMissingPairs;
  const now = deps.now ?? nowTimestamp;

  const pairs: Array<{
    key: string;
    addressKey: string;
    stationName: string;
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  }> = [];

  for (const addressKey of options.addressKeys) {
    const geocode = options.geocodes[addressKey];
    if (!geocode) {
      continue;
    }
    const start = { lat: geocode.lat, lng: geocode.lng };
    const picks = pickNearestStations(start, options.mrtExits, 3);
    for (const pick of picks) {
      const end = { lat: pick.exitLat, lng: pick.exitLng };
      pairs.push({
        key: buildRoutingCacheKey(start, end),
        addressKey,
        stationName: pick.stationName,
        start,
        end,
      });
    }
  }

  if (options.skipRouting) {
    console.log(
      `Skipping OneMap routing; using ${Object.keys(options.routingCache.entries).length} cached pairs and falling back where missing.`,
    );
  } else {
    const token = await resolveOneMapTokenFn({
      email: process.env.ONEMAP_EMAIL,
      password: process.env.ONEMAP_PASSWORD,
      token: process.env.ONEMAP_TOKEN,
      tokenEndpoint: options.tokenEndpoint,
    });

    if (!token) {
      console.warn(
        "No ONEMAP_TOKEN (or ONEMAP_EMAIL+ONEMAP_PASSWORD) configured; falling back to straight-line walking-time estimates for all pairs.",
      );
    } else {
      const dedupedPairs = [...new Map(pairs.map((pair) => [pair.key, pair])).values()];
      const result = await routeMissingPairsFn({
        pairs: dedupedPairs,
        cache: options.routingCache,
        routingEndpoint: options.routingEndpoint,
        token,
        flushCacheFn: options.flushCacheFn,
        concurrency: options.concurrency,
        now,
      });
      if (result.failedCount > 0) {
        console.warn(
          `OneMap routing failed for ${result.failedCount} pairs. Sample: ${result.failureSamples.join(" | ")}`,
        );
      }
    }
  }

  const walkingTimes = new Map<string, number>();
  let fallbackCount = 0;
  let failureCount = 0;
  for (const pair of pairs) {
    const cached = options.routingCache.entries[pair.key];
    if (cached) {
      walkingTimes.set(
        walkingTimeLookupKey(pair.addressKey, pair.stationName),
        cached.walkingTimeSeconds,
      );
    } else {
      fallbackCount += 1;
      if (!options.skipRouting) {
        failureCount += 1;
      }
    }
  }

  return { walkingTimes, fallbackCount, failureCount };
}

function requireD1Config() {
  const d1Config = resolveD1ConfigFromEnv();
  if (!d1Config) {
    throw new Error(
      "Missing D1 credentials. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_D1_DATABASE_ID before running sync-data.",
    );
  }
  return d1Config;
}

/**
 * Entry point of `vp run sync-data`.
 *
 * A plain run (optionally `--force`) is the production publication: it rebuilds every artifact and replaces the
 * D1 generated tables under the publication marker (`writeArtifactsToD1`). The incremental modes are opt-in and
 * never take that path:
 *
 * - `--plan` / `--check-upstream`: read-only probes (source hints, and with `--reconcile-manual` /
 *   `--reconcile-monthly` the exact transaction delta). Safe against a remote D1.
 * - `--apply-rehearsal`: applies the incremental plan as one atomic batch to a loopback emulator only.
 */
export async function runSyncData(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes("--check-upstream");
  const planOnly = argv.includes("--plan") || checkOnly;
  const rehearsal = argv.includes("--apply-rehearsal");
  if (planOnly && rehearsal)
    throw new Error("Choose either --plan/--check-upstream or --apply-rehearsal, not both.");
  if (planOnly || rehearsal) return runIncrementalSync(argv, { checkOnly, planOnly });
  // Explicit reconciliation intent selects the incremental modes. It must never fall through to the
  // production publication, which replaces every generated D1 table.
  if (argv.includes("--reconcile-manual") || argv.includes("--reconcile-monthly")) {
    throw new Error(
      "--reconcile-manual and --reconcile-monthly select the incremental modes: add --plan (read-only) or " +
        "--apply-rehearsal (loopback emulator). A plain run publishes the full replacement under the " +
        "publication marker; use --force to repeat it when upstream is unchanged.",
    );
  }

  const force = argv.includes("--force");
  const skipGeocoding = argv.includes("--skip-geocoding") || process.env.SKIP_GEOCODING === "1";
  const skipAmenities = argv.includes("--skip-amenities") || process.env.SKIP_AMENITIES === "1";
  const skipRouting = argv.includes("--skip-routing") || process.env.SKIP_ROUTING === "1";
  const geocodeEndpoint = resolveOneMapSearchEndpoint();
  const routingEndpoint = resolveOneMapRoutingEndpoint();
  const tokenEndpoint = resolveOneMapTokenEndpoint();

  // The publication is one long multi-request run that has always retried transient failures.
  const db = new D1Client(requireD1Config(), { retry: true });

  const resaleCollection = await fetchCollectionMetadata();
  if (!force) {
    const previousLastUpdatedAt = await readManifestUpdatedAt(db);
    if (previousLastUpdatedAt && previousLastUpdatedAt === resaleCollection.lastUpdatedAt) {
      console.log(
        `No upstream resale collection change detected (${resaleCollection.lastUpdatedAt}).`,
      );
      return;
    }
  }

  console.log(`Downloading ${resaleCollection.childDatasets.length} resale datasets...`);
  const transactions: ResaleTransaction[] = [];
  for (const [index, datasetId] of resaleCollection.childDatasets.entries()) {
    const datasetRows = await fetchCsvRows(datasetId);
    const normalized = normalizeResaleRows(datasetRows);
    for (const transaction of normalized) transactions.push(transaction);
    console.log(
      `Processed resale dataset ${index + 1}/${resaleCollection.childDatasets.length}: ${normalized.length} transactions (${transactions.length} total).`,
    );
  }

  const propertyRows = await fetchCsvRows(PROPERTY_DATASET_ID);
  const normalizedPropertyInfo = normalizePropertyRows(propertyRows);
  console.log(`Processed ${normalizedPropertyInfo.length} property rows.`);

  const mrtGeoJson = await fetchGeoJson(MRT_DATASET_ID);
  const mrtExits = normalizeMrtFeatures(mrtGeoJson);
  console.log(`Processed ${mrtExits.length} MRT exits.`);

  const propertyInfo = rekeyPropertyInfo(normalizedPropertyInfo, transactions);
  const geocodeCache = await loadGeocodeCache(db);
  console.log(`Loaded ${Object.keys(geocodeCache.entries).length} cached geocodes from D1.`);

  let amenities: Omit<Awaited<ReturnType<typeof fetchAmenityData>>, "geocodedCount"> | undefined;
  const amenityGeocodeKeys: string[] = [];
  if (!skipAmenities) {
    const beforeAmenityKeys = new Set(Object.keys(geocodeCache.entries));
    const { geocodedCount, ...amenityData } = await fetchAmenityData(geocodeCache, {
      skipGeocoding,
      geocodeEndpoint,
    });
    amenities = amenityData;
    if (geocodedCount > 0) {
      for (const key of Object.keys(geocodeCache.entries)) {
        if (!beforeAmenityKeys.has(key)) {
          amenityGeocodeKeys.push(key);
        }
      }
      await saveGeocodeCacheEntries(db, geocodeCache, amenityGeocodeKeys, nowTimestamp());
    }
  }

  const uniqueAddresses = new Map(
    transactions.map((t) => [t.addressKey, `${t.block} ${t.streetName} SINGAPORE`]),
  );
  const missingAddresses = [...uniqueAddresses.entries()].filter(
    ([addressKey]) => geocodeCache.entries[addressKey] === undefined,
  );
  const concurrency = Math.max(1, Number(process.env.GEOCODE_CONCURRENCY ?? "10"));
  const { geocodeFailureCount, geocodeFailureSamples } = await geocodeMissingAddresses({
    missingAddresses,
    geocodeCache,
    geocodeEndpoint,
    skipGeocoding,
    concurrency,
    flushCacheFn: async (newKeys) => {
      await saveGeocodeCacheEntries(db, geocodeCache, newKeys, nowTimestamp());
    },
  });

  if (geocodeFailureCount > 0) {
    console.warn(
      `Geocoding failed for ${geocodeFailureCount} addresses. Sample: ${geocodeFailureSamples.join(" | ")}`,
    );
  }

  const routingCache = await loadRoutingCache(db);
  console.log(`Loaded ${Object.keys(routingCache.entries).length} cached walking times from D1.`);
  const routingConcurrency = Math.max(1, Number(process.env.ROUTING_CONCURRENCY ?? "4"));
  const { walkingTimes, fallbackCount: walkingFallbackCount } = await computeWalkingTimes({
    geocodes: geocodeCache.entries,
    addressKeys: uniqueAddresses.keys(),
    mrtExits,
    routingCache,
    skipRouting,
    routingEndpoint,
    tokenEndpoint,
    concurrency: routingConcurrency,
    flushCacheFn: async (newKeys) => {
      await saveRoutingCacheEntries(db, routingCache, newKeys, nowTimestamp());
    },
  });
  if (walkingFallbackCount > 0) {
    console.log(
      `Walking-time fallbacks used for ${walkingFallbackCount} block→station pairs (straight-line / 1.25 m/s).`,
    );
  }

  const artifacts = buildArtifacts({
    transactions,
    propertyInfo,
    mrtExits,
    geocodes: geocodeCache.entries,
    walkingTimes,
    ...amenities,
    metadata: {
      resaleCollectionId: RESALE_COLLECTION_ID,
      resaleDatasetIds: resaleCollection.childDatasets,
      propertyDatasetId: PROPERTY_DATASET_ID,
      mrtDatasetId: MRT_DATASET_ID,
      moeSchoolDatasetId: MOE_SCHOOL_DATASET_ID,
      neaHawkerDatasetId: NEA_HAWKER_DATASET_ID,
      sfaSupermarketDatasetId: SFA_SUPERMARKET_DATASET_ID,
      nparksParksDatasetId: NPARKS_PARKS_DATASET_ID,
      lastUpdatedAt: resaleCollection.lastUpdatedAt,
    },
  });

  validateGeneratedArtifacts({
    blockSummariesCount: artifacts.blockSummaries.length,
    detailCount: Object.keys(artifacts.details).length,
    geocodeFailureCount,
  });

  const stationsGeoJson = buildMrtStationsGeoJson(mrtExits);
  await writeArtifactsToD1(db, artifacts, mrtGeoJson, stationsGeoJson, nowTimestamp());
}

/**
 * The incremental modes: exact source reconciliation against the stored transactions, then (loopback emulator
 * only) one atomic batch of the changed rows. Nothing here replaces whole tables, stamps the publication marker
 * or writes a remote D1; those belong to the production publication in `runSyncData`.
 */
async function runIncrementalSync(argv: string[], mode: { checkOnly: boolean; planOnly: boolean }) {
  const { checkOnly, planOnly } = mode;
  const reconciliationTrigger = resolveReconciliationTrigger(argv);
  const skipGeocoding = argv.includes("--skip-geocoding") || process.env.SKIP_GEOCODING === "1";
  const skipAmenities = argv.includes("--skip-amenities") || process.env.SKIP_AMENITIES === "1";
  const skipRouting = argv.includes("--skip-routing") || process.env.SKIP_ROUTING === "1";
  const geocodeEndpoint = resolveOneMapSearchEndpoint();
  const routingEndpoint = resolveOneMapRoutingEndpoint();
  const tokenEndpoint = resolveOneMapTokenEndpoint();

  const db = new D1Client(requireD1Config());
  if (!planOnly && !db.isLocalRehearsal) {
    throw new Error(
      "Remote apply disabled: --apply-rehearsal publishes one atomic batch and only runs against a loopback " +
        "emulator (CLOUDFLARE_D1_ENDPOINT=http://localhost:<port>). A remote D1 is published by a plain run, " +
        "the full replacement under the publication marker.",
    );
  }
  db.setPhase("source-version-preflight");

  const baselineRows = await db.query<{ json: string }>({
    sql: "SELECT json FROM manifest WHERE id = 1",
  });
  const manifestJson = baselineRows[0]?.json ?? null;
  const resaleCollection = await fetchCollectionMetadata();
  const baselineManifest = manifestJson ? (JSON.parse(manifestJson) as StoredManifest) : undefined;
  const sourceVersionHints = await fetchSourceVersionHints([
    ...resaleCollection.childDatasets,
    PROPERTY_DATASET_ID,
    MRT_DATASET_ID,
    ...(!skipAmenities
      ? [
          MOE_SCHOOL_DATASET_ID,
          NEA_HAWKER_DATASET_ID,
          SFA_SUPERMARKET_DATASET_ID,
          NPARKS_PARKS_DATASET_ID,
        ]
      : []),
  ]);
  const reconciliationRequired = requiresSourceReconciliation({
    trigger: reconciliationTrigger,
    previousReconciledAt: baselineManifest?.syncBuildState?.reconciledAt,
  });
  if (checkOnly || !reconciliationRequired) {
    console.log(
      JSON.stringify({
        mode: "read-only-source-probe",
        reconciliationTrigger,
        reconciliationRequired,
        collectionHintChanged:
          baselineManifest?.sources.lastUpdatedAt !== resaleCollection.lastUpdatedAt,
        sourceHintsChanged: sourceVersionHintsChanged(
          baselineManifest?.syncBuildState?.sourceVersionHints,
          sourceVersionHints,
        ),
        sourceVersion: resaleCollection.lastUpdatedAt,
        sourceVersionHints,
        actual: db.usageReport(),
        limitation:
          "Hints are observability only; reconciliation requires explicit monthly or manual intent.",
      }),
    );
    return;
  }
  // An unfinished full publication leaves the tables half replaced: they are no baseline to diff against.
  if (manifestJson) assertNoUnfinishedPublication(manifestJson);

  console.log(`Downloading ${resaleCollection.childDatasets.length} resale datasets...`);
  const transactions: ResaleTransaction[] = [];
  for (const [index, datasetId] of resaleCollection.childDatasets.entries()) {
    const datasetRows = await fetchCsvRows(datasetId);
    const normalized = normalizeResaleRows(datasetRows);
    if (normalized.length !== datasetRows.length)
      throw new Error(
        `Invalid or partial source: dataset ${datasetId} had ${datasetRows.length - normalized.length} rejected rows`,
      );
    for (const transaction of normalized) transactions.push(transaction);
    console.log(
      `Processed resale dataset ${index + 1}/${resaleCollection.childDatasets.length}: ${normalized.length} transactions (${transactions.length} total).`,
    );
  }

  // Validate the complete transaction multiset BEFORE geocode/routing cache writes.
  const transactionRows = transactions.flatMap((row) => {
    const fact = toTransactionRow(row);
    return fact ? [fact] : [];
  });
  const excludedDigest = excludedTransactionDigest(transactions);
  const previousExcludedDigest = baselineManifest?.syncBuildState?.excludedSourceDigest;
  if (
    (previousExcludedDigest && previousExcludedDigest !== excludedDigest) ||
    (!previousExcludedDigest && transactions.length !== transactionRows.length)
  )
    throw new Error(
      "Excluded storey-range facts require explicit manual reconciliation before publication",
    );
  const stored = await readTransactionSnapshot(db);
  const delta = planTransactionDelta(stored, transactionRows);
  assignStableTransactionIds(transactions, stored, delta, toTransactionRow);
  if (planOnly) {
    console.log(
      JSON.stringify({
        mode: "read-only-plan",
        sourceVersion: resaleCollection.lastUpdatedAt,
        sourceDatasets: resaleCollection.childDatasets,
        sourceRows: transactionRows.length,
        inserts: delta.inserts.length,
        updates: delta.updates.length,
        affectedBlocks: delta.affectedBlocks.size,
        affectedTownTypes: delta.affectedTownTypes.size,
        actual: db.usageReport(),
        limitation:
          "Transaction preflight only; derived write costs, account headroom and remote atomicity are not proven",
      }),
    );
    return;
  }

  const previousArtifacts = await readPublishedArtifacts(db, manifestJson);
  db.beginWriteStaging();
  const propertyRows = await fetchCsvRows(PROPERTY_DATASET_ID);
  const normalizedPropertyInfo = normalizePropertyRows(propertyRows);
  console.log(`Processed ${normalizedPropertyInfo.length} property rows.`);

  const mrtGeoJson = await fetchGeoJson(MRT_DATASET_ID);
  const mrtExits = normalizeMrtFeatures(mrtGeoJson);
  console.log(`Processed ${mrtExits.length} MRT exits.`);

  const propertyInfo = rekeyPropertyInfo(normalizedPropertyInfo, transactions);
  const geocodeCache = await loadGeocodeCache(db);
  console.log(`Loaded ${Object.keys(geocodeCache.entries).length} cached geocodes from D1.`);

  let amenities: Omit<Awaited<ReturnType<typeof fetchAmenityData>>, "geocodedCount"> | undefined;
  const amenityGeocodeKeys: string[] = [];
  if (!skipAmenities) {
    const beforeAmenityKeys = new Set(Object.keys(geocodeCache.entries));
    const { geocodedCount, ...amenityData } = await fetchAmenityData(geocodeCache, {
      skipGeocoding,
      geocodeEndpoint,
    });
    if (amenityData.failedSources.length)
      throw new Error(`Incomplete amenity snapshot: ${amenityData.failedSources.join(", ")}`);
    amenities = amenityData;
    if (geocodedCount > 0) {
      for (const key of Object.keys(geocodeCache.entries)) {
        if (!beforeAmenityKeys.has(key)) {
          amenityGeocodeKeys.push(key);
        }
      }
      await saveGeocodeCacheEntries(db, geocodeCache, amenityGeocodeKeys, nowTimestamp());
    }
  }

  const uniqueAddresses = new Map(
    transactions.map((t) => [t.addressKey, `${t.block} ${t.streetName} SINGAPORE`]),
  );
  const missingAddresses = [...uniqueAddresses.entries()].filter(
    ([addressKey]) => geocodeCache.entries[addressKey] === undefined,
  );
  const concurrency = Math.max(1, Number(process.env.GEOCODE_CONCURRENCY ?? "10"));
  const { geocodeFailureCount, geocodeFailureSamples } = await geocodeMissingAddresses({
    missingAddresses,
    geocodeCache,
    geocodeEndpoint,
    skipGeocoding,
    concurrency,
    flushCacheFn: async (newKeys) => {
      await saveGeocodeCacheEntries(db, geocodeCache, newKeys, nowTimestamp());
    },
  });

  if (geocodeFailureCount > 0) {
    console.warn(
      `Geocoding failed for ${geocodeFailureCount} addresses. Sample: ${geocodeFailureSamples.join(" | ")}`,
    );
  }

  const routingCache = await loadRoutingCache(db);
  console.log(`Loaded ${Object.keys(routingCache.entries).length} cached walking times from D1.`);
  const routingConcurrency = Math.max(1, Number(process.env.ROUTING_CONCURRENCY ?? "4"));
  const { walkingTimes, fallbackCount: walkingFallbackCount } = await computeWalkingTimes({
    geocodes: geocodeCache.entries,
    addressKeys: uniqueAddresses.keys(),
    mrtExits,
    routingCache,
    skipRouting,
    routingEndpoint,
    tokenEndpoint,
    concurrency: routingConcurrency,
    flushCacheFn: async (newKeys) => {
      await saveRoutingCacheEntries(db, routingCache, newKeys, nowTimestamp());
    },
  });
  if (walkingFallbackCount > 0) {
    console.log(
      `Walking-time fallbacks used for ${walkingFallbackCount} block→station pairs (straight-line / 1.25 m/s).`,
    );
  }

  const artifacts = buildArtifacts({
    transactions,
    propertyInfo,
    mrtExits,
    geocodes: geocodeCache.entries,
    walkingTimes,
    ...amenities,
    sourceVersionHints,
    incremental: previousArtifacts ? { previous: previousArtifacts, delta } : undefined,
    metadata: {
      resaleCollectionId: RESALE_COLLECTION_ID,
      resaleDatasetIds: resaleCollection.childDatasets,
      propertyDatasetId: PROPERTY_DATASET_ID,
      mrtDatasetId: MRT_DATASET_ID,
      moeSchoolDatasetId: MOE_SCHOOL_DATASET_ID,
      neaHawkerDatasetId: NEA_HAWKER_DATASET_ID,
      sfaSupermarketDatasetId: SFA_SUPERMARKET_DATASET_ID,
      nparksParksDatasetId: NPARKS_PARKS_DATASET_ID,
      lastUpdatedAt: resaleCollection.lastUpdatedAt,
    },
  });

  validateGeneratedArtifacts({
    blockSummariesCount: artifacts.blockSummaries.length,
    detailCount: Object.keys(artifacts.details).length,
    geocodeFailureCount,
  });

  const stationsGeoJson = buildMrtStationsGeoJson(mrtExits);
  await writeIncrementalArtifactsToLocalD1(
    db,
    artifacts,
    mrtGeoJson,
    stationsGeoJson,
    nowTimestamp(),
    { delta, manifestJson },
  );
}

function isDirectExecution() {
  const entryFile = process.argv[1];
  if (!entryFile) {
    return false;
  }

  return path.resolve(entryFile) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  void runSyncData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
