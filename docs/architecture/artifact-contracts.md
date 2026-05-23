# Artifact Contracts

This project enforces a strict build-time/runtime contract. Data flows are:

```
data.gov.sg / OneMap  →  scripts/sync-data.ts  →  Cloudflare D1  →  functions/api/*  →  src/
                                  (Node CI)              (DB)         (Pages Functions)   (React)
```

## Producer (build-time)
- Entry: `scripts/sync-data.ts`
- Core pipeline logic: `scripts/lib/pipeline.ts`
- Persistence: `scripts/lib/sync/store.ts` (writes D1 via the Cloudflare HTTP API)
- Output target: Cloudflare D1 (`hdb-resale` database)
- Persistent caches (one-time per row): `geocode_cache`, `walking_time_cache`

## Runtime serving (Pages Functions)
- Function root: `functions/api/*`
- Shared helpers + row → DTO mapping: `functions/_lib/d1.ts`
- D1 binding: `DB` (declared in `wrangler.toml`)

## Consumer (browser)
- Runtime data access: `src/lib/data.ts`
- Type contracts: `shared/data-types.ts`
- Validation: Zod schemas in `src/lib/dataSchemas.ts` (unchanged from the previous static-artifact contract)

## API Surface (`functions/api/*`)
| Path | Function | DTO |
|---|---|---|
| `/api/manifest` | `manifest.ts` | `Manifest` |
| `/api/block-summaries` | `block-summaries.ts` | `BlockSummary[]` |
| `/api/blocks/{townSlug}` | `blocks/[town].ts` | `BlockSummary[]` |
| `/api/details/{addressKey}` | `details/[addressKey].ts` | `AddressDetail` |
| `/api/comparisons/{addressKey}` | `comparisons/[addressKey].ts` | `ComparisonArtifact` (404 when unavailable) |
| `/api/trends/town-flat-type` | `trends/town-flat-type.ts` | `TownFlatTypeTrendPoint[]` |
| `/api/mrt-stations` | `mrt-stations.ts` | GeoJSON FeatureCollection |
| `/api/mrt-exits` | `mrt-exits.ts` | GeoJSON FeatureCollection |

## Rules
1. The browser must only fetch `/api/*` (same-origin Pages Functions). No `fetch()` to data.gov.sg or OneMap from `src/`.
2. Geocoding and proximity metrics are computed in `scripts/` only and persisted to D1; the cache tables are upserted, never truncated.
3. Shared data structures must live in `shared/` and be imported by both `scripts/` and `src/`.
4. D1 schema changes are forward-only: add a new file to `migrations/`, never edit a previously-applied migration.

## Enforcement Checks
### Script/runtime boundary enforcement
- Command: `npm run check:boundaries`
- Validator: `scripts/check-boundaries.ts`
- Scope: recursively traverses import graphs starting from `scripts/` entry files and fails on:
  - any reachable module under `src/`
  - Vite runtime alias usage (`@/`, `@shared/`) in Node-executed module graphs

This prevents accidental coupling where build-time jobs depend on browser/runtime modules.
