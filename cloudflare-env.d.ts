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
  /** Release mode of the PostGIS nearby endpoint (`shared/nearby-places.ts`); absent or unknown means off. */
  NEON_SPATIAL_MODE?: "off" | "blocks";
  /** Nearby database statements per UTC day, as text; mirrors `NEARBY_DAILY_MISS_BUDGET` in shared/nearby-limits.ts. */
  NEARBY_DAILY_MISS_BUDGET?: string;
  /** The one Durable Object that counts them. Required once the mode is not off: missing answers 503. */
  NEARBY_BUDGET?: DurableObjectNamespace;
  /** Static asset serving — worker-routed requests for non-API paths. */
  ASSETS: Fetcher;
  /** Per-IP rate limit for POST /api/shortlist before any D1 write. */
  SHORTLIST_WRITE_LIMITER: RateLimit;
  /**
   * Per-client rate limit for GET /api/nearby-places (IPv4 address or IPv6 /64). Required once the
   * spatial mode is not off: a missing binding answers 503 instead of running unlimited.
   */
  NEARBY_IP_LIMITER?: RateLimit;
  /** Per-location cap on cache-miss nearby queries. Required once the spatial mode is not off. */
  NEARBY_ORIGIN_LIMITER?: RateLimit;
}
