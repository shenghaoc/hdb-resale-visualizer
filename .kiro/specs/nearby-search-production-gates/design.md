# Design: Block-only PostGIS nearby endpoint

**Status:** `NEON_SPATIAL_MODE` is `off` or `blocks`. In `blocks` the endpoint answers the nearest MRT exits to one published HDB block and nothing else. The prior D1 and Neon daily-counter proposals stay rejected (#431 was closed without merging): a refusal there spent a statement of the allowance it protected. The global budget is a Durable Object, whose refusals spend none.

## Request path

```text
request  GET /api/nearby-places?block=<address_key>
 -> NEON_SPATIAL_MODE (off: 503, no query)
 -> NEARBY_IP_LIMITER (30 requests / minute / client, fail closed)
 -> public cache, one key per block and publication (HIT: zero SQL, no Durable Object)
 -> validate request (400 for coordinates or anything but one block key; 503 if the backend has no PostGIS)
 -> published block list (404 for an unknown block; no nearby statement)
 -> NEARBY_ORIGIN_LIMITER (300 cache misses / minute / location, fail closed)
 -> NEARBY_BUDGET (20,000 statements / UTC day, one global Durable Object, fail closed)
 -> one parameterized PostGIS labelled SELECT that looks the block's location up itself
 -> version-scoped cache, or uncached 503/500
```

The atomic labelled query returns a publication hash and places in one SQL snapshot, avoiding two manifest reads per nearby miss. Other public routes retain their existing cache behaviour. The SQL and response ordering remain independently verified. No quota table, reservation function, second Hyperdrive connection or write-capable runtime role is introduced.

**Rate limits are not a global quota; the daily budget is.** The 300/minute/location origin setting can theoretically permit 432,000 misses per day per location if continually driven, and Cloudflare allows 100,000 total Hyperdrive statements per day on Free. `NearbyDailyBudget` (`worker/nearby-budget.ts`) is one SQLite-backed Durable Object addressed by a fixed name from every location. It grants a statement while the UTC day's count is below 20,000, records it before granting, and resets when the UTC date changes. The Worker treats every failure of it as a refusal.

**Why the request space matters.** The budget bounds a day; the cache needs a small key space to be useful. Block-only requests have about 9,700 keys (the published block list), against roughly a billion for snapped coordinates, so ordinary use is served from the cache and a full walk costs one statement per block per location and publication. That is why coordinates are refused rather than limited.

## Isolated verification

The deployed-path harness is not in the repository. Its last version is commit `c7b2f6b` in this pull request's history, with its [runbook](https://github.com/shenghaoc/hdb-resale-visualizer/blob/c7b2f6b91be4e135d26757d999eb86cf09bb1e33/tests/deployed-path/README.md), and has three parts:

- [`local-rehearsal.mjs`](https://github.com/shenghaoc/hdb-resale-visualizer/blob/c7b2f6b91be4e135d26757d999eb86cf09bb1e33/tests/deployed-path/local-rehearsal.mjs) runs a real workerd Worker against a **uniquely named scratch PostgreSQL/PostGIS database** and checks exact SQL results, the 30-request client limit (`429`), the origin limit (`503`), cached answers and the reader's statement counts. Its scratch helper refuses preexisting database names and drops only its own database, never with FORCE.
- [`wrangler.deployed.template.jsonc`](https://github.com/shenghaoc/hdb-resale-visualizer/blob/c7b2f6b91be4e135d26757d999eb86cf09bb1e33/tests/deployed-path/wrangler.deployed.template.jsonc) binds one disposable fork-scoped SELECT-only Hyperdrive config with unique limiter namespaces and no D1 database. The temporary Worker selects its mode in its own configuration.
- [`verify-client.mjs`](https://github.com/shenghaoc/hdb-resale-visualizer/blob/c7b2f6b91be4e135d26757d999eb86cf09bb1e33/tests/deployed-path/verify-client.mjs) checks the functional, client-limit, origin-limit and latency phases. It never holds database credentials.

Independent direct SQL remains `sql/neon/verify_nearby_spatial_sql.sql`. The parked harness predates block-only mode and sends coordinate requests, so it needs adapting before it is used again.

## Relation to publish-time MRT exits

The block-detail UI is a fixed 1,500-metre query around one of the known blocks, which is exactly what block-only mode answers at run time. Publishing the same five results with the block detail (prototyped in the closed draft #432, planned in the serving-refresh spec) would remove the runtime query altogether and remains an option; until then the drawer calls this endpoint with the block's address key.
