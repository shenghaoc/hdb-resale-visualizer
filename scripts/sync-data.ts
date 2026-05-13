import {
  ensureDataDirectories,
  writeComparisonFiles,
  writeDetailFiles,
  writeGeneratedArtifacts,
  writeTownBlockFiles,
} from "./lib/sync/writer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildArtifacts,
  buildMrtStationsGeoJson,
  type AmenityLocation,
  type GeocodeCacheFile,
  type SchoolLocation,
} from "./lib/pipeline";
import { collectionMetadataSchema } from "./lib/schemas";
import { fetchCsvRows, fetchGeoJson, fetchJson, sleep } from "./lib/sync/fetchers";
import { geocodeAddress, loadGeocodeCache, saveGeocodeCache } from "./lib/sync/geocode";
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
import { resolveOneMapSearchEndpoint, validateGeneratedArtifacts } from "./lib/syncGuards";

const ROOT = process.cwd();
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const GEOCODE_CACHE_PATH = path.join(ROOT, "data", "cache", "geocodes.json");

type CollectionMetadata = { childDatasets: string[]; lastUpdatedAt: string };
type TimestampFactory = () => string;
type GeocodeDependencies = {
  geocodeAddressFn?: typeof geocodeAddress;
  saveGeocodeCacheFn?: typeof saveGeocodeCache;
  now?: TimestampFactory;
};
type AmenityFetchDependencies = {
  fetchCsvRowsFn?: typeof fetchCsvRows;
  fetchGeoJsonFn?: typeof fetchGeoJson;
  normalizeSchoolRowsFn?: typeof normalizeSchoolRows;
  normalizeAmenityGeoJsonFn?: typeof normalizeAmenityGeoJson;
  normalizeSupermarketRowsFn?: typeof normalizeSupermarketRows;
  sleepFn?: typeof sleep;
};
type ArtifactWriteDependencies = {
  validateGeneratedArtifactsFn?: typeof validateGeneratedArtifacts;
  buildMrtStationsGeoJsonFn?: typeof buildMrtStationsGeoJson;
  writeGeneratedArtifactsFn?: typeof writeGeneratedArtifacts;
  writeTownBlockFilesFn?: typeof writeTownBlockFiles;
  writeComparisonFilesFn?: typeof writeComparisonFiles;
  writeDetailFilesFn?: typeof writeDetailFiles;
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
  const sleepFn = deps.sleepFn ?? sleep;

  console.log("Fetching amenity data...");
  let schools: SchoolLocation[] = [];
  let hawkers: AmenityLocation[] = [];
  let supermarkets: AmenityLocation[] = [];
  let parks: AmenityLocation[] = [];
  let geocodedCount = 0;

  try {
    const schoolRows = await fetchCsvRowsFn(MOE_SCHOOL_DATASET_ID);
    await sleepFn(2600);
    const schoolResult = await normalizeSchoolRowsFn(schoolRows, geocodeCache, options);
    schools = schoolResult.schools;
    geocodedCount += schoolResult.geocodedCount;
  } catch (error) {
    warnAmenityStep("schools", error);
  }

  try {
    const hawkerGeoJson = await fetchGeoJsonFn(NEA_HAWKER_DATASET_ID);
    await sleepFn(2600);
    hawkers = normalizeAmenityGeoJsonFn(hawkerGeoJson);
  } catch (error) {
    warnAmenityStep("hawkers", error);
  }

  try {
    const supermarketRows = await fetchCsvRowsFn(SFA_SUPERMARKET_DATASET_ID);
    await sleepFn(2600);
    const supermarketResult = await normalizeSupermarketRowsFn(
      supermarketRows,
      geocodeCache,
      options,
    );
    supermarkets = supermarketResult.supermarkets;
    geocodedCount += supermarketResult.geocodedCount;
  } catch (error) {
    warnAmenityStep("supermarkets", error);
  }

  try {
    const parksGeoJson = await fetchGeoJsonFn(NPARKS_PARKS_DATASET_ID);
    await sleepFn(2600);
    parks = normalizeAmenityGeoJsonFn(parksGeoJson);
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
    cachePath: string;
    concurrency: number;
  },
  deps: GeocodeDependencies = {},
) {
  const geocodeAddressFn = deps.geocodeAddressFn ?? geocodeAddress;
  const saveGeocodeCacheFn = deps.saveGeocodeCacheFn ?? saveGeocodeCache;
  const now = deps.now ?? nowTimestamp;
  const { missingAddresses, geocodeCache, geocodeEndpoint, skipGeocoding, cachePath, concurrency } =
    options;
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
  let flushInFlight: Promise<void> | null = null;
  console.log(`Geocoding ${missingAddresses.length} addresses with concurrency ${concurrency}...`);

  async function worker() {
    while (nextIndex < missingAddresses.length) {
      const currentIndex = nextIndex++;
      const [addressKey, searchValue] = missingAddresses[currentIndex];
      try {
        const geocode = await geocodeAddressFn(searchValue, geocodeEndpoint);
        if (geocode) geocodeCache.entries[addressKey] = geocode;
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
        const flush = flushInFlight ?? Promise.resolve();
        flushInFlight = flush.then(() => saveGeocodeCacheFn(cachePath, geocodeCache));
        await flushInFlight;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, missingAddresses.length) }, () => worker()),
  );

  return { geocodeFailureCount, geocodeFailureSamples };
}

