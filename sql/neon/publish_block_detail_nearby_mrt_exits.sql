-- Run once for each newly created, unserved Neon blue/green child, AFTER migration 001.
-- This is a publish-time derivation, not a runtime API or a D1 migration.
-- Uses exactly the centre snapping, spheroidal ST_DWithin/ST_Distance,
-- nearest-exit-per-(source, kind, STATION_NA) and deterministic ordering
-- of NEARBY_SPATIAL_SQL, then stores only the five stations displayed by the UI.
--
-- This statement updates the child (not the publisher's benchmark branch). It must
-- be included in the approved promotion plan. Do not run against the live serving
-- branch; a missing/incorrect source aborts this transaction.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.block_locations') IS NULL
    OR to_regclass('public.poi_locations') IS NULL
    OR to_regclass('public.block_details') IS NULL
    OR to_regclass('public.manifest') IS NULL THEN
    RAISE EXCEPTION 'MRT-exit publication requires base artifacts and PostGIS migration 001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.block_details d
    LEFT JOIN public.block_locations b ON b.address_key=d.address_key
    WHERE b.address_key IS NULL OR jsonb_typeof(d.json) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'MRT-exit publication: detail missing coordinates or is not an object';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poi_locations WHERE poi_kind='mrt_exit') THEN
    RAISE EXCEPTION 'MRT-exit publication: authoritative MRT exit source is empty';
  END IF;
  IF (SELECT count(*) FROM public.manifest WHERE id=1) <> 1 THEN
    RAISE EXCEPTION 'MRT-exit publication: exactly one manifest is required';
  END IF;
END
$preflight$;

WITH centers AS MATERIALIZED (
  SELECT address_key,
    ST_SetSRID(ST_MakePoint(
      round(lng::numeric,4)::double precision,
      round(lat::numeric,4)::double precision
    ),4326)::geography AS point
  FROM public.block_locations
), nearby AS MATERIALIZED (
  SELECT b.address_key,p.source,p.poi_kind AS kind,
    p.source_properties->>'STATION_NA' AS station_name,
    p.source_properties->>'EXIT_CODE' AS exit_label,
    p.source||':'||p.poi_kind||':'||p.source_id AS exit_id,
    ST_Distance(p.location,b.point) AS distance_meters
  FROM centers b
  JOIN public.poi_locations p ON p.poi_kind='mrt_exit'
    AND ST_DWithin(p.location,b.point,1500::double precision)
), station_ranked AS MATERIALIZED (
  SELECT *,
    row_number() OVER(
      PARTITION BY address_key,source,kind,station_name
      ORDER BY distance_meters ASC,exit_id COLLATE "C" ASC
    ) AS station_rank
  FROM nearby
), five_per_block AS MATERIALIZED (
  SELECT *,
    row_number() OVER(
      PARTITION BY address_key
      ORDER BY distance_meters ASC,kind COLLATE "C" ASC,exit_id COLLATE "C" ASC
    ) AS display_rank
  FROM station_ranked WHERE station_rank=1
), answers AS (
  SELECT b.address_key,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'stationName',f.station_name,
        'exitLabel',f.exit_label,
        'distanceMeters',round(f.distance_meters::numeric,1)::double precision,
        'exitId',f.exit_id
      ) ORDER BY f.display_rank
    ) FILTER (WHERE f.display_rank<=5),'[]'::jsonb) AS exits
  FROM centers b
  LEFT JOIN five_per_block f ON f.address_key=b.address_key AND f.display_rank<=5
  GROUP BY b.address_key
)
UPDATE public.block_details d SET json=jsonb_set(d.json,'{nearbyMrtExits}',a.exits,true)
FROM answers a
WHERE d.address_key=a.address_key
  AND (d.json->'nearbyMrtExits') IS DISTINCT FROM a.exits;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.block_details
    WHERE jsonb_typeof(json->'nearbyMrtExits') IS DISTINCT FROM 'array'
       OR jsonb_array_length(json->'nearbyMrtExits') > 5
  ) THEN
    RAISE EXCEPTION 'MRT-exit publication: incomplete or oversized block-detail list';
  END IF;
END
$postflight$;

-- Manifest last, inside the same transaction: the hash used by Worker Cache API
-- changes with this derived field. Public /api/manifest filters internal fields.
-- The base-artifact digest proof must run BEFORE this child-only stage; after it,
-- verify the materialized lists and the expected manifest marker separately.
UPDATE public.manifest
SET json=jsonb_set(
  json,'{nearbyMrtExitsMaterialization}',
  '{"version":1,"radiusMeters":1500,"maxStations":5}'::jsonb,true
)
WHERE id=1 AND json->'nearbyMrtExitsMaterialization'
  IS DISTINCT FROM '{"version":1,"radiusMeters":1500,"maxStations":5}'::jsonb;

COMMIT;
