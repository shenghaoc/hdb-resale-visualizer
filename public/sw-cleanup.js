// Imported by the generated service worker (workbox.importScripts in vite.config.ts).
//
// The first runtime cache for /api/* GETs, hdb-api-get-v1, admitted every status-200 response, including ones the
// Worker computed while a D1 publication had the tables half replaced. Workbox does not re-check an entry that is
// already cached when it falls back to it offline, so tightening admission (the cacheWillUpdate rule in
// vite.config.ts) needed a new cache, hdb-api-get-v2. Entries admitted under the old policy are untrusted: delete
// the old cache once this worker activates, rather than leave it orphaned in the browser's storage.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("hdb-api-get-v1"));
});