export async function validateAndWriteArtifacts(
  options: {
    artifacts: ReturnType<typeof buildArtifacts>;
    mrtGeoJson: { type: "FeatureCollection"; features: unknown[] };
    mrtExits: ReturnType<typeof normalizeMrtFeatures>;
    geocodeFailureCount: number;
  },
  deps: ArtifactWriteDependencies = {},
) {
  const validateGeneratedArtifactsFn = deps.validateGeneratedArtifactsFn ?? validateGeneratedArtifacts;
  const buildMrtStationsGeoJsonFn = deps.buildMrtStationsGeoJsonFn ?? buildMrtStationsGeoJson;
  const writeGeneratedArtifactsFn = deps.writeGeneratedArtifactsFn ?? writeGeneratedArtifacts;
  const writeTownBlockFilesFn = deps.writeTownBlockFilesFn ?? writeTownBlockFiles;
  const writeComparisonFilesFn = deps.writeComparisonFilesFn ?? writeComparisonFiles;
  const writeDetailFilesFn = deps.writeDetailFilesFn ?? writeDetailFiles;

  validateGeneratedArtifactsFn({
    blockSummariesCount: options.artifacts.blockSummaries.length,
    detailCount: Object.keys(options.artifacts.details).length,
    geocodeFailureCount: options.geocodeFailureCount,
  });

  const stationsGeoJson = buildMrtStationsGeoJsonFn(options.mrtExits);
  await writeGeneratedArtifactsFn(options.artifacts, options.mrtGeoJson, stationsGeoJson);
  await writeTownBlockFilesFn(options.artifacts.blocksByTown);
  await writeComparisonFilesFn(options.artifacts.comparisons);
  await writeDetailFilesFn(options.artifacts.details);
}

export async function runSyncData(argv = process.argv.slice(2)) {
  const force = argv.includes("--force");
  const skipGeocoding = argv.includes("--skip-geocoding") || process.env.SKIP_GEOCODING === "1";
  const skipAmenities = argv.includes("--skip-amenities") || process.env.SKIP_AMENITIES === "1";
  const geocodeEndpoint = resolveOneMapSearchEndpoint();

  await ensureDataDirectories();

  const resaleCollection = await fetchCollectionMetadata();
  try {
    const previousManifest = JSON.parse(
      await fs.readFile(path.join(PUBLIC_DATA_DIR, "manifest.json"), "utf8"),
    ) as { sources?: { lastUpdatedAt?: string } };
    if (!force && previousManifest.sources?.lastUpdatedAt === resaleCollection.lastUpdatedAt) {
      console.log(`No upstream resale collection change detected (${resaleCollection.lastUpdatedAt}).`);
      return;
    }
  } catch {
    // No manifest yet.
  }

  console.log(`Downloading ${resaleCollection.childDatasets.length} resale datasets...`);
  const resaleCsvRows: Record<string, string>[] = [];
  for (const datasetId of resaleCollection.childDatasets) {
    const datasetRows = await fetchCsvRows(datasetId);
    for (const row of datasetRows) {
      resaleCsvRows.push(row);
    }
    await sleep(2600);
  }

  const propertyRows = await fetchCsvRows(PROPERTY_DATASET_ID);
  await sleep(2600);
  const mrtGeoJson = await fetchGeoJson(MRT_DATASET_ID);

  const transactions = normalizeResaleRows(resaleCsvRows);
  const propertyInfo = rekeyPropertyInfo(normalizePropertyRows(propertyRows), transactions);
  const mrtExits = normalizeMrtFeatures(mrtGeoJson);
  const geocodeCache = await loadGeocodeCache(GEOCODE_CACHE_PATH);

  let amenities: Omit<Awaited<ReturnType<typeof fetchAmenityData>>, "geocodedCount"> | undefined;
  if (!skipAmenities) {
    const { geocodedCount, ...amenityData } = await fetchAmenityData(geocodeCache, {
      skipGeocoding,
      geocodeEndpoint,
    });
    amenities = amenityData;
    if (geocodedCount > 0) {
      geocodeCache.updatedAt = nowTimestamp();
      await saveGeocodeCache(GEOCODE_CACHE_PATH, geocodeCache);
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
    cachePath: GEOCODE_CACHE_PATH,
    concurrency,
  });

  if (geocodeFailureCount > 0) {
    console.warn(`Geocoding failed for ${geocodeFailureCount} addresses. Sample: ${geocodeFailureSamples.join(" | ")}`);
  }

  geocodeCache.updatedAt = nowTimestamp();
  await saveGeocodeCache(GEOCODE_CACHE_PATH, geocodeCache);

  const artifacts = buildArtifacts({
    transactions,
    propertyInfo,
    mrtExits,
    geocodes: geocodeCache.entries,
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

  await validateAndWriteArtifacts({
    artifacts,
    mrtGeoJson,
    mrtExits,
    geocodeFailureCount,
  });
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
