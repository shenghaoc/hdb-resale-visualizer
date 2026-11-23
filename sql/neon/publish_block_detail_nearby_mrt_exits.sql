-- Publication-time MRT exits for the block drawer (`block_details.json -> 'nearbyMrtExits'`).
--
-- WHERE IT RUNS. Once on each new, UNSERVED serving candidate: a copy-on-write child of a verified benchmark
-- publication, after sql/neon/001_postgis_nearby.sql and after the base-table equality proof against the benchmark
-- (docs/architecture/postgis-precomputed-mrt-exits.md). Never on the benchmark branch (the publisher's schema and
-- COPY stage do not carry this field) and never on the branch that serves traffic.
--
--   psql "$CANDIDATE_URL" -X -v ON_ERROR_STOP=1 -f sql/neon/publish_block_detail_nearby_mrt_exits.sql
--
-- WHAT IT DOES, in one transaction:
--   1. derives, with PostGIS, one list for EVERY row of the candidate's own `block_details` from the candidate's own
--      `block_locations` and `poi_locations`;
--   2. requires the derived key set to equal the `block_details` key set (the count is read from the candidate,
--      never fixed), then writes only the documents whose list differs;
--   3. writes the private manifest marker LAST. The marker changes the manifest hash, which is the Worker's cache
--      generation, so no cached detail of an earlier generation is served for this one.
-- Any failed check raises, the transaction rolls back and the candidate is left without the marker, which
-- sql/neon/verify_block_detail_nearby_mrt_exits.sql refuses. An unchanged rerun writes nothing: no document, no
-- marker, no `updated_at`.
--
-- THE CALCULATION is the one GET /api/nearby-places uses (NEARBY_SPATIAL_SQL in worker/nearby-spatial-query.ts)
-- for kind `mrt_exit` at 1,500 m: the block centre snapped to the 0.0001-degree grid, geography ST_DWithin and
-- spheroidal ST_Distance, the nearest exit per station chosen BEFORE any limit (ties by exit id under COLLATE "C"),
-- then the result ordered by the distance rounded to 0.1 m, kind and exit id, and the first five kept.
-- Station name and exit code are the source fields STATION_NA and EXIT_CODE; the display name is never parsed.
--
-- ONE EXPLICIT NORMALISATION (`station_aliases`). The source labels a few exits with a station code instead of the
-- station name. Two of those codes label extra exits of a station that its other exits name, so without the alias
-- one physical station takes two of the five places:
--   CC9  -> PAYA LEBAR MRT STATION   (2 exits, 50.3 to 61.4 m from a PAYA LEBAR exit, publication 2026-10-04)
--   DT18 -> TELOK AYER MRT STATION   (2 exits, 75.8 to 143.5 m from a TELOK AYER exit)
-- The other code labels in that publication (CC30, CC31, CC32, DT4, NE18) have no named exit within 227 m and are
-- kept exactly as the source records them. The alias is grounded in the candidate's own data on every run: each
-- exit under an aliased code must lie within 200 m of an exit that carries the station name, or the run stops.
-- GET /api/nearby-places is not changed and still groups by the source label verbatim.
--
-- tests/unit/block-detail-nearby-mrt-exits-sql.test.ts pins the text between the `core` markers to the copy in
-- sql/neon/verify_block_detail_nearby_mrt_exits_cases.sql and runs the text between the `apply` markers on PGlite.
BEGIN;

DO $preflight$
DECLARE
  ungrounded text;
