# Design: Platform Parity Extraction

> Status: Complete. Deterministic buyer/filter/search/profile logic
> extracted from `src/` into `shared/product/` so a future native/macOS
> app can reuse the same platform-neutral logic without copying from the
> React layer.

## Problem

Deterministic buyer logic for search profiles, filtering, and geographic
search lived under `src/` and was therefore too coupled to the React web
app for a future native/macOS app to reuse safely:

1. **`src/features/search-profile/matchProfile.ts`** — profile matching
   (flat type / lease / budget / commute) imported `getCurrentYear()`
   from `src/shared/lib/constants` and `MAX_LEASE_DURATION` from the
   same web-owned module.

2. **`src/types/searchProfile.ts`** — `SearchProfile` and
   `SearchProfilePatch` types owned only by `src/`.

3. **`src/shared/lib/filtering.ts`** — filter predicate, geographic
   search intent, station matching, coordinate parsing, distance
   calculation, and effective median price helpers all lived in a
   web-coupled module that imported `resolveMultilingualSearchAliases`
   from `src/shared/lib/i18n/domain.ts` and `passesAffordabilityMode`
   from `src/shared/lib/affordability.ts`.

4. **`src/hooks/useFilterPipeline.ts`** — pure filter pipeline logic
   (block filtering, selected-address inclusion, scope detection) was
   interleaved with React hooks, debouncing, and URL state.

A native implementation would have had to either copy these modules
out of `src/` (risking drift) or import from the web layer (violating
platform boundaries).

## Goals

- Search profile types and matching logic live in `shared/product/`.
- Filter predicate and geographic search logic live in `shared/product/`.
- Pure filter-pipeline functions live in `shared/product/`.
- Multilingual search alias resolution lives in `shared/product/`.
- `src/` modules become thin adapters that supply `getCurrentYear()`
  defaults, affordability caching, and React orchestration.
- No duplicated business logic for extracted areas.
- Existing web behaviour is unchanged.
- Golden parity fixtures cover extracted behaviours.
- Boundary checks fail if `shared/product/` imports web-only code.

## Non-goals

- Build a native/macOS app.
- Add Tauri, Electron, Swift, SwiftUI, MapKit, SQLite, DuckDB.
- Redesign UI or alter map visuals.
- Alter API contracts or Cloudflare/D1 runtime behaviour.
- Replace MapLibre.
- Rewrite the app architecture wholesale.

## Architecture

### 1. New Module: `shared/product/search-profile.ts`

Platform-neutral search profile types and matching logic.

**Exports:**
- `SearchProfile`, `SearchProfilePatch` types
- `MatchTier`, `DimensionMatch`, `ProfileEvaluation` types
- `computeRemainingLeaseYears(leaseCommenceRange, currentYear)`
- `createProfileEvaluator(profile, currentYear)` → reusable evaluator
- `evaluateBlockForProfile(block, profile, currentYear)`
- `isProfileVisibilityActive(profile)`
- `applyProfileVisibility(blocks, profile, currentYear)`

All functions take `currentYear` as an explicit parameter (no
`getCurrentYear()` call). The web adapter supplies the default.

**Imports:** `BlockSummary` from `../data-types`, `MAX_LEASE_DURATION`
from `./lease`. No React, no browser globals.

### 2. New Module: `shared/product/filtering.ts`

Filter predicate, geographic search intent, station matching, and
effective median price helpers.

**Exports:**
- `GeographicSearchIntent` type
- `FilterEvaluationContext` type
- `AffordabilityMode` type
- `matchesFilter(block, filters, intent?, profile?, fuseKeys?, ctx?, passesAffordability?)`
- `resolveGeographicSearchIntent(query, blocks, radius, userLocation?, nearMeQuery?)`
- `matchesGeographicSearchIntent(block, intent)`
- `getEffectiveMedianPrice(block, flatType)`
- `getEffectivePricePerSqmMedian(block, flatType)`
- `createFilterEvaluationContext(currentYear)`
- `resetFilteringCachesForTests()`

**Key design decision:** `matchesFilter` accepts a pre-computed
`passesAffordability` boolean instead of importing the affordability
module. This keeps the shared predicate free of framework-specific
caching dependencies. The web adapter computes the boolean via its
cached `passesAffordabilityMode` wrapper.

All caches are module-level and resettable for deterministic tests.

**Imports:** `BlockSummary`, `Coordinates`, `FilterState` from
`../data-types`, `canonicalFlatType` from `../filter-options`,
`resolveMultilingualSearchAliases` from `./search-aliases`,
`MAX_LEASE_DURATION` from `./lease`.

### 3. New Module: `shared/product/filter-pipeline.ts`

