import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { collectionMetadataSchema, mrtFeatureSchema, oneMapResponseSchema, propertyRowSchema, resaleCsvRowSchema } from "./lib/schemas";
import {
  buildArtifacts,
  makeAddressKey,
  normalizeText,
  parseRemainingLease,
  type GeocodeCacheFile,
  type MrtExit,
  type PropertyInfo,
  type ResaleTransaction,
} from "./lib/pipeline";

const ROOT = process.cwd();
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const DETAILS_DIR = path.join(PUBLIC_DATA_DIR, "details");
const TRENDS_DIR = path.join(PUBLIC_DATA_DIR, "trends");
const GEOCODE_CACHE_PATH = path.join(ROOT, "data", "cache", "geocodes.json");

const RESALE_COLLECTION_ID = "189";
const PROPERTY_DATASET_ID = "d_17f5382f26140b1fdae0ba2ef6239d2f";
const MRT_DATASET_ID = "d_b39d3a0871985372d7e1637193335da5";
const ONEMAP_SEARCH_ENDPOINT =
  process.env.ONEMAP_SEARCH_ENDPOINT ??
  "https://www.onemap.gov.sg/api/common/elastic/search";

type RawGeoJson = {
  type: "FeatureCollection";
  features: unknown[];
};

type CollectionMetadata = {
  childDatasets: string[];
  lastUpdatedAt: string;
};

function getHeaders() {
  const apiKey = process.env.DATA_GOV_API_KEY;

  return apiKey ? { "x-api-key": apiKey } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...getHeaders(),
        ...(init?.headers ?? {}),
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`Request failed for ${url}: ${response.status}`);
      await sleep(2200 * (attempt + 1));
      continue;
    }

    throw new Error(`Request failed for ${url}: ${response.status}`);
  }

  throw lastError ?? new Error(`Request failed for ${url}`);
}

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

async function sleep(milliseconds: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function getDatasetDownloadUrl(datasetId: string) {
  const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}`;

  try {
    await fetchJson(`${base}/initiate-download`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // Some datasets expose the file directly through poll-download without initiation.
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = await fetchJson<{ code: number; data?: { url?: string } }>(
      `${base}/poll-download`,
    );
    const url = payload.data?.url;
    if (url) {
      return url;
    }

    await sleep(1500);
  }

  throw new Error(`Timed out waiting for dataset download URL: ${datasetId}`);
}

async function fetchCsvRows(datasetId: string) {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download CSV for ${datasetId}: ${response.status}`);
  }

  const csv = await response.text();
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error for ${datasetId}: ${parsed.errors[0]?.message ?? "unknown"}`);
  }

  return parsed.data;
}

async function fetchGeoJson(datasetId: string): Promise<RawGeoJson> {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download GEOJSON for ${datasetId}: ${response.status}`);
  }

  return (await response.json()) as RawGeoJson;
}

async function loadGeocodeCache(): Promise<GeocodeCacheFile> {
  try {
    const content = await fs.readFile(GEOCODE_CACHE_PATH, "utf8");
    return JSON.parse(content) as GeocodeCacheFile;
  } catch {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      entries: {},
    };
  }
}

async function saveGeocodeCache(cache: GeocodeCacheFile) {
  await fs.mkdir(path.dirname(GEOCODE_CACHE_PATH), { recursive: true });
  await fs.writeFile(GEOCODE_CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function geocodeAddress(searchValue: string) {
  const url = new URL(ONEMAP_SEARCH_ENDPOINT);
  url.searchParams.set("searchVal", searchValue);
  url.searchParams.set("returnGeom", "Y");
  url.searchParams.set("getAddrDetails", "Y");
  url.searchParams.set("pageNum", "1");

  const payload = await fetchJson<unknown>(url.toString(), {
    headers: {
      ...getHeaders(),
    },
  });

  const parsed = oneMapResponseSchema.parse(payload);
  const match = parsed.results[0];
  if (!match) {
    return null;
  }

  return {
    lat: Number(match.LATITUDE),
    lng: Number(match.LONGITUDE),
    postalCode: match.POSTAL ?? null,
    displayName: match.BUILDING ?? match.ADDRESS ?? null,
    searchValue,
  };
}

function normalizeResaleRows(rows: Record<string, string>[]) {
  const transactions: ResaleTransaction[] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = resaleCsvRowSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }

    const month = parsed.data.month.trim();
    const town = normalizeText(parsed.data.town);
    const block = normalizeText(parsed.data.block);
    const streetName = normalizeText(parsed.data.street_name);
    const floorAreaSqm = Number(parsed.data.floor_area_sqm);
    const resalePrice = Number(parsed.data.resale_price);
    const leaseCommenceDate = Number(parsed.data.lease_commence_date);

    if (
      !Number.isFinite(floorAreaSqm) ||
      !Number.isFinite(resalePrice) ||
      !Number.isFinite(leaseCommenceDate)
    ) {
      continue;
    }

    const addressKey = makeAddressKey(town, block, streetName);
    const pricePerSqm = resalePrice / floorAreaSqm;

    transactions.push({
      id: `${addressKey}-${month}-${index}`,
      month,
      town,
      flatType: normalizeText(parsed.data.flat_type),
      block,
      streetName,
      storeyRange: normalizeText(parsed.data.storey_range),
      floorAreaSqm,
      flatModel: normalizeText(parsed.data.flat_model),
      leaseCommenceDate,
      remainingLease: parseRemainingLease(parsed.data.remaining_lease, leaseCommenceDate),
      resalePrice,
      pricePerSqm: Number(pricePerSqm.toFixed(2)),
      pricePerSqft: Number.isFinite(pricePerSqm) ? Number((pricePerSqm / 10.7639).toFixed(2)) : null,
      addressKey,
    });
  }

  return transactions;
}

