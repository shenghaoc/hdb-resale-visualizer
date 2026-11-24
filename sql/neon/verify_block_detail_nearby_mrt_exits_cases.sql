-- Synthetic cases for the calculation in sql/neon/publish_block_detail_nearby_mrt_exits.sql, on real PostGIS.
-- READ ONLY and self-contained: it reads no table and creates no object, so it is safe on any branch that has the
-- PostGIS extension. It refuses to run outside a READ ONLY transaction.
--
--   psql "$DISPOSABLE_BRANCH_URL" -X -q -v ON_ERROR_STOP=1 -f sql/neon/verify_block_detail_nearby_mrt_exits_cases.sql
--   MCP or console: `SET TRANSACTION READ ONLY`, then the DO block, as statements of one transaction.
--
-- The `core` literal is a verbatim copy of the text between the `core` markers of the publication SQL;
-- tests/unit/block-detail-nearby-mrt-exits-sql.test.ts fails when the copy drifts, so a passing run checks the
-- statement that is published. The fixture supplies the two inputs the core reads (`centers` and `exits`) from
-- literal rows: every exit is placed with ST_Project at an exact spheroidal distance and bearing from its centre,
-- and the centres are at least 5 km apart.
--
--   empty     the only exit is 1,500.3 m away                       -> []
--   boundary  exits at 1,499.7 m and 1,500.3 m                      -> only the first
--   dense     30 exits of one station, then two more stations       -> three entries (the nearest 25 exits are all one
--             station, so cutting before grouping would give one)
--   six       six stations                                          -> the nearest five
--   short     source EXIT_CODE `E` (display name `... (E)`)         -> exitLabel `E`, taken from the code
--   tie       two exits of one station at one point                 -> the lower exit id under COLLATE "C";
--             two stations at one distance                          -> ordered by exit id
--   alias     a `CC9` exit nearer than a `PAYA LEBAR MRT STATION` exit, and a `DT4` exit
--                                                                   -> one PAYA LEBAR entry (the CC9 exit), DT4 kept
--   rounding  100.01 m and 100.04 m, the farther with the lower id  -> both 100.0, ordered by exit id (the order is
--             taken after rounding to 0.1 m, as GET /api/nearby-places does)
BEGIN READ ONLY;

DO $cases$
DECLARE
  core constant text := $core$
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
$core$;
  fixture constant text := $fixture$
