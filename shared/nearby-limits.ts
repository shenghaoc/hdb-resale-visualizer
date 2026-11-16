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
 * script walking the published block list is slowed to this rate.
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
 * Hyperdrive statements one nearby cache miss spends: the labelled spatial query is a single statement (places and
 * publication identity come back together). Every other public route spends three per miss, because the shared
 * cache reads the whole manifest before and after the handler; see docs/architecture/postgis-nearby.md.
 */
export const NEARBY_STATEMENTS_PER_MISS = 1;

/**
 * Database statements the nearby endpoint may send per UTC day, across every location and client. One Durable
 * Object (`worker/nearby-budget.ts`) counts them and is consulted only on a cache miss. The enforced value is the
 * `NEARBY_DAILY_MISS_BUDGET` variable in wrangler.jsonc; tests/unit/nearby-rate-limit.test.ts fails when the two
 * disagree, and the Worker refuses a configured value above this one.
 */
export const NEARBY_DAILY_MISS_BUDGET = 20_000;
