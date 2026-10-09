-- Disposable Neon branch only. Requires sql/neon/001_postgis_nearby.sql.
-- READ ONLY: the script runs in one read-only transaction and aborts up front unless
-- `transaction_read_only` is on, so a mistaken target cannot be modified.
--
-- Differential check of the SHIPPED nearby query against a brute-force oracle.
-- The `worker_sql` literal below is a verbatim copy of NEARBY_SPATIAL_SQL
-- (worker/nearby-spatial-query.ts). tests/unit/nearby-spatial-verifier.test.ts fails when the
-- copy drifts, so a passing run verifies the SQL the Worker actually sends. After changing the
-- constant, paste the new text between the two worker_sql dollar-quote markers.
--
-- The oracle shares no code with the shipped query: no index (ST_Distance <= radius rather than
-- ST_DWithin), DISTINCT ON rather than ROW_NUMBER(), and the documented semantics written out
-- independently (nearest exit per source STATION_NA label, every radius match considered before
-- the global 25-row limit, ties broken by source id under COLLATE "C").
--
-- Coverage, about 1,900 shipped-query executions (roughly 20 s on a Neon branch):
--   grounded  central-area-535-upp-cross-st at 1,500 m: more than 25 exits are in range, the shipped
--             query returns one row per distinct STATION_NA, and a nearest-25-exits cut would have
--             reached fewer stations (grouping really does precede the limit)
--   edge      boundary and offshore centres x every radius bucket x every kind set
--   block     a deterministic md5-ordered sample of block centres, snapped like the Worker
--   exit      every MRT exit as its own centre (distance 0, unsnapped)
--
-- psql:    psql "$DISPOSABLE_BRANCH_URL" -v ON_ERROR_STOP=1 -f sql/neon/verify_nearby_spatial_sql.sql
-- MCP or console: run `SET TRANSACTION READ ONLY` first, then the DO block, then the final SELECT
-- as separate statements of one transaction (omit BEGIN and ROLLBACK).
BEGIN READ ONLY;

DO $verify$
DECLARE
  worker_sql constant text := $worker_sql$
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
$worker_sql$;
  oracle_sql constant text := $oracle$
WITH me AS (SELECT ST_SetSRID(ST_MakePoint($2::double precision,$1::double precision),4326)::geography AS g),
blk AS (
  SELECT 'hdb_block'::text AS kind, b.address_key::text AS id, NULL::text AS st, NULL::text AS ex,
         round(ST_Distance(bl.location, me.g)::numeric,1) AS d
  FROM public.block_locations bl JOIN public.blocks b ON b.address_key = bl.address_key, me
  WHERE 'hdb_block' = ANY($4) AND ST_Distance(bl.location, me.g) <= $3
), stn AS (
  SELECT p.poi_kind AS kind, (p.source || ':' || p.poi_kind || ':' || p.source_id) AS id,
         NULL::text AS st, NULL::text AS ex,
         round(ST_Distance(p.location, me.g)::numeric,1) AS d
  FROM public.poi_locations p, me
  WHERE p.poi_kind = 'mrt_station' AND 'mrt_station' = ANY($4) AND ST_Distance(p.location, me.g) <= $3
), ext AS (
  SELECT DISTINCT ON (p.source, p.source_properties->>'STATION_NA')
         p.poi_kind AS kind, (p.source || ':' || p.poi_kind || ':' || p.source_id) AS id,
         p.source_properties->>'STATION_NA' AS st, p.source_properties->>'EXIT_CODE' AS ex,
         round(ST_Distance(p.location, me.g)::numeric,1) AS d
  FROM public.poi_locations p, me
  WHERE p.poi_kind = 'mrt_exit' AND 'mrt_exit' = ANY($4) AND ST_Distance(p.location, me.g) <= $3
  ORDER BY p.source, p.source_properties->>'STATION_NA', ST_Distance(p.location, me.g), p.source_id COLLATE "C"
), allr AS (SELECT * FROM blk UNION ALL SELECT * FROM stn UNION ALL SELECT * FROM ext),
ranked AS (SELECT kind, id, st, ex, d FROM allr ORDER BY d, kind COLLATE "C", id COLLATE "C" LIMIT 25)
SELECT coalesce(string_agg(kind || '|' || id || '|' || coalesce(st,'') || '|' || coalesce(ex,'') || '|' || d::text || ';',
       '' ORDER BY d, kind COLLATE "C", id COLLATE "C"), '') FROM ranked
