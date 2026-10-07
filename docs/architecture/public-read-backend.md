# Public-read backend selector

Every public, read-only data route is served from **one** backend per request: Cloudflare D1 (the default and the rollback target) or Neon Postgres reached through a Hyperdrive binding. The shortlist routes and the scheduled shortlist cleanup always use D1.

## What is selected

| Served from the selected backend                                                                                                                                      | Always D1 (`DB`)                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `GET /api/manifest`, `block-summaries`, `blocks/:town`, `details/:key`, `comparisons/:key`, `trends/town-flat-type`, `mrt-stations`, `mrt-exits`, `search`, `suggest` | `POST /api/shortlist`, `GET /api/shortlist/:syncCode` |
| `POST /api/comparable-transactions` (read-only; one `REPEATABLE READ READ ONLY` snapshot in Neon mode)                                                                | The daily cron that purges stale shortlists           |
| `/og/block/:key.png`, `/og/compare/:a/:b.png`, `/sitemap.xml`, the SEO metadata lookup                                                                                |                                                       |

`PUBLIC_DATA_BACKEND` (`"d1"` or `"neon"`, default `"d1"`) is captured once at request entry. An invalid value, or `"neon"` without the `HDB_PUBLIC_NEON` binding, fails that request with the standard `500 {"error":"Internal server error"}` (`no-store`). There is no per-request failover and no request ever mixes backends.

## How Neon reads work

- The handlers in `functions/api/*` are unchanged. In Neon mode they receive a D1-shaped `env.DB` (`worker/neon-read-db.ts`) that accepts only the exact SQL those handlers issue (`worker/neon-public-read-sql.ts`) and compiles it to native PostgreSQL `SELECT`s. Unknown SQL, mutating SQL, multiple statements and unexpected bindings throw before any network call. `tests/unit/neon-public-handlers.test.ts` runs every public handler through the shim, so a handler SQL change fails CI instead of production.
- `worker/neon-transport.ts` opens one request-scoped `pg` client over the Hyperdrive binding, lazily: cache hits and invalid bodies open no connection. Queries are serialized on that client, and comparable POSTs run inside one read-only repeatable-read transaction that always ends in `COMMIT` or `ROLLBACK`.
- Responses are cached through `worker/public-data-cache.ts`, keyed by the SHA-256 of the manifest row and namespaced `<backend>-<epoch>`, so D1 and Neon entries can never be served for each other.

## The D1 publication window

`scripts/lib/sync/store.ts` replaces the generated D1 tables through many separate requests (about half an hour at production scale) and writes the manifest last, so for that whole window the old manifest sits over tables that are already partly new. The cache only labels a response with the manifest's version when the manifest text is identical before and after the handler, which on its own would bless a half-replaced response.

