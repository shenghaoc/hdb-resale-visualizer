/**
 * Ambient type declarations for Cloudflare Worker bindings.
 *
 * Read by the Worker entry (`worker/index.ts`), the public-read backend
 * selector (`worker/public-read-backend.ts`) and the shortlist handlers under
 * `functions/api/shortlist/*`; public data routes never see it.  Keep in sync
 * with `wrangler.jsonc`.
 */

interface Env {
  /** D1 database (production id configured in Cloudflare dashboard). */
  DB: D1Database;
  /** Public-read backend selector; see docs/architecture/public-read-backend.md (absent means D1). */
  HDB_PUBLIC_NEON?: Hyperdrive;
  PUBLIC_DATA_BACKEND?: "d1" | "neon";
  D1_PUBLIC_CACHE_EPOCH?: string;
  NEON_PUBLIC_CACHE_EPOCH?: string;
  /** Explicit release gate for the PostGIS nearby endpoint; default off. */
  NEON_SPATIAL_ENABLED?: "true" | "false";
  /** Static asset serving — worker-routed requests for non-API paths. */
  ASSETS: Fetcher;
  /** Per-IP rate limit for POST /api/shortlist before any D1 write. */
  SHORTLIST_WRITE_LIMITER: RateLimit;
  /**
   * Per-client rate limit for GET /api/nearby-places (IPv4 address or IPv6 /64). Required once the
   * spatial gate is open: a missing binding answers 503 instead of running unlimited.
   */
  NEARBY_IP_LIMITER?: RateLimit;
  /** Per-location cap on cache-miss nearby queries. Required once the spatial gate is open. */
  NEARBY_ORIGIN_LIMITER?: RateLimit;
  /**
   * Overrides the global daily Hyperdrive statement ceiling for nearby searches (whole number, at most the Free
   * allowance); absent means `NEARBY_DAILY_STATEMENT_CEILING` in shared/nearby-limits.ts. A present but invalid
   * value makes nearby misses fail closed.
   */
  NEARBY_DAILY_STATEMENT_CEILING?: string;
}
