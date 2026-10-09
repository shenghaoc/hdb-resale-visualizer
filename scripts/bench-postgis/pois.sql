-- Second half of the synthetic dataset: stations, exits, and the query centres. Run after dataset.sql AND after
-- sql/neon/001_postgis_nearby.sql (which creates and backfills block_locations and creates poi_locations).
--   psql -v n=100000 -d <db> -f pois.sql
-- POI rows are inserted directly because the benchmark does not go through the GeoJSON trigger. The query reads
-- source_properties->>'STATION_NA' and 'EXIT_CODE' for exits, exactly as the real rows provide them.
\set ON_ERROR_STOP on

WITH counts AS (SELECT greatest(20, :n / 50) AS stations, greatest(40, :n / 16) AS exits),
st AS (
  SELECT s, 1.23 + bench_u(s * 31) * 0.23 AS lat, 103.63 + bench_u(s * 37) * 0.41 AS lng
  FROM counts, generate_series(1, (SELECT stations FROM counts)) s),
ex AS (
  SELECT e, 1 + (e % (SELECT stations FROM counts)) AS s, (e / (SELECT stations FROM counts)) AS k
  FROM generate_series(1, (SELECT exits FROM counts)) e)
INSERT INTO poi_locations (source, poi_kind, source_id, name, lat, lng, source_properties)
SELECT 'mrt_geojson', 'mrt_station', 'S' || s, 'STATION ' || s || ' MRT STATION', lat, lng,
  jsonb_build_object('stationName', 'STATION ' || s || ' MRT STATION')
FROM st
UNION ALL
SELECT 'mrt_geojson', 'mrt_exit', e::text, 'STATION ' || ex.s || ' MRT STATION (' || chr(65 + (ex.k % 8)) || ')',
  least(1.47, st.lat + ex.k * 0.0004), least(104.05, st.lng + ex.k * 0.0003),
  jsonb_build_object('OBJECTID', e::text, 'STATION_NA', 'STATION ' || ex.s || ' MRT STATION', 'EXIT_CODE', 'Exit ' || chr(65 + (ex.k % 8)))
FROM ex JOIN st ON st.s = ex.s;

-- 10,000 query centres: real block locations, so queries come from where the data is.
CREATE TABLE bench_centres (id integer PRIMARY KEY, lat double precision NOT NULL, lng double precision NOT NULL);
INSERT INTO bench_centres
SELECT row_number() OVER (ORDER BY md5(address_key)), round(lat::numeric, 4), round(lng::numeric, 4)
FROM (SELECT address_key, lat, lng FROM blocks ORDER BY md5(address_key) LIMIT 10000) q;
GRANT SELECT ON bench_centres, poi_locations, block_locations TO hdb_benchmark_runtime;

VACUUM (ANALYZE) blocks, block_locations, poi_locations, bench_centres;
SELECT 'blocks' AS relation, count(*) FROM blocks UNION ALL SELECT 'block_locations', count(*) FROM block_locations
UNION ALL SELECT 'stations', count(*) FROM poi_locations WHERE poi_kind = 'mrt_station'
UNION ALL SELECT 'exits', count(*) FROM poi_locations WHERE poi_kind = 'mrt_exit'
UNION ALL SELECT 'centres', count(*) FROM bench_centres;
