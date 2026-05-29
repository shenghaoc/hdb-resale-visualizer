-- Prefix lookups for /api/suggest (street_name, postal_code).
-- SQLite uses these for LIKE 'prefix%' with COLLATE NOCASE only (no leading wildcard).
CREATE INDEX IF NOT EXISTS idx_blocks_street_name ON blocks(street_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_blocks_postal_code ON blocks(postal_code COLLATE NOCASE);