Pure filter pipeline functions extracted from `useFilterPipeline`.

**Exports:**
- `filterScopedBlocks(blocks, filters, intent, profile, fuseKeys, ctx, passesAffordabilityFn)`
- `computeMapFilteredBlocks(blocks, filters, intent, profile, searchProfile, fuseKeys, selectedKey, blocksByKey, currentYear, passesAffordabilityFn)`
- `hasResultScope(town, search, intent, selectedKey)`
- `hasMapMarkerScope(town, search, intent)`

These are the deterministic cores of the React hook's filtering logic.
The hook becomes an adapter that feeds debounced/URL-resolved inputs
into these pure functions.

### 4. New Module: `shared/product/search-aliases.ts`

Multilingual (CJK) search alias resolver.

**Exports:**
- `resolveMultilingualSearchAliases(input)`

Pure static data + string transform. Aliases are pre-sorted at module
level (longest first) so the resolver doesn't re-sort on every
invocation.

### 5. Updated Module: `shared/product/affordability.ts`

Added platform-neutral affordability filter predicate.

**New exports:**
- `isAffordabilityProfileComplete(profile)`
- `passesAffordabilityMode(block, profile, mode)`

Imported `AffordabilityMode` and `BlockSummary` from `../data-types`.

### 6. Web Adapters

| Web module | Role |
|------------|------|
| `src/types/searchProfile.ts` | Re-exports `SearchProfile` from shared |
| `src/features/search-profile/matchProfile.ts` | Wraps shared evaluators with `getCurrentYear()` defaults |
| `src/shared/lib/filtering.ts` | Wraps shared `matchesFilter` with affordability caching |
| `src/shared/lib/affordability.ts` | Wraps shared affordability with WeakMap verdict caching |
| `src/shared/lib/i18n/domain.ts` | Re-exports `resolveMultilingualSearchAliases` from shared |

### 7. Boundary Checks

`scripts/check-boundaries.ts` extended with a `shared/product/**`
rule: must not import from `src/`, must not use Vite aliases (`@/`,
`@shared/`), must not import browser-only packages (`react`,
`react-dom`, `maplibre-gl`). Transitive shared imports that reach
`src/` are also caught.

## Testing

### New Shared-Core Tests

1. `tests/unit/shared-search-profile.test.ts` — 20 tests covering
   `computeRemainingLeaseYears`, `createProfileEvaluator`,
   `evaluateBlockForProfile`, `isProfileVisibilityActive`,
   `applyProfileVisibility` with deterministic `currentYear`.

2. `tests/unit/shared-filtering.test.ts` — 32 tests covering
   `matchesFilter` (town, budget, lease, area, MRT, date, flat type,
   affordability, text search), `resolveGeographicSearchIntent`
   (station, coordinate, near-me, town suppression),
   `matchesGeographicSearchIntent`, `getEffectiveMedianPrice`,
   `getEffectivePricePerSqmMedian`, cache reset.

3. `tests/unit/shared-filter-pipeline.test.ts` — 10 tests covering
   `filterScopedBlocks`, `computeMapFilteredBlocks` (selected-address
   inclusion), `hasResultScope`, `hasMapMarkerScope`.

### Expanded Golden Fixtures

`tests/fixtures/platform-parity/product-core-golden.json` expanded
with scenarios for:
- Search profile tiers (strong, good, stretch, weak)
- Stretch budget (within, beyond, primary)
- Commute proxy (pass, stretch, fail, no-data)
- Filter dimensions (town, flat type, budget, lease, MRT, date)
- Geographic search (station match/no-match, coordinate match/no-match)
- Effective median price (flat-type-specific, fallback, no-filter)

### Existing Tests

- `tests/unit/match-profile.test.ts` — continues to pass via web
  adapter re-exports.
- `tests/unit/filtering.test.ts` — continues to pass via web adapter.
- `tests/unit/search-profile.test.ts` — unchanged.
- `tests/unit/product-core-parity.test.ts` — expanded from 3 to 11
  test cases covering all new shared modules.

## Risks / Trade-offs

- **Affordability caching stays in web layer**: the shared
  `passesAffordabilityMode` calls `computeAffordabilityVerdict` on
  every invocation. The web adapter adds WeakMap caching for the
  10,000+ block filter loop. A future native app should add its own
  caching if needed.

- **`_affordabilityProfile` parameter in shared `matchesFilter`**: the
  shared predicate accepts but ignores the profile parameter (uses
  pre-computed `passesAffordability` boolean instead). This keeps the
  signature compatible with the web adapter while staying pure.

- **`near me` without userLocation**: returns `null` immediately
  instead of falling through to station matching, preventing confusing
  matches against stations like "Simei" or "Promenade".