function normalizePropertyRows(rows: Record<string, string>[]) {
  const output: PropertyInfo[] = [];

  for (const row of rows) {
    const parsed = propertyRowSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }

    const block = normalizeText(parsed.data.blk_no);
    const streetName = normalizeText(parsed.data.street);
    output.push({
      addressKey: makeAddressKey("UNKNOWN", block, streetName),
      block,
      streetName,
      maxFloorLevel: Number(parsed.data.max_floor_lvl) || null,
      yearCompleted: Number(parsed.data.year_completed) || null,
      totalDwellingUnits: Number(parsed.data.total_dwelling_units) || null,
    });
  }

  return output;
}

function rekeyPropertyInfo(propertyRows: PropertyInfo[], transactions: ResaleTransaction[]) {
  const knownAddresses = new Map<string, string>();
  for (const transaction of transactions) {
    knownAddresses.set(`${transaction.block}__${transaction.streetName}`, transaction.addressKey);
  }

  return propertyRows.map((row) => ({
    ...row,
    addressKey: knownAddresses.get(`${row.block}__${row.streetName}`) ?? row.addressKey,
  }));
}

function normalizeMrtFeatures(geoJson: RawGeoJson): MrtExit[] {
  return geoJson.features
    .map((feature) => mrtFeatureSchema.safeParse(feature))
    .filter((result): result is { success: true; data: Awaited<ReturnType<typeof mrtFeatureSchema.parse>> } => result.success)
    .map((result) => ({
      stationName: normalizeText(result.data.properties.STATION_NA),
      lng: result.data.geometry.coordinates[0],
      lat: result.data.geometry.coordinates[1],
    }));
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function ensureDirectories() {
  await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
  await fs.mkdir(DETAILS_DIR, { recursive: true });
  await fs.mkdir(TRENDS_DIR, { recursive: true });
}

async function main() {
  const force = process.argv.includes("--force");
  const skipGeocoding =
    process.argv.includes("--skip-geocoding") || process.env.SKIP_GEOCODING === "1";
  await ensureDirectories();

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
  const propertyInfo = rekeyPropertyInfo(
    normalizePropertyRows(propertyRows),
    transactions,
  );
  const mrtExits = normalizeMrtFeatures(mrtGeoJson);

  const geocodeCache = await loadGeocodeCache();
  const uniqueAddresses = new Map(
    transactions.map((transaction) => [
      transaction.addressKey,
      `${transaction.block} ${transaction.streetName} SINGAPORE`,
    ]),
  );
  const missingAddresses = [...uniqueAddresses.entries()].filter(
    ([addressKey]) => geocodeCache.entries[addressKey] === undefined,
  );
  if (skipGeocoding) {
    console.log(
      `Skipping geocoding and using ${Object.keys(geocodeCache.entries).length} cached coordinates.`,
    );
  } else {
    const concurrency = Math.max(1, Number(process.env.GEOCODE_CONCURRENCY ?? "10"));
    let nextIndex = 0;
    let completed = 0;
    let flushedAt = 0;

    console.log(
      `Geocoding ${missingAddresses.length} uncached addresses with concurrency ${concurrency}...`,
    );

    async function worker() {
      while (nextIndex < missingAddresses.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const [addressKey, searchValue] = missingAddresses[currentIndex];

        try {
          const geocode = await geocodeAddress(searchValue);
          if (geocode) {
            geocodeCache.entries[addressKey] = geocode;
          }
        } catch (error) {
          console.warn(
            `Geocode failed for ${searchValue}: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }

        completed += 1;
        if (completed % 200 === 0 || completed === missingAddresses.length) {
          console.log(`Geocoded ${completed}/${missingAddresses.length}`);
        }

        if (completed - flushedAt >= 250 || completed === missingAddresses.length) {
          geocodeCache.updatedAt = new Date().toISOString();
          await saveGeocodeCache(geocodeCache);
          flushedAt = completed;
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, missingAddresses.length || 1) }, () => worker()),
    );
  }

  geocodeCache.updatedAt = new Date().toISOString();
  await saveGeocodeCache(geocodeCache);

  const artifacts = buildArtifacts({
    transactions,
    propertyInfo,
    mrtExits,
    geocodes: geocodeCache.entries,
    metadata: {
      resaleCollectionId: RESALE_COLLECTION_ID,
      resaleDatasetIds: resaleCollection.childDatasets,
      propertyDatasetId: PROPERTY_DATASET_ID,
      mrtDatasetId: MRT_DATASET_ID,
      lastUpdatedAt: resaleCollection.lastUpdatedAt,
    },
  });

  await writeJson(path.join(PUBLIC_DATA_DIR, "manifest.json"), artifacts.manifest);
  await writeJson(path.join(PUBLIC_DATA_DIR, "block-summaries.json"), artifacts.blockSummaries);
  await writeJson(path.join(TRENDS_DIR, "town-flat-type.json"), artifacts.townFlatTypeTrend);
  await writeJson(path.join(PUBLIC_DATA_DIR, "mrt-exits.geojson"), mrtGeoJson);

  await fs.rm(DETAILS_DIR, { recursive: true, force: true });
  await fs.mkdir(DETAILS_DIR, { recursive: true });

  for (const [addressKey, detail] of Object.entries(artifacts.details)) {
    await writeJson(path.join(DETAILS_DIR, `${addressKey}.json`), detail);
  }

  console.log(
    `Generated ${artifacts.blockSummaries.length} block summaries and ${Object.keys(artifacts.details).length} detail files.`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