BEGIN
  IF to_regclass('public.block_locations') IS NULL
    OR to_regclass('public.poi_locations') IS NULL
    OR to_regclass('public.block_details') IS NULL
    OR to_regclass('public.manifest') IS NULL THEN
    RAISE EXCEPTION 'MRT-exit publication requires the base artifacts and PostGIS migration 001';
  END IF;
  IF (SELECT count(*) FROM public.manifest WHERE id = 1) <> 1 THEN
    RAISE EXCEPTION 'MRT-exit publication: exactly one manifest is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.block_details) THEN
    RAISE EXCEPTION 'MRT-exit publication: the candidate has no block details';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poi_locations WHERE poi_kind = 'mrt_exit') THEN
    RAISE EXCEPTION 'MRT-exit publication: the MRT exit source is empty';
  END IF;
  -- The drawer shows both fields, so an exit without either one fails the publication instead of being skipped.
  IF EXISTS (
    SELECT 1 FROM public.poi_locations
    WHERE poi_kind = 'mrt_exit'
      AND (COALESCE(source_properties->>'STATION_NA', '') = ''
        OR COALESCE(source_properties->>'EXIT_CODE', '') = '')
  ) THEN
    RAISE EXCEPTION 'MRT-exit publication: an exit lacks the source STATION_NA or EXIT_CODE';
  END IF;
  SELECT string_agg(code.source_properties->>'STATION_NA' || ':' || code.source_id, ', ')
  INTO ungrounded
  FROM public.poi_locations AS code
  JOIN (VALUES ('CC9', 'PAYA LEBAR MRT STATION'), ('DT18', 'TELOK AYER MRT STATION'))
    AS alias(code, station_name) ON alias.code = code.source_properties->>'STATION_NA'
  WHERE code.poi_kind = 'mrt_exit'
    AND NOT EXISTS (
      SELECT 1 FROM public.poi_locations AS named
      WHERE named.poi_kind = 'mrt_exit'
        AND named.source_properties->>'STATION_NA' = alias.station_name
        AND ST_DWithin(named.location, code.location, 200::double precision)
    );
  IF ungrounded IS NOT NULL THEN
    RAISE EXCEPTION 'MRT-exit publication: station alias no longer grounded in the source (no named exit within 200 m): %', ungrounded;
  END IF;
END
$preflight$;

-- derive: one row per block detail that has a location, from the candidate's own tables.
CREATE TEMPORARY TABLE nearby_mrt_exit_answers ON COMMIT DROP AS
WITH station_aliases(code, station_name) AS (
  VALUES ('CC9', 'PAYA LEBAR MRT STATION'), ('DT18', 'TELOK AYER MRT STATION')
), centers AS MATERIALIZED (
  SELECT d.address_key,
    ST_SetSRID(ST_MakePoint(
      round(b.lng::numeric, 4)::double precision,
      round(b.lat::numeric, 4)::double precision
    ), 4326)::geography AS point
  FROM public.block_details AS d
  JOIN public.block_locations AS b ON b.address_key = d.address_key
), exits AS MATERIALIZED (
  SELECT p.source, p.poi_kind AS kind,
    (p.source || ':' || p.poi_kind || ':' || p.source_id) AS exit_id,
    COALESCE(a.station_name, p.source_properties->>'STATION_NA') AS station_name,
    p.source_properties->>'EXIT_CODE' AS exit_label,
    p.location
  FROM public.poi_locations AS p
  LEFT JOIN station_aliases AS a ON a.code = p.source_properties->>'STATION_NA'
  WHERE p.poi_kind = 'mrt_exit'
),
-- core:begin
nearby AS MATERIALIZED (
  SELECT c.address_key, e.source, e.kind, e.exit_id, e.station_name, e.exit_label,
    ST_Distance(e.location, c.point) AS distance_meters
  FROM centers AS c
  JOIN exits AS e ON ST_DWithin(e.location, c.point, 1500::double precision)
), station_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY address_key, source, kind, station_name
      ORDER BY distance_meters ASC, exit_id COLLATE "C" ASC
    ) AS station_rank
  FROM nearby
), displayed AS (
  SELECT address_key, station_name, exit_label, exit_id,
    ROUND(distance_meters::numeric, 1)::double precision AS distance_meters,
    ROW_NUMBER() OVER (
      PARTITION BY address_key
      ORDER BY ROUND(distance_meters::numeric, 1) ASC, kind COLLATE "C" ASC, exit_id COLLATE "C" ASC
    ) AS display_rank
  FROM station_ranked
  WHERE station_rank = 1
)
SELECT c.address_key,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'stationName', d.station_name,
        'exitLabel', d.exit_label,
        'distanceMeters', d.distance_meters,
        'exitId', d.exit_id
      ) ORDER BY d.display_rank
    ) FILTER (WHERE d.display_rank IS NOT NULL),
    '[]'::jsonb
  ) AS exits
FROM centers AS c
LEFT JOIN displayed AS d ON d.address_key = c.address_key AND d.display_rank <= 5
GROUP BY c.address_key
-- core:end
;

