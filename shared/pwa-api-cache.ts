/**
 * Workbox runtime-cache policy for same-origin GET /api/* responses.
 *
 * The service worker uses NetworkFirst and only checks HTTP status, so it
 * stores responses even when the server sends `Cache-Control: no-store`.
 * Shortlist GETs are the private, mutable exception: a cached copy can be
 * served on the next load and then pushed back, overwriting newer cloud data.
 */

/** True when `pathname` is the shortlist collection or a per-code read. */
export function isShortlistApiPath(pathname: string): boolean {
  return pathname === "/api/shortlist" || pathname.startsWith("/api/shortlist/");
}

/**
 * Whether a GET pathname may be stored in the PWA runtime cache.
 * The Workbox route inlines this predicate because the generated service
 * worker stringifies `urlPattern` and cannot close over imports.
 */
export function isRuntimeCacheableApiGet(pathname: string): boolean {
  return pathname.startsWith("/api/") && !isShortlistApiPath(pathname);
}
