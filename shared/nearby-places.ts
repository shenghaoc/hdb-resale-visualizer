/** Deterministic, bounded Singapore spatial query contract (straight-line distances only). */
export const NEARBY_PLACE_KINDS = ["hdb_block", "mrt_station", "mrt_exit"] as const;
/**
 * One cache centre per 0.0001° grid cell (11.14 m or less per axis).
 * At most ~7.88 m of straight-line distance error to an arbitrary point.
 * The 100 m minimum radius remains much larger than this displacement.
 */
const NEARBY_GRID_SCALE = 10_000;
export const NEARBY_GRID_DEGREES = 1 / NEARBY_GRID_SCALE;
/** 4,001 latitude positions × 6,001 longitude positions, including endpoints. */
export const MAX_NEARBY_CENTER_KEYS = 4_001 * 6_001;
/** Fixed public query radius buckets in metres; we round *up* without shrinking a search. */
export const NEARBY_RADIUS_BUCKETS = [100, 250, 500, 1000, 1500, 2500] as const;
/** One fixed SQL LIMIT: caller-supplied alternate limits are rejected. */
export const NEARBY_FIXED_LIMIT = 25;
/** Centres × six radii × seven nonempty kind sets; limit has no key dimension. */
export const MAX_NEARBY_CACHE_KEYS =
  MAX_NEARBY_CENTER_KEYS * NEARBY_RADIUS_BUCKETS.length * ((1 << 3) - 1);

export function bucketNearbyRadius(requestedMetres: number): number {
  return NEARBY_RADIUS_BUCKETS.find((radius) => requestedMetres <= radius) ?? 2500;
}

export function snapNearbyCenter(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.round(lat * NEARBY_GRID_SCALE) / NEARBY_GRID_SCALE,
    lng: Math.round(lng * NEARBY_GRID_SCALE) / NEARBY_GRID_SCALE,
  };
}

/** Absent or false never unlocks a PostGIS query. */
export const isNeonSpatialEnabled = (value: string | undefined): boolean => value === "true";
export type NearbyPlaceKind = (typeof NEARBY_PLACE_KINDS)[number];
export type NearbyPlace = {
  id: string;
  kind: NearbyPlaceKind;
  name: string;
  lat: number;
  lng: number;
  /** Ellipsoidal straight-line distance in metres, not routing/walking distance. */
  distanceMeters: number;
  addressKey: string | null;
  /** Source STATION_NA of the nearest MRT exit; null for other kinds. */
  stationName: string | null;
  /** Source EXIT_CODE, preserved verbatim (e.g. "E" or "Exit B"). */
  exitCode: string | null;
};
export type NearbyPlacesRequest = {
  lat: number;
  lng: number;
  radiusMeters: number;
  limit: number;
  kinds: NearbyPlaceKind[];
};

type ParsedNearby = { ok: true; request: NearbyPlacesRequest } | { ok: false; error: string };
const allowedParams = new Set(["lat", "lng", "radius", "limit", "types"]);
const numeric = (text: string | null) =>
  text !== null && /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
const integer = (text: string | null) =>
  text !== null && /^\d+$/.test(text) ? Number(text) : Number.NaN;

/** One coordinate pair, one radius, up to 25 bounded results. Unrecognized parameters fail closed. */
export function parseNearbyPlacesRequest(url: URL): ParsedNearby {
  if (url.search.length > 400) return { ok: false, error: "Nearby query is too long" };
  for (const key of url.searchParams.keys()) {
    if (!allowedParams.has(key) || url.searchParams.getAll(key).length !== 1)
      return { ok: false, error: "Invalid or repeated nearby parameter" };
  }
  const lat = numeric(url.searchParams.get("lat"));
  const lng = numeric(url.searchParams.get("lng"));
  if (
    !Number.isFinite(lat) ||
    lat < 1.15 ||
    lat > 1.55 ||
    !Number.isFinite(lng) ||
    lng < 103.55 ||
    lng > 104.15
  )
    return { ok: false, error: "Coordinates must be within Singapore" };
  const radiusText = url.searchParams.get("radius");
  const requestedRadius = radiusText === null ? 1000 : integer(radiusText);
  if (!Number.isSafeInteger(requestedRadius) || requestedRadius < 100 || requestedRadius > 2500)
    return { ok: false, error: "radius must be an integer between 100 and 2500 metres" };
  const radiusMeters = bucketNearbyRadius(requestedRadius);
  const limitText = url.searchParams.get("limit");
  if (limitText !== null && integer(limitText) !== NEARBY_FIXED_LIMIT)
    return { ok: false, error: "limit must be 25 when provided" };
  const limit = NEARBY_FIXED_LIMIT;
  const types = url.searchParams.get("types");
  const kinds =
    types === null
      ? (["mrt_station", "mrt_exit"] as NearbyPlaceKind[])
      : (types.split(",") as NearbyPlaceKind[]);
  if (
    kinds.length === 0 ||
    kinds.length > NEARBY_PLACE_KINDS.length ||
    new Set(kinds).size !== kinds.length ||
    kinds.some((k) => !NEARBY_PLACE_KINDS.includes(k))
  )
    return { ok: false, error: "types may include hdb_block,mrt_station,mrt_exit" };
  const sorted = NEARBY_PLACE_KINDS.filter((k) => kinds.includes(k));
  const center = snapNearbyCenter(lat, lng);
  return { ok: true, request: { ...center, radiusMeters, limit, kinds: [...sorted] } };
}

/** Stable canonical Worker Cache API key; input type order and spelling do not fragment the cache. */
export function canonicalNearbyPlacesParams(request: NearbyPlacesRequest): URLSearchParams {
  const params = new URLSearchParams();
  const center = snapNearbyCenter(request.lat, request.lng);
  params.set("lat", String(center.lat));
  params.set("lng", String(center.lng));
  params.set("radius", String(bucketNearbyRadius(request.radiusMeters)));
  params.set("types", request.kinds.join(","));
  return params;
}