- The publisher stamps `publicationInProgress` (`{ baseVersion, startedAt, owner }`) into the stored manifest **before** it touches any table, reads it back, and only then proceeds, so the manifest text changes first. The first publication (no stored manifest) and a stored manifest that is not a JSON object get a placeholder manifest that carries only the marker, so every run owns a marker; for the first publication it is a plain `INSERT`, so two first publications cannot both start. `GET /api/manifest` still answers 404 for a placeholder. The final manifest write replaces the whole document and removes the marker in the same statement; nothing else clears it.
- The marker has an owner: the run that stamped it last. Every write a marked publication sends is itself conditional on that ownership, inside the statement (`INSERT … SELECT … WHERE <owner check>`, `DELETE … WHERE <owner check>`), so a run that another run superseded changes nothing, even if it was paused and resumes later. The last run to stamp the marker rewrites every generated table after its stamp, so the tables end up exactly as that run wrote them. The run also checks its ownership between phases (and every 25 batches of the transactions phase) to stop sooner, and its final manifest write is conditional the same way and is read back to learn whether it applied, so a superseded run can never clear the owner's marker. Overlapping `sync-data` runs remain unsupported, but they can no longer corrupt each other or tell the cache that a half-written set of tables is complete.
- While the marker is present the public data cache (`worker/public-data-cache.ts`) stores nothing: no data entry and no version pointer. Requests answered by the 60 s pointer, or whose previous generation (`baseVersion`) is still cached, keep being served from it (`x-data-cache: HIT`, or `HIT-STALE` once the pointer has expired). Everything else is computed from D1 as it is at that moment, is not stored, and carries `cache-control: no-store` (`BYPASS`). A manifest that is not a JSON object is handled the same way and labelled `BYPASS-UNREADABLE`, no manifest at all `BYPASS-NO-MANIFEST`, a manifest that changed while the request ran `BYPASS-UNSTABLE`, and a cache layer that fails answers from the origin labelled `ERROR` (`no-store` as well). The Worker logs the first occurrence of each state, at most once per ten minutes per isolate. The installed PWA's runtime cache ignores `no-store`, so its service worker stores only responses labelled with one of the Worker's consistent outcomes (`MISS`, `HIT`, `HIT-AFTER-VERSION-READ`, `HIT-STALE`) or not labelled at all (a `cacheWillUpdate` plugin in `vite.config.ts`); every `BYPASS*`, `ERROR` and any later label never becomes an offline fallback.
- `GET /api/manifest` never exposes the marker (`shared/manifest-contract.ts`), so clients see the same manifest before, during and after a publication.

What this does not do:

