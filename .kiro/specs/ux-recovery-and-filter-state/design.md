# Design: UX Recovery and Filter State

## State Ownership

- `ResultsPane` distinguishes controlled state by whether `sortMode` is
  supplied, not by whether the supplied value is truthy. The empty controlled
  value maps to `median-asc`.
- `useManifestData` owns a retry generation. Retry clears the failed snapshot
  and starts the same same-origin manifest fetch again.
- `useBlockLoading` clears request errors before all early-return paths and
  exposes a retry generation so recovery does not depend on filters changing.

## Validation Boundary

`shared/yearMonth.ts` remains the sole strict calendar-month validator.
`clampFilterRanges` applies it on both URL hydration and every filter patch,
then normalizes valid month ranges and clamps numeric bounds. `parseFilters`
alone orders numeric deep-link endpoints; doing that on every keystroke would
move a value into the opposite controlled input. For live numeric edits,
`useFilterPipeline` evaluates a derived ascending range while `FilterPanel`
keeps raw controlled values until blur commits the shared endpoint order. The
Worker uses the same numeric ordering helper and month validator, preserving
the browser/server contract.

## URL Ownership

`mergeFiltersIntoSearch` treats the filter query keys as an owned subset of the
URL. On hydration and every later filter update, it removes that subset and
merges the canonical serialized filters back into the existing query string.
This strips invalid and retired values without deleting Listing Check or other
non-filter deep-link state. `useUrlFilters` writes only when the merged search
actually differs, so the initial canonicalization is safe under repeated React
effects.

## Async Comparison

Town comparison assigns a monotonically increasing request sequence before
awaiting. Completion handlers commit only when their sequence is still current
and the component remains mounted. Disabling or changing comparison invalidates
the previous request without adding a duplicate cache. Loading and failure
states never synthesize a snapshot from an empty array; failure exposes an
explicit retry generation for block and trend data.

## Recovery Copy

Diagnostic strings stay in hook state for debugging, but `App` renders only
source-specific translated manifest/results failure copy. Buyers never see raw
request paths or HTTP implementation details.

`useListingCheckAnalysis` owns an address-detail retry generation. The panel
exposes it beside the translated detail error, so retrying the same block does
not depend on changing reducer selection state.

## Presentation

The compact affordability indicator includes the existing translated status
text next to its colored dot. It introduces no new affordability calculation
or promise.
