# Public-read backend selector

Every public, read-only data route is served from **one** backend per request: Cloudflare D1 (the default and the rollback target) or Neon Postgres reached through a Hyperdrive binding. The shortlist routes and the scheduled shortlist cleanup always use D1.

## What is selected

| Served from the selected backend                                                                                                                                      | Always D1 (`DB`)                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `GET /api/manifest`, `block-summaries`, `blocks/:town`, `details/:key`, `comparisons/:key`, `trends/town-flat-type`, `mrt-stations`, `mrt-exits`, `search`, `suggest` | `POST /api/shortlist`, `GET /api/shortlist/:syncCode` |
| `POST /api/comparable-transactions` (read-only; one `REPEATABLE READ READ ONLY` snapshot in Neon mode)                                                                | The daily cron that purges stale shortlists           |
| `/og/block/:key.png`, `/og/compare/:a/:b.png`, `/sitemap.xml`, the SEO metadata lookup                                                                                |                                                       |

`PUBLIC_DATA_BACKEND` (`"d1"` or `"neon"`, default `"d1"`) is captured once at request entry. An invalid value, or `"neon"` without the `HDB_PUBLIC_NEON` binding, fails that request with the standard `500 {"error":"Internal server error"}` (`no-store`). There is no per-request failover and no request ever mixes backends.

## How public reads work

- Routes ask for data, not SQL. Every public read is an operation of `PublicData` (`functions/_lib/public-data.ts`), named for what it returns (`allBlocks`, `searchBlocks`, `townsMatching`, `recentTransactions`, …), with rows in the public tables' column names. The handlers in `functions/api/*` receive it as `publicData` and get no `env` at all; the OG cards, the sitemap, the SEO rewrite and the public data cache read through the same object.
- `worker/public-read-backend.ts` captures the backend at request entry and builds that object: `worker/public-data-d1.ts` over the `DB` binding, or `worker/public-data-neon.ts` over the request's Hyperdrive transport. Each holds its own SQL. D1's statements are the ones the routes issued before the boundary existed; Neon's are native PostgreSQL written to return the same rows (JSONB columns read as text, D1's implicit orders spelled out, SQLite's ASCII case folding and integer truncation reproduced where a predicate depends on them). Request values only ever travel as bound parameters, and the Neon role is read-only besides.
- `tests/unit/public-data-parity.test.ts` loads one publication into SQLite built from the real D1 migrations and into PostgreSQL (PGlite) with the Neon column types, and requires every public route to answer the same on both (byte for byte, except where a stored JSON document is involved: JSONB keeps object keys in an order of its own) and every Worker-only read to return the same rows. To add a public read, add an operation to `PublicData`, implement it in both files, and cover it there.
- `worker/neon-transport.ts` opens one request-scoped `pg` client over the Hyperdrive binding, lazily: cache hits and invalid bodies open no connection. Queries are serialized on that client, and comparable POSTs run inside one read-only repeatable-read transaction that always ends in `COMMIT` or `ROLLBACK`.
- Responses are cached through `worker/public-data-cache.ts`, keyed by the SHA-256 of the manifest row and namespaced `<backend>-<epoch>`, so D1 and Neon entries can never be served for each other.

## The D1 publication window

`scripts/lib/sync/store.ts` replaces the generated D1 tables through many separate requests (about half an hour at production scale) and writes the manifest last, so for that whole window the old manifest sits over tables that are already partly new. The cache only labels a response with the manifest's version when the manifest text is identical before and after the handler, which on its own would bless a half-replaced response.