- It does not make a publication atomic. Uncached requests inside the window can still read half-replaced tables, exactly as before the cache existed; the guarantee is that such a response is never stored or presented as a generation.
- It covers the public data cache only. The OG image cache (keyed by the manifest's `generatedAt` and a five-minute memo) and the sitemap cache (one day) are separate caches with their own staleness model and are unchanged.
- A cleared marker means the publisher finished without an error, not that the tables were verified complete.
- It relies on: one publisher at a time, a different `generatedAt` on every run, D1 reads from its primary (no read replicas or Sessions API), and Neon publications being atomic and followed by a new `NEON_PUBLIC_CACHE_EPOCH`.

### An unfinished publication

An aborted run keeps the marker, because the tables may be half replaced, and says so in its output. `readManifestUpdatedAt` reports the manifest as not synced, so the next `sync-data` run publishes again even when upstream is unchanged. Running it to completion is the only safe recovery (the new manifest exists only in the publisher's memory). To look at D1 directly:

```bash
wrangler d1 execute hdb-resale --remote --command "SELECT json_extract(json, '$.publicationInProgress') FROM manifest WHERE id = 1"
```

A non-null result means a publication is unfinished. While D1 is marked and selected, nothing is cached beyond the previous generation's entries (which expire within an hour), so every public request is computed from D1, and `/api/block-summaries` alone reads every `blocks` row. **Check the marker before rolling back to D1** and complete the publication first if it is set. The D1-selected version `a93c380f…` predates the marker, so do not run `sync-data` while that version is the live one; refresh D1 only after a rollback by configuration, which deploys the current code.

## Public contract guarantees

Switching backends must not change what clients receive, so two routes are pinned explicitly.

- **`GET /api/manifest`** is projected to its declared contract by `shared/manifest-contract.ts`: `schemaVersion`, `generatedAt`, `dataWindow`, `sources`, `filterOptions` and `counts`, in that order, with the same nested keys. For D1's manifest this changes nothing. The Neon publication also stores internal bookkeeping (`syncBuildState`, `neonPublication`, `neonReconciliation`) and PostgreSQL JSONB reorders object keys; neither reaches clients. `tests/unit/manifest-contract.test.ts` ties the projection to the frontend `manifestSchema` and the shared `Manifest` type, so a backend or publisher change cannot widen the manifest. Keep publisher details in internal evidence, not in this route.
- **`GET /api/suggest`** keeps its existing implementation and results. Its queries ask for "the first 20 matches" without an `ORDER BY`, so on D1 the answer is whatever order SQLite walks: the NOCASE or BINARY index (ascending) for towns, streets and postal codes, and the table itself for blocks, which the pipeline inserts as `median_price DESC, transaction_count DESC`. PostgreSQL has no implicit order, so the shim in `worker/neon-read-db.ts` states that order explicitly (`address_key` breaks ties) and uses `ILIKE` where SQLite's `LIKE` is ASCII case-insensitive. A parity test (`tests/unit/neon-suggest-parity.test.ts`) runs the legacy code against a D1-shaped and a Neon-shaped database and requires identical suggestions. The equivalence was also checked against live production on broad queries, against 3,914 generated queries on a model of D1 (zero differences), and on real PostgreSQL with the Neon data. A deterministic global ranking (a cached dictionary) was prototyped and deliberately left out; review ranking separately from the migration.

## Configuration

| Name                      | Kind               | Purpose                                                                                          |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `PUBLIC_DATA_BACKEND`     | var                | `"d1"` (default) or `"neon"`.                                                                    |
| `D1_PUBLIC_CACHE_EPOCH`   | var                | Cache namespace epoch for D1. Change it to retire every cached D1 public response.               |
| `NEON_PUBLIC_CACHE_EPOCH` | var                | Cache namespace epoch for Neon. Change it on every switch to Neon and on every Neon data change. |
| `HDB_PUBLIC_NEON`         | Hyperdrive binding | Required only when `PUBLIC_DATA_BACKEND` is `"neon"`.                                            |

The Hyperdrive config must use the direct (non-pooled) Neon endpoint, query caching **disabled**, an origin connection limit of 5, and a database role that is `SELECT`-only on the public tables, has `default_transaction_read_only = on` and a bounded `statement_timeout`, and cannot read private tables. Writer or owner credentials must never be placed in Worker configuration.

## Current production state

Since 2026-10-07 production selects **Neon** (`PUBLIC_DATA_BACKEND="neon"`, cache epoch `neon-20261007-1`). Neon holds the publication generated on 2026-10-04 (988,128 transactions); D1 still holds the older 2026-08-29 publication (985,533 transactions) and is frozen. While Neon is selected, refreshing D1 does not change what the site serves; a new publication has to go to Neon, followed by a new `NEON_PUBLIC_CACHE_EPOCH`. The last D1-selected Worker version is `a93c380f-1a7a-4a15-868e-4cd8a70c549e`.

## Switching and rolling back

1. Switch: set `PUBLIC_DATA_BACKEND` to `"neon"`, set a **new** `NEON_PUBLIC_CACHE_EPOCH`, deploy.
2. Fastest rollback: `wrangler rollback <version-id> --name hdb-resale-visualizer` to a D1-selected version (for the 2026-10-07 switch, `a93c380f-1a7a-4a15-868e-4cd8a70c549e`). It takes effect within seconds, needs no build, and was rehearsed in both directions before the switch.
3. Rollback by configuration: set `PUBLIC_DATA_BACKEND` back to `"d1"`, change `D1_PUBLIC_CACHE_EPOCH`, deploy.

D1 and Neon hold different publications until D1 is refreshed. Rolling back to D1 returns to D1's data, not a Neon snapshot; nothing is copied back. Browsers and the service worker can keep a response for up to its `max-age` (public API responses use 60 s; the PWA runtime cache keeps API responses for offline use), so a switch is not instantaneous for already-open clients.

## Verifying what is being served

The two backends hold different publications, so `GET /api/manifest` identifies the backend (`generatedAt` and `counts.transactions`). `x-data-cache` reports `MISS`, `HIT` or `HIT-AFTER-VERSION-READ` for cacheable public API routes. `HIT-STALE` and `BYPASS` appear while a D1 publication is running, and for as long as an aborted one is left unfinished; `BYPASS-UNREADABLE` means the stored manifest is not a JSON object, `BYPASS-NO-MANIFEST` that none has been published, `BYPASS-UNSTABLE` that the manifest changed while the request was being answered (a publication started or finished mid-request), and `ERROR` that the cache layer itself failed. The header is absent for `HEAD`, `Cookie`/`Authorization` requests and `POST`.
