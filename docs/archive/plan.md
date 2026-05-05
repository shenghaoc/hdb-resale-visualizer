1. **Optimize `matchesFilter` inside `src/lib/filtering.ts`**
   - The filtering logic is executed inside a tight loop over thousands of blocks whenever a user types or changes filters.
   - Currently, it instantiates a `new Date().getFullYear()` for every single block being evaluated during `matchesFilter` to calculate `maxRemainingLease`.
   - By hoisting `new Date().getFullYear()` outside `matchesFilter`, or lazy-initializing a module-level cached variable, we can avoid this allocation overhead for every array item. Given `currentYear` rarely changes while the app is active, it can be cached at the module level.

2. **Optimize `getSortValue` inside `src/components/ResultsPane.tsx`**
   - Sorting inside `ResultsPane` uses `getSortValue` on every single block comparison: `[...blocks].sort((left, right) => getSortValue(left, sortMode) - getSortValue(right, sortMode));`.
   - `getSortValue` instantiates `new Date().getFullYear()` every time it runs. This is called $O(N \log N)$ times during sorting.
   - Hoist `new Date().getFullYear()` into `useMemo` block surrounding the `sort` operation, and pass it to `getSortValue`.

3. **Optimize `formatRemainingLease` inside `src/lib/format.ts`**
   - Similarly, this gets called in render loops for multiple components.
   - Cache `new Date().getFullYear()` at the module level since the application lifecycle is short relative to a full year.

4. **Add entry to `.jules/bolt.md`**
   - Document the performance anti-pattern of instantiating `Date` objects in tight loops over large array filters or sorts, as this takes a surprisingly large amount of time relative to the pure math and comparisons.

5. **Run Pre-Commit Checks**
   - Check format, linting, tests, and build.

6. **Submit PR**
   - Submit the PR with the performance changes.
