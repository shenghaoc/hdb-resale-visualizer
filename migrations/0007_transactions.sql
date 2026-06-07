-- Normalized transactions table for the transaction-level comparable engine v2.
-- One row per resale transaction across all blocks. Populated by sync-data
-- alongside the existing block_details JSON blobs. Truncated and re-inserted
-- on every sync run (same pattern as blocks, block_details, etc.).

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  town TEXT NOT NULL,
  block TEXT NOT NULL,
  street_name TEXT NOT NULL,
  address_key TEXT NOT NULL,
  flat_type TEXT NOT NULL,
  storey_range TEXT NOT NULL,
  storey_midpoint REAL NOT NULL,
  floor_area_sqm REAL NOT NULL,
  lease_commence_year INTEGER,
  resale_price INTEGER NOT NULL,
  price_per_sqm REAL NOT NULL,
  flat_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_tx_town ON transactions(town);
CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(town, block);
CREATE INDEX IF NOT EXISTS idx_tx_street ON transactions(street_name);
CREATE INDEX IF NOT EXISTS idx_tx_flat_type ON transactions(flat_type);
CREATE INDEX IF NOT EXISTS idx_tx_town_flat_type ON transactions(town, flat_type);
CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_tx_lease ON transactions(lease_commence_year);
CREATE INDEX IF NOT EXISTS idx_tx_floor_area ON transactions(floor_area_sqm);
