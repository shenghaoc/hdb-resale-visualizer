-- Replace single-column and partial composite indexes from 0007_transactions
-- with covering composite indexes that match the three API query shapes:
--
--   1. WHERE town=? AND block=? AND flat_type=? ORDER BY month DESC
--   2. WHERE street_name=? AND flat_type=? ORDER BY month DESC
--   3. WHERE town=? AND flat_type=? ORDER BY month DESC
--
-- Each new index covers the filter columns first, then the sort column so D1
-- can satisfy both the filter and the ORDER BY without an extra sort step.

DROP INDEX IF EXISTS idx_tx_block;
DROP INDEX IF EXISTS idx_tx_street;
DROP INDEX IF EXISTS idx_tx_town_flat_type;

CREATE INDEX IF NOT EXISTS idx_tx_block_flat_month
  ON transactions(town, block, flat_type, month DESC);

CREATE INDEX IF NOT EXISTS idx_tx_street_flat_month
  ON transactions(street_name, flat_type, month DESC);

CREATE INDEX IF NOT EXISTS idx_tx_town_flat_month
  ON transactions(town, flat_type, month DESC);
