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
