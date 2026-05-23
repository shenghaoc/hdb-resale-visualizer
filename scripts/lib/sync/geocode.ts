import { fetchJson } from "./fetchers";
import { oneMapResponseSchema } from "../schemas";
import type { GeocodeCacheFile } from "../pipeline";
import type { D1Client } from "./d1";

type GeocodeCacheRow = {
  cache_key: string;
  lat: number;
  lng: number;
  postal_code: string | null;
  display_name: string | null;
  search_value: string;
};

const EPOCH_TIMESTAMP = Temporal.Instant.fromEpochMilliseconds(0).toString({
  fractionalSecondDigits: 3,
});

export async function loadGeocodeCache(db: D1Client): Promise<GeocodeCacheFile> {
  const rows = await db.query<GeocodeCacheRow>({
    sql: "SELECT cache_key, lat, lng, postal_code, display_name, search_value FROM geocode_cache",
  });
  const entries: GeocodeCacheFile["entries"] = {};
  for (const row of rows) {
    entries[row.cache_key] = {
      lat: row.lat,
      lng: row.lng,
      postalCode: row.postal_code,
      displayName: row.display_name,
      searchValue: row.search_value,
    };
  }
  return { version: 1, updatedAt: EPOCH_TIMESTAMP, entries };
}

/**
 * Upserts a set of cache keys back into D1. Callers track which keys were
 * added during this run; we only write those rather than the entire cache.
 */
export async function saveGeocodeCacheEntries(
  db: D1Client,
  cache: GeocodeCacheFile,
  keys: Iterable<string>,
  updatedAt: string,
): Promise<void> {
  const rows: Array<{ key: string; entry: GeocodeCacheFile["entries"][string] }> = [];
  for (const key of keys) {
    const entry = cache.entries[key];
    if (entry) {
      rows.push({ key, entry });
    }
  }
  if (rows.length === 0) {
    return;
  }
  await db.batchInsert({
    table: "geocode_cache",
    columns: [
      "cache_key",
      "lat",
      "lng",
      "postal_code",
      "display_name",
      "search_value",
      "updated_at",
    ],
    rows,
    upsert: true,
    mapRow: ({ key, entry }) => [
      key,
      entry.lat,
      entry.lng,
      entry.postalCode,
      entry.displayName,
      entry.searchValue,
      updatedAt,
    ],
  });
}

export async function geocodeAddress(searchValue: string, geocodeEndpoint: URL) {
  const url = new URL(geocodeEndpoint);
  url.searchParams.set("searchVal", searchValue);
  url.searchParams.set("returnGeom", "Y");
  url.searchParams.set("getAddrDetails", "Y");
  url.searchParams.set("pageNum", "1");

  const payload = await fetchJson<unknown>(url.toString());

  const parsed = oneMapResponseSchema.parse(payload);
  const match = parsed.results[0];
  if (!match) return null;

  return {
    lat: Number(match.LATITUDE),
    lng: Number(match.LONGITUDE),
    postalCode: match.POSTAL,
    displayName: match.BUILDING ?? match.ADDRESS ?? null,
    searchValue,
  };
}
