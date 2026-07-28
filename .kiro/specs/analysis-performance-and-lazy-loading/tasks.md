# Tasks: Analysis Performance and Lazy Loading

> Execution checklist. Ordered by impact and dependency. Each task names its
> acceptance check. Tasks marked [x] are already addressed in the current
> codebase.

## Phase 1 — Performance measurement harness

- [x] **T1.1** Add a Playwright performance trace script in `tests/e2e/` that
  captures timing for:
  - filter typing → list update latency (measure time from keypress to DOM
    change in ResultsPane)
  - listing check: click "Check" → verdict card visible
  - map pan/zoom FPS during active filtering
  - Acceptance: script returns stable timing summary; can be run before/after
    any performance PR.
  - **Done:** `tests/e2e/performance-trace.spec.ts` records metrics in-page;
    deterministic corpus/setup and measurement code is split into
    `performance-fixture.ts` and `performance-metrics.ts`.

- [x] **T1.2** Add a `scripts/perf-baseline.sh` script that runs:
  - the package build (record time)
  - the package bundle check (record preload sizes)
  - the package test suite (record duration)
  - Outputs a JSON summary for diff comparison.
  - Acceptance: script runs in CI and produces reproducible output.
  - **Done:** `scripts/perf-baseline.sh`; base CI runs it on `main` pushes and
    `workflow_dispatch` (not on pull requests) and uploads
    `performance-baseline.json` as a 14-day artifact. The script re-runs build,
    bundle, test, typecheck and lint, all of which `vp run check` already ran,
    so charging every PR for it would roughly double PR feedback time while
    nothing compares the artifact against a previous run.

## Phase 2 — Filtering pipeline stabilization

- [x] **T2.1** Audit `src/hooks/useFilterPipeline.ts` for unstable
  dependencies. Current state: `stableFilters` uses explicit dep list;
  `filterScopedBlocks` uses minimal callback deps; tokenization and flat-type
  caches are module-level.

- [x] **T2.2** Stabilize the `t` dependency for geographic intent computation.
  Resolve `t("filters.nearMe")` to a primitive label before the geographic
  intent memos. Those memos depend on the label value rather than the
  translator function reference.
  - Acceptance: `geographicIntent` and `mapGeographicIntent` do not
    recompute when `t` reference changes but string is identical. Add a test
    that verifies memo stability.
  - **Done:** `nearMeLabel` is passed to both geographic intent memos;
    `useFilterPipeline.test.tsx` verifies their references stay stable when a
    new translator returns the same label.

- [x] **T2.3** Add regression tests for filter consistency under rapid state
  toggles. Test that toggling town/flatType/budget back and forth produces
  identical filtered sets.
  - Acceptance: new test file passes in `vp run test`.
  - **Done:** "filter consistency under rapid state toggles" describe block
    in `src/lib/__tests__/filtering.test.ts`

- [x] **T2.4** Keep 10,000-block structured search within the R3.4 budget.
  - Use a corpus-scoped, length-bucketed
    town/street/block/display-name/postal-code index for exact and one-edit
    queries; retain Fuse.js for broader free text.
  - Reuse the latest result for the stable block corpus.
  - Keep map filters referentially stable until the shared debounce settles.
  - Acceptance: exact, typo, fuzzy-fallback, cache-invalidation, and map
    debounce regressions pass; the 20-sample browser P95 is below 100ms.
  - **Done:** focused tests pass; the isolated trace measured 26.5ms P95 and
    the final two-worker pre-PR gate measured 83.5ms P95.

## Phase 3 — Map sync hook optimization (if profiling warrants)

- [x] **T3.1** Audit map sync hooks for redundant setData calls. Current
  state: `useMapDataSync` uses ref-based identity guards
  (`geoJson !== blocksSourceRef.current`) to skip setData when reference is
  unchanged. School sync uses similar pattern.

- [x] **T3.2** Add payload-change guards and minimal-change detection for
  source/layer updates. Current state: all hooks use ref comparison before
  calling setData/setLayoutProperty.

