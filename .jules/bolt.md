## 2024-05-18 - Heavy Text Tokenization in Array Filters
**Learning:** In a map/search application, filtering over thousands of items triggers regex-based text tokenization (`tokenizeSearchText`) for the query string AND every single item's display string, redundantly, on every keystroke or filter change. The unoptimized implementation runs in O(N) operations per filter pass for repetitive values.
**Action:** Always memoize pure tokenization functions that run per-item in a large array filter (e.g. using a Map cache), as well as cache the tokenized output of static properties on the items themselves if possible. This cut array filter times by ~65% in benchmark.

## 2024-06-25 - Redundant Set Allocations in Array Filtering
**Learning:** Instantiating `new Set(...)` and `Array.prototype.map(...)` on every item inside hot loops (like array filtering) can introduce significant garbage collection overhead and slow down operations, particularly on large arrays. The array method `some` with an early exit avoids instantiating new intermediate arrays or sets and evaluates quicker.
**Action:** When filtering or looping over many items, use `Array.some()` with early returns rather than converting arrays to `Set` inline to check for inclusion. This avoids unnecessary object allocations and leverages built-in array iteration optimizations.

## 2026-04-25 - React.memo on List Item Components
**Learning:** Long lists of complex components, like `BlockCard` in `ResultsPane`, can re-render every item when parent state changes unless both the item component and function props are stable.
**Action:** Wrap list item components in `React.memo`, memoize callbacks passed into those items, and memoize custom hook return objects when callers keep the object reference.

## 2026-04-26 - Short-Circuiting Array Filtering Operations
**Learning:** The order of logical conditions inside hot loops (like array filtering over 50,000+ items) heavily impacts performance. Placing expensive string manipulations or tokenizations before cheap comparison operations (like simple equality or bounds checks) will unnecessarily compute expensive regex for blocks that would have been rejected anyway. Also instantiating objects like `new Date()` within these loops adds significant GC and evaluation overhead.
**Action:** When creating filtering chains for large arrays, always place cheap bounds checks (`===`, `<`, `>`) first to short-circuit evaluation. Defer the most expensive operations (like full-text search tokenization) to the absolute end. Hoist repetitive object instantiations (like calculating the current year) outside of the loop entirely.

## 2024-06-25 - Redundant Work Inside Sorting Callbacks
**Learning:** Functions used within `Array.prototype.sort()` execute repeatedly (O(N log N)). In components like `ResultsPane`, evaluating properties inside the `sort` comparator — such as repeatedly fetching `getCurrentYear()` or doing string-to-number transformation via `.replace()` — adds substantial cumulative overhead across thousands of records.
**Action:** Always hoist independent data evaluation outside the comparator function loop. Pass fixed primitives as parameters, and utilize JS native string comparisons directly (e.g. `YYYY-MM < YYYY-MM`) instead of parsing string dates into Numbers inside `sort`.

## 2024-05-18 - Heavy Intl Object Instantiations in Formatting
**Learning:** `Intl.NumberFormat` and `Intl.DateTimeFormat` are known to be slow to instantiate. In a map/search application where formatting functions like `formatCompactCurrency`, `formatCurrency`, `formatMonth`, and `formatNumber` are called thousands of times inside loops or renders, this creates a significant performance bottleneck (e.g. from 3000ms down to 45ms per 50,000 calls).
**Action:** Always memoize and cache the `Intl` formatter instances (e.g., using a Map with a key derived from locale and options) so that they are reused across formatting calls.
## 2024-05-18 - [ResultsPane Sorting Optimization]
**Learning:** Calling a function containing a `switch` statement dynamically inside `Array.prototype.sort()` creates a massive performance penalty for large datasets due to O(N log N) evaluations of the `sortMode`. Moving the `if/else` logic outside the sort loop and providing inline comparators can speed up sorting significantly (~15-20%).
**Action:** When sorting dynamic collections in React, always evaluate the sort conditions *outside* the `.sort()` comparator loop, returning specific, optimized comparators for each condition. Remove unnecessary operations from sort comparators (e.g. constant math like `MAX_LEASE_DURATION - (currentYear - value)` can just be sorted by `-value` or reversed).

## 2026-04-26 - Geographic Search Intent Optimization
**Learning:** Inside `matchesGeographicSearchIntent` (which runs in a hot loop when filtering thousands of blocks by MRT), spreading arrays (`[block.nearestMrt, ...(block.nearbyMrts ?? [])]`) and running `.filter()` creates substantial array allocation overhead. Furthermore, evaluating `normalizeStationName` before checking distance bounds unnecessarily computes regexes on stations that are out of range.
**Action:** When filtering across multiple nested object lists per-item, evaluate items natively without spreading into intermediate arrays. Always evaluate cheap numeric comparisons (`distanceMeters <= radiusMeters`) before calling expensive normalizations or tokenizations.
## 2024-05-02 - Added `useI18n` Hook Tests
**Learning:** Testing a React hook requires using `@testing-library/react` and its `renderHook` method. To test a hook that relies on a Context Provider, you can pass a custom `wrapper` option to `renderHook` that renders the Provider around the hook. To catch expected errors and prevent them from cluttering the test output, `vi.spyOn(console, "error").mockImplementation(() => {})` can be used.
**Action:** When testing hooks that consume contexts in the future, apply the `renderHook` with `wrapper` pattern.

