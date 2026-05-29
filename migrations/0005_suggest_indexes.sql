-- Prefix lookups for /api/suggest (town, street_name, postal_code).
-- SQLite uses these for LIKE 'prefix%' with COLLATE NOCASE only (no leading wildcard).
-- The existing idx_blocks_town (from 0001_initial.sql) lacks COLLATE NOCASE, so
-- queryDistinctTowns would table-scan without this dedicated NOCASE index.
CREATE INDEX IF NOT EXISTS idx_blocks_town_nocase ON blocks(town COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_blocks_street_name ON blocks(street_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_blocks_postal_code ON blocks(postal_code COLLATE NOCASE);
