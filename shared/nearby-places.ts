/** Deterministic, bounded Singapore spatial query contract (straight-line distances only). */
export const NEARBY_PLACE_KINDS = ["hdb_block", "mrt_station", "mrt_exit"] as const;
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
  const radiusMeters = radiusText === null ? 1000 : integer(radiusText);
  if (!Number.isSafeInteger(radiusMeters) || radiusMeters < 100 || radiusMeters > 2500)
    return { ok: false, error: "radius must be an integer between 100 and 2500 metres" };
  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? 15 : integer(limitText);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25)
    return { ok: false, error: "limit must be an integer between 1 and 25" };
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
  return { ok: true, request: { lat, lng, radiusMeters, limit, kinds: [...sorted] } };
}

/** Stable canonical Worker Cache API key; input type order and spelling do not fragment the cache. */
export function canonicalNearbyPlacesParams(request: NearbyPlacesRequest): URLSearchParams {
  const params = new URLSearchParams();
  params.set("lat", String(request.lat));
  params.set("lng", String(request.lng));
  params.set("radius", String(request.radiusMeters));
  params.set("limit", String(request.limit));
  params.set("types", request.kinds.join(","));
  return params;
}
