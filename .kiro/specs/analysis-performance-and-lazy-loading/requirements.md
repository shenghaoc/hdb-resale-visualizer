# Requirements: Analysis Performance and Lazy Loading

## R1 — Baseline and measurement

- **R1.1** Capture pre-change baseline values for:
  - `npm run build` timing and output sizes
  - `npm run check:bundle` preload metrics
  - `npm run test` pass count and duration
  - `npm run lint` clean state
  - Playwright interaction timings for filter/search/map/check flows.
- **R1.2** Add a Playwright performance trace script that captures:
  - filter typing latency (keypress → list update)
  - listing check verdict latency (click → verdict visible)
  - map pan/zoom frame stability during active filtering
- **R1.3** Record before/after deltas in PR descriptions for any performance
  change.

## R2 — Bundle-size safety

- **R2.1** New dependencies must not increase initial preload budgets beyond
  the current 225,280 B gzip total / 98,304 B gzip single limits.
- **R2.2** Heavy dependencies must ship only in lazily-loaded chunks (not in
  the modulepreload set).
- **R2.3** `npm run check:bundle` must continue to pass after any dependency
  addition.
- **R2.4** The main index chunk (currently 195 KiB gzip) must not grow by
  more than 10% without explicit justification.

## R3 — Filtering pipeline efficiency

- **R3.1** Stabilize the `t` (translator) dependency in
  `useFilterPipeline.ts` so that `geographicIntent` and
  `mapGeographicIntent` memos do not recompute on translator reference
  changes when the translated string is unchanged.
- **R3.2** Maintain existing short-circuit ordering in `matchesFilter`:
  cheap numeric comparisons first, expensive text search last.
- **R3.3** Keep existing cache infrastructure (`tokenizationCache`,
  `filterFlatTypeCache`, `getCanonicalFlatTypes` WeakMap) intact.
- **R3.4** Filter-change-to-first-result latency must remain under 100ms
  (P95) for 10,000+ block datasets.
- **R3.5** No correctness regressions in filter results when filter state is
  toggled rapidly.

## R4 — Comparable scoring and table performance

- **R4.1** Keep comparable computation on the API side (Workers). Do not move
  scoring to the browser unless a concrete local-only use case arises.
- **R4.2** Maintain the single-pass `buildComparablePayload` pattern for
  computing counts and mapping transactions (currently O(30)).
- **R4.3** All derived state (`comparablePayload`, `result`, confidence,
  caveats) must remain memoized — never recompute on unrelated state updates.
- **R4.4** ComparableEvidenceTable sort must not run on unrelated state updates
  (currently memoized on `[comparables, sortKey, sortDirection]`).
- **R4.5** Add virtualization to ComparableEvidenceTable only if row count
  exceeds 50 (currently capped at 30 by engine).

## R5 — Map rendering performance

- **R5.1** Maintain existing ref-based change guards in map sync hooks to
  prevent redundant `setData` calls.
- **R5.2** Map pan/zoom must not visibly stutter during active filtering
  (>30fps target).
- **R5.3** Do not replace or rewrite the existing MapLibre map stack.
- **R5.4** Consider debouncing `styledata` handlers only if profiling shows
  measurable frame drops during rapid interaction.

## R6 — Mobile responsiveness

- **R6.1** CSS-only responsive switching (`hidden sm:*` / `sm:hidden`) must
  remain the pattern — no JS media query listeners.
- **R6.2** ComparableEvidenceTable mobile card layout must remain functional.
- **R6.3** Analysis-heavy surfaces must not block touch interactions on
  mobile devices.

## R7 — Rerender and render-path hygiene

- **R7.1** No expensive derived computations inside render for listing check
  or result views.
- **R7.2** All pure transformation pipelines must use stable dependencies in
  `useMemo` / `useCallback`.
- **R7.3** `BlockCard` in ResultsPane must remain wrapped in `React.memo`.
- **R7.4** Avoid creating new object/array references in dependency arrays
  that would invalidate downstream memos.

## R8 — Worker architecture (deferred)

- **R8.1** Do not introduce a Web Worker boundary unless a specific analysis
  task is measured as UI-blocking (>50ms on P95 hardware).
- **R8.2** If a worker is added in future, it must be lazy-loaded and only
  started when the analysis view activates.
- **R8.3** Worker payloads must be typed (`Request`/`Result` contracts).
- **R8.4** A synchronous fallback must exist for browsers without worker
  support.

## R9 — Heavy dependency governance

- **R9.1** `@tanstack/react-virtual`: add only for tables exceeding 50 rows,
  and only in lazy analysis chunks.
- **R9.2** Comlink: add only if worker message-passing complexity exceeds a
  small helper-function boundary.
- **R9.3** DuckDB-WASM / Arquero: do not add without a concrete in-browser
  analysis-workbench user story approved in a separate spec.

## R10 — Validation

- **R10.1** All existing unit tests (1,205) and e2e tests must continue to
  pass.
- **R10.2** Add a Playwright performance trace script for before/after
  comparison (filter latency, check latency, map smoothness).
- **R10.3** Add regression tests for filter result consistency under rapid
  toggling.
- **R10.4** Document heavy library decisions with measured justification in
  the performance audit file.
