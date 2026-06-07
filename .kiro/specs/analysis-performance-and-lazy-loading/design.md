# Design: Analysis Performance and Lazy Loading

## Status

In Progress.

## Goal

Improve usability and performance in analysis-heavy flows without regressing
load size or map responsiveness. Allow heavy libraries where they clearly
improve the buyer workflow, but never in the initial bundle unless justified.

Primary focus:

- Keep listing price check responsive under realistic dataset sizes.
- Keep map interactions smooth on desktop and mobile.
- Reduce rerender and compute churn for filtering, comparable scoring, and
  result rendering.
- Avoid adding heavy dependencies to the initial bundle unless justified by
  measurable gain.

## Performance audit (concrete baseline)

### Bundle state (measured 2025-06-08)

| Metric | Value |
|--------|-------|
| Modulepreload count | 5 |
| Modulepreload gzip total | 15,346 B |
| Budget: total gzip | 225,280 B (220 KiB) |
| Budget: single gzip | 98,304 B (96 KiB) |
| Largest chunk (vendor-maplibre) | 272.93 KiB gzip |
| Main index chunk | 195.45 KiB gzip |
| CartesianChart chunk | 97.31 KiB gzip |
| GuideDialog chunk | 50.48 KiB gzip |
| ShortlistDrawer chunk | 15.99 KiB gzip |
| DetailDrawer chunk | 14.05 KiB gzip |
| ResultsPane chunk | 11.71 KiB gzip |

**Assessment:** Initial preloads are well within budget (15 KiB / 220 KiB).
The heavy chunks (MapLibre 273 KiB, CartesianChart 97 KiB) are lazy-loaded.
The main index chunk at 195 KiB is large but within the 220 KiB single-module
limit since it is not a preloaded chunk.

### Lazy loading boundaries (current)

Already lazy via `React.lazy` in `src/App.tsx`:
- `MapView` — map stack + hooks
- `DetailDrawer` — transaction detail
- `ResultsPane` — block cards + virtualized list
- `ShortlistDrawer` — saved blocks
- `GuideDialog` — onboarding dialog
- `ListingCheckPanel` — price check + comparable table

Eagerly loaded:
- `AppHeader`, `FilterPanel`, `AppTabBars`, `AppPanelShell` — structural
  shell, needed immediately
- Map controls (`MapLocaleControl`, `AmenityLayersControl`,
  `PriceHeatmapControl`) — small, needed when map loads

**Assessment:** Lazy boundaries are well-placed. No further route-level splits
needed unless a new heavy analysis surface is added.

### Filtering performance

**Hot path:** `matchesFilter` in `src/lib/filtering.ts:622-715` runs against
10,000+ blocks per filter change.

**What's already optimized:**
- Short-circuit ordering: cheap numeric comparisons first (town, budget, area,
  lease, date, MRT distance), expensive text search last.
- `filterFlatTypeCache` (Map) avoids `.trim().toUpperCase()` per block.
- `getCanonicalFlatTypes` uses WeakMap per-block cache.
- `tokenizationCache` (Map, 10K limit) prevents repeated search tokenization.
- `fuseMatchedKeys` (Set) provides O(1) lookup for text search when Fuse.js
  pre-computed results are available — bypasses the hand-rolled
  substring/Levenshtein entirely.
- `geographicIntent` uses bounding-box pre-filter before haversine.

**Remaining bottlenecks:**
1. `resolveGeographicSearchIntent` depends on `t` (translator fn) which may
   have unstable identity, causing `geographicIntent` and
   `mapGeographicIntent` to recompute unnecessarily.
2. Two parallel filter passes run (results + map) with overlapping work when
   `debouncedSearch === stableFilters.search`.
3. `getFuseMatchedKeys` scans all blocks even when search is empty (early
   return exists but depends on Fuse index rebuild timing).

### Comparable computation performance

**API path:** `shared/comparable-engine.ts` runs in Workers (Cloudflare Pages
Functions). The `scoreSimilarity` function is lightweight (8 numeric
comparisons + weighting). `buildComparableSet` performs at most 3 widening
passes (block → street → town) with sort of ≤30 items each.

**Browser path:** `buildComparablePayload` in
`src/components/ListingCheckPanel.tsx:155-215` runs a single O(N) pass over
comparables (N≤30) to compute counts and map transactions. This is correctly
memoized via `useMemo` keyed on `[comparableSet, detail]`.

**Result computation:** The `result` useMemo block
(`ListingCheckPanel.tsx:510-557`) calls `assessAskingPrice`,
`computeConfidence`, and `generateCaveats` — all pure functions on small
inputs (≤30 comparables). Correctly memoized.

**No remaining hot-path issues** in comparable computation. The original
concern about 4 redundant array filters has been resolved — counts are now
accumulated in a single `for` loop in `buildComparablePayload`.

### Map rendering performance

**Pattern:** All map sync hooks (`useMapDataSync`, `useMapPriceHeatmapSync`,
`useMapRadiusLayer`, `useAmenityGeoSync`) listen to the `styledata` event and
call `setData` / `setLayoutProperty` when it fires.

**Existing guards (already in place):**
- `useMapDataSync` uses ref-based identity checks
  (`geoJson !== blocksSourceRef.current`) to skip setData when the GeoJSON
  reference hasn't changed.
- Primary school sync uses similar ref-based guards for both data and
  visibility.
- `moveLayersBeforeTargetIfNeeded` checks current order before calling
  `moveLayer`.

**Remaining concern:** MapLibre fires `styledata` frequently during
pan/zoom/interaction. Even with ref guards, the event handler itself runs and
performs source lookups. This is low-cost per call but adds up under rapid
interaction.

