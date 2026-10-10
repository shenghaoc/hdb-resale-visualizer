-- Daily Hyperdrive statement budget for GET /api/nearby-places: one row per UTC day, incremented by the Worker
-- (functions/_lib/nearby-budget.ts) just before a cache miss is allowed to reach Neon. Holds a counter only, no user
-- data. Additive: nothing reads or writes it while NEON_SPATIAL_ENABLED is "false".
CREATE TABLE IF NOT EXISTS nearby_statement_budget (
  day TEXT PRIMARY KEY CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  statements INTEGER NOT NULL CHECK (statements >= 0)
) WITHOUT ROWID;
