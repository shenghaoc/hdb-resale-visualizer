-- Deterministic synthetic dataset for the local PostGIS benchmark (see README.md).
--
-- Run against an empty database with a superuser, after tests/deployed-path/base-schema.sql and the role
-- hdb_benchmark_runtime exist:   psql -v n=100000 -d <db> -f dataset.sql
-- :n is the number of blocks. Exits are n/16 and stations n/50, the ratios of the real data (9,730 / 613 / 190).
-- Everything derives from hash functions of the row number, so a given :n always yields the same rows.
-- Points are a mixture: 80% in 40 clusters (spread of about 1.4 km), 20% uniform, all inside the allowed query box
-- (lat 1.22 to 1.47, lng 103.62 to 104.05).
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.bench_u(x bigint) RETURNS double precision
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT (hashint8(x)::bigint + 2147483648) / 4294967296.0 $$;

-- Roughly normal offset in [-2, 2] (sum of four uniforms minus two).
CREATE OR REPLACE FUNCTION public.bench_n(x bigint) RETURNS double precision
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT bench_u(x) + bench_u(x + 1000003) + bench_u(x + 2000003) + bench_u(x + 3000017) - 2 $$;

CREATE TEMP TABLE bench_clusters AS
SELECT g AS id, 1.24 + bench_u(g * 101) * 0.21 AS lat, 103.64 + bench_u(g * 211) * 0.39 AS lng
FROM generate_series(1, 40) g;

-- Blocks. The columns the shipped query reads (address_key, display_name, block, street_name, lat, lng) are real;
-- the rest only satisfy the base schema.
INSERT INTO blocks (address_key, town, block, street_name, display_name, lat, lng, median_price, price_per_sqm_median,
  transaction_count, floor_area_min, floor_area_max, lease_commence_year, latest_month, available_min_month,
  available_max_month, flat_types_json, flat_models_json)
SELECT 'blk-' || g, 'TOWN ' || (g % 26), ((g % 900) + 1)::text, 'STREET ' || (g % 400),
  CASE WHEN g % 5 = 0 THEN 'NAMED ' || g END,
  CASE WHEN bench_u(g * 3) < 0.8
    THEN least(1.47, greatest(1.22, c.lat + bench_n(g * 5) * 0.0125 / 0.577))
    ELSE 1.22 + bench_u(g * 7) * 0.25 END,
  CASE WHEN bench_u(g * 3) < 0.8
    THEN least(104.05, greatest(103.62, c.lng + bench_n(g * 11) * 0.0125 / 0.577))
    ELSE 103.62 + bench_u(g * 13) * 0.43 END,
  500000, 5000, 10, 60, 110, 1990, '2026-06', '2020-01', '2026-06', '["4 ROOM"]'::jsonb, '["MODEL A"]'::jsonb
FROM generate_series(1, :n) g
JOIN bench_clusters c ON c.id = 1 + (abs(hashint8(g * 17)::bigint) % 40);

GRANT USAGE ON SCHEMA public TO hdb_benchmark_runtime;
GRANT SELECT ON transactions, blocks, block_details, comparisons, town_flat_type_trends, manifest, mrt_geojson
  TO hdb_benchmark_runtime;
INSERT INTO manifest (id, json, updated_at) VALUES (1, '{"schemaVersion":1,"benchmark":true}'::jsonb, now());
