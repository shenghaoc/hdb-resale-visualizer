# Design: Analysis Performance and Lazy Loading

## Status

In Progress.

## Goal

Improve usability and performance in analysis-heavy flows without regressing load size or map responsiveness.

Primary focus:

- Keep listing price check responsive under realistic dataset sizes.
- Keep map interactions smooth on desktop and mobile.
- Reduce rerender and compute churn for filtering, comparable scoring, and result rendering.
- Avoid adding heavy dependencies to the initial bundle unless justified by measurable gain.

## Short performance audit

### 1) Current performance budget and baseline setup

- Module preload budgets are enforced by `scripts/check-bundle.ts`.
  - Total gzip preload budget: `220 KiB`.
  - Largest single preload budget: `96 KiB`.
  - Enforcement path is `scripts/lib/bundle-modulepreload-budget.ts`.
- There is an existing runtime performance reporting helper: `src/lib/performance.ts`.
  - LCP, INP, CLS are observed in `src/lib/__tests__/performance.test.ts`.
- Build pipeline already validates `npm run check:bundle` after Vite output.

### 2) Existing optimization signals already present

- App-level route-level lazy loading exists for heavy UI branches in `src/App.tsx`:
  - `MapView`, `DetailDrawer`, `ResultsPane`, `ShortlistDrawer`, `GuideDialog` use `React.lazy`.
- Map data rendering path already includes caches:
  - `src/lib/map.ts` caches generated GeoJSON features for stable block objects.
- Result list rendering already has compact-mode virtualization logic in `src/components/ResultsPane.tsx`.
- Filtering pipeline already memoizes multiple stages and uses search indexes in:
  - `src/hooks/useFilterPipeline.ts`, `src/lib/filtering.ts`, `src/lib/searchFuse.ts`.

### 3) Identified bottlenecks and risk areas

1. Filtering rerun frequency
- `useFilterPipeline` performs repeated memoized derivations; however `filterScopedBlocks` depends on frequently changing filter state and `blocks`, and its callback may re-run broadly.
- `matchesFilter` still contains multiple conditional checks and short-circuit paths that can be expensive for large `blocks` arrays.

2. Comparable computation path
- Comparable generation logic runs at API boundary in `functions/api/comparable-transactions.ts` + `shared/comparable-engine.ts`.
- Current path still performs full sort+rank per selected scope and then returns up to 30 comparables.
- Listing check currently maps comparable payload in render-driven hooks and computes assessment/caveats in one memoized block in `src/components/ListingCheckPanel.tsx`.
- For high-volume usage in future or expanded compare windows, this can still block the worker thread during parse/assessment passes.

3. Result and table rendering cost
- `ComparableEvidenceTable.tsx` performs full-array sort and mapping on each supported interaction.
- It currently renders full rows for desktop and mobile by mapping arrays.
- The existing compact table workaround is in `ResultsPane`, but comparable table does not use `react-virtual`.

4. Map rendering update frequency
- `MapView` uses multiple hooks that sync map sources and layers on `styledata` events:
  - `src/hooks/useMapDataSync.ts`
  - `src/hooks/useMapPriceHeatmapSync.ts`
  - `src/hooks/useAmenityGeoSync.ts`, `useMapSelectionSync`, `useMapRadiusLayer`.
- Some effects call `setData` / layer/visibility updates whenever style data changes, which can add avoidable work while pan/zoom interactions occur.

5. Mobile-specific pressure
- Results and controls are responsive but still re-render with desktop-mode structures on small devices until breakpoints resolve.
- Some controls and table structures can be kept in separate mobile-first paths to reduce render work and paint complexity.

6. Rerenders and render-path computation
- `ListingCheckPanel.tsx` contains state-reset branches in render path for prop transitions.
- Several inline maps/derivations are recalculated in hook bodies and are vulnerable to cascading renders from state updates.
- Need clear guardrails for avoiding expensive recomputation of comparables and confidence artifacts inside render loops.

## Design approach

### A. Measurement-first baseline

Before changes, collect baseline snapshots in one controlled run:

- `npm run build` + `npm run check:bundle`
- `npm run test`
- `npm run lint`
- Playwright trace run for
  - map pan/zoom + filter interactions
  - listing check flow
  - large payload result rendering

Then define delta targets in terms of:

- INP
- LCP
- CLS
- Filter-change to first painted result latency
- Comparable request-to-verdict latency
- Rows rendered per frame
- JS thread long task ratio on interaction bursts

