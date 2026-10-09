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
), block_candidates AS (
  SELECT 'hdb_block'::text AS kind, b.address_key::text AS id,
    COALESCE(NULLIF(b.display_name,''), b.block || ' ' || b.street_name) AS name,
    b.lat, b.lng, b.address_key,
    NULL::text AS station_name, NULL::text AS exit_code,
    ST_Distance(p.location, center.point) AS distance_meters
  FROM public.block_locations AS p
  JOIN public.blocks AS b ON b.address_key=p.address_key CROSS JOIN center
  WHERE 'hdb_block' = ANY($4::text[])
    AND ST_DWithin(p.location, center.point, $3::double precision)
), poi_candidates AS (
  SELECT p.source, p.poi_kind AS kind,
    (p.source || ':' || p.poi_kind || ':' || p.source_id) AS id,
    p.name, p.lat, p.lng, NULL::text AS address_key,
    CASE WHEN p.poi_kind='mrt_exit' THEN p.source_properties->>'STATION_NA'
      ELSE NULL END AS station_name,
    CASE WHEN p.poi_kind='mrt_exit' THEN p.source_properties->>'EXIT_CODE'
      ELSE NULL END AS exit_code,
    ST_Distance(p.location, center.point) AS distance_meters
  FROM public.poi_locations AS p CROSS JOIN center
  WHERE p.poi_kind = ANY($4::text[])
    AND ST_DWithin(p.location, center.point, $3::double precision)
), poi_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY source, kind,
        CASE WHEN kind='mrt_exit' THEN station_name ELSE id END
      ORDER BY distance_meters ASC, id COLLATE "C" ASC
    ) AS station_rank
  FROM poi_candidates
), candidates AS (
  SELECT * FROM block_candidates
  UNION ALL
  SELECT kind, id, name, lat, lng, address_key,
    station_name, exit_code, distance_meters
  FROM poi_ranked
  WHERE station_rank=1
)
SELECT kind, id, name, lat, lng, address_key,
  station_name, exit_code,
  ROUND(distance_meters::numeric,1)::double precision AS distance_meters
FROM candidates
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
    stationName: textOrNull(r.station_name),
    exitCode: textOrNull(r.exit_code),
    distanceMeters: Number(r.distance_meters),
  }));
}