$oracle$;
  v_block_sample constant int := 40;
  v_all_kinds constant jsonb :=
    '[["mrt_exit"],["mrt_station","mrt_exit"],["hdb_block","mrt_station","mrt_exit"]]';
  v_exit_kinds constant jsonb := '[["mrt_exit"]]';
  c record;
  r record;
  ks jsonb;
  v_kinds text[];
  v_radius int;
  got text;
  want text;
  v_rows int;
  v_combos int := 0;
  v_bad int := 0;
  v_empty int := 0;
  v_max int := 0;
  v_by_phase jsonb := '{}'::jsonb;
  v_first_bad text := '';
  g_lat double precision;
  g_lng double precision;
  g_exits int;
  g_labels int;
  g_naive int;
  g_returned int := 0;
  g_stations text[] := '{}';
  g_distinct int;
  g_short boolean := false;
  v_summary text;
  t0 timestamptz := clock_timestamp();
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'Refusing to run outside a READ ONLY transaction';
  END IF;

  -- Grounded case: the shipped query, not a restatement of it.
  SELECT round(lat::numeric,4)::float8, round(lng::numeric,4)::float8 INTO STRICT g_lat, g_lng
  FROM public.block_locations WHERE address_key = 'central-area-535-upp-cross-st';
  WITH me AS (SELECT ST_SetSRID(ST_MakePoint(g_lng,g_lat),4326)::geography AS g),
  within_r AS (
    SELECT p.source_id, p.source_properties->>'STATION_NA' AS station, ST_Distance(p.location, me.g) AS d
    FROM public.poi_locations p, me
    WHERE p.poi_kind = 'mrt_exit' AND ST_Distance(p.location, me.g) <= 1500
  ), naive AS (SELECT station FROM within_r ORDER BY d, source_id COLLATE "C" LIMIT 25)
  SELECT (SELECT count(*) FROM within_r),
         (SELECT count(DISTINCT station) FROM within_r),
         (SELECT count(DISTINCT station) FROM naive)
  INTO g_exits, g_labels, g_naive;
  FOR r IN EXECUTE worker_sql USING g_lat, g_lng, 1500, ARRAY['mrt_exit']::text[], 25 LOOP
    g_returned := g_returned + 1;
    g_stations := g_stations || r.station_name;
    IF r.exit_code !~ '^Exit ' THEN g_short := true; END IF;
  END LOOP;
  SELECT count(DISTINCT s) INTO g_distinct FROM unnest(g_stations) AS s;
  IF g_exits <= 25 THEN
    RAISE EXCEPTION 'Fixture no longer has more than 25 exits in range: %', g_exits;
  END IF;
  IF g_returned <> least(g_labels, 25) OR g_returned <> g_distinct THEN
    RAISE EXCEPTION 'Shipped query is not one row per STATION_NA: exits %, labels %, returned %, distinct %',
      g_exits, g_labels, g_returned, g_distinct;
  END IF;
  IF g_naive >= g_returned THEN
    RAISE EXCEPTION 'Fixture no longer separates group-then-limit from limit-then-group: naive % vs shipped %',
      g_naive, g_returned;
  END IF;
  IF NOT g_short THEN
    RAISE EXCEPTION 'Expected a returned exit whose code has no "Exit " prefix';
  END IF;

  -- Differential: every centre x radius x kind set, shipped query against the oracle.
  FOR c IN
    SELECT 'edge'::text AS phase, tag, lat, lng, ARRAY[100,250,500,1000,1500,2500] AS radii, false AS exits_only
    FROM (VALUES ('sw',1.15::float8,103.55::float8),('se',1.15,104.15),('nw',1.55,103.55),('ne',1.55,104.15),
                 ('tuas',1.30,103.63),('changi',1.36,103.99),('ubin',1.40,103.96),
                 ('city',1.2846,103.8462),('bukit-timah',1.35,103.78)) AS v(tag,lat,lng)
    UNION ALL
    SELECT 'block', address_key, round(lat::numeric,4)::float8, round(lng::numeric,4)::float8,
           ARRAY[250,1000,1500,2500], false
    FROM (SELECT * FROM public.block_locations ORDER BY md5(address_key) LIMIT v_block_sample) AS s
    UNION ALL
    SELECT 'exit', source_id, lat, lng, ARRAY[100,1500], true
    FROM public.poi_locations WHERE poi_kind = 'mrt_exit'
  LOOP
    FOREACH v_radius IN ARRAY c.radii LOOP
      FOR ks IN SELECT jsonb_array_elements(CASE WHEN c.exits_only THEN v_exit_kinds ELSE v_all_kinds END) LOOP
        v_kinds := ARRAY(SELECT jsonb_array_elements_text(ks));
        got := '';
        v_rows := 0;
        FOR r IN EXECUTE worker_sql USING c.lat, c.lng, v_radius, v_kinds, 25 LOOP
          got := got || r.kind || '|' || r.id || '|' || coalesce(r.station_name,'') || '|' ||
                 coalesce(r.exit_code,'') || '|' || round(r.distance_meters::numeric,1)::text || ';';
          v_rows := v_rows + 1;
        END LOOP;
        EXECUTE oracle_sql INTO want USING c.lat, c.lng, v_radius, v_kinds;
        v_combos := v_combos + 1;
        v_by_phase := jsonb_set(v_by_phase, ARRAY[c.phase],
          to_jsonb(coalesce((v_by_phase->>c.phase)::int, 0) + 1), true);
        IF v_rows = 0 THEN v_empty := v_empty + 1; END IF;
        IF v_rows > v_max THEN v_max := v_rows; END IF;
        IF got <> want THEN
          v_bad := v_bad + 1;
          IF v_bad <= 2 THEN
            v_first_bad := v_first_bad || format(' [%s radius=%s kinds=%s GOT=%s WANT=%s]',
              c.tag, v_radius, v_kinds, left(got,400), left(want,400));
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL: % of % combinations differ from the oracle.%', v_bad, v_combos, v_first_bad;
  END IF;
  v_summary := format(
    'PASS: shipped NEARBY_SPATIAL_SQL matches the oracle in %s combinations (by phase %s); empty results %s, max rows %s; grounded case: %s exits in range, %s station labels, %s returned, nearest-25-exits cut would reach %s; %s s',
    v_combos, v_by_phase, v_empty, v_max, g_exits, g_labels, g_returned, g_naive,
    round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1));
  PERFORM set_config('hdb.nearby_verify_summary', v_summary, true);
  RAISE NOTICE '%', v_summary;
END
$verify$;

SELECT current_setting('hdb.nearby_verify_summary') AS result;

ROLLBACK;
