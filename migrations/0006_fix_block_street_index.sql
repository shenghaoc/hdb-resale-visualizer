-- Fix operator precedence in the block+street expression index.
-- Without parentheses, `block || ' ' || street_name COLLATE NOCASE` is parsed as
-- `block || ' ' || (street_name COLLATE NOCASE)`, which does not match the WHERE clause
-- `(block || ' ' || street_name) COLLATE NOCASE LIKE ?`, so the query planner
-- cannot use the index. Recreate it with the full expression parenthesised.
DROP INDEX IF EXISTS idx_blocks_block_street_nocase;
CREATE INDEX IF NOT EXISTS idx_blocks_block_street_nocase ON blocks((block || ' ' || street_name) COLLATE NOCASE);
