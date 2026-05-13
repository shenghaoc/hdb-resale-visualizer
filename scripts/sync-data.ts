import {
  ensureDataDirectories,
  writeComparisonFiles,
  writeDetailFiles,
  writeGeneratedArtifacts,
  writeTownBlockFiles,
} from "./lib/sync/writer";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildArtifacts,
  buildMrtStationsGeoJson,
  type GeocodeCacheFile,
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

async function fetchAmenityData(
  geocodeCache: GeocodeCacheFile,
  options: { skipGeocoding: boolean; geocodeEndpoint: URL },
) {
  console.log("Fetching amenity data...");
  const schoolRows = await fetchCsvRows(MOE_SCHOOL_DATASET_ID);
  await sleep(2600);
  const schoolResult = await normalizeSchoolRows(schoolRows, geocodeCache, options);

  const hawkerGeoJson = await fetchGeoJson(NEA_HAWKER_DATASET_ID);
  await sleep(2600);
  const hawkers = normalizeAmenityGeoJson(hawkerGeoJson);

  const supermarketRows = await fetchCsvRows(SFA_SUPERMARKET_DATASET_ID);
  await sleep(2600);
  const supermarketResult = await normalizeSupermarketRows(supermarketRows, geocodeCache, options);

  const parksGeoJson = await fetchGeoJson(NPARKS_PARKS_DATASET_ID);
  await sleep(2600);
  const parks = normalizeAmenityGeoJson(parksGeoJson);

  console.log(
    `Loaded ${schoolResult.schools.length} schools, ${hawkers.length} hawkers, ${supermarketResult.supermarkets.length} supermarkets, ${parks.length} parks.`,
  );

  return {
    schools: schoolResult.schools,
    hawkers,
    supermarkets: supermarketResult.supermarkets,
    parks,
    geocodedCount: schoolResult.geocodedCount + supermarketResult.geocodedCount,
  };
}

async function main() {
  const force = process.argv.includes("--force");
  const skipGeocoding =
    process.argv.includes("--skip-geocoding") || process.env.SKIP_GEOCODING === "1";
  const skipAmenities =
    process.argv.includes("--skip-amenities") || process.env.SKIP_AMENITIES === "1";
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
    resaleCsvRows.push(...datasetRows);
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
    try {
      const { geocodedCount, ...amenityData } = await fetchAmenityData(geocodeCache, {
        skipGeocoding,
        geocodeEndpoint,
      });
      amenities = amenityData;
      if (geocodedCount > 0) {
        geocodeCache.updatedAt = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
        await saveGeocodeCache(GEOCODE_CACHE_PATH, geocodeCache);
      }
    } catch (error) {
      console.warn(
        `Failed to fetch amenity data: ${error instanceof Error ? error.message : "unknown error"}. Continuing without amenities.`,
      );
    }
  }

  const uniqueAddresses = new Map(
    transactions.map((t) => [t.addressKey, `${t.block} ${t.streetName} SINGAPORE`]),
  );
  const missingAddresses = [...uniqueAddresses.entries()].filter(
    ([addressKey]) => geocodeCache.entries[addressKey] === undefined,
  );
  let geocodeFailureCount = 0;
  const geocodeFailureSamples: string[] = [];

  if (skipGeocoding) {
    console.log(`Skipping geocoding and using ${Object.keys(geocodeCache.entries).length} cached coordinates.`);
  } else if (missingAddresses.length > 0) {
    const concurrency = Math.max(1, Number(process.env.GEOCODE_CONCURRENCY ?? "10"));
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
          const geocode = await geocodeAddress(searchValue, geocodeEndpoint);
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
          geocodeCache.updatedAt = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
          const flush = flushInFlight ?? Promise.resolve();
          flushInFlight = flush.then(() => saveGeocodeCache(GEOCODE_CACHE_PATH, geocodeCache));
          await flushInFlight;
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, missingAddresses.length) }, () => worker()),
    );
  }

  if (geocodeFailureCount > 0) {
    console.warn(`Geocoding failed for ${geocodeFailureCount} addresses. Sample: ${geocodeFailureSamples.join(" | ")}`);
  }

  geocodeCache.updatedAt = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
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

  validateGeneratedArtifacts({
    blockSummariesCount: artifacts.blockSummaries.length,
    detailCount: Object.keys(artifacts.details).length,
    geocodeFailureCount,
  });

  const stationsGeoJson = buildMrtStationsGeoJson(mrtExits);
  await writeGeneratedArtifacts(artifacts, mrtGeoJson, stationsGeoJson);

  await writeTownBlockFiles(artifacts.blocksByTown);
  await writeComparisonFiles(artifacts.comparisons);
  await writeDetailFiles(artifacts.details);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
