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

## Rules
1. Runtime must only load files from `public/data/`.
2. Coordinates and proximity metrics must be precomputed in `scripts/`.
3. Shared artifact data structures must live in `shared/` and be imported by both `scripts/` and `src/`.
4. Generated artifacts are source-of-truth; frontend should not derive conflicting canonical values.
