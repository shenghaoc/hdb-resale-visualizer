/** Pins the existing skip-geocoding path. No credentials, requests or new routing policy. */
import { z } from "zod";
import { pickNearestStations, type MrtExit } from "../lib/pipeline";
import { buildRoutingCacheKey } from "../lib/sync/routing";
import { canonicalJson } from "../lib/sync/neon";

const keys = z.array(z.string().min(1));
export const cacheOnlyInputsSchema = z
  .object({
    mode: z.literal("skip-geocoding"),
    sourceAddressKeys: keys,
    locatedAddressKeys: keys,
    omittedAddressKeys: keys,
    skippedSupermarketKeys: keys,
    skippedSchoolKeys: keys,
    omissionPolicy: z.literal(
      "retain-transactions-and-trends-omit-unlocated-blocks-details-comparisons",
    ),
    amenityPolicy: z.literal("skip-unresolved-schools-and-supermarkets"),
    routingPolicy: z.literal(
      "reuse-retained-routes-otherwise-round-straight-line-meters-divided-by-1.25",
    ),
    routePairs: z.array(
      z
        .object({
          addressKey: z.string().min(1),
          stationName: z.string().min(1),
          cacheKey: z.string().min(1),
          source: z.enum(["cache", "straight-line-fallback"]),
        })
        .strict(),
    ),
  })
  .strict();
export type CacheOnlyInputs = z.infer<typeof cacheOnlyInputsSchema>;
type Row = Record<string, unknown>;
const ordered = (values: string[]) => [...new Set(values)].sort();

export function deriveCacheOnlyInputs(input: {
  sourceAddressKeys: string[];
  cacheInputs: { geocode_cache: Row[]; walking_time_cache: Row[] };
  mrtExits: MrtExit[];
  skippedSupermarketKeys: string[];
  skippedSchoolKeys: string[];
}): CacheOnlyInputs {
  const sourceAddressKeys = ordered(input.sourceAddressKeys);
  const geocodes = new Map(input.cacheInputs.geocode_cache.map((r) => [String(r.cache_key), r]));
  const routing = new Set(input.cacheInputs.walking_time_cache.map((r) => String(r.cache_key)));
  const locatedAddressKeys = sourceAddressKeys.filter((key) => geocodes.has(key));
  return {
    mode: "skip-geocoding",
    sourceAddressKeys,
    locatedAddressKeys,
    omittedAddressKeys: sourceAddressKeys.filter((key) => !geocodes.has(key)),
    skippedSupermarketKeys: ordered(input.skippedSupermarketKeys),
    skippedSchoolKeys: ordered(input.skippedSchoolKeys),
    omissionPolicy: "retain-transactions-and-trends-omit-unlocated-blocks-details-comparisons",
    amenityPolicy: "skip-unresolved-schools-and-supermarkets",
    routingPolicy: "reuse-retained-routes-otherwise-round-straight-line-meters-divided-by-1.25",
    routePairs: locatedAddressKeys.flatMap((addressKey) => {
      const geo = geocodes.get(addressKey)!;
      return pickNearestStations(
        { lat: Number(geo.lat), lng: Number(geo.lng) },
        input.mrtExits,
        3,
      ).map((station) => {
        const cacheKey = buildRoutingCacheKey(
          { lat: Number(geo.lat), lng: Number(geo.lng) },
          { lat: station.exitLat, lng: station.exitLng },
        );
        return {
          addressKey,
          stationName: station.stationName,
          cacheKey,
          source: routing.has(cacheKey) ? ("cache" as const) : ("straight-line-fallback" as const),
        };
      });
    }),
  };
}

export function assertCacheOnlyInputs(
  value: unknown,
  input: Parameters<typeof deriveCacheOnlyInputs>[0],
) {
  const actual = cacheOnlyInputsSchema.parse(value);
  if (canonicalJson(actual) !== canonicalJson(deriveCacheOnlyInputs(input)))
    throw new Error("Cache-only resolved/omitted/fallback set drift");
  const cached = new Set(input.cacheInputs.geocode_cache.map((r) => String(r.cache_key)));
  if (
    [...actual.skippedSchoolKeys, ...actual.skippedSupermarketKeys].some((key) => cached.has(key))
  )
    throw new Error("Cached amenity cannot be claimed as unresolved");
  return actual;
}
