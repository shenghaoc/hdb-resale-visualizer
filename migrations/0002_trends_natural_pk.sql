-- Replace autoincrement id with a natural composite primary key.
-- The table is fully truncated and re-inserted on every sync, so the
-- autoincrement counter grows unboundedly.  (town, flat_type, month) is
-- the natural key — every row is unique on that triple.

-- Drop the old index first (it duplicates what the PK will provide).
DROP INDEX IF EXISTS idx_trends_lookup;

-- Rebuild the table with a composite PK.
CREATE TABLE IF NOT EXISTS town_flat_type_trends_new (
  town TEXT NOT NULL,
  flat_type TEXT NOT NULL,
  month TEXT NOT NULL,
  median_price INTEGER NOT NULL,
  median_price_per_sqm REAL NOT NULL,
  transaction_count INTEGER NOT NULL,
  PRIMARY KEY (town, flat_type, month)
);

-- Copy data if the old table exists and has rows.
INSERT OR IGNORE INTO town_flat_type_trends_new
  (town, flat_type, month, median_price, median_price_per_sqm, transaction_count)
SELECT town, flat_type, month, median_price, median_price_per_sqm, transaction_count
FROM town_flat_type_trends;

DROP TABLE IF EXISTS town_flat_type_trends;
ALTER TABLE town_flat_type_trends_new RENAME TO town_flat_type_trends;