## 2025-05-02 - Testing `format.ts` and Intl format caching
**Learning:** Pure formatting functions that make use of `Intl` APIs can be straightforward to test, but handling localized output correctly while checking for expected properties like inclusion of standard numbers or symbols avoids brittle tests that break across Node environments. The caching eviction of our custom objects was also tricky but easily triggered via varying simple arguments in a loop.
**Action:** When testing UI/format utility functions, prefer string containment or regex checks rather than exact equality matching, particularly for formatted localized text or strings that may change representations based on engine versions. Always use dependency injection/mocking to deterministically control system parameters like date or `getCurrentYear` in tests.

## 2024-05-18 - Utility Unit Tests Addition
**Learning:** Testing simple utility functions like `cn` and `townToFilename` provides safety against regressions in core helpers that are used pervasively throughout the app. Testing `cn` explicitly confirms proper behavior for combining, resolving conflicts (via tailwind-merge), and dropping falsy inputs (via clsx).
**Action:** Always include complete unit test suites for base utility functions to prevent subtle UI bugs and ensure components can trust basic helper assumptions.

## 2025-01-20 - Inline Types in Component Props
**Learning:** Defining complex nested types directly inline in component props (such as `React.ComponentProps<"div"> & { errors?: Array<{ message?: string } | undefined> }`) can cause automated code health tools to misidentify syntax (like mistaking multiple `?` for a nested ternary operator) and reduces code readability.
**Action:** Extract complex inline prop definitions into dedicated interface or type declarations above the component to improve readability and tooling accuracy.

## 2024-05-18 - Caching String Outputs of Intl Formatters
**Learning:** Even when `Intl` formatter instances are cached, calling their `.format()` method repeatedly in hot loops (e.g. for large list renders) or performing setup operations (like string splitting or Date instantiations in `formatMonth`) is computationally expensive (~100-150ms per 50,000 items). Since the underlying data (like months, or rounded prices) is highly repetitive, a significant amount of redundant formatting occurs.
**Action:** In pure formatting functions handling repetitive data, implement an LRU-like Map to cache the actual string output based on the input value and locale. Returning the precomputed string rather than invoking the `.format()` logic reduces execution time by over 10x for repeated values.
## 2023-10-27 - GeoJSON Object Allocation Spike

**Learning:** When repeatedly mapping over thousands of items (e.g., frontend datasets of HDB blocks) to generate derived structures like GeoJSON features on filter changes, creating new objects on every render allocates megabytes of memory and blocks the main thread, causing GC spikes and UI stutter.
**Action:** Use a `WeakMap` keyed by the original data reference (e.g. `BlockSummary`) to cache the generated objects (e.g., `GeoJsonFeature`), completely eliminating allocation overhead on subsequent mappings while avoiding memory leaks.
## 2026-05-07 - Hoisting operations and avoiding implicit true function calls in loops
**Learning:** Even fast operations like `.trim().toUpperCase()` or empty-string function calls (`tokenizeSearchText("")`) become significant bottlenecks when buried inside a loop processing 10,000+ items (like our `matchesFilter`). The frontend filter loop executes continuously upon user interactions, causing GC spikes and frame drops from hidden object allocations and function call overheads.
**Action:** Always identify variables that are constant throughout the loop (e.g. `filters.flatType`) and cache or evaluate them exactly once outside the loop boundaries. Additionally, guard expensive functions (like search tokenization matching) with short-circuit checks (`filters.search` falsiness) to avoid redundant evaluation logic on the common default state (empty input).
## 2026-05-10 - Replacing Multiple Sorting with Single Pass
**Learning:** Performing multiple sorting operations on arrays (`[...rows].sort()`) just to find the min or max element is extremely computationally expensive. This takes $O(N \log N)$ complexity and causes garbage collection overhead per evaluation. By combining min/max findings within a single $O(N)$ linear pass, performance can be heavily improved.
**Action:** When finding extremes in a dataset, use a single `for` loop tracking the min/max values rather than completely sorting the array.
## 2026-05-11 - Binary Search for Percentile Calculation
**Learning:** Calculating percentiles inside a loop using `Array.prototype.sort()` creates an O(N log N) overhead per iteration. For populations that do not change during metric generation, this results in massive redundant computation. By pre-sorting the populations once and applying a binary search to find the rank, the per-item calculation drops to O(log N).
**Action:** When calculating metrics against a static population inside a loop, pre-sort the population reference data outside the loop and use binary search instead of repeatedly sorting arrays inline.

## 2024-06-25 - Haversine Bounding Box Fast Path
**Learning:** Checking distance limits over large arrays (like thousands of HDB blocks) using the haversine formula (`computeDistanceMeters`) is slow due to excessive trigonometric functions (`Math.sin`, `Math.cos`, `Math.sqrt`, `Math.atan2`).
**Action:** Always implement a cheap "bounding box" check before the spherical distance calculation. A conservative approximation (e.g. `110,000` meters per degree for both latitude and longitude near the equator) allows fast-path short-circuiting and yields a ~3-4x performance speedup.