- The publisher stamps `publicationInProgress` (`{ baseVersion, startedAt, owner }`) into the stored manifest **before** it touches any table, reads it back, and only then proceeds, so the manifest text changes first. The first publication (no stored manifest) and a stored manifest that is not a JSON object get a placeholder manifest that carries only the marker, so every run owns a marker; for the first publication it is a plain `INSERT`, so two first publications cannot both start. `GET /api/manifest` still answers 404 for a placeholder. The final manifest write replaces the whole document and removes the marker in the same statement; nothing else clears it.
- The marker has an owner: the run that stamped it last. Every write a marked publication sends is itself conditional on that ownership, inside the statement (`INSERT … SELECT … WHERE <owner check>`, `DELETE … WHERE <owner check>`), so a run that another run superseded changes nothing, even if it was paused and resumes later. The last run to stamp the marker rewrites every generated table after its stamp, so the tables end up exactly as that run wrote them. The run also checks its ownership between phases (and every 25 batches of the transactions phase) to stop sooner, and its final manifest write is conditional the same way and is read back to learn whether it applied, so a superseded run can never clear the owner's marker. Overlapping `sync-data` runs remain unsupported, but they can no longer corrupt each other or tell the cache that a half-written set of tables is complete.
- While the marker is present the public data cache (`worker/public-data-cache.ts`) stores nothing: no data entry and no version pointer. Requests answered by the 60 s pointer, or whose previous generation (`baseVersion`) is still cached, keep being served from it (`x-data-cache: HIT`, or `HIT-STALE` once the pointer has expired). Everything else is computed from D1 as it is at that moment, is not stored, and carries `cache-control: no-store` (`BYPASS`). A manifest that is not a JSON object is handled the same way and labelled `BYPASS-UNREADABLE`, no manifest at all `BYPASS-NO-MANIFEST`, a manifest that changed while the request ran `BYPASS-UNSTABLE`, and a cache layer that fails answers from the origin labelled `ERROR` (`no-store` as well). The Worker logs the first occurrence of each state, at most once per ten minutes per isolate. The installed PWA's runtime cache ignores `no-store`, so its service worker stores only responses labelled with one of the Worker's consistent outcomes (`MISS`, `HIT`, `HIT-AFTER-VERSION-READ`, `HIT-STALE`) (a `cacheWillUpdate` plugin in `vite.config.ts`); every `BYPASS*`, `ERROR`, later label and unlabelled response (requests that skip the cache layer before the manifest is read: cookies, credentials, oversized URLs, invalid queries) never becomes an offline fallback. The rule is new, so the runtime cache was rotated (`hdb-api-get-v2`) and the worker deletes `hdb-api-get-v1` when it activates (`public/sw-cleanup.js`): entries admitted under the old rule are not trusted, and Workbox does not re-check an entry it falls back to.
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
- **`GET /api/suggest`** keeps its existing implementation and results. Its queries ask for "the first 20 matches" without an `ORDER BY`, so on D1 the answer is whatever order SQLite walks: the NOCASE or BINARY index (ascending) for towns, streets and postal codes, and the table itself for blocks, which the pipeline inserts as `median_price DESC, transaction_count DESC`. PostgreSQL has no implicit order, so the Neon implementation (`worker/public-data-neon.ts`) states that order explicitly (`address_key` breaks ties) and uses `ILIKE` where SQLite's `LIKE` is ASCII case-insensitive. A parity test (`tests/unit/neon-suggest-parity.test.ts`) runs suggest over both implementations, with D1's indexes and row order on one side and neither on the other, and requires identical suggestions. The equivalence was also checked against live production on broad queries, against 3,914 generated queries on a model of D1 (zero differences), and on real PostgreSQL with the Neon data. A deterministic global ranking (a cached dictionary) was prototyped and deliberately left out; review ranking separately from the migration.

## Configuration

| Name                      | Kind               | Purpose                                                                                          |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `PUBLIC_DATA_BACKEND`     | var                | `"d1"` (default) or `"neon"`.                                                                    |
| `D1_PUBLIC_CACHE_EPOCH`   | var                | Cache namespace epoch for D1. Change it to retire every cached D1 public response.               |
| `NEON_PUBLIC_CACHE_EPOCH` | var                | Cache namespace epoch for Neon. Change it on every switch to Neon and on every Neon data change. |
| `HDB_PUBLIC_NEON`         | Hyperdrive binding | Always bound in `wrangler.jsonc`; read only when `PUBLIC_DATA_BACKEND` is `"neon"`.              |

The Hyperdrive config must use the direct (non-pooled) Neon endpoint, query caching **disabled**, an origin connection limit of 5, and a database role that is `SELECT`-only on the public tables, has `default_transaction_read_only = on` and a bounded `statement_timeout`, and cannot read private tables. Writer or owner credentials must never be placed in Worker configuration.

