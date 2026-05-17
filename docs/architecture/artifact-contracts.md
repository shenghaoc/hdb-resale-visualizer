# Artifact Contracts

This project enforces a strict build-time/runtime contract.

## Producer (build-time)
- Entry: `scripts/sync-data.ts`
- Core pipeline logic: `scripts/lib/pipeline.ts`
- Output target: `public/data/`

## Consumer (runtime)
- Runtime data access: `src/lib/data.ts`
- Type contracts: `shared/data-types.ts`

## Contracted Artifacts
- `public/data/manifest.json`
- `public/data/block-summaries.json`
- `public/data/blocks/{town}.json`
- `public/data/details/{addressKey}.json`
- `public/data/comparisons/{addressKey}.json`
- `public/data/trends/town-flat-type.json`
- `public/data/mrt-exits.geojson`

### `public/data/trends/town-flat-type.json`

JSON array of **town × flat type × month** resale summaries. Each row: `town`, `flatType`, `month` (`YYYY-MM`), `medianPrice`, `medianPricePerSqm` (median of resale `pricePerSqm` within that slice), and `transactionCount`. Used for the town overview and validated at runtime by `townFlatTypeTrendPointSchema` in `src/lib/dataSchemas.ts`.

## Rules
1. Runtime must only load files from `public/data/`.
2. Coordinates and proximity metrics must be precomputed in `scripts/`.
3. Shared artifact data structures must live in `shared/` and be imported by both `scripts/` and `src/`.
4. Generated artifacts are source-of-truth; frontend should not derive conflicting canonical values.

## Enforcement Checks

### Script/runtime boundary enforcement
- Command: `npm run check:boundaries`
- Validator: `scripts/check-boundaries.ts`
- Scope: recursively traverses import graphs starting from `scripts/` entry files and fails on:
  - any reachable module under `src/`
  - Vite runtime alias usage (`@/`, `@shared/`) in Node-executed module graphs

This prevents accidental coupling where build-time jobs depend on browser/runtime modules.

### Artifact presence enforcement
- Command: `npm run check:data`
- Validator: `scripts/check-data-artifacts.ts`
- Scope: ensures runtime-required artifacts exist before production build succeeds.

This protects runtime from missing static inputs and keeps deploy-time failures deterministic.