WITH station_aliases(code, station_name) AS (
  VALUES ('CC9', 'PAYA LEBAR MRT STATION'), ('DT18', 'TELOK AYER MRT STATION')
), centers AS MATERIALIZED (
  SELECT c.address_key, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography AS point
  FROM (VALUES
    ('empty', 1.20, 103.60), ('boundary', 1.25, 103.60), ('dense', 1.30, 103.60), ('six', 1.35, 103.60),
    ('short', 1.40, 103.60), ('tie', 1.45, 103.60), ('alias', 1.20, 103.70), ('rounding', 1.25, 103.70)
  ) AS c(address_key, lat, lng)
), raw_exits(center_key, source_id, station, code, bearing_degrees, meters) AS (
  VALUES
    ('empty', '001', 'FAR MRT STATION', 'Exit A', 0, 1500.3),
    ('boundary', '011', 'EDGE MRT STATION', 'Exit A', 90, 1499.7),
    ('boundary', '012', 'OUT MRT STATION', 'Exit A', 180, 1500.3),
    ('dense', '201', 'SECOND MRT STATION', 'Exit A', 45, 200),
    ('dense', '202', 'THIRD MRT STATION', 'Exit B', 135, 300),
    ('six', '301', 'S1 MRT STATION', 'Exit A', 0, 100),
    ('six', '302', 'S2 MRT STATION', 'Exit A', 60, 200),
    ('six', '303', 'S3 MRT STATION', 'Exit A', 120, 300),
    ('six', '304', 'S4 MRT STATION', 'Exit A', 180, 400),
    ('six', '305', 'S5 MRT STATION', 'Exit A', 240, 500),
    ('six', '306', 'S6 MRT STATION', 'Exit A', 300, 600),
    ('short', '351', 'BUGIS MRT STATION', 'E', 10, 120),
    ('tie', '410', 'TWIN MRT STATION', 'Exit B', 30, 150),
    ('tie', '402', 'TWIN MRT STATION', 'Exit A', 30, 150),
    ('tie', '420', 'LATER MRT STATION', 'Exit A', 200, 250),
    ('tie', '415', 'EARLIER MRT STATION', 'Exit A', 200, 250),
    ('alias', '501', 'CC9', 'E', 0, 100),
    ('alias', '502', 'PAYA LEBAR MRT STATION', 'Exit A', 0, 150),
    ('alias', '503', 'DT4', 'Exit A', 90, 300),
    ('rounding', '602', 'ALPHA MRT STATION', 'Exit A', 0, 100.01),
    ('rounding', '601', 'BETA MRT STATION', 'Exit A', 120, 100.04)
  UNION ALL
  SELECT 'dense', (100 + g)::text, 'BUSY MRT STATION', 'Exit ' || g, g * 10, 100 + g
  FROM generate_series(1, 30) AS g
), exits AS MATERIALIZED (
  SELECT 'mrt_geojson'::text AS source, 'mrt_exit'::text AS kind,
    'mrt_geojson:mrt_exit:' || r.source_id AS exit_id,
    COALESCE(a.station_name, r.station) AS station_name,
    r.code AS exit_label,
    ST_Project(c.point, r.meters, radians(r.bearing_degrees)) AS location
  FROM raw_exits AS r
  JOIN centers AS c ON c.address_key = r.center_key
  LEFT JOIN station_aliases AS a ON a.code = r.station
),
$fixture$;
  expected constant jsonb := $expected${
    "empty": [],
    "boundary": [
      {"stationName": "EDGE MRT STATION", "exitLabel": "Exit A", "distanceMeters": 1499.7, "exitId": "mrt_geojson:mrt_exit:011"}
    ],
    "dense": [
      {"stationName": "BUSY MRT STATION", "exitLabel": "Exit 1", "distanceMeters": 101, "exitId": "mrt_geojson:mrt_exit:101"},
      {"stationName": "SECOND MRT STATION", "exitLabel": "Exit A", "distanceMeters": 200, "exitId": "mrt_geojson:mrt_exit:201"},
      {"stationName": "THIRD MRT STATION", "exitLabel": "Exit B", "distanceMeters": 300, "exitId": "mrt_geojson:mrt_exit:202"}
    ],
    "six": [
      {"stationName": "S1 MRT STATION", "exitLabel": "Exit A", "distanceMeters": 100, "exitId": "mrt_geojson:mrt_exit:301"},
      {"stationName": "S2 MRT STATION", "exitLabel": "Exit A", "distanceMeters": 200, "exitId": "mrt_geojson:mrt_exit:302"},
      {"stationName": "S3 MRT STATION", "exitLabel": "Exit A", "distanceMeters": 300, "exitId": "mrt_geojson:mrt_exit:303"},
      {"stationName": "S4 MRT STATION", "exitLabel": "Exit A", "distanceMeters": 400, "exitId": "mrt_geojson:mrt_exit:304"},
      {"stationName": "S5 MRT STATION", "exitLabel": "Exit A", "distanceMeters": 500, "exitId": "mrt_geojson:mrt_exit:305"}
    ],
    "short": [
      {"stationName": "BUGIS MRT STATION", "exitLabel": "E", "distanceMeters": 120, "exitId": "mrt_geojson:mrt_exit:351"}
    ],
    "tie": [
      {"stationName": "TWIN MRT STATION", "exitLabel": "Exit A", "distanceMeters": 150, "exitId": "mrt_geojson:mrt_exit:402"},
      {"stationName": "EARLIER MRT STATION", "exitLabel": "Exit A", "distanceMeters": 250, "exitId": "mrt_geojson:mrt_exit:415"},
      {"stationName": "LATER MRT STATION", "exitLabel": "Exit A", "distanceMeters": 250, "exitId": "mrt_geojson:mrt_exit:420"}
    ],
    "alias": [
      {"stationName": "PAYA LEBAR MRT STATION", "exitLabel": "E", "distanceMeters": 100, "exitId": "mrt_geojson:mrt_exit:501"},
      {"stationName": "DT4", "exitLabel": "Exit A", "distanceMeters": 300, "exitId": "mrt_geojson:mrt_exit:503"}
    ],
    "rounding": [
      {"stationName": "BETA MRT STATION", "exitLabel": "Exit A", "distanceMeters": 100, "exitId": "mrt_geojson:mrt_exit:601"},
      {"stationName": "ALPHA MRT STATION", "exitLabel": "Exit A", "distanceMeters": 100, "exitId": "mrt_geojson:mrt_exit:602"}
    ]
  }$expected$;
  got jsonb;
  failed text;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'Refusing to run outside a READ ONLY transaction';
  END IF;
  EXECUTE 'SELECT jsonb_object_agg(address_key, exits) FROM (' || fixture || core || ') AS answers' INTO got;
  SELECT string_agg(format('%s: expected %s, got %s', want.key, want.value, got->want.key), E'\n' ORDER BY want.key)
  INTO failed
  FROM jsonb_each(expected) AS want
  WHERE (got->want.key) IS DISTINCT FROM want.value;
  IF failed IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(got)) <> 8 THEN
    RAISE EXCEPTION E'FAIL: cases differ.\n%', COALESCE(failed, 'unexpected key set: ' || got::text);
  END IF;
  RAISE NOTICE 'PASS: 8 cases (empty, boundary, dense, six, short, tie, alias, rounding) match the expected lists';
END
$cases$;

ROLLBACK;
