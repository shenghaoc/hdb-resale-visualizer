/**
 * Neon-only, parameterized index-aware proximity query. Do not insert coordinates
 * into SQL text. The separate derived PostGIS geography tables have matching GiST indexes.
 */
import {
  bucketNearbyRadius,
  NEARBY_FIXED_LIMIT,
  snapNearbyCenter,
  type LabelledNearbyPlaces,
  type NearbyPlacesRequest,
  type NearbyPlaceKind,
} from "../shared/nearby-places";
import { PUBLICATION_MARKER_KEY, publicationLabel } from "../shared/publication-state";

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

/**
 * The statement the Worker actually sends: {@link NEARBY_SPATIAL_SQL} (embedded verbatim, same `$1..$5`) plus the
 * identity of the publication it ran against, in ONE statement. A single statement sees one snapshot, so the places
 * and the label cannot come from different generations, which is what the shared cache otherwise establishes by
 * reading the manifest before and after the handler (three statements, and the 10 KB manifest twice, per miss).
 *
 * The first row is the publication header (`row_type = 'publication'`, absent when no manifest is stored):
 * `version` is the SHA-256 of `manifest.json::text`, the same text `manifestJson()` returns and
 * `manifestVersion` hashes, so every route shares one identity per generation; `manifest_type` and `marker` let
 * `publicationLabel` decide "in progress" with the code that reads a full manifest. The remaining rows are the
 * places in exactly the order of {@link NEARBY_SPATIAL_SQL} (`row_type = 'place'`). The hash is computed in SQL so
 * the manifest never leaves the database.
 */
export const NEARBY_LABELLED_SQL = `
WITH publication AS (
  SELECT encode(sha256(convert_to(json::text, 'UTF8')), 'hex') AS version,
    jsonb_typeof(json) AS manifest_type,
    (json -> '${PUBLICATION_MARKER_KEY}')::text AS marker
  FROM public.manifest WHERE id = 1
), places AS (${NEARBY_SPATIAL_SQL})
SELECT * FROM (
  SELECT 'publication'::text AS row_type, publication.version, publication.manifest_type, publication.marker,
    NULL::text AS kind, NULL::text AS id, NULL::text AS name,
    NULL::double precision AS lat, NULL::double precision AS lng,
    NULL::text AS address_key, NULL::text AS station_name, NULL::text AS exit_code,
    NULL::double precision AS distance_meters
  FROM publication
  UNION ALL
  SELECT 'place', NULL, NULL, NULL, places.kind, places.id, places.name, places.lat, places.lng,
    places.address_key, places.station_name, places.exit_code, places.distance_meters
  FROM places
) labelled
ORDER BY (row_type <> 'publication'), distance_meters ASC, kind COLLATE "C" ASC, id COLLATE "C" ASC
`;

/** `pg` returns `text` columns as strings and NULL as null; anything else is treated as absent. */
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

export async function queryNearbyPlaces(
  query: SpatialReadQuery,
  request: NearbyPlacesRequest,
): Promise<LabelledNearbyPlaces> {
  const center = snapNearbyCenter(request.lat, request.lng);
  const rows = await query(NEARBY_LABELLED_SQL, [
    center.lat,
    center.lng,
    bucketNearbyRadius(request.radiusMeters),
    request.kinds,
    NEARBY_FIXED_LIMIT,
  ]);
  const header = rows.find((r) => r.row_type === "publication");
  return {
    publication: header
      ? publicationLabel(header.version, header.manifest_type, header.marker ?? null)
      : null,
    places: rows
      .filter((r) => r.row_type === "place")
      .map((r) => ({
        id: String(r.id),
        kind: r.kind as NearbyPlaceKind,
        name: String(r.name),
        lat: Number(r.lat),
        lng: Number(r.lng),
        addressKey: textOrNull(r.address_key),
        stationName: textOrNull(r.station_name),
        exitCode: textOrNull(r.exit_code),
        distanceMeters: Number(r.distance_meters),
      })),
  };
}