- [x] **T3.3** Add a map interaction performance check in e2e/smoke that
  verifies no visible stutter during repeated pan/zoom with active filters.
  - Acceptance: trace shows >30fps during interaction; no frame drops >100ms.
  - **Done:** "map remains interactive during filter operations" test in
    `tests/e2e/performance-trace.spec.ts`; the final gate measured 63.8fps with
    a 25.9ms maximum frame gap and asserted that the camera actually moved.

## Phase 4 — Render-path hygiene validation

- [x] **T4.1** Refactor `ListingCheckPanel.tsx` to avoid expensive
  transformations during render. Current state: all derivations
  (`flatTypeOptions`, `storeyOptions`, `comparablePayload`, `result`) are
  properly memoized with appropriate dependencies.

- [x] **T4.2** Ensure `buildComparablePayload` uses single-pass O(N) loop
  for counts. Current state: single `for` loop over comparables accumulates
  all counts and maps transactions in one pass.

- [x] **T4.3** Add regression tests for:
  - no repeated comparable recompute on unchanged query
  - loading/error states remain responsive
  - result stays interactive while user edits price/filters
  - Acceptance: new tests pass in `vp run test`.
  - **Done:** `tests/unit/comparable-determinism.test.ts`

## Phase 5 — Comparable table virtualization (conditional)

- [ ] **T5.1** If comparable engine cap increases beyond 30 (tracked in
  `shared/comparable-engine.ts`), add threshold-based virtualization to
  `ComparableEvidenceTable.tsx` using `@tanstack/react-virtual`.
  - Keep direct render for ≤50 rows (current behavior).
  - Virtualize for >50 rows.
  - Gate behind lazy import (not in initial bundle).
  - Acceptance: both modes render correctly; sort behavior preserved.

- [ ] **T5.2** Add a focused test fixture with row counts above and below
  threshold to verify virtualization switch behavior.
  - Acceptance: test verifies correct rendering at 30 rows (no
    virtualization) and 60 rows (virtualized).

## Phase 6 — Worker architecture (conditional)

- [ ] **T6.1** If profiling shows a browser-side analysis task exceeds 50ms
  on P95 hardware, add worker scaffolding under `src/workers/analysis/`:
  - `analysis-worker.ts` — worker entry
  - `analysis-worker-contract.ts` — typed request/response
  - Bootstrap only on analysis view activation
  - Acceptance: worker loads on demand; synchronous fallback works.

- [ ] **T6.2** Move the identified blocking computation to worker. Maintain
  identical outputs for a fixed fixture payload.
  - Acceptance: before/after outputs match for test fixtures.

## Phase 7 — Final validation and documentation

- [x] **T7.1** Re-run full validation suite:
  - `vp run check:pr` — formatting, lint, typecheck, 1,782 tests, boundaries,
    production build, bundle budget, and 76 Playwright tests pass.
  - `vp run test:browser` — 8 Chromium Browser Mode tests pass.
  - Playwright performance trace — 83.5ms filter P95 in the two-worker gate,
    63.8fps map pan with 25.9ms maximum gap, 108.9ms listing verdict.

- [x] **T7.2** Compare before/after metrics using the T1.2 baseline script.
  - Final JSON: build 3,818ms; 8 preloads / 100,703 B gzip; 1,782 tests in
    28,782ms; typecheck 1,003ms; lint 1,578ms.
  - Same-tree isolated filter P95: 247.0ms before → 26.5ms final (−89.3%).
  - Publish these deltas in the PR description.

- [x] **T7.3** Update `performance-audit.md` with final measured deltas and
  heavy-library decisions.

## Task dependency summary

```
T1.1, T1.2 (measurement) → enables T7.1, T7.2 (validation)
T2.2, T2.4 (filter-path stabilization) → standalone, no deps
T2.3, T4.3 (regression tests) → standalone
T3.3 (map perf check) → depends on T1.1 script
T5.1, T5.2 (virtualization) → conditional on engine cap change
T6.1, T6.2 (worker) → conditional on profiling evidence
```
