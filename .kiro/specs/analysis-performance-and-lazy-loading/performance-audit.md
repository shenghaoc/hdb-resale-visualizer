# Performance Audit: Analysis Performance and Lazy Loading

## Baseline capture (required before final sign-off)

- `npm run build`
- `npm run check:bundle`
- `npm run test`
- `npm run lint`
- `npm run test:e2e` trace scenario:
  - results filter typing + toggle states
  - map pan/zoom while filters are active
  - listing check request -> table render
- Runtime telemetry from `src/lib/performance.ts`:
  - INP
  - LCP
  - CLS

## Current observed bottlenecks

1. `useFilterPipeline` previously recomputed fuse-matched candidate checks across repeated renders; now memoized by search/path with stable filter identities.
2. Listing comparable transforms and confidence aggregates in `ListingCheckPanel` were previously performed inline during result derivation; now extracted into memoized helpers.
3. Map sync hooks could issue redundant `setData` and layer visibility updates during `styledata`; now guarded by source/layer identity and visibility signatures.
4. Comparable table remains non-virtualized and can still render full rows for large payloads when opened.

## Before/after notes

- Before: this section is reserved for measured deltas after Phase 8 baselines are captured in CI.
- After: compare baseline vs current run outputs for:
  - comparable fetch-to-verdict end-to-end latency
  - filter-change-to-results latency (desktop/mobile)
  - average table frame cost for large comparable payloads
  - map pan/zoom interaction frame stability during active filtering

## Heavy dependency decision status

- `@tanstack/react-virtual`: approved for thresholded table virtualization once profiling shows row virtualization is required.
- Web Workers: approved for clearly measured, repeatable CPU-bound comparable ranking/aggregation transforms.
- Comlink: not yet used; add only if worker message surface becomes complex.
- DuckDB-WASM / Arquero: explicitly out of scope for this phase.
