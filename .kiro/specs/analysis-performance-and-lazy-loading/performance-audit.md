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
| Legacy listing checker (retired; historical baseline only) | 3.12 KiB | Lazy |

> Current UI contract: `ListingCheckPanel` is the sole listing-check surface,
> with `ComparableEvidenceTable` as its comparable-evidence surface.

## Final verification capture (2026-07-28)

`./scripts/perf-baseline.sh /private/tmp/hdb-perf-baseline-final-20260728.json`
produced:

```text
build: 3,818ms
bundle: 8 modulepreloads, 100,703 B gzip total
tests: 181 files, 1,782 passed in 28,782ms
typecheck: 1,003ms
lint: 1,578ms
```

The preload total remains below the 225,280 B budget. This snapshot is not
treated as a direct delta from the 2025 baseline because it includes all
intervening repository work; this change adds no runtime dependency.

The final in-page Playwright trace measured:

| Metric | Before fix | Final | Target |
|--------|------------|-------|--------|
| 10,000-block filter P95, isolated (20 exact + minor-typo samples) | 247.0 ms | 26.5 ms | <100 ms |
| 10,000-block filter P95, full two-worker gate | No valid in-page baseline | 83.5 ms | <100 ms |
| Listing check click → verdict, full gate | Invalid driver-timed proxy | 108.9 ms | <500 ms |
| Trusted map pan, full gate | Invalid driver-timed proxy | 63.8 fps; 25.9 ms max gap | >30 fps; <100 ms gap |

The comparable isolated filter trace improved by 220.5 ms (89.3%) on the same
rebased tree; the baseline run restored only `searchFuse.ts` and
`useFilterPipeline.ts` to `origin/main`. The full two-worker `check:pr` run
also remained within the 100 ms requirement. Listing and map values do not
claim a numeric before/after delta: the superseded checks timed Playwright/CDP
work rather than the user-visible browser interval.

### Current initial load budget

- Modulepreload total: 100,703 B / 225,280 B budget =
  **44.7% of budget used**
- Remaining budget: 124,577 B gzip. Dependency additions still require
  measurement and lazy-loading justification.

## Findings and disposition

### 1. Filtering pipeline — translator dependency instability (resolved)

**File:** `src/hooks/useFilterPipeline.ts:240-261`

**Issue:** `geographicIntent` and `mapGeographicIntent` useMemo blocks depend
on `t` (the translator function). If the `t` reference is recreated on
language context changes or component re-renders, both memos recompute even
when the actual translated string hasn't changed.

**Impact:** Low-medium. Only triggers on locale changes (rare) or if i18n
context is unstable. With 10,000+ blocks, `resolveGeographicSearchIntent`
scans the station list — unnecessary recomputation wastes ~1-2ms per pass.

**Fix:** The translated "Near Me" label is resolved to a primitive before the
geographic-intent memos. Replacing `t` with a function that returns the same
label does not change those memo dependencies.

### 2. Filtering pipeline — duplicate filter passes (resolved)

**File:** `src/hooks/useFilterPipeline.ts:230-238`

**Issue:** Two separate `getFuseMatchedKeys` calls run — one for
`stableFilters.search` (results) and one for `mapFilters.search` (map). After
the 100ms debounce settles, both values are identical.

**Impact:** The measured 10,000-block path exceeded the 100ms P95 target when
the live search invalidated map state immediately and the debounced update
repeated that work.

**Fix:** `mapFilters` now excludes the live search value from its memo
dependencies and changes only when `debouncedSearch` changes. Structured
exact/one-edit queries use a corpus-scoped, length-bucketed field index before
Fuse.js; broader free text retains Fuse ranking. The latest result is reused
when the result and map queries converge.

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

**File:** `src/features/listing-check/ComparableEvidenceTable.tsx`

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
| Listing check verdict | Playwright: click → verdict visible | < 500ms per deterministic trace |
| Map pan/zoom stability | Playwright: interaction trace FPS | > 30fps |
| Bundle preload total | `vp run check:bundle` | < 225,280 B gzip |
| Test suite duration | `vp run test` | Record and compare like-for-like |

### How to capture

1. Run `vp run build && vp run check:bundle` — record preload sizes.
2. Run the Playwright performance spec for filter/check/map scenarios.
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

1. **Keep the Playwright performance trace in the pre-PR gate** — it now
   records filter/check/map timings in-page and asserts functional outcomes.
2. **Preserve structured-search and debounce regressions** — the focused unit
   and hook tests protect exact/typo/Fuse behavior and map-filter stability.
3. **Monitor comparable table growth** — if engine cap increases beyond 30,
   evaluate @tanstack/react-virtual for the evidence table.
4. **Consider worker only for future local-only analysis** — e.g., if a
   browser-side scoring/ranking workbench is added for power users.
