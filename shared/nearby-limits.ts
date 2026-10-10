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
 * Hyperdrive statements one nearby cache miss spends: the labelled spatial query is a single statement (places and
 * publication identity come back together). Every other public route spends three per miss, because the shared
 * cache reads the whole manifest before and after the handler; see docs/architecture/postgis-nearby.md.
 */
export const NEARBY_STATEMENTS_PER_MISS = 1;

/** Workers Free plan: Hyperdrive database statements per day, account-wide, reset at 00:00 UTC. */
export const HYPERDRIVE_FREE_DAILY_STATEMENTS = 100_000;

/**
 * Global ceiling on the statements the nearby route may send through Hyperdrive per UTC day, kept in D1
 * (functions/_lib/nearby-budget.ts). Once it is spent every cache miss is refused with 503 until 00:00 UTC; cache
 * hits are unaffected. It is a tenth of the Free allowance, so a runaway nearby workload cannot starve the rest of
 * the site's database reads, and at the measured size of the block panel's answer (about 1.3 KB) spending all of it
 * moves roughly 15 MB a day out of Neon. Raise it only together with the plan; `NEARBY_DAILY_STATEMENT_CEILING`
 * in the Worker's vars overrides it (the temporary verification Worker uses a tiny value to see it trip).
 */
export const NEARBY_DAILY_STATEMENT_CEILING = 10_000;
