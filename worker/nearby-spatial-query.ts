/**
 * Neon-only, parameterized index-aware proximity query. Do not insert coordinates
 * into SQL text. The separate derived PostGIS geography tables have matching GiST indexes.
 */
import {
  bucketNearbyRadius,
  NEARBY_FIXED_LIMIT,
  snapNearbyCenter,
  type NearbyPlace,
  type NearbyPlacesRequest,
  type NearbyPlaceKind,
} from "../shared/nearby-places";

export type SpatialReadQuery = (
  sql: string,
  params: readonly unknown[],
) => Promise<Record<string, unknown>[]>;

export const NEARBY_SPATIAL_SQL = `
WITH center AS (
  SELECT ST_SetSRID(ST_MakePoint($2::double precision,$1::double precision),4326)::geography AS point
), candidate AS (
  SELECT 'hdb_block'::text AS kind, b.address_key::text AS id,
    COALESCE(NULLIF(b.display_name,''), b.block || ' ' || b.street_name) AS name,
    b.lat, b.lng, b.address_key,
    ST_Distance(p.location, center.point) AS distance_meters
  FROM public.block_locations AS p
  JOIN public.blocks AS b ON b.address_key=p.address_key CROSS JOIN center
  WHERE 'hdb_block' = ANY($4::text[])
    AND ST_DWithin(p.location, center.point, $3::double precision)
  UNION ALL
  SELECT p.poi_kind AS kind,
    (p.source || ':' || p.poi_kind || ':' || p.source_id) AS id,
    p.name, p.lat, p.lng, NULL::text AS address_key,
    ST_Distance(p.location, center.point) AS distance_meters
  FROM public.poi_locations AS p CROSS JOIN center
  WHERE p.poi_kind = ANY($4::text[])
    AND ST_DWithin(p.location, center.point, $3::double precision)
)
SELECT kind, id, name, lat, lng, address_key,
  ROUND(distance_meters::numeric,1)::double precision AS distance_meters
FROM candidate
ORDER BY distance_meters ASC, kind COLLATE "C" ASC, id COLLATE "C" ASC
LIMIT $5
`;

/** `pg` returns `text` columns as strings and NULL as null; anything else is treated as absent. */
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

export async function queryNearbyPlaces(
  query: SpatialReadQuery,
  request: NearbyPlacesRequest,
): Promise<NearbyPlace[]> {
  const center = snapNearbyCenter(request.lat, request.lng);
  const rows = await query(NEARBY_SPATIAL_SQL, [
    center.lat,
    center.lng,
    bucketNearbyRadius(request.radiusMeters),
    request.kinds,
    NEARBY_FIXED_LIMIT,
  ]);
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as NearbyPlaceKind,
    name: String(r.name),
    lat: Number(r.lat),
    lng: Number(r.lng),
    addressKey: textOrNull(r.address_key),
    distanceMeters: Number(r.distance_meters),
  }));
}
