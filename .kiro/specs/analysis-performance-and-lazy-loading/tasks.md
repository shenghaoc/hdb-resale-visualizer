# Tasks: Analysis Performance and Lazy Loading

## Phase 1 — Baseline capture and harness

- [ ] **T1.1** Add a short performance capture note to repo docs or spec scratch notes with baseline outputs for:
  - `npm run check:bundle`
  - `npm run build`
  - `npm run test`
  - `npm run lint`
  - Playwright smoke run for map/filter/listing check interactions.
  - Acceptance: all baseline scripts run in current branch and outputs are recorded.

- [ ] **T1.2** Add a dedicated Playwright script in `tests/e2e` for timing capture of:
  - filter change to list update
  - map interaction while filtering
  - listing check request to evidence render
  - Acceptance: script returns stable timing summary for repeated runs.

## Phase 2 — Bundle and lazy-loading boundary work

- [ ] **T2.1** Create a new lazy analysis entry module under `src/components/analysis/AnalysisPanel.tsx` (name placeholder) so heavy analysis-only UI and logic are not in the initial eager graph.
- [ ] **T2.2** Refactor `App.tsx` to load analysis-heavy route/views via `React.lazy` and keep defaults on existing lightweight shells.
  - Acceptance: `npm run check:bundle` remains within budgets.

- [ ] **T2.3** Add conditional loading for analysis-only helpers (e.g., worker bootstrap, table virtualization, formatting utilities) inside the analysis chunk only.
  - Acceptance: route-level split exists in import graph.

## Phase 3 — Filtering and rerender reductions

- [x] **T3.1** Audit `src/hooks/useFilterPipeline.ts` for unstable dependencies and tighten memo inputs to avoid unnecessary pipeline resets.
- [ ] **T3.2** Add memoized derived selectors for expensive inputs and caches for repeated filter requests in `src/lib/filtering.ts` where safe.
- [ ] **T3.3** Add tests for filter result consistency when filter state is toggled rapidly.
  - Acceptance: no result correctness regressions and fewer avoidable full recomputations in profiler-like runs.

## Phase 4 — Analysis worker and comparable post-processing

- [ ] **T4.1** Add worker scaffolding under `src/workers/analysis/`:
  - `analysis-worker.ts`
  - `analysis-worker-contract.ts` (request/response types)
  - bootstrapping entry from browser when check view enters
  - Acceptance: worker only loads on analysis view activation.

- [ ] **T4.2** Move or mirror these compute-heavy tasks into worker path:
  - comparable ranking and stable sort slices
  - caveat/confidence derivation that is purely presentational
  - aggregated summary stats used by listing check
  - Acceptance: same outputs before and after for a fixed fixture payload.

- [ ] **T4.3** Ensure fallback to synchronous path when worker unavailable.
  - Acceptance: no functional regressions on browsers without workers.

## Phase 5 — Comparable and table rendering performance

- [ ] **T5.1** In `src/components/ComparableEvidenceTable.tsx`, add threshold-based virtualized path using `@tanstack/react-virtual`.
  - Keep direct render for small row counts.
  - Acceptance: rows above threshold render smoothly in large local test sets.

- [ ] **T5.2** Move sort and transform helpers out of render into memoized functions/hooks.
  - Acceptance: sorting does not run on unrelated state updates.

- [ ] **T5.3** Add a focused benchmark fixture with row counts above and below threshold to verify virtualization switch behavior.
  - Acceptance: both modes render and maintain expected sort behavior.

## Phase 6 — Map update throttling and source sync pruning

- [x] **T6.1** Audit `src/hooks/useMapDataSync.ts`, `src/hooks/useMapPriceHeatmapSync.ts`, `src/hooks/useMapRadiusLayer.ts` for repeated `styledata` updates.
- [x] **T6.2** Add payload-change guards and minimal-change detection for `source.setData` and layer visibility updates.
- [ ] **T6.3** Add a map interaction perf check in e2e/smoke to verify no visible stutter during repeated pan/zoom and filter toggles.
  - Acceptance: improved smoothness; no visual regression in existing map interactions.

## Phase 7 — Render-path safety and UI responsiveness

- [x] **T7.1** Refactor `src/components/ListingCheckPanel.tsx` to avoid expensive transformations during render; keep compute in memoized selectors or worker results.
- [x] **T7.2** Preserve `adjustmentMeta` and listing check contract while reducing intermediate object churn.
- [ ] **T7.3** Add regression tests for:
  - no repeated comparable recompute on unchanged query
  - loading/error states remain responsive
  - result stays interactive while user edits price/filters.

## Phase 8 — Validation and trade-off closure

- [ ] **T8.1** Re-run:
  - `npm run test`
  - `npm run lint`
  - `npm run check:bundle`
  - `npm run build`
  - perf + e2e timing scripts
- [ ] **T8.2** Compare before/after metrics and publish measured deltas in the spec log.
- [ ] **T8.3** Document heavy library decisions:
  - Why worker is justified
  - Why virtualization is justified if enabled
  - Why Comlink/DuckDB/Arquero are not used or deferred.
