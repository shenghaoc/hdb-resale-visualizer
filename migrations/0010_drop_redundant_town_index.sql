-- Drop idx_tx_town — it is redundant because idx_tx_town_flat_month
-- (town, flat_type, month) and idx_tx_block_flat_month (town, block,
-- flat_type, month) both have `town` as their leftmost column, so
-- SQLite can use their prefix for town-only lookups.
--
-- This migration is a no-op for fresh environments (0009 no longer
-- creates the index). It exists for production, where the earlier
-- version of 0009 was already applied with idx_tx_town included.

DROP INDEX IF EXISTS idx_tx_town;