### Table rendering performance

**ComparableEvidenceTable** (`src/components/ComparableEvidenceTable.tsx`):
- Sort is memoized via `useMemo` on `[comparables, sortKey, sortDirection]`.
- Typical payload: 8–30 rows. No virtualization needed at this scale.
- Desktop and mobile layouts render in parallel (`hidden sm:table` /
  `sm:hidden`) — no JS media query overhead.

**ResultsPane** (`src/components/ResultsPane.tsx`):
- Implements custom virtualization for compact mode when
  `sortedBlocks.length > 80` (overscan: 8 items).
- `BlockCard` is wrapped in `React.memo`.
- Sort helpers pre-compute affordability headroom in a memoized Map to avoid
  O(N log N) CPF/loan calculations during sort.

**Assessment:** Table rendering is already well-optimized. Virtualization for
the comparable table would only help if row counts grow beyond 30 (currently
capped by engine).

### Mobile responsiveness

- Responsive breakpoints use CSS-only switching (`hidden sm:*` / `sm:hidden`).
- No JS resize observers or media query listeners.
- `ComparableEvidenceTable` has dedicated mobile card layout.
- `ResultsPane` has compact card mode for mobile.

**No blocking issues** identified for mobile rendering performance.

### Rerenders and render-path computation

**Resolved issues:**
- `ListingCheckPanel` correctly memoizes all derived state (`flatTypeOptions`,
  `storeyOptions`, `resolvedAskingPrice`, `comparablePayload`, `result`).
- `useFilterPipeline` uses explicit dependency lists in `stableFilters` to
  prevent reference churn.
- `filterScopedBlocks` uses `useCallback` with minimal dependencies.

**Remaining concerns:**
1. `geographicIntent` depends on `t` — if translator identity is unstable,
   both intent memos recompute.
2. `mapFilters` recreates on every `debouncedSearch` change — this is
   intentional (100ms debounce) but means the map filter pass always runs
   100ms behind results.

## Design approach

### A. Measurement-first baseline

Before further changes, collect baseline snapshots:

- `npm run build` + `npm run check:bundle` (captured above)
- `npm run test` — 133 files, 1205 tests passing
- `npm run typecheck` — clean
- `npm run lint` — clean

Define delta targets:
- INP: maintain < 200ms for filter interactions
- Filter-change-to-first-result: measure with Playwright tracing
- Comparable request-to-verdict: measure with network + render timing
- Map pan/zoom frame stability: no visible stutter during active filtering

### B. Deferred execution for analysis-heavy paths

- Keep map stack (MapLibre) as-is — no replacement.
- Keep heavy analysis code behind existing lazy boundaries.
- Load analysis-specific modules only when needed (listing check expanded,
  comparable table opened).

### C. Web Worker for CPU-heavy analysis (deferred)

**Decision:** Not justified yet. Current comparable computation runs in
Workers (API-side). Browser-side post-processing is O(30) — a single loop
over ≤30 items. Worker thread overhead would exceed the computation saved.

**When to revisit:**
- If comparable window expands to 100+ transactions.
- If new local-only analysis features require repeated scoring.

### D. `@tanstack/react-virtual` (deferred)

**Decision:** Not justified yet. ComparableEvidenceTable handles ≤30 rows.
ResultsPane already has custom virtualization for >80 blocks.

**When to revisit:**
- If comparable table row cap increases beyond 50.
- If a new analysis surface needs unbounded row rendering.

### E. Bundle size guardrails

- Any new heavy package must ship only in dynamically loaded analysis bundles.
- Keep initial preload budget under 220 KiB gzip (currently 15 KiB — massive
  headroom).
- New deps accepted only if measurable pre/post gain is captured.

### F. No-compute-in-render rule

- Any derived summary/caveat/sort must be memoized or precomputed.
- Never derive large arrays directly in JSX render loops.
- Ensure stable keys and stable handlers to reduce child rerenders.

## Architecture changes (target)

1. **`src/hooks/useFilterPipeline.ts`**
   - Stabilize `t` dependency for geographic intent computation.
   - Add early-exit when search is empty to skip Fuse pass entirely.
   - Consider deduplicating results/map filter passes when search values
     converge.

2. **`src/hooks/useMapDataSync.ts` and sibling hooks**
   - Current ref-based guards are sufficient.
   - Consider debouncing `styledata` handler if profiling shows it fires
     excessively during rapid pan/zoom (only if measurable).

3. **`src/components/ComparableEvidenceTable.tsx`**
   - No changes needed at current scale (≤30 rows).
   - Add optional virtualization path if row cap increases.

4. **Performance regression fixture**
   - Add Playwright performance trace script for:
     - filter typing latency
     - listing check request-to-verdict
     - map interaction smoothness
   - Run as part of CI or manually before/after performance PRs.

## Heavy library justification

### Web Workers
- **Status:** Not justified for this phase.
- **Reason:** All heavy computation (comparable scoring, filtering) either runs
  server-side (Workers) or is already O(30) in the browser. Worker thread
  overhead would exceed savings.
- **Revisit when:** Comparable window grows >100 or new local-only analysis.

### @tanstack/react-virtual
- **Status:** Not justified for this phase.
- **Reason:** ComparableEvidenceTable ≤30 rows. ResultsPane already has custom
  virtualization for >80 blocks.
- **Revisit when:** Comparable table exceeds 50 rows or new unbounded list.

### Comlink
- **Status:** Not justified.
- **Reason:** No worker boundary exists to communicate across.

### DuckDB-WASM / Arquero
- **Status:** Explicitly out of scope.
- **Reason:** No ad-hoc SQL/columnar analysis workbench use case exists.
