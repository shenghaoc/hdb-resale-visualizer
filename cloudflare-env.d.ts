/**
 * Ambient type declarations for Cloudflare Worker bindings.
 *
 * Shared by the Worker entry (`worker/index.ts`) and API handlers under
 * `functions/api/*`.  Keep in sync with `wrangler.jsonc`.
 */

interface Env {
  /** D1 database (production id configured in Cloudflare dashboard). */
  DB: D1Database;
  /** Optional, locally prepared public-read rollout; production defaults to D1. */
  HDB_PUBLIC_NEON?: Hyperdrive;
  PUBLIC_DATA_BACKEND?: "d1" | "neon";
  D1_PUBLIC_CACHE_EPOCH?: string;
  NEON_PUBLIC_CACHE_EPOCH?: string;
  /** Captured request scope; never populated from client input. */
  PUBLIC_DATA_CACHE_NAMESPACE?: string;
  /** Static asset serving — worker-routed requests for non-API paths. */
  ASSETS: Fetcher;
  /** Per-IP rate limit for POST /api/shortlist before any D1 write. */
  SHORTLIST_WRITE_LIMITER: RateLimit;
}
