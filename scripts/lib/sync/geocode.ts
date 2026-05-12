import fs from "node:fs/promises";
import path from "node:path";
import { fetchJson } from "./fetchers";
import { oneMapResponseSchema } from "../schemas";
import type { GeocodeCacheFile } from "../pipeline";

export async function loadGeocodeCache(cachePath: string): Promise<GeocodeCacheFile> {
  try {
    const content = await fs.readFile(cachePath, "utf8");
    return JSON.parse(content) as GeocodeCacheFile;
  } catch {
    return {
      version: 1,
      updatedAt: Temporal.Instant.fromEpochMilliseconds(0).toString({ fractionalSecondDigits: 3 }),
      entries: {},
    };
  }
}

export async function saveGeocodeCache(cachePath: string, cache: GeocodeCacheFile) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
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
