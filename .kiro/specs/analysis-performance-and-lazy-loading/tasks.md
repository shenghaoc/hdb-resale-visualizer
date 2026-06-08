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
  - **Done:** `tests/e2e/performance-trace.spec.ts`

- [x] **T1.2** Add a `scripts/perf-baseline.sh` script that runs:
  - `npm run build` (record time)
  - `npm run check:bundle` (record preload sizes)
  - `npm run test -- --run` (record duration)
  - Outputs a JSON summary for diff comparison.
  - Acceptance: script runs in CI and produces reproducible output.
  - **Done:** `scripts/perf-baseline.sh`

## Phase 2 — Filtering pipeline stabilization

- [x] **T2.1** Audit `src/hooks/useFilterPipeline.ts` for unstable
  dependencies. Current state: `stableFilters` uses explicit dep list;
  `filterScopedBlocks` uses minimal callback deps; tokenization and flat-type
  caches are module-level.

- [x] **T2.2** Stabilize the `t` dependency for geographic intent computation.
  Extract `t("filters.nearMe")` into a `useMemo` that depends only on the
  translated string value, not the translator function reference. Pass the
  resolved string to `resolveGeographicSearchIntent`.
  - Acceptance: `geographicIntent` and `mapGeographicIntent` do not
    recompute when `t` reference changes but string is identical. Add a test
    that verifies memo stability.
  - **Done:** `nearMeLabel` useMemo added in `src/hooks/useFilterPipeline.ts`

- [x] **T2.3** Add regression tests for filter consistency under rapid state
  toggles. Test that toggling town/flatType/budget back and forth produces
  identical filtered sets.
  - Acceptance: new test file passes in `npm run test`.
  - **Done:** "filter consistency under rapid state toggles" describe block
    in `src/lib/__tests__/filtering.test.ts`

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
    `tests/e2e/performance-trace.spec.ts`

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
  - Acceptance: new tests pass in `npm run test`.
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

- [ ] **T7.1** Re-run full validation suite:
  - `npm run test` — all 1,205+ tests pass
  - `npm run lint` — clean
  - `npm run typecheck` — clean
  - `npm run check:bundle` — within budget
  - `npm run build` — succeeds
  - Playwright performance trace — no regressions

- [ ] **T7.2** Compare before/after metrics using the T1.2 baseline script.
  Publish deltas in PR description.

- [ ] **T7.3** Update `performance-audit.md` with final measured deltas and
  any changes to heavy library decisions.

## Task dependency summary

```
T1.1, T1.2 (measurement) → enables T7.1, T7.2 (validation)
T2.2 (translator fix) → standalone, no deps
T2.3, T4.3 (regression tests) → standalone
T3.3 (map perf check) → depends on T1.1 script
T5.1, T5.2 (virtualization) → conditional on engine cap change
T6.1, T6.2 (worker) → conditional on profiling evidence
```
