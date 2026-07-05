# Requirements: Platform Parity Extraction

## R1 — Shared search profile module

- **R1.1** `SearchProfile` and `SearchProfilePatch` types are defined
  in `shared/product/search-profile.ts` and re-exported from
  `src/types/searchProfile.ts`.

- **R1.2** Profile matching functions (`evaluateBlockForProfile`,
  `createProfileEvaluator`, `isProfileVisibilityActive`,
  `applyProfileVisibility`) are defined in `shared/product/search-profile.ts`
  with explicit `currentYear` parameters.

- **R1.3** `computeRemainingLeaseYears` uses `MAX_LEASE_DURATION` from
  `shared/product/lease.ts`, not from `src/shared/lib/constants`.

- **R1.4** `src/features/search-profile/matchProfile.ts` becomes a thin
  adapter that wraps shared functions with `getCurrentYear()` defaults.

## R2 — Shared filtering module

- **R2.1** The main filter predicate (`matchesFilter`) is defined in
  `shared/product/filtering.ts` and covers: town, budget min/max, area
  range, remaining lease, date range, MRT distance, flat type, flat
  model, affordability, and text search.

- **R2.2** Geographic search intent resolution (`resolveGeographicSearchIntent`)
  is defined in `shared/product/filtering.ts` and handles: station
  intent from cue words, coordinate intent, near-me intent, town-name
  suppression, and alias-mapped station names.

- **R2.3** `matchesGeographicSearchIntent` handles both coordinate
  radius (with bounding box fast-path) and station name matching
  (nearestMrt + nearbyMrts).

- **R2.4** `getEffectiveMedianPrice` and `getEffectivePricePerSqmMedian`
  return flat-type-specific medians when the filter is active, falling
  back to overall block median.

- **R2.5** `createFilterEvaluationContext` takes explicit `currentYear`
  instead of calling `getCurrentYear()`.

- **R2.6** All caches are module-level and resettable via
  `resetFilteringCachesForTests()`.

- **R2.7** `src/shared/lib/filtering.ts` becomes a thin adapter that
  re-exports from shared and adds the affordability caching integration.

## R3 — Shared filter pipeline module

- **R3.1** `filterScopedBlocks` is a pure function that filters blocks
  against filters, geographic intent, affordability, and Fuse.js keys.

- **R3.2** `computeMapFilteredBlocks` includes the selected-address
  inclusion semantics (appends selected block if not already in filtered
  set).

- **R3.3** `hasResultScope` and `hasMapMarkerScope` are pure boolean
  computations derived from filter state.

- **R3.4** `src/hooks/useFilterPipeline.ts` uses shared pure functions
  for deterministic filter/map/list semantics.

## R4 — Search alias resolver

- **R4.1** `resolveMultilingualSearchAliases` is defined in
  `shared/product/search-aliases.ts` as a pure function with static
  alias tables.

- **R4.2** Aliases are pre-sorted at module level (longest first) to
  avoid re-sorting on every invocation.

- **R4.3** `src/shared/lib/i18n/domain.ts` re-exports the resolver
  from shared.

## R5 — Shared affordability helpers

- **R5.1** `isAffordabilityProfileComplete` is defined in
  `shared/product/affordability.ts`.

- **R5.2** `passesAffordabilityMode` is defined in
  `shared/product/affordability.ts` and imports `AffordabilityMode`
  and `BlockSummary` from `../data-types`.

- **R5.3** `src/shared/lib/affordability.ts` wraps the shared version
  with WeakMap verdict caching for the hot filter loop.

## R6 — Boundary enforcement

- **R6.1** `scripts/check-boundaries.ts` includes a `shared/product/**`
  rule that rejects imports from `src/`, Vite aliases, and browser-only
  packages (`react`, `react-dom`, `maplibre-gl`).

- **R6.2** Transitive shared imports that reach `src/` are also caught.

- **R6.3** The rule handles missing `shared/product/` directory
  gracefully (for test workspaces).

## R7 — Golden parity fixtures

- **R7.1** `tests/fixtures/platform-parity/product-core-golden.json`
  includes search profile scenarios for strong, good, stretch, and
  weak tiers.

- **R7.2** Stretch budget scenarios cover within-ceiling, beyond-ceiling,
  and within-primary-budget.

- **R7.3** Commute proxy scenarios cover pass, stretch, fail, and
  no-data.

- **R7.4** Filter scenarios cover town, flat type, budget min/max,
  remaining lease, MRT distance, and date range.

- **R7.5** Geographic search scenarios cover station match/no-match and
  coordinate match/no-match.

- **R7.6** Effective price scenarios cover flat-type-specific median,
  fallback to overall, and no-filter.

## R8 — Shared-core tests

- **R8.1** `tests/unit/shared-search-profile.test.ts` covers
  `computeRemainingLeaseYears`, `createProfileEvaluator`,
  `evaluateBlockForProfile`, `isProfileVisibilityActive`,
  `applyProfileVisibility` with deterministic `currentYear`.

- **R8.2** `tests/unit/shared-filtering.test.ts` covers `matchesFilter`
  all dimensions, `resolveGeographicSearchIntent`, `matchesGeographicSearchIntent`,
  `getEffectiveMedianPrice`, `getEffectivePricePerSqmMedian`,
  `resetFilteringCachesForTests`.

- **R8.3** `tests/unit/shared-filter-pipeline.test.ts` covers
  `filterScopedBlocks`, `computeMapFilteredBlocks`,
  `hasResultScope`, `hasMapMarkerScope`.

- **R8.4** `tests/unit/product-core-parity.test.ts` covers all new
  golden fixture scenarios.

## R9 — Backward compatibility

- **R9.1** `src/types/searchProfile.ts` re-exports from shared;
  existing imports continue to work.

- **R9.2** `src/features/search-profile/matchProfile.ts` preserves
  existing function signatures with `getCurrentYear()` defaults.

- **R9.3** `src/shared/lib/filtering.ts` preserves existing function
  signatures including the affordability integration.

- **R9.4** `src/shared/lib/affordability.ts` preserves existing
  function signatures including the WeakMap caching.

- **R9.5** `src/shared/lib/i18n/domain.ts` preserves existing
  `resolveMultilingualSearchAliases` export.

- **R9.6** Existing tests pass without modification (except import
  path updates if needed).

## R10 — Documentation

- **R10.1** `docs/architecture/platform-parity.md` includes a module
  table listing all `shared/product/` modules and their purposes.

- **R10.2** The web adapter pattern is documented with examples.

- **R10.3** The future macOS/native checklist includes shared-core test
  requirements.

- **R10.4** The parity validation gate lists all required commands.

- **R10.5** Guidelines for adding new golden fixtures and detecting
  product logic drift are documented.
