/**
 * Rate limits for GET /api/nearby-places. The enforced values are the `ratelimits` bindings in
 * wrangler.jsonc (Workers Rate Limiting counters are per Cloudflare location and approximate);
 * tests/unit/nearby-rate-limit.test.ts fails when these constants and the bindings disagree.
 */

/** Window for both limiters, in seconds. The binding only accepts 10 or 60. */
export const NEARBY_RATE_LIMIT_PERIOD_SEC = 60;

/**
 * Requests per client per window, counted for every request including cache hits. The UI sends one
 * request each time a user expands a block's exit list, so ordinary use stays far below this while a
 * script walking the 24 million canonical grid centres is stopped within a minute.
 */
export const NEARBY_CLIENT_RATE_LIMIT = 30;

/**
 * Origin (cache-miss) queries per window per location, across all clients. Cache hits never consume
 * this, so it bounds database work independently of how many clients are asking.
 */
export const NEARBY_ORIGIN_RATE_LIMIT = 300;

/** Constant key for the origin limiter: one shared counter per location. */
export const NEARBY_ORIGIN_RATE_LIMIT_KEY = "nearby-origin";

/**
 * One budget-reservation statement through a restricted Neon Hyperdrive role, then one
 * SELECT through the existing read-only Hyperdrive role. A rejected reservation spends
 * only its own statement. The spatial SELECT itself still reads places and publication
 * identity together without extra manifest round trips.
 */
export const NEARBY_STATEMENTS_PER_MISS = 2;

/** Workers Free Hyperdrive hard allowance, counting all statements including refused reservations. */
export const HYPERDRIVE_FREE_DAILY_STATEMENTS = 100_000;

/**
 * Hard SQL maximum for admitted spatial searches per UTC day on one serving branch.
 * The operator can lower this ceiling, never raise it. Unlike the old D1 proposal,
 * this uses Neon itself: see sql/neon/002_nearby_daily_budget.sql.
 *
 * This is NOT a strict account-wide Hyperdrive statement cap: declined reservations
 * still traverse Hyperdrive, and blue/green branches need controlled counter handoff.
 */
export const NEARBY_DAILY_STATEMENT_CEILING = 10_000;
