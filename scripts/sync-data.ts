import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildArtifacts,
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
import {
  geocodeAddress,
  loadGeocodeCache,
  saveGeocodeCacheEntries,
} from "./lib/sync/geocode";
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
import { readManifestUpdatedAt, writeArtifactsToD1 } from "./lib/sync/store";

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

const nowTimestamp: TimestampFactory = () =>
  Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });

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

  try {
    const schoolRows = await fetchCsvRowsFn(MOE_SCHOOL_DATASET_ID);
    const schoolResult = await normalizeSchoolRowsFn(schoolRows, geocodeCache, options);
    schools = schoolResult.schools;
    geocodedCount += schoolResult.geocodedCount;
    console.log(`Processed ${schools.length} primary schools.`);
  } catch (error) {
    warnAmenityStep("schools", error);
  }

  try {
    const hawkerGeoJson = await fetchGeoJsonFn(NEA_HAWKER_DATASET_ID);
    hawkers = normalizeAmenityGeoJsonFn(hawkerGeoJson);
    console.log(`Processed ${hawkers.length} hawker centres.`);
  } catch (error) {
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
    warnAmenityStep("supermarkets", error);
  }

  try {
    const parksGeoJson = await fetchGeoJsonFn(NPARKS_PARKS_DATASET_ID);
    parks = normalizeAmenityGeoJsonFn(parksGeoJson);
    console.log(`Processed ${parks.length} parks.`);
  } catch (error) {
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
      walkingTimes.set(walkingTimeLookupKey(pair.addressKey, pair.stationName), cached.walkingTimeSeconds);
    } else {
      fallbackCount += 1;
      if (!options.skipRouting) {
        failureCount += 1;
      }
    }
  }

  return { walkingTimes, fallbackCount, failureCount };
}

export async function runSyncData(argv = process.argv.slice(2)) {
  const force = argv.includes("--force");
  const skipGeocoding = argv.includes("--skip-geocoding") || process.env.SKIP_GEOCODING === "1";
  const skipAmenities = argv.includes("--skip-amenities") || process.env.SKIP_AMENITIES === "1";
  const skipRouting = argv.includes("--skip-routing") || process.env.SKIP_ROUTING === "1";
  const geocodeEndpoint = resolveOneMapSearchEndpoint();
  const routingEndpoint = resolveOneMapRoutingEndpoint();
  const tokenEndpoint = resolveOneMapTokenEndpoint();

  const d1Config = resolveD1ConfigFromEnv();
  if (!d1Config) {
    throw new Error(
      "Missing D1 credentials. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_D1_DATABASE_ID before running sync-data.",
    );
  }
  const db = new D1Client(d1Config);

  const resaleCollection = await fetchCollectionMetadata();
  if (!force) {
    const previousLastUpdatedAt = await readManifestUpdatedAt(db);
    if (previousLastUpdatedAt && previousLastUpdatedAt === resaleCollection.lastUpdatedAt) {
      console.log(`No upstream resale collection change detected (${resaleCollection.lastUpdatedAt}).`);
      return;
    }
  }

  console.log(`Downloading ${resaleCollection.childDatasets.length} resale datasets...`);
  const transactions: ResaleTransaction[] = [];
  for (const [index, datasetId] of resaleCollection.childDatasets.entries()) {
    const datasetRows = await fetchCsvRows(datasetId);
    const normalized = normalizeResaleRows(datasetRows);
    for (let i = 0; i < normalized.length; i++) transactions.push(normalized[i]);
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
    console.warn(`Geocoding failed for ${geocodeFailureCount} addresses. Sample: ${geocodeFailureSamples.join(" | ")}`);
  }

  const routingCache = await loadRoutingCache(db);
  console.log(`Loaded ${Object.keys(routingCache.entries).length} cached walking times from D1.`);
  const routingConcurrency = Math.max(
    1,
    Number(process.env.ROUTING_CONCURRENCY ?? "4"),
  );
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
