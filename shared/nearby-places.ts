import type { PublicationLabel } from "./publication-state";

/** Deterministic, bounded Singapore spatial query contract (straight-line distances only). */
export const NEARBY_PLACE_KINDS = ["hdb_block", "mrt_station", "mrt_exit"] as const;
/** One fixed SQL LIMIT: caller-supplied alternate limits are rejected. */
export const NEARBY_FIXED_LIMIT = 25;
/** The one search the endpoint answers: MRT exits within this straight-line radius of a published HDB block. */
export const NEARBY_BLOCK_RADIUS_METERS = 1500;
export const NEARBY_BLOCK_KINDS = ["mrt_exit"] as const satisfies readonly NearbyPlaceKind[];

/**
 * Release mode of the PostGIS nearby endpoint (`NEON_SPATIAL_MODE`).
 * - `off`: no nearby query is ever sent.
 * - `blocks`: nearest MRT exits to one published HDB block, named by its address key.
 * There is no mode that accepts arbitrary coordinates. Absent or unrecognized values are `off`.
 */
export const NEON_SPATIAL_MODES = ["off", "blocks"] as const;
export type NeonSpatialMode = (typeof NEON_SPATIAL_MODES)[number];
export const parseNeonSpatialMode = (value: string | undefined): NeonSpatialMode =>
  value === "blocks" ? "blocks" : "off";
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
/**
 * The places of one request together with the publication they were read from, taken in the same statement
 * (null: the database stores no manifest). See `NEARBY_LABELLED_SQL` in `worker/nearby-spatial-query.ts`.
 */
export type LabelledNearbyPlaces = { places: NearbyPlace[]; publication: PublicationLabel | null };

/** A block-only request. Radius, limit and kinds are fixed; they are carried so the answer can state them. */
export type NearbyPlacesRequest = {
  /** Address key of a published HDB block, e.g. `central-area-535-upp-cross-st`. */
  block: string;
  radiusMeters: number;
  limit: number;
  kinds: NearbyPlaceKind[];
};

type ParsedNearby = { ok: true; request: NearbyPlacesRequest } | { ok: false; error: string };
/** Address keys are lower-case slugs (`scripts/lib/pipeline.ts`); nothing else can name a block. */
const ADDRESS_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ADDRESS_KEY_LENGTH = 120;

/**
 * `?block=<address_key>` and nothing else. Coordinates, a radius, a limit or a kind list are refused: the
 * endpoint answers one question per block, so the request space is the published block list.
 */
export function parseNearbyPlacesRequest(url: URL): ParsedNearby {
  if (url.search.length > 400) return { ok: false, error: "Nearby query is too long" };
  const keys = [...url.searchParams.keys()];
  if (keys.includes("lat") || keys.includes("lng"))
    return { ok: false, error: "Coordinate searches are not available; pass block=<address key>" };
  if (keys.length !== 1 || keys[0] !== "block")
    return { ok: false, error: "Pass exactly one parameter: block=<address key>" };
  const block = url.searchParams.get("block") ?? "";
  if (block.length === 0 || block.length > MAX_ADDRESS_KEY_LENGTH || !ADDRESS_KEY.test(block))
    return { ok: false, error: "block must be an HDB block address key" };
  return {
    ok: true,
    request: {
      block,
      radiusMeters: NEARBY_BLOCK_RADIUS_METERS,
      limit: NEARBY_FIXED_LIMIT,
      kinds: [...NEARBY_BLOCK_KINDS],
    },
  };
}

/** Stable canonical Worker Cache API key: one entry per block and publication. */
export function canonicalNearbyPlacesParams(request: NearbyPlacesRequest): URLSearchParams {
  return new URLSearchParams({ block: request.block });
}
