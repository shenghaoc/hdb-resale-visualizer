-- Neon/PostgreSQL only. D1 migrations remain under migrations/*.sql.
-- Run against a disposable Neon branch and verify before promotion.
-- PostgreSQL 18 + PostGIS 3.6.4 verified on 2026-10-09.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Spatial state is derived, never a second independently editable coordinate.
-- Existing Worker JSON reads still use the original lat/lng columns.
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS location geography(Point,4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography) STORED;
CREATE INDEX IF NOT EXISTS blocks_location_gist
  ON public.blocks USING GIST(location);

-- Persist only *known* location observations. Other types are reserved for
-- future official-source ingestion; no absent geocodes are fabricated.
CREATE TABLE IF NOT EXISTS public.poi_locations (
  source TEXT NOT NULL,
  poi_kind TEXT NOT NULL CHECK (poi_kind IN
    ('mrt_station','mrt_exit','school','supermarket','hawker_centre','park')),
  source_id TEXT NOT NULL CHECK (length(trim(source_id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  source_properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  location geography(Point,4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography) STORED,
  PRIMARY KEY(source,poi_kind,source_id)
);
CREATE INDEX IF NOT EXISTS poi_locations_location_gist
  ON public.poi_locations USING GIST(location);

-- The original MRT GeoJSON remains the authoritative source.
-- Update its derived POIs *inside the same transaction* when it changes.
-- Invalid/duplicate/missing official observations fail the source update.
CREATE OR REPLACE FUNCTION public.refresh_mrt_poi_locations(
  p_kind TEXT, p_document JSONB
) RETURNS VOID LANGUAGE plpgsql AS $func$
DECLARE resolved_kind TEXT; expected_count INTEGER; inserted_count INTEGER;
BEGIN
  IF p_kind NOT IN ('stations','exits') THEN
    RAISE EXCEPTION 'Unknown MRT GeoJSON kind: %', p_kind;
  END IF;
  resolved_kind := CASE p_kind WHEN 'stations' THEN 'mrt_station' ELSE 'mrt_exit' END;
  DELETE FROM public.poi_locations
    WHERE source = 'mrt_geojson' AND poi_kind = resolved_kind;
  IF p_document IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_document->'features') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'MRT GeoJSON features must be an array';
  END IF;
  expected_count := jsonb_array_length(p_document->'features');
  INSERT INTO public.poi_locations(source,poi_kind,source_id,name,lat,lng,source_properties)
  SELECT 'mrt_geojson', resolved_kind,
    CASE p_kind WHEN 'stations' THEN (f.feature->'properties'->>'stationName')
         ELSE (f.feature->'properties'->>'OBJECTID') END,
    CASE p_kind WHEN 'stations' THEN (f.feature->'properties'->>'stationName')
         ELSE (f.feature->'properties'->>'STATION_NA') || ' (' ||
           (f.feature->'properties'->>'EXIT_CODE') || ')' END,
    (f.feature->'geometry'->'coordinates'->>1)::double precision,
    (f.feature->'geometry'->'coordinates'->>0)::double precision,
    f.feature->'properties'
  FROM jsonb_array_elements(p_document->'features') AS f(feature)
  WHERE f.feature->'geometry'->>'type' = 'Point'
    AND jsonb_typeof(f.feature->'geometry'->'coordinates') = 'array'
    AND jsonb_array_length(f.feature->'geometry'->'coordinates') = 2;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> expected_count THEN
    RAISE EXCEPTION 'MRT POI coverage mismatch: expected %, inserted %',
      expected_count, inserted_count;
  END IF;
END
$func$;

CREATE OR REPLACE FUNCTION public.refresh_mrt_poi_locations_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $func$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.refresh_mrt_poi_locations(OLD.kind,NULL);
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.kind IS DISTINCT FROM OLD.kind THEN
    PERFORM public.refresh_mrt_poi_locations(OLD.kind,NULL);
  END IF;
  PERFORM public.refresh_mrt_poi_locations(NEW.kind,NEW.json);
  RETURN NEW;
END
$func$;
DROP TRIGGER IF EXISTS mrt_geojson_poi_sync ON public.mrt_geojson;
CREATE TRIGGER mrt_geojson_poi_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.mrt_geojson
  FOR EACH ROW EXECUTE FUNCTION public.refresh_mrt_poi_locations_trigger();

-- Safe to repeat on the current snapshot; the table is wholly derived.
SELECT public.refresh_mrt_poi_locations(kind,json)
FROM public.mrt_geojson ORDER BY kind;

-- Keep the Worker SELECT-only. Do not grant the serving role any writes.
GRANT SELECT ON TABLE public.poi_locations TO hdb_benchmark_runtime;
