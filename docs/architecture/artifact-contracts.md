# Artifact Contracts

This project enforces a strict build-time/runtime contract. Data flows are:

```
data.gov.sg / OneMap  →  scripts/sync-data.ts  →  Cloudflare D1  →  Worker + functions/api/*  →  src/
                                  (Node sync)             (DB)          (same-origin API)       (React)
```

Automatic nightly refresh is **disabled**. `scripts/sync-data.ts` still writes remote D1 when a maintainer runs it, but there is no scheduled `refresh-data.yml` job. The production dataset stays at the last successful sync until someone runs `vp run sync-data` with Cloudflare and upstream credentials.

## Producer (build-time)

- Entry: `scripts/sync-data.ts`
- Core pipeline logic: `scripts/lib/pipeline.ts`
- Persistence: `scripts/lib/sync/store.ts` (writes **remote** D1 via the Cloudflare HTTP API — not the local Wrangler emulator)
- Output target: Cloudflare D1 (`hdb-resale` database)
- Persistent caches (one-time per row): `geocode_cache`, `walking_time_cache`
- Generated tables rebuilt on each sync: `manifest`, `blocks`, `block_details`, `comparisons`, `town_flat_type_trends`, `mrt_geojson`, `transactions`

`transactions` is the listing-check evidence table (one row per registered resale). `storey_midpoint` and `price_per_sqm` are derived at read time in `functions/api/comparable-transactions.ts`; they are not stored columns.

## Runtime serving (Worker-routed API handlers)

- Worker router: `worker/index.ts` (`matchApiRoute` in `worker/api-route-match.ts`)
- Reused handler root: `functions/api/*`
- Shared helpers + row → DTO mapping: `functions/_lib/d1.ts`
- Public reads: the `PublicData` boundary in `functions/_lib/public-data.ts`, implemented for D1 (`worker/public-data-d1.ts`) and Neon (`worker/public-data-neon.ts`) and selected per request (see [public-read backend](public-read-backend.md)); responses do not depend on the backend
- D1 binding: `DB` (declared in `wrangler.jsonc`); Neon through the Hyperdrive binding `HDB_PUBLIC_NEON`

HEAD is treated as GET. Unknown methods on a matched path return **405** with `Allow`.

## Consumer (browser)

- Runtime data access: `src/shared/lib/data.ts` (`API_BASE_PATH` = `/api`)
- Type contracts: `shared/data-types.ts`
- Validation: Zod schemas in `src/shared/lib/dataSchemas.ts`

Listing Check POSTs to `/api/comparable-transactions` from `src/features/listing-check/useListingCheckAnalysis.ts` rather than through `data.ts`. Shortlist cloud sync uses `functions/api/shortlist/*` from `src/features/shortlist/`.

## API surface (`functions/api/*`)

