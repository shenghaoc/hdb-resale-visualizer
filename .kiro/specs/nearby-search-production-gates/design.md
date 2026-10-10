# Design: Disabled but verifiable PostGIS nearby endpoint

**Status:** The spatial search remains production-disabled. The prior D1 and Neon daily-counter proposals were rejected; #431 was closed without merging. The fixed block-detail MRT UI is being migrated to publish-time data in draft #432.

## Request path

```text
request
 -> NEON_SPATIAL_ENABLED (production false; 503, no query)
 -> NEARBY_IP_LIMITER (30 requests / minute / client, fail closed)
 -> public cache (HIT: zero SQL)
 -> validate request (400 or 503 for invalid/backend unavailable)
 -> NEARBY_ORIGIN_LIMITER (300 cache misses / minute / location, fail closed)
 -> one parameterized PostGIS labelled SELECT through the existing read-only Hyperdrive binding
 -> version-scoped cache, or uncached 503/500
```

The atomic labelled query returns a publication hash and places in one SQL snapshot, avoiding two manifest reads per nearby miss. Other public routes retain their existing cache behaviour. The SQL and response ordering remain independently verified. No quota table, reservation function, second Hyperdrive connection or write-capable runtime role is introduced.

**Rate limits are not a global quota.** The 300/minute/location origin setting can theoretically permit 432,000 misses per day per location if continually driven. Cloudflare allows 100,000 total Hyperdrive statements per day on Free; no publicly exposed route is safe solely on these settings. A future globally enforceable control must be separately designed, approved and measured, including rejected requests.

## Isolated verification

- `tests/deployed-path/local-rehearsal.mjs` runs a real workerd Worker against a **uniquely named scratch PostgreSQL/PostGIS database** and checks exact SQL results, 30-client-limit `429`, origin-limit `503`, cached answers and observed reader statement counts. The scratch helper refuses preexisting database names and drops only its own database, never with FORCE.
- `tests/deployed-path/wrangler.deployed.template.jsonc` binds one disposable fork-scoped SELECT-only Hyperdrive config with unique limiter namespaces; it does not include a D1 database. Only the temporary Worker runs with the spatial gate enabled.
- `tests/deployed-path/verify-client.mjs` checks functional, client-limit, origin-limit and latency phases. It never holds database credentials.

Independent direct SQL remains `sql/neon/verify_nearby_spatial_sql.sql`. The deploy-path experiment is **not** approval for public activation. The production flag, serving branch, existing Hyperdrive config and D1 stay unchanged.

## Relation to publish-time MRT exits

The block-detail UI is a fixed 1,500-metre query around one of the known blocks; #432 derives and publishes its top-five results on the **serving child** after PostGIS migration 001 and before promotion. The general-purpose `GET /api/nearby-places` operation stays available for future arbitrary centres but has no current UI caller. Precomputation is not evidence of a global cost control for public spatial searches.
