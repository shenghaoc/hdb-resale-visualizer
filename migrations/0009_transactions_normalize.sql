-- Normalize the transactions table to reduce D1 storage footprint.
--
-- Key changes:
--   1. INTEGER PRIMARY KEY (rowid alias) replaces the ~50-byte TEXT id.
--      Every secondary index now stores a 4–8 byte rowid instead of the
--      full synthetic text key — the single biggest size win.
--   2. Drop `storey_midpoint` (derived: parseStoreyMidpoint(storey_range)).
--   3. Drop `price_per_sqm`  (derived: resale_price / floor_area_sqm).
--
-- Both derived columns are computed at read time in the API handler.
-- The sync script truncates and re-inserts on every run, so no data
-- migration is needed — just drop and recreate.

DROP TABLE IF EXISTS transactions;

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  month TEXT NOT NULL,
  town TEXT NOT NULL,
  block TEXT NOT NULL,
  street_name TEXT NOT NULL,
  address_key TEXT NOT NULL,
  flat_type TEXT NOT NULL,
  storey_range TEXT NOT NULL,
  floor_area_sqm REAL NOT NULL,
  lease_commence_year INTEGER,
  resale_price INTEGER NOT NULL,
  flat_model TEXT
);

-- Recreate indexes from 0007 + 0008 (minus the three that 0008 dropped).
-- With INTEGER PK each index entry is ~44 bytes smaller.
-- Note: idx_tx_town is omitted — it is redundant because the composite
-- indexes idx_tx_town_flat_month and idx_tx_block_flat_month both have
-- `town` as their leftmost column. See 0010 for the production cleanup.

CREATE INDEX IF NOT EXISTS idx_tx_flat_type ON transactions(flat_type);
CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_tx_lease ON transactions(lease_commence_year);
CREATE INDEX IF NOT EXISTS idx_tx_floor_area ON transactions(floor_area_sqm);

CREATE INDEX IF NOT EXISTS idx_tx_block_flat_month
  ON transactions(town, block, flat_type, month DESC);

CREATE INDEX IF NOT EXISTS idx_tx_street_flat_month
  ON transactions(street_name, flat_type, month DESC);

CREATE INDEX IF NOT EXISTS idx_tx_town_flat_month
  ON transactions(town, flat_type, month DESC);
