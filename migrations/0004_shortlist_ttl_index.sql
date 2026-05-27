-- Index required by the daily TTL purge (purgeStaleShortlists) to avoid
-- full table scans as the shortlists table grows. The DELETE is parameterized
-- on updated_at < ? so a btree index on updated_at lets SQLite/D1 seek
-- directly to the stale rows without reading the entire table.
CREATE INDEX IF NOT EXISTS idx_shortlists_updated_at ON shortlists(updated_at);