-- apply:begin
-- Plain SQL from here on: it reads `nearby_mrt_exit_answers(address_key, exits)` and needs no PostGIS.
DO $coverage$
DECLARE
  expected bigint;
  derived bigint;
  missing bigint;
  extra bigint;
  malformed bigint;
BEGIN
  SELECT count(*) INTO expected FROM public.block_details;
  SELECT count(*) INTO derived FROM nearby_mrt_exit_answers;
  SELECT count(*) INTO missing FROM public.block_details AS d
  WHERE NOT EXISTS (SELECT 1 FROM nearby_mrt_exit_answers AS a WHERE a.address_key = d.address_key);
  SELECT count(*) INTO extra FROM nearby_mrt_exit_answers AS a
  WHERE NOT EXISTS (SELECT 1 FROM public.block_details AS d WHERE d.address_key = a.address_key);
  IF expected = 0 OR derived <> expected OR missing <> 0 OR extra <> 0
    OR (SELECT count(DISTINCT address_key) FROM nearby_mrt_exit_answers) <> derived THEN
    RAISE EXCEPTION 'MRT-exit publication: derived lists do not cover the candidate block details exactly (block details %, derived %, without a list %, without a block detail %)',
      expected, derived, missing, extra;
  END IF;
  SELECT count(*) INTO malformed FROM nearby_mrt_exit_answers AS a
  WHERE jsonb_typeof(a.exits) IS DISTINCT FROM 'array'
    OR jsonb_array_length(a.exits) > 5
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.exits) AS item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
        OR COALESCE(item->>'stationName', '') = ''
        OR COALESCE(item->>'exitLabel', '') = ''
        OR COALESCE(item->>'exitId', '') = ''
        OR jsonb_typeof(item->'distanceMeters') IS DISTINCT FROM 'number'
        OR (item->>'distanceMeters')::double precision < 0
        OR (item->>'distanceMeters')::double precision > 1500.05
    );
  IF malformed <> 0 THEN
    RAISE EXCEPTION 'MRT-exit publication: % derived lists are not valid (an array of at most five complete entries within range)', malformed;
  END IF;
  IF EXISTS (SELECT 1 FROM public.block_details WHERE jsonb_typeof(json) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'MRT-exit publication: a block detail is not a JSON object';
  END IF;
END
$coverage$;

UPDATE public.block_details AS d
SET json = jsonb_set(d.json, '{nearbyMrtExits}', a.exits, true)
FROM nearby_mrt_exit_answers AS a
WHERE d.address_key = a.address_key
  AND (d.json->'nearbyMrtExits') IS DISTINCT FROM a.exits;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.block_details AS d
    JOIN nearby_mrt_exit_answers AS a ON a.address_key = d.address_key
    WHERE (d.json->'nearbyMrtExits') IS DISTINCT FROM a.exits
  ) OR EXISTS (
    SELECT 1 FROM public.block_details
    WHERE jsonb_typeof(json->'nearbyMrtExits') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'MRT-exit publication: a block detail does not hold its derived list';
  END IF;
END
$postflight$;

-- Manifest LAST, in the same transaction. The marker names the calculation and binds it to this exact content:
-- `blockDetails` is the candidate's own count and `listsSHA256` covers every key and its stored list. The public
-- /api/manifest route returns the contract keys only, so the marker stays private. `updated_at` moves with the
-- marker and stays as it is when nothing changed.
WITH marker AS (
  SELECT jsonb_build_object(
    'version', 1,
    'radiusMeters', 1500,
    'maxStations', 5,
    'stationAliases', jsonb_build_object(
      'CC9', 'PAYA LEBAR MRT STATION',
      'DT18', 'TELOK AYER MRT STATION'
    ),
    'blockDetails', count(*),
    'listsSHA256', encode(sha256(convert_to(
      COALESCE(string_agg(
        address_key || E'\t' || (json->'nearbyMrtExits')::text, E'\n'
        ORDER BY address_key COLLATE "C"
      ), ''), 'UTF8')), 'hex')
  ) AS value
  FROM public.block_details
)
UPDATE public.manifest AS m
SET json = jsonb_set(m.json, '{nearbyMrtExitsMaterialization}', marker.value, true),
    updated_at = now()
FROM marker
WHERE m.id = 1
  AND (m.json->'nearbyMrtExitsMaterialization') IS DISTINCT FROM marker.value;
-- apply:end

COMMIT;