### B. Analysis-first lazy loading and deferred execution

- Keep map stack (`MapLibre`) as the source of map visuals; do not replace.
- Keep heavy analysis code out of the default render path.
- Load analysis-specific modules only when needed:
  - listing check expanded flow
  - comparable details table opened
  - large result rendering paths

### C. Web Worker for CPU-heavy analysis

Allowed by current constraints: move heavy, repeated, synchronous computations into worker.

Candidate moves:

1. Comparable post-processing in browser
- Deduplicate and rank final comparable candidates for display.
- Compute table sort/paging slices for analysis view.
- Compute aggregate trend/quality summaries for local views.

2. Large filtering helper tasks (frontend-only mode)
- Optional background scoring/index precompute for search + local affordance.
- Keep API DB filtering as source of truth; worker is used only for UI shaping and local analytics.

3. Communication
- Use plain `postMessage` first.
- Introduce `Comlink` only if multiple bidirectional method APIs become complex.

### D. `@tanstack/react-virtual` where payload grows

- Use for `ComparableEvidenceTable` and any tabular analysis surfaces once row count crosses threshold.
- Do not import it into entry chunk; gate behind analysis lazy split.
- Keep current threshold-based behavior:
  - small sets render normally.
  - large sets use virtualization.
- Avoid adding if payload never crosses threshold.

### E. Bundle size guardrails

- Any new heavy package must ship only in dynamically loaded analysis bundles.
- Keep initial preload budgets respected.
- New deps are accepted only if:
  - measurable pre/post gain is captured.
  - dependency is not duplicated by existing stack behavior.

### F. Mobile responsiveness plan

- Ensure comparable view has dedicated mobile card/table split.
- Use existing compact patterns for cards and action groups.
- Defer expensive columns and controls until viewport width allows.

### G. No-compute-in-render rule for analysis surfaces

- Any derived comparable summary/caveat/sort list must be memoized or precomputed in effect/worker.
- Never derive large arrays directly in JSX render loops.
- Ensure stable keys and stable handlers to reduce child rerenders.

## Proposed architecture changes (target)

1. `src/components/ListingCheckPanel.tsx`
- Extract analysis derivations into `useListingAnalysisResult` style hook.
- Move compare response post-processing and sort helpers to worker-backed adapter when available.

2. `src/components/ComparableEvidenceTable.tsx`
- Add optional virtualization path using `@tanstack/react-virtual` above a size threshold.
- Keep current default rendering for small sets.

3. `src/hooks/useFilterPipeline.ts` and `src/lib/filtering.ts`
- Add stronger memo boundaries for heavy loops.
- Reduce churn from unstable object dependencies.
- Add cache keys and invalidation points for expensive derived indexes.

4. `src/lib/map.ts` and map hooks
- Keep existing cache model but add guarded source update checks.
- Avoid repeated expensive layer updates in style loops when derived payload is unchanged.

5. New analysis worker package
- `src/workers/analysis/` with worker entry + typed message contracts.
- Worker loads only on demand.

6. Benchmark scaffolding
- Add a small performance regression fixture to collect:
  - scriptable timing metrics
  - table render and map interaction traces
  - bundle size diff for each PR scope

## Before / after measurement plan

### Before

- LCP/INP/CLS from existing telemetry path and test harness.
- Bundle budget from `npm run check:bundle`.
- Filter operation time and render count for large filters from existing scenario tests.
- Comparable flow timeline:
  - user click -> API return -> table visible.

### After

- Same metrics with target windows, plus worker offload deltas and frame budget gains.
- Compare:
  - no-worker vs worker path toggled by feature flag.
  - virtualized vs non-virtualized table path at row thresholds.
- Hard acceptance:
  - initial route budget remains under enforced preload caps.
  - map/scroll interactions avoid visible stutter at normal mobile/desktop hardware.
  - listing check result area remains responsive when comparables and profiles are large.

## Heavy library justification

### Comlink
- Not required initially.
- Add only if worker API surface becomes multi-method and wrapper overhead justifies complexity reduction.

### @tanstack/react-virtual
- Justified for large table bodies in analysis surfaces (comparable list + potential future transaction tables).
- Not required for default small payloads.

### Web Workers
- Justified and preferred for any repeated CPU-bound comparable or derived computations in analysis flows.
- Must be lazy loaded and only started on analysis route/state.

### DuckDB-WASM / Arquero
- Not justified for this spec phase.
- No clear need for ad-hoc SQL/columnar analysis workbench inside browser.
