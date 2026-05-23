-- D1 schema for HDB Resale Visualizer.
-- Tables are split into two groups:
--
-- 1. Generated artifacts — overwritten on every sync-data run.
--    These mirror the JSON contract previously served from `public/data/`.
-- 2. Persistent caches — geocodes and walking times never change for an
--    address/pair, so we keep them across runs. This is the "geocode once"
--    guarantee: the sync pipeline only hits OneMap for rows missing from the
--    cache tables here.

CREATE TABLE IF NOT EXISTS manifest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  address_key TEXT PRIMARY KEY,
  town TEXT NOT NULL,
  block TEXT NOT NULL,
  street_name TEXT NOT NULL,
  display_name TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  median_price INTEGER NOT NULL,
  price_per_sqm_median REAL NOT NULL,
  transaction_count INTEGER NOT NULL,
  floor_area_min REAL NOT NULL,
  floor_area_max REAL NOT NULL,
  lease_commence_year INTEGER NOT NULL,
  latest_month TEXT NOT NULL,
  available_min_month TEXT NOT NULL,
  available_max_month TEXT NOT NULL,
  flat_types_json TEXT NOT NULL,
  flat_models_json TEXT NOT NULL,
  median_price_by_flat_type_json TEXT,
  median_price_per_sqm_by_flat_type_json TEXT,
  nearest_mrt_json TEXT,
  nearby_mrts_json TEXT,
  postal_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_blocks_town ON blocks(town);
CREATE INDEX IF NOT EXISTS idx_blocks_sort ON blocks(median_price DESC, transaction_count DESC);

CREATE TABLE IF NOT EXISTS block_details (
  address_key TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comparisons (
  address_key TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS town_flat_type_trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  town TEXT NOT NULL,
  flat_type TEXT NOT NULL,
  month TEXT NOT NULL,
  median_price INTEGER NOT NULL,
  median_price_per_sqm REAL NOT NULL,
  transaction_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trends_lookup ON town_flat_type_trends(town, flat_type, month);

CREATE TABLE IF NOT EXISTS mrt_geojson (
  kind TEXT PRIMARY KEY CHECK (kind IN ('stations', 'exits')),
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geocode_cache (
  cache_key TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  postal_code TEXT,
  display_name TEXT,
  search_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS walking_time_cache (
  cache_key TEXT PRIMARY KEY,
  walking_time_seconds INTEGER NOT NULL,
  walking_distance_meters INTEGER,
  updated_at TEXT NOT NULL
);
