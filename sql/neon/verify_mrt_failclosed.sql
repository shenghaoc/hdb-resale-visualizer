-- Run only on a disposable Neon branch after 001_postgis_nearby.sql.
-- Deliberate invalid updates are caught by subtransactions and must leave
-- the authoritative source and derived POI table unchanged.
DO $verify$
DECLARE
  source_before text; source_after text;
  poi_before text; poi_after text;
  no_op_before text; no_op_after text;
  was_rejected boolean;
BEGIN
  SELECT string_agg(kind || ':' || md5(json::text),'|' ORDER BY kind)
    INTO source_before FROM public.mrt_geojson;
  SELECT md5(string_agg(poi_kind || ':' || source_id || ':' || name || ':' ||
    lat::text || ':' || lng::text,'|' ORDER BY poi_kind,source_id))
    INTO poi_before FROM public.poi_locations WHERE source='mrt_geojson';

  was_rejected := false;
  BEGIN
    UPDATE public.mrt_geojson SET
      json=jsonb_set(json,'{features,0,properties,EXIT_CODE}','null'::jsonb,false)
      WHERE kind='exits';
  EXCEPTION WHEN not_null_violation THEN
    was_rejected := true;
  END;
  IF NOT was_rejected THEN RAISE EXCEPTION 'Expected missing-exit-code rejection'; END IF;

  was_rejected := false;
  BEGIN
    UPDATE public.mrt_geojson SET
      json=jsonb_set(json,'{features,0,properties,stationName}',
        to_jsonb(json->'features'->1->'properties'->>'stationName'),false)
      WHERE kind='stations';
  EXCEPTION WHEN unique_violation THEN
    was_rejected := true;
  END;
  IF NOT was_rejected THEN RAISE EXCEPTION 'Expected duplicate-station rejection'; END IF;

  was_rejected := false;
  BEGIN
    UPDATE public.mrt_geojson SET
      json=jsonb_set(json,'{features,0,geometry,type}','"Polygon"'::jsonb,false)
      WHERE kind='stations';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    was_rejected := true;
  END;
  IF NOT was_rejected THEN RAISE EXCEPTION 'Expected malformed-geometry rejection'; END IF;

  SELECT string_agg(kind || ':' || md5(json::text),'|' ORDER BY kind)
    INTO source_after FROM public.mrt_geojson;
  SELECT md5(string_agg(poi_kind || ':' || source_id || ':' || name || ':' ||
    lat::text || ':' || lng::text,'|' ORDER BY poi_kind,source_id))
    INTO poi_after FROM public.poi_locations WHERE source='mrt_geojson';
  IF source_before IS DISTINCT FROM source_after OR
     poi_before IS DISTINCT FROM poi_after THEN
    RAISE EXCEPTION 'A rejected MRT update altered source or derived POIs';
  END IF;

  SELECT md5(string_agg(source_id || ':' || xmin::text,'|' ORDER BY source_id))
    INTO no_op_before FROM public.poi_locations
    WHERE source='mrt_geojson' AND poi_kind='mrt_station';
  UPDATE public.mrt_geojson SET json=json WHERE kind='stations';
  SELECT md5(string_agg(source_id || ':' || xmin::text,'|' ORDER BY source_id))
    INTO no_op_after FROM public.poi_locations
    WHERE source='mrt_geojson' AND poi_kind='mrt_station';
  IF no_op_before IS DISTINCT FROM no_op_after THEN
    RAISE EXCEPTION 'No-op MRT update rewrote derived POIs';
  END IF;
END
$verify$;
