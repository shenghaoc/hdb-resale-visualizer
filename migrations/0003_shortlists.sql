-- Opt-in cloud sync for user shortlists (anonymous, no PII).
--
-- Unlike the generated artifact tables (blocks, block_details, …) this table
-- holds *runtime* user state written by the Worker (functions/api/shortlist/*).
-- It is NEVER truncated or rewritten by the sync pipeline
-- (scripts/lib/sync/store.ts) — see the note there.
--
-- The bearer "sync code" is treated as a secret: only its SHA-256 hash is
-- stored here and rows are looked up by that hash, so the raw code is never
-- persisted server-side and a database dump exposes no usable codes.
CREATE TABLE IF NOT EXISTS shortlists (
  code_hash TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
