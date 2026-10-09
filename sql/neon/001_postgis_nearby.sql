-- Neon/PostgreSQL only. D1 migrations remain unchanged.
-- Run only on a disposable copy-on-write Neon branch in one transaction.
-- Precondition: frozen publisher only inserts with explicit column lists and updates rows in place.
-- No PostGIS column is added to any table inspected by NeonPlanningStore.inspectSchema().
DO $preflight$
DECLARE required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'transactions', 'blocks', 'block_details', 'comparisons',
    'town_flat_type_trends', 'mrt_geojson', 'manifest',
    'geocode_cache', 'walking_time_cache'
  ] LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION 'PostGIS prerequisite missing: public.%', required_table;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hdb_benchmark_runtime') THEN
    RAISE EXCEPTION 'PostGIS prerequisite missing: SELECT-only role hdb_benchmark_runtime';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='blocks'
      AND column_name='address_key' AND data_type='text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='blocks'
      AND column_name='lat' AND data_type='double precision' AND is_nullable='NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='blocks'
      AND column_name='lng' AND data_type='double precision' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'PostGIS prerequisite mismatch: public.blocks key/coordinate columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mrt_geojson'
      AND column_name='kind' AND data_type='text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mrt_geojson'
      AND column_name='json' AND udt_name='jsonb'
  ) THEN
    RAISE EXCEPTION 'PostGIS prerequisite mismatch: public.mrt_geojson source columns';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='blocks' AND column_name='location'
  ) THEN
    RAISE EXCEPTION 'Incompatible older migration: public.blocks.location would fail NeonPlanningStore.inspectSchema()';
  END IF;
END
$preflight$;

CREATE EXTENSION IF NOT EXISTS postgis;

-- Derived block points are deliberately outside the publisher-inspected tables.
-- A source update to blocks does not gain a new UDT.
CREATE TABLE IF NOT EXISTS public.block_locations (
  address_key text PRIMARY KEY REFERENCES public.blocks(address_key) ON DELETE CASCADE,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  location geography(Point,4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography) STORED
);
CREATE INDEX IF NOT EXISTS block_locations_location_gist
  ON public.block_locations USING GIST (location);

CREATE OR REPLACE FUNCTION public.sync_block_location()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.block_locations WHERE address_key = OLD.address_key;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.lat IS NOT DISTINCT FROM OLD.lat
    AND NEW.lng IS NOT DISTINCT FROM OLD.lng THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.block_locations(address_key,lat,lng)
  VALUES(NEW.address_key,NEW.lat,NEW.lng)
  ON CONFLICT (address_key) DO UPDATE
    SET lat=EXCLUDED.lat, lng=EXCLUDED.lng
    WHERE public.block_locations.lat IS DISTINCT FROM EXCLUDED.lat
       OR public.block_locations.lng IS DISTINCT FROM EXCLUDED.lng;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS block_location_sync ON public.blocks;
CREATE TRIGGER block_location_sync
  AFTER INSERT OR DELETE OR UPDATE OF lat,lng ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.sync_block_location();

INSERT INTO public.block_locations(address_key,lat,lng)
SELECT address_key,lat,lng FROM public.blocks
ON CONFLICT(address_key) DO UPDATE
  SET lat=EXCLUDED.lat,lng=EXCLUDED.lng
  WHERE public.block_locations.lat IS DISTINCT FROM EXCLUDED.lat
     OR public.block_locations.lng IS DISTINCT FROM EXCLUDED.lng;

CREATE TABLE IF NOT EXISTS public.poi_locations (
  source text NOT NULL,
  poi_kind text NOT NULL CHECK (poi_kind IN
    ('mrt_station','mrt_exit','school','supermarket','hawker_centre','park')),
  source_id text NOT NULL CHECK (length(trim(source_id)) > 0),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  source_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  location geography(Point,4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography) STORED,
  PRIMARY KEY(source,poi_kind,source_id)
);
CREATE INDEX IF NOT EXISTS poi_locations_location_gist
  ON public.poi_locations USING GIST (location);

-- The authoritative mrt_geojson is updated in place by the publisher.
-- Rebuild only the changed source kind. A malformed complete source aborts
-- the same transaction rather than materialising a false partial snapshot.
CREATE OR REPLACE FUNCTION public.refresh_mrt_poi_locations(
  p_kind text,p_document jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $function$
DECLARE resolved_kind text; expected_count integer; inserted_count integer;
BEGIN
  IF p_kind NOT IN ('stations','exits') THEN
    RAISE EXCEPTION 'Unknown MRT GeoJSON kind: %',p_kind;
  END IF;
  resolved_kind := CASE p_kind WHEN 'stations' THEN 'mrt_station' ELSE 'mrt_exit' END;
  DELETE FROM public.poi_locations
  WHERE source='mrt_geojson' AND poi_kind=resolved_kind;
  IF p_document IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_document->'features') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'MRT GeoJSON features must be an array';
  END IF;
  expected_count := jsonb_array_length(p_document->'features');
  INSERT INTO public.poi_locations(source,poi_kind,source_id,name,lat,lng,source_properties)
  SELECT 'mrt_geojson',resolved_kind,
    CASE p_kind WHEN 'stations' THEN (f.feature->'properties'->>'stationName')
         ELSE (f.feature->'properties'->>'OBJECTID') END,
    CASE p_kind WHEN 'stations' THEN (f.feature->'properties'->>'stationName')
         ELSE (f.feature->'properties'->>'STATION_NA') || ' (' ||
           (f.feature->'properties'->>'EXIT_CODE') || ')' END,
    (f.feature->'geometry'->'coordinates'->>1)::double precision,
    (f.feature->'geometry'->'coordinates'->>0)::double precision,
    f.feature->'properties'
  FROM jsonb_array_elements(p_document->'features') AS f(feature)
  WHERE f.feature->'geometry'->>'type'='Point'
    AND jsonb_typeof(f.feature->'geometry'->'coordinates')='array'
    AND jsonb_array_length(f.feature->'geometry'->'coordinates')=2;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count <> expected_count THEN
    RAISE EXCEPTION 'MRT POI coverage mismatch: expected %, inserted %',
      expected_count,inserted_count;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.refresh_mrt_poi_locations_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.refresh_mrt_poi_locations(OLD.kind,NULL);
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.kind IS NOT DISTINCT FROM OLD.kind
    AND NEW.json IS NOT DISTINCT FROM OLD.json THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.kind IS DISTINCT FROM OLD.kind THEN
    PERFORM public.refresh_mrt_poi_locations(OLD.kind,NULL);
  END IF;
  PERFORM public.refresh_mrt_poi_locations(NEW.kind,NEW.json);
  RETURN NEW;
END
$function$;

-- Only the trusted migration owner can execute these directly. The publisher
-- continues to hold DML on the authoritative source tables, not derived POIs.
-- SECURITY DEFINER allows its row triggers to synchronize derived tables.
REVOKE EXECUTE ON FUNCTION public.sync_block_location() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_mrt_poi_locations(text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_mrt_poi_locations_trigger() FROM PUBLIC;

DROP TRIGGER IF EXISTS mrt_geojson_poi_sync ON public.mrt_geojson;
CREATE TRIGGER mrt_geojson_poi_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.mrt_geojson
  FOR EACH ROW EXECUTE FUNCTION public.refresh_mrt_poi_locations_trigger();

SELECT public.refresh_mrt_poi_locations(kind,json)
FROM public.mrt_geojson ORDER BY kind;

GRANT SELECT ON TABLE public.block_locations,public.poi_locations TO hdb_benchmark_runtime;
