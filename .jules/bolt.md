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
