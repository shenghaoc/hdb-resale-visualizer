# Design: Analysis Performance and Lazy Loading

## Status

Complete. Conditional virtualization and worker paths were not triggered by
measured evidence.

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

### Current verification snapshot (measured 2026-07-28)

| Metric | Value |
|--------|-------|
| Build | 3,818 ms |
| Modulepreload count | 8 |
| Modulepreload gzip total | 100,703 B |
| Unit/integration tests | 181 files, 1,782 passed in 28,782 ms |
| Typecheck | 1,003 ms |
| Lint | 1,578 ms |
| Filter interaction | 83.5 ms P95, 20 samples, 10,000 blocks, two-worker gate |
| Map interaction | 63.8 fps, 25.9 ms maximum frame gap |
| Listing verdict | 108.9 ms |

The current preload total remains below the 225,280 B budget. Interaction
metrics are recorded in-page and therefore exclude Playwright/CDP round trips.

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
- Exact and one-edit whole-field queries use a corpus-scoped normalized field
  index before Fuse.js; broader free text retains the existing Fuse ranking.
- The most recent query result is reused, including between the results and
  debounced-map consumers when their query values converge.
- `geographicIntent` uses bounding-box pre-filter before haversine.

**Disposition of measured bottlenecks:**
1. `nearMeLabel` is resolved to a primitive string before the geographic
   intent memos. A translator reference change that produces the same label
   does not invalidate those memos.
2. `mapFilters` excludes the live search value from its memo dependencies and
   changes only when the debounced search changes, avoiding an immediate
   10,000-block map pass followed by a duplicate debounced pass.
3. Empty/one-character queries return before any Fuse index work. Exact and
   minor-typo structured queries avoid building/searching Fuse entirely.

### Comparable computation performance

**API path:** `shared/comparable-engine.ts` runs in Workers (Cloudflare Pages
Functions). The `scoreSimilarity` function is lightweight (8 numeric
comparisons + weighting). `buildComparableSet` performs at most 3 widening
passes (block → street → town) with sort of ≤30 items each.

**Browser path:** `buildComparablePayload` in
`src/features/listing-check/ListingCheckPanel.tsx` runs a single O(N) pass over
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

**ComparableEvidenceTable**
(`src/features/listing-check/ComparableEvidenceTable.tsx`):
- Sort is memoized via `useMemo` on `[comparables, sortKey, sortDirection]`.
- Typical payload: 8–30 rows. No virtualization needed at this scale.
- Desktop and mobile layouts render in parallel (`hidden sm:table` /
  `sm:hidden`) — no JS media query overhead.

**ResultsPane** (`src/components/ResultsPane.tsx`):
- Implements custom virtualization for compact mode when
  `sortedBlocks.length > 80` (overscan: 8 items).
- `BlockCard` is wrapped in `React.memo`.
- Sort helpers read only cohort-aligned price, lease, MRT, and recency facts.
  There is no affordability sort; the optional CPF-based mode is a filter and
  its verdicts are computed through the dedicated cached filtering path, not
  inside result sorting.

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

**Intentional behavior:** Results respond immediately to live search input;
map filtering follows the shared 100ms debounce. This keeps result feedback
prompt while avoiding duplicate map-corpus work on each keystroke.

## Design approach

### A. Measurement-first baseline

Before further changes, collect baseline snapshots:

- `vp run build` + `vp run check:bundle`
- `vp run test`
- `vp run typecheck`
- `vp run lint`

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
- Keep initial preload budget under 220 KiB gzip (currently 100,703 B, or
  44.7% of the budget).
- New deps accepted only if measurable pre/post gain is captured.

### F. No-compute-in-render rule

- Any derived summary/caveat/sort must be memoized or precomputed.
- Never derive large arrays directly in JSX render loops.
- Ensure stable keys and stable handlers to reduce child rerenders.

## Architecture disposition

1. **`src/hooks/useFilterPipeline.ts`**
   - Resolve the translated near-me label before geographic intent memos.
   - Keep live result filtering immediate while map filtering follows a
     single-sourced 100ms debounce.

2. **`src/features/search-profile/searchFuse.ts`**
   - Reuse the last query result for a stable block corpus.
   - Use a corpus-scoped exact/one-edit whole-field index for structured
     queries.
   - Build and search the Fuse index only for broader free text.

3. **`src/hooks/useMapDataSync.ts` and sibling hooks**
   - Current ref-based guards are sufficient.
   - Consider debouncing `styledata` handler if profiling shows it fires
     excessively during rapid pan/zoom (only if measurable).

4. **`src/features/listing-check/ComparableEvidenceTable.tsx`**
   - No changes needed at current scale (≤30 rows).
   - Add optional virtualization path if row cap increases.

5. **Performance regression fixture**
   - Playwright performance traces cover:
     - filter typing latency
     - listing check request-to-verdict
     - map interaction smoothness
   - Metrics are measured in-page; deterministic corpus/setup and measurement
     utilities live in focused e2e helper modules.

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
