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

## Switching and rolling back

1. Switch: set `PUBLIC_DATA_BACKEND` to `"neon"`, set a **new** `NEON_PUBLIC_CACHE_EPOCH`, deploy.
2. Fastest rollback: promote the previous Worker version (`wrangler rollback`). Versions that predate a switch default to D1.
3. Rollback by configuration: set `PUBLIC_DATA_BACKEND` back to `"d1"`, change `D1_PUBLIC_CACHE_EPOCH`, deploy.

D1 and Neon hold different publications until D1 is refreshed. Rolling back to D1 returns to D1's data, not a Neon snapshot; nothing is copied back. Browsers and the service worker can keep a response for up to its `max-age` (public API responses use 60 s; the PWA runtime cache keeps API responses for offline use), so a switch is not instantaneous for already-open clients.

## Verifying what is being served

The two backends hold different publications, so `GET /api/manifest` identifies the backend (`generatedAt` and `counts.transactions`). `x-data-cache` reports `MISS`, `HIT` or `HIT-AFTER-VERSION-READ` for cacheable public API routes and is absent for `HEAD`, `Cookie`/`Authorization` requests and `POST`.
