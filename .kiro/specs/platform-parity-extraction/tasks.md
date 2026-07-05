# Tasks: Platform Parity Extraction

> Execution checklist. Order respects dependencies: shared types →
> search profile → filtering → filter pipeline → affordability →
> adapters → tests → boundary checks → docs.

## Phase 1 — Shared search profile module

- [x] **T1.1** Create `shared/product/search-profile.ts`: export
  `SearchProfile`, `SearchProfilePatch`, `MatchTier`, `DimensionMatch`,
  `ProfileEvaluation` types and `evaluateBlockForProfile`,
  `createProfileEvaluator`, `isProfileVisibilityActive`,
  `applyProfileVisibility` functions. Import `MAX_LEASE_DURATION`
  from `./lease`. All functions take explicit `currentYear`.
  → `vp run typecheck` passes. (R1.1, R1.2, R1.3)

- [x] **T1.2** Update `src/types/searchProfile.ts` to re-export
  `SearchProfile` and `SearchProfilePatch` from
  `@shared/product/search-profile`.
  → Existing imports continue to work. (R9.1)

- [x] **T1.3** Update `src/features/search-profile/matchProfile.ts`
  to wrap shared functions with `getCurrentYear()` defaults.
  → Existing tests pass. (R1.4, R9.2)

## Phase 2 — Shared filtering module

- [x] **T2.1** Create `shared/product/search-aliases.ts`: export
  `resolveMultilingualSearchAliases` with pre-sorted alias tables at
  module level.
  → `vp run typecheck` passes. (R4.1, R4.2)

- [x] **T2.2** Create `shared/product/filtering.ts`: export
  `GeographicSearchIntent`, `FilterEvaluationContext`, `AffordabilityMode`
  types and `matchesFilter`, `resolveGeographicSearchIntent`,
  `matchesGeographicSearchIntent`, `getEffectiveMedianPrice`,
  `getEffectivePricePerSqmMedian`, `createFilterEvaluationContext`,
  `resetFilteringCachesForTests` functions. Import
  `resolveMultilingualSearchAliases` from `./search-aliases`.
  → `vp run typecheck` passes. (R2.1–R2.7)

- [x] **T2.3** Update `src/shared/lib/filtering.ts` to re-export from
  shared and add affordability caching integration.
  → Existing tests pass. (R9.3)

- [x] **T2.4** Update `src/shared/lib/i18n/domain.ts` to re-export
  `resolveMultilingualSearchAliases` from `@shared/product/search-aliases`.
  → Existing tests pass. (R4.3, R9.5)

## Phase 3 — Shared filter pipeline module

- [x] **T3.1** Create `shared/product/filter-pipeline.ts`: export
  `filterScopedBlocks`, `computeMapFilteredBlocks`, `hasResultScope`,
  `hasMapMarkerScope`.
  → `vp run typecheck` passes. (R3.1–R3.3)

- [x] **T3.2** Update `src/hooks/useFilterPipeline.ts` to use shared
  pure functions for deterministic filter/map/list semantics.
  → Existing tests pass. (R3.4)

## Phase 4 — Shared affordability helpers

- [x] **T4.1** Update `shared/product/affordability.ts`: add
  `isAffordabilityProfileComplete` and `passesAffordabilityMode`.
  Import `AffordabilityMode` and `BlockSummary` from `../data-types`.
  → `vp run typecheck` passes. (R5.1, R5.2)

- [x] **T4.2** Update `src/shared/lib/affordability.ts` to wrap shared
  `passesAffordabilityMode` with WeakMap verdict caching.
  → Existing tests pass. (R5.3, R9.4)

- [x] **T4.3** Update `shared/product/index.ts` to re-export new
  modules.
  → `vp run typecheck` passes.

## Phase 5 — Shared-core tests

- [x] **T5.1** Create `tests/unit/shared-search-profile.test.ts`: 20
  tests covering all shared search-profile functions with deterministic
  `currentYear`.
  → `vp run test` passes. (R8.1)

- [x] **T5.2** Create `tests/unit/shared-filtering.test.ts`: 32 tests
  covering `matchesFilter` all dimensions, geographic search intent,
  effective median price, cache reset.
  → `vp run test` passes. (R8.2)

- [x] **T5.3** Create `tests/unit/shared-filter-pipeline.test.ts`: 10
  tests covering `filterScopedBlocks`, `computeMapFilteredBlocks`,
  scope detection.
  → `vp run test` passes. (R8.3)

## Phase 6 — Golden fixtures and parity tests

- [x] **T6.1** Expand `tests/fixtures/platform-parity/product-core-golden.json`
  with search profile, stretch budget, commute proxy, filter, geographic
  search, and effective price scenarios.
  → `vp run test` passes. (R7.1–R7.6)

- [x] **T6.2** Expand `tests/unit/product-core-parity.test.ts` from 3
  to 11 test cases covering all new golden fixture scenarios.
  → `vp run test` passes. (R8.4)

## Phase 7 — Boundary checks

- [x] **T7.1** Update `scripts/check-boundaries.ts` to add
  `shared/product/**` rule: reject imports from `src/`, Vite aliases,
  and browser-only packages.
  → `vp run check:boundaries` passes. (R6.1, R6.2)

- [x] **T7.2** Handle missing `shared/product/` directory gracefully
  for test workspaces.
  → `tests/unit/check-boundaries.test.ts` passes. (R6.3)

## Phase 8 — Documentation

- [x] **T8.1** Update `docs/architecture/platform-parity.md` with
  module table, web adapter pattern, expanded checklist, parity
  validation gate, fixture/drift guidelines.
  → File updated. (R10.1–R10.5)

## Phase 9 — Verification

- [x] **T9.1** `vp run format:check` — clean.
- [x] **T9.2** `vp run lint` — clean.
- [x] **T9.3** `vp run typecheck` — clean.
- [x] **T9.4** `vp run test` — 148 files, 1378 tests pass.
- [x] **T9.5** `vp run build` — production build succeeds.
- [x] **T9.6** `vp run check:boundaries` — passes (25 modules scanned).