| Method | Path                            | Handler                       | Contract                                                                              |
| ------ | ------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/manifest`                 | `manifest.ts`                 | `Manifest` (data window, `generatedAt`, source ids, counts)                           |
| GET    | `/api/block-summaries`          | `block-summaries.ts`          | `BlockSummary[]`                                                                      |
| GET    | `/api/blocks/{townSlug}`        | `blocks/[town].ts`            | `BlockSummary[]` for one town (`townToFilename()` from `shared/geo.ts`)               |
| GET    | `/api/details/{addressKey}`     | `details/[addressKey].ts`     | `AddressDetail`; 404 if unknown                                                       |
| GET    | `/api/comparisons/{addressKey}` | `comparisons/[addressKey].ts` | `ComparisonArtifact`; 404 when amenity data was unavailable                           |
| GET    | `/api/trends/town-flat-type`    | `trends/town-flat-type.ts`    | `TownFlatTypeTrendPoint[]`                                                            |
| GET    | `/api/mrt-stations`             | `mrt-stations.ts`             | GeoJSON FeatureCollection                                                             |
| GET    | `/api/mrt-exits`                | `mrt-exits.ts`                | GeoJSON FeatureCollection                                                             |
| GET    | `/api/search`                   | `search.ts`                   | Filtered `BlockSummary[]` plus `truncated`, `limit` (2000), `cohortMetadataAvailable` |
| GET    | `/api/suggest`                  | `suggest.ts`                  | `{ suggestions }` — ranked typeahead                                                  |
| POST   | `/api/comparable-transactions`  | `comparable-transactions.ts`  | Listing comparable set; optional `?adjust=time`                                       |
| POST   | `/api/shortlist`                | `shortlist/index.ts`          | Create or replace a cloud shortlist                                                   |
| GET    | `/api/shortlist/{syncCode}`     | `shortlist/[syncCode].ts`     | `{ items }`; 404 for unknown **or** malformed codes                                   |

`blocks.flat_type_cohorts_json` (added forward-only by
`migrations/0011_block_flat_type_cohorts.sql`) keeps each flat type's price,
floor-area, model, sample-size, and recency facts on one evidence cohort.
Advanced selected-type refinements are enabled only when every row in the
current corpus has that metadata; an absent or partially backfilled column
fails closed rather than mixing block-wide and selected-type evidence.

### Search (`GET /api/search`)

Query params:

- Text: `town`, `flatType`, `flatModel`, `startMonth`, `endMonth`. Each value is capped at 256 characters and a longer value is rejected.
- Numeric: `budgetMin`, `budgetMax`, `areaMin`, `areaMax`, `mrtMax`, `remainingLeaseMin`. These have no length cap. A value that is not a finite number is ignored, so that filter is simply not applied.

Server-side predicates stop at those columns. **Text / geographic search and CPF-based affordability stay client-side** (`SEARCH_PREDICATE_OWNERSHIP` in `functions/_lib/search.ts`). The handler returns at most 2000 rows and sets `truncated` when more matched.

Selected-type refinements that need `flat_type_cohorts_json` return no rows when that column is missing or only partially backfilled.

### Suggest (`GET /api/suggest?q=`)

- Query must be 2–256 characters after normalization (`functions/_lib/suggest.ts`).
- Groups: `town`, `street`, `block`, `mrt`, `postal`. Caps are 3/3/3/2/2 with a total of 10.
- Ranking is exact → prefix → substring. A few static aliases (for example `amk` → `ang mo kio`) are applied before matching.
- The browser skips fetches shorter than 2 characters and LRU-caches successful responses (`src/shared/lib/data.ts`).

### Comparable transactions (`POST /api/comparable-transactions`)

- JSON body is a `CandidateListing`: town, block, street, flat type, storey range, floor area, optional lease year, `referenceMonth` (`YYYY-MM`). Body cap is 8 KB.
- The handler widens block → street → town on the `transactions` table, then scores with `shared/comparable-engine.ts`. Price is never a selection input.
- `?adjust=time` (the Check tab always sends this) time-adjusts prices using `town_flat_type_trends`. If trends are missing, the response still includes `adjustmentApplied: false` and caveats instead of silently using raw prices.

### Shortlist sync (only runtime D1 write path for user data)

- `POST /api/shortlist` body: `{ syncCode?: string, items: ShortlistItem[] }` (max 20 items, 64 KB). Omit `syncCode` to mint a new 128-bit URL-safe code.
- Server stores only `SHA-256(syncCode)`. The raw code is returned once and kept in the browser (`hdb_resale_sync_code_v1`).
- Push **replaces** the stored items and the Worker does not merge. On pull/link the client unions local and cloud items by `addressKey`, and the newer `addedAt` wins per key. There are no deletion markers, so a deletion is not guaranteed to survive: a device that still holds the item locally restores it on its next hydrate.
- Rate limit: 10 POSTs per client IP per colo per 60 seconds (`SHORTLIST_WRITE_LIMITER` in `wrangler.jsonc`).
- There is **no DELETE**. Disabling sync locally leaves the D1 row. The Worker cron (`0 3 * * *`, 03:00 UTC) purges rows whose `updated_at` is older than 180 days.

## Worker-owned routes (not `functions/api/*`)

| Path                                          | Behaviour                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /robots.txt`                             | Allows `/` and points at `/sitemap.xml`                                 |
| `GET /sitemap.xml`                            | Town + every block URL; paginates D1 past the 10k-row cap; cached       |
| `GET /og/block/{addressKey}.png`              | Dynamic Open Graph image                                                |
| `GET /og/compare/{townA}/{townB}.png`         | Town-compare Open Graph image                                           |
| HTML with `town` / `selected` / `compareTown` | `HTMLRewriter` injects title, description, canonical, JSON-LD, og:image |

Static assets fall through to `dist/` with SPA `not_found_handling`.

## Rules

1. The browser must only fetch same-origin `/api/*` routes served by the Worker. No `fetch()` to data.gov.sg or OneMap from `src/`.
2. Geocoding and proximity metrics are computed in `scripts/` only and persisted to D1; the cache tables are upserted, never truncated.
3. Shared data structures must live in `shared/` and be imported by both `scripts/` and `src/`.
4. D1 schema changes are forward-only: add a new file to `migrations/`, never edit a previously-applied migration.
5. The only runtime D1 write path for user data is opt-in shortlist sync. Do not add other user-data writes. The disabled nearby route introduces no D1 budget table, write role or counter.

## Enforcement Checks

### Script/runtime boundary enforcement

- Command: `vp run check:boundaries`
- Validator: `scripts/check-boundaries.ts`
- Scope: recursively traverses import graphs starting from `scripts/` entry files and fails on:
  - any reachable module under `src/`
  - Vite runtime alias usage (`@/`, `@shared/`) in Node-executed module graphs

This prevents accidental coupling where build-time jobs depend on browser/runtime modules.
