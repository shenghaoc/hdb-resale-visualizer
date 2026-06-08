# Performance Audit: Analysis Performance and Lazy Loading

## Baseline capture (2025-06-08)

### Build and bundle

```
npm run build: ✓ built in 320ms
npm run check:bundle: PASS
  - 5 modulepreloads, 15,346 B gzip total
  - Budgets: total ≤ 225,280 B gzip, single ≤ 98,304 B gzip
npm run typecheck: ✓ clean
npm run lint: ✓ clean
npm run test: 133 files, 1,205 tests, 13.39s
```

### Bundle size breakdown (gzip)

| Chunk | Size (gzip) | Loading |
|-------|-------------|---------|
| vendor-maplibre | 272.93 KiB | Lazy (MapView) |
| index (main) | 195.45 KiB | Eager |
| CartesianChart | 97.31 KiB | Lazy (TrendChart) |
| GuideDialog | 50.48 KiB | Lazy |
| ShortlistDrawer | 15.99 KiB | Lazy |
| DetailDrawer | 14.05 KiB | Lazy |
| ResultsPane | 11.71 KiB | Lazy |
| createLucideIcon | 10.37 KiB | Eager (icons) |
| TrendChart | 10.68 KiB | Lazy |
| MapView | 6.29 KiB | Lazy |
| AskingPriceCheck | 3.12 KiB | Lazy |

### Initial load budget

- Modulepreload total: 15,346 B / 225,280 B budget = **6.8% of budget used**
- Massive headroom for adding dependencies to lazy chunks without affecting
  initial load.

## Identified bottlenecks (concrete)

### 1. Filtering pipeline — translator dependency instability

**File:** `src/hooks/useFilterPipeline.ts:240-261`

**Issue:** `geographicIntent` and `mapGeographicIntent` useMemo blocks depend
on `t` (the translator function). If the `t` reference is recreated on
language context changes or component re-renders, both memos recompute even
when the actual translated string hasn't changed.

**Impact:** Low-medium. Only triggers on locale changes (rare) or if i18n
context is unstable. With 10,000+ blocks, `resolveGeographicSearchIntent`
scans the station list — unnecessary recomputation wastes ~1-2ms per pass.

**Fix:** Extract the translated "Near Me" string into a stable memo or pass it
as a pre-resolved string rather than calling `t()` inside the dependency
array.

### 2. Filtering pipeline — duplicate filter passes

**File:** `src/hooks/useFilterPipeline.ts:230-238`

**Issue:** Two separate `getFuseMatchedKeys` calls run — one for
`stableFilters.search` (results) and one for `mapFilters.search` (map). After
the 100ms debounce settles, both values are identical.

**Impact:** Low. Fuse.js search is fast with the existing index, and the
memoization prevents re-execution when values are equal. The duplicate call
only fires during the 100ms window when `debouncedSearch` lags behind.

**Fix:** No fix needed — this is intentional UX behavior (map responds to
debounced input while results respond immediately).

### 3. Map hook styledata handler frequency

**File:** `src/hooks/useMapDataSync.ts:90`, `useMapPriceHeatmapSync.ts`,
`useMapRadiusLayer.ts`, `useAmenityGeoSync.ts`

**Issue:** MapLibre fires `styledata` on every style mutation (sprite load,
glyph load, source tile load, etc.). All sync hooks register handlers that
run on every event.

**Impact:** Low. Existing ref-based guards
(`geoJson !== blocksSourceRef.current`) short-circuit before any expensive
work. The overhead is ~4 event handler invocations × source lookup per
styledata event — microsecond-level cost.

**Fix:** Current guards are sufficient. Only debounce if profiling shows
measurable frame drops during rapid interaction (not observed).

### 4. ComparableEvidenceTable — no virtualization

**File:** `src/components/ComparableEvidenceTable.tsx`

**Issue:** Renders all rows directly for both desktop table and mobile cards.

**Impact:** None at current scale (8-30 rows). Sort is memoized. Row
rendering is straightforward DOM.

**Fix:** None needed. Add virtualization only if comparable count exceeds 50.

### 5. Main index chunk size (195 KiB gzip)

**Issue:** The main chunk is large but not preloaded beyond what's necessary.
It contains React, shadcn primitives, state management, and the app shell.

**Impact:** Affects initial load on slow connections but does not affect
runtime performance.

**Fix:** Further code-splitting the main chunk would create waterfall chains
for components that need to render immediately. Current split is reasonable.

## Before/after comparison framework

### Metrics to track

| Metric | How to measure | Target |
|--------|---------------|--------|
| Filter typing latency | Playwright: keypress → list update | < 100ms (P95) |
| Listing check verdict | Playwright: click → verdict visible | < 500ms (P95) |
| Map pan/zoom stability | Playwright: interaction trace FPS | > 30fps |
| Bundle preload total | `npm run check:bundle` | < 225,280 B gzip |
| Test suite duration | `npm run test` | < 20s |

### How to capture

1. Run `npm run build && npm run check:bundle` — record preload sizes.
2. Run Playwright trace with `--trace on` for filter/check/map scenarios.
3. Compare trace timelines before and after changes.
4. Annotate PR with delta table.

## Heavy dependency decisions (final)

| Dependency | Decision | Justification |
|-----------|----------|---------------|
| Web Workers | Deferred | Browser-side comparable work is O(30). Overhead exceeds savings. |
| @tanstack/react-virtual | Deferred | ComparableEvidenceTable ≤30 rows. ResultsPane already virtualized. |
| Comlink | Not needed | No worker boundary to communicate across. |
| DuckDB-WASM | Out of scope | No analysis-workbench use case. |
| Arquero | Out of scope | No columnar analysis use case. |

## Recommendations (prioritized)

1. **Add Playwright performance trace script** — captures filter/check/map
   timings reproducibly for before/after comparison.
2. **Stabilize translator dependency** — extract `t("filters.nearMe")` into
   a ref or pre-resolved value to prevent geographic intent recomputation.
3. **Monitor comparable table growth** — if engine cap increases beyond 30,
   evaluate @tanstack/react-virtual for the evidence table.
4. **Consider worker only for future local-only analysis** — e.g., if a
   browser-side scoring/ranking workbench is added for power users.
