/**
 * Limits shared between the browser (src/) and the Worker (functions/).
 *
 * Kept dependency-free so it can be bundled into both the Vite app and the
 * Cloudflare Worker without pulling in framework code.
 */

/** Maximum number of properties that can be saved to a shortlist. */
export const MAX_SHORTLIST_ITEMS = 20;

/** Upper bound on an address key, to reject malformed/oversized input. */
export const MAX_ADDRESS_KEY_LENGTH = 200;

/** Upper bound on any free-text note field (notes, pros, cons, …). */
export const MAX_NOTE_LENGTH = 2_000;

/** Upper bound on the ISO `addedAt` timestamp string. */
export const MAX_ADDED_AT_LENGTH = 40;

/**
 * Hard cap on a sync request body, in bytes. Guards the runtime D1 write path
 * against attacker-crafted oversized payloads (client-side/edge DoS).
 */
export const MAX_SYNC_BODY_BYTES = 64 * 1024;

/** Number of random bytes behind a sync code (128 bits of entropy). */
export const SYNC_CODE_BYTES = 16;

/**
 * Shape of a valid sync code: URL-safe base64 characters only, bounded length.
 * Checked before hashing/looking up so we never hash unbounded attacker input.
 */
export const SYNC_CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Max POST /api/shortlist writes per client IP per colo within
 * {@link SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC}. Must stay in sync with the
 * `ratelimits` binding in wrangler.jsonc. Not referenced at runtime — the
 * actual limit is enforced by the Cloudflare binding. This constant exists
 * as documentation so the two values are co-located with the period.
 */
export const SHORTLIST_WRITE_RATE_LIMIT = 10;

/** Rate-limit window for POST /api/shortlist (seconds). Wrangler only allows 10 or 60. */
export const SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC = 60;

/**
 * Rows with `updated_at` older than this window are purged by the scheduled
 * cleanup. Active sync refreshes `updated_at`, so only abandoned rows expire.
 */
export const SHORTLIST_RETENTION_DAYS = 180;

export const SHORTLIST_RETENTION_MS = SHORTLIST_RETENTION_DAYS * 24 * 60 * 60 * 1000;
