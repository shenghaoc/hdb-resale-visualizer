/**
 * Ambient type declarations for Cloudflare Worker bindings.
 *
 * Shared by the Worker entry (`worker/index.ts`) and API handlers under
 * `functions/api/*`.  Keep in sync with `wrangler.jsonc`.
 */

interface Env {
  /** D1 database (production id configured in Cloudflare dashboard). */
  DB: D1Database;
  /** Static asset serving — worker-routed requests for non-API paths. */
  ASSETS: Fetcher;
  /** Per-IP rate limit for POST /api/shortlist before any D1 write. */
  SHORTLIST_WRITE_LIMITER: RateLimit;
}