## Local development

`vp run dev:functions` runs `wrangler dev --var PUBLIC_DATA_BACKEND:d1`, so the full-stack workflow uses the seeded local D1 emulator whichever backend production selects, and never needs a Neon connection. Two details of the committed configuration make that work:

- `wrangler dev` refuses to start while a Hyperdrive binding has no local connection string, even if nothing uses it. The binding therefore carries `localConnectionString`: a fixed, non-secret placeholder (Wrangler requires a user and a password in it) that deploys never upload (they send only the binding's `id`) and that nothing connects to while D1 is selected. `tests/unit/wrangler-public-backend.test.ts` asks Wrangler itself to build the local options from `wrangler.jsonc`, so a binding without one fails CI instead of local development.
- `--var` overrides the `vars` in `wrangler.jsonc` for that run only.

Plain `wrangler dev` (without the override) selects Neon, and public reads then return `500` locally because the placeholder points at no database; use `vp run dev:functions`. To exercise the Neon path locally, run `wrangler dev` without the override against a local PostgreSQL that holds the public tables and set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HDB_PUBLIC_NEON` to its connection string, which takes the place of the placeholder.

## Current production state

`wrangler.jsonc` selects **Neon** (`PUBLIC_DATA_BACKEND="neon"`, cache epoch `neon-20261007-2`) and keeps D1 bound for shortlists and the TTL cleanup. Neon holds the publication generated on 2026-10-04 (988,128 transactions); D1 still holds the older 2026-08-29 publication (985,533 transactions) and is frozen. While Neon is selected, refreshing D1 does not change what the site serves; a new publication has to go to Neon, followed by a new `NEON_PUBLIC_CACHE_EPOCH`. The last D1-selected Worker version is `a93c380f-1a7a-4a15-868e-4cd8a70c549e`.

## Switching and rolling back

1. Switch: set `PUBLIC_DATA_BACKEND` to `"neon"` and a **new** `NEON_PUBLIC_CACHE_EPOCH` in `wrangler.jsonc`, deploy. The `HDB_PUBLIC_NEON` binding stays in the committed configuration permanently (with its local placeholder, see above), so a switch is a variable change. A Worker that selects Neon without that binding fails every public read with a `500`, which is why the configuration test requires the binding whenever Neon is selected.
2. Fastest rollback: `wrangler rollback <version-id> --name hdb-resale-visualizer` to a D1-selected version (for the 2026-10-07 switch, `a93c380f-1a7a-4a15-868e-4cd8a70c549e`). It takes effect within seconds, needs no build, and was rehearsed in both directions before the switch.
3. Rollback by configuration: set `PUBLIC_DATA_BACKEND` back to `"d1"`, change `D1_PUBLIC_CACHE_EPOCH`, deploy.

D1 and Neon hold different publications until D1 is refreshed. Rolling back to D1 returns to D1's data, not a Neon snapshot; nothing is copied back. Browsers and the service worker can keep a response for up to its `max-age` (public API responses use 60 s; the PWA runtime cache keeps API responses for offline use), so a switch is not instantaneous for already-open clients.

## Verifying what is being served

The two backends hold different publications, so `GET /api/manifest` identifies the backend (`generatedAt` and `counts.transactions`). `x-data-cache` reports `MISS`, `HIT` or `HIT-AFTER-VERSION-READ` for cacheable public API routes. `HIT-STALE` and `BYPASS` appear while a D1 publication is running, and for as long as an aborted one is left unfinished; `BYPASS-UNREADABLE` means the stored manifest is not a JSON object, `BYPASS-NO-MANIFEST` that none has been published, `BYPASS-UNSTABLE` that the manifest changed while the request was being answered (a publication started or finished mid-request), `BYPASS-UNLABELLED` that a single-statement route (`GET /api/nearby-places`, which reads its answer and the publication it belongs to in one statement instead of reading the manifest before and after) produced no publication label, because a limit refused it, the input was invalid, the backend has no PostGIS or the query failed, so nothing was stored, and `ERROR` that the cache layer itself failed. The header is absent for `HEAD`, `Cookie`/`Authorization` requests and `POST`.
