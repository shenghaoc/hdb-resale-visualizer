## 2024-05-18 - Heavy Text Tokenization in Array Filters
**Learning:** In a map/search application, filtering over thousands of items triggers regex-based text tokenization (`tokenizeSearchText`) for the query string AND every single item's display string, redundantly, on every keystroke or filter change. The unoptimized implementation runs in O(N) operations per filter pass for repetitive values.
**Action:** Always memoize pure tokenization functions that run per-item in a large array filter (e.g. using a Map cache), as well as cache the tokenized output of static properties on the items themselves if possible. This cut array filter times by ~65% in benchmark.

## 2024-06-25 - Redundant Set Allocations in Array Filtering
**Learning:** Instantiating `new Set(...)` and `Array.prototype.map(...)` on every item inside hot loops (like array filtering) can introduce significant garbage collection overhead and slow down operations, particularly on large arrays. The array method `some` with an early exit avoids instantiating new intermediate arrays or sets and evaluates quicker.
**Action:** When filtering or looping over many items, use `Array.some()` with early returns rather than converting arrays to `Set` inline to check for inclusion. This avoids unnecessary object allocations and leverages built-in array iteration optimizations.

## 2026-04-25 - React.memo on List Item Components
**Learning:** Long lists of complex components, like `BlockCard` in `ResultsPane`, can re-render every item when parent state changes unless both the item component and function props are stable.
**Action:** Wrap list item components in `React.memo`, memoize callbacks passed into those items, and memoize custom hook return objects when callers keep the object reference.
