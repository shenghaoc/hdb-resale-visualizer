-- Independent check of a serving candidate AFTER sql/neon/publish_block_detail_nearby_mrt_exits.sql.
-- READ ONLY: one read-only transaction; it refuses to run otherwise. A candidate is admitted for promotion only
-- when this script ends with its PASS notice. Any failure raises.
--
--   psql "$CANDIDATE_URL" -X -q -v ON_ERROR_STOP=1 -f sql/neon/verify_block_detail_nearby_mrt_exits.sql
--   MCP or console: `SET TRANSACTION READ ONLY`, then the DO block, as statements of one transaction.
--
-- What it proves, for EVERY row of the candidate's `block_details` (the key set and its count are read from the
-- candidate, never fixed):
--   coverage   every block detail holds `nearbyMrtExits`, an array, and has a location;
--   oracle     the stored list equals a brute-force oracle that shares no code with the publication SQL: no index
--              (ST_Distance <= 1500 rather than ST_DWithin), DISTINCT ON rather than ROW_NUMBER(), the station alias
--              written as a CASE, and the list assembled by array slicing rather than a filtered aggregate;
--   shipped    for a deterministic sample of blocks with no aliased code in range, the stored list equals the first
--              five rows of the shipped NEARBY_SPATIAL_SQL (kind mrt_exit, 1,500 m), so the drawer shows what
--              GET /api/nearby-places would answer. The `worker_sql` literal is a verbatim copy of that constant;
--              tests/unit/block-detail-nearby-mrt-exits-sql.test.ts fails when the copy drifts;
--   alias      every exit under an aliased code lies within 200 m of an exit carrying the station name;
--   marker     the private manifest marker names this calculation, its `blockDetails` equals the candidate's
--              count and its `listsSHA256` equals a digest recomputed here from the stored lists.
-- It also prints two digests of the candidate WITHOUT the derived data (`block_details` with `nearbyMrtExits`
-- removed, the manifest with the marker removed). They must equal the benchmark's own digests, which
-- docs/architecture/postgis-precomputed-mrt-exits.md shows how to read: the derivation added one field and changed
-- nothing else.
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
  v_details bigint;
  v_without_field bigint;
  v_without_location bigint;
  v_populated bigint;
  v_empty bigint;
  v_exits bigint;
  v_mismatch bigint;
  v_first_mismatch text;
  v_ungrounded text;
  v_marker jsonb;
  v_digest text;
  v_sampled integer := 0;
  v_sample_bad integer := 0;
  v_first_sample_bad text := '';
  v_base_details text;
  v_base_manifest text;
  shipped jsonb;
  blk record;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'Refusing to run outside a READ ONLY transaction';
  END IF;

  -- coverage
  SELECT count(*),
    count(*) FILTER (WHERE jsonb_typeof(d.json->'nearbyMrtExits') IS DISTINCT FROM 'array'),
    count(*) FILTER (WHERE b.address_key IS NULL),
    count(*) FILTER (WHERE jsonb_typeof(d.json->'nearbyMrtExits') = 'array'
      AND jsonb_array_length(d.json->'nearbyMrtExits') > 0),
    count(*) FILTER (WHERE d.json->'nearbyMrtExits' = '[]'::jsonb),
    COALESCE(sum(CASE WHEN jsonb_typeof(d.json->'nearbyMrtExits') = 'array'
      THEN jsonb_array_length(d.json->'nearbyMrtExits') END), 0)
  INTO v_details, v_without_field, v_without_location, v_populated, v_empty, v_exits
  FROM public.block_details AS d
  LEFT JOIN public.block_locations AS b ON b.address_key = d.address_key;
  IF v_details = 0 OR v_without_field <> 0 OR v_without_location <> 0 THEN
    RAISE EXCEPTION 'FAIL coverage: block details %, without a nearbyMrtExits array %, without a location %',
      v_details, v_without_field, v_without_location;
  END IF;

  -- alias grounding
  SELECT string_agg(code.source_properties->>'STATION_NA' || ':' || code.source_id, ', ')
  INTO v_ungrounded
  FROM public.poi_locations AS code
  WHERE code.poi_kind = 'mrt_exit'
    AND code.source_properties->>'STATION_NA' IN ('CC9', 'DT18')
    AND NOT EXISTS (
      SELECT 1 FROM public.poi_locations AS named
      WHERE named.poi_kind = 'mrt_exit'
        AND named.source_properties->>'STATION_NA' =
          CASE code.source_properties->>'STATION_NA'
            WHEN 'CC9' THEN 'PAYA LEBAR MRT STATION' ELSE 'TELOK AYER MRT STATION' END
        AND ST_Distance(named.location, code.location) <= 200
    );
  IF v_ungrounded IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL alias: no named exit within 200 m of %', v_ungrounded;
  END IF;

  -- oracle: every block detail, brute force
  WITH me AS (
    SELECT d.address_key, d.json->'nearbyMrtExits' AS stored,
      ST_SetSRID(ST_MakePoint(round(b.lng::numeric, 4)::double precision,
        round(b.lat::numeric, 4)::double precision), 4326)::geography AS g
    FROM public.block_details AS d
    JOIN public.block_locations AS b ON b.address_key = d.address_key
  ), labelled AS (
    SELECT p.source, p.source_id, p.location,
      CASE p.source_properties->>'STATION_NA'
        WHEN 'CC9' THEN 'PAYA LEBAR MRT STATION'
        WHEN 'DT18' THEN 'TELOK AYER MRT STATION'
        ELSE p.source_properties->>'STATION_NA' END AS station,
      p.source_properties->>'EXIT_CODE' AS code
    FROM public.poi_locations AS p
    WHERE p.poi_kind = 'mrt_exit'
  ), per_station AS (
    SELECT DISTINCT ON (me.address_key, l.source, l.station)
      me.address_key, l.station, l.code,
      l.source || ':mrt_exit:' || l.source_id AS id,
      round(ST_Distance(l.location, me.g)::numeric, 1) AS d
    FROM me
    JOIN labelled AS l ON ST_Distance(l.location, me.g) <= 1500
    ORDER BY me.address_key, l.source, l.station, ST_Distance(l.location, me.g), l.source_id COLLATE "C"
  ), wanted AS (
    SELECT address_key,
      (array_agg(jsonb_build_object('stationName', station, 'exitLabel', code,
        'distanceMeters', d, 'exitId', id) ORDER BY d, id COLLATE "C"))[1:5] AS items
    FROM per_station
    GROUP BY address_key
  ), compared AS (
    SELECT me.address_key,
      me.stored IS DISTINCT FROM COALESCE(to_jsonb(w.items), '[]'::jsonb) AS differs
    FROM me
    LEFT JOIN wanted AS w ON w.address_key = me.address_key
  )
  SELECT count(*) FILTER (WHERE differs), min(address_key) FILTER (WHERE differs)
  INTO v_mismatch, v_first_mismatch
  FROM compared;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'FAIL oracle: % of % block details differ from the oracle (first: %)',
      v_mismatch, v_details, v_first_mismatch;
  END IF;

  -- shipped query: a deterministic sample of blocks whose range holds no aliased code
  FOR blk IN
    SELECT d.address_key, d.json->'nearbyMrtExits' AS stored,
      round(b.lat::numeric, 4)::double precision AS lat,
      round(b.lng::numeric, 4)::double precision AS lng
    FROM public.block_details AS d
    JOIN public.block_locations AS b ON b.address_key = d.address_key
    WHERE NOT EXISTS (
      SELECT 1 FROM public.poi_locations AS p
      WHERE p.poi_kind = 'mrt_exit'
        AND p.source_properties->>'STATION_NA' IN ('CC9', 'DT18')
        AND ST_Distance(p.location, ST_SetSRID(ST_MakePoint(
          round(b.lng::numeric, 4)::double precision,
          round(b.lat::numeric, 4)::double precision), 4326)::geography) <= 1500
    )
    ORDER BY md5(d.address_key)
    LIMIT 200
  LOOP
    EXECUTE 'SELECT COALESCE(jsonb_agg(jsonb_build_object(''stationName'', station_name, ''exitLabel'', exit_code,
      ''distanceMeters'', distance_meters, ''exitId'', id) ORDER BY n), ''[]''::jsonb)
      FROM (SELECT *, row_number() OVER () AS n FROM (' || worker_sql || ') AS shipped) AS numbered WHERE n <= 5'
      INTO shipped USING blk.lat, blk.lng, 1500, ARRAY['mrt_exit'], 25;
    v_sampled := v_sampled + 1;
    IF shipped IS DISTINCT FROM blk.stored THEN
      v_sample_bad := v_sample_bad + 1;
      IF v_first_sample_bad = '' THEN v_first_sample_bad := blk.address_key; END IF;
    END IF;
  END LOOP;
  IF v_sample_bad <> 0 THEN
    RAISE EXCEPTION 'FAIL shipped: % of % sampled block details differ from NEARBY_SPATIAL_SQL (first: %)',
      v_sample_bad, v_sampled, v_first_sample_bad;
  END IF;

  -- marker
  SELECT json->'nearbyMrtExitsMaterialization' INTO v_marker FROM public.manifest WHERE id = 1;
  SELECT encode(sha256(convert_to(COALESCE(string_agg(
      address_key || E'\t' || (json->'nearbyMrtExits')::text, E'\n' ORDER BY address_key COLLATE "C"), ''),
      'UTF8')), 'hex')
  INTO v_digest FROM public.block_details;
  IF v_marker IS NULL
    OR v_marker - 'listsSHA256' - 'blockDetails' IS DISTINCT FROM jsonb_build_object(
      'version', 1, 'radiusMeters', 1500, 'maxStations', 5,
      'stationAliases', jsonb_build_object('CC9', 'PAYA LEBAR MRT STATION', 'DT18', 'TELOK AYER MRT STATION'))
    OR (v_marker->>'blockDetails')::bigint IS DISTINCT FROM v_details
    OR v_marker->>'listsSHA256' IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'FAIL marker: the manifest marker is absent or does not describe the stored lists (marker %, block details %, digest %)',
      v_marker, v_details, v_digest;
  END IF;

  -- the candidate without its derived data, for comparison with the benchmark
  SELECT encode(sha256(convert_to(COALESCE(string_agg(
      address_key || E'\t' || (json - 'nearbyMrtExits')::text, E'\n' ORDER BY address_key COLLATE "C"), ''),
      'UTF8')), 'hex')
  INTO v_base_details FROM public.block_details;
  SELECT encode(sha256(convert_to((json - 'nearbyMrtExitsMaterialization')::text, 'UTF8')), 'hex')
  INTO v_base_manifest FROM public.manifest WHERE id = 1;

  RAISE NOTICE 'PASS: % block details, each with a verified nearbyMrtExits list (% populated, % empty, % stored exits); 0 differ from the oracle; % sampled against the shipped NEARBY_SPATIAL_SQL, 0 differ; marker digest %; without derived data: block_details % manifest %',
    v_details, v_populated, v_empty, v_exits, v_sampled, v_digest, v_base_details, v_base_manifest;
END
$verify$;

ROLLBACK;
