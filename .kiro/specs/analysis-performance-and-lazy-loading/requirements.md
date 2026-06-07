# Requirements: Analysis Performance and Lazy Loading

## R1 — Baseline and measurement

- **R1.1** Capture pre-change baseline values for:
  - `npm run build`
  - `npm run check:bundle`
  - `npm run test`
  - `npm run lint`
  - Playwright interaction timings for filter/search/map/check flows.
- **R1.2** Record INP, LCP, and CLS using existing reporting pathway (`src/lib/performance.ts`) before and after changes.
- **R1.3** Keep all baseline outputs under version control notes for later comparison in review comments.

## R2 — Bundle-size safety

- **R2.1** New dependencies required for analysis surfaces must not increase initial preload budgets beyond current checks without explicit justification.
- **R2.2** Add/adjust lazy boundaries so heavy dependencies do not appear in initial modulepreload set by default.
- **R2.3** `npm run check:bundle` must continue to pass after introducing lazy split points.

## R3 — Analysis performance and responsiveness

- **R3.1** Keep listing check interactions responsive while the comparable payload is loading or being processed.
- **R3.2** Move non-API-required expensive post-processing (sorting/filtering/summaries) out of direct React render paths.
- **R3.3** Preserve existing API behavior for comparable retrieval; API endpoint still remains authoritative.
- **R3.4** Listing price check should remain usable while comparable data is large or when multiple quick edits occur.

## R4 — Filtering pipeline efficiency

- **R4.1** Reduce unnecessary recomputation in `useFilterPipeline.ts` and `matchesFilter` by improving memo boundaries and input identity control.
- **R4.2** Ensure filtering work is amortized and cache-friendly under repeated typing and filter toggles.
- **R4.3** Keep existing short-circuit semantics and result correctness in map and results panes.

## R5 — Comparable scoring and table performance

- **R5.1** For analysis views, use worker-backed or memoized compute path for heavy comparable transformations and stable ranking.
- **R5.2** Add optional virtualization for comparable tables when row count exceeds threshold.
- **R5.3** Keep small payloads on the fast direct render path.
- **R5.4** Never recompute comparable display arrays in JSX render loops.

## R6 — Map rendering performance

- **R6.1** Reduce redundant map source/layer sync operations on frequent `styledata`/interaction cycles.
- **R6.2** Preserve current map UX and layer ordering while reducing unnecessary updates.
- **R6.3** Continue using existing map stack and avoid rewriting map primitives.

## R7 — Mobile responsiveness

- **R7.1** Maintain a dedicated mobile rendering path for tables/cards with smaller DOM trees.
- **R7.2** Ensure analysis-heavy surfaces do not block touch interactions due to oversized desktop-only rendering.
- **R7.3** Preserve accessibility and readable layout at mobile widths.

## R8 — Rerender and render-path hygiene

- **R8.1** Avoid expensive derived computations inside render for both listing check and result views.
- **R8.2** Memoize all pure transformation pipelines using stable dependencies.
- **R8.3** Limit rerender propagation by passing memoized data/handlers to heavy child components.

## R9 — Optional worker architecture

- **R9.1** Introduce worker boundary only when an analysis task can be clearly measured as UI-blocking.
- **R9.2** Worker payloads must be typed and structured (`Request`/`Result` contracts).
- **R9.3** Worker initialization must be lazy and only occur in analysis-heavy UI states.

## R10 — Heavy dependency governance

- **R10.1** Add `@tanstack/react-virtual` only for large row bodies and only in lazy analysis chunks.
- **R10.2** Add Comlink only if function-call complexity or maintenance overhead makes raw message passing materially worse.
- **R10.3** Do not add DuckDB-WASM or Arquero unless a concrete analysis-workbench use case is approved.

## R11 — Validation

- **R11.1** Keep all existing unit/e2e tests passing.
- **R11.2** Add benchmark-style tests/scripts for before/after deltas where practical.
- **R11.3** Add explicit assertions for thresholds and feature flags that gate lazy and virtualized paths.

## R12 — Current baseline and dependency decisions

- **R12.1** Baseline measurements for bundle + bundle budget, INP/LCP/CLS, and Playwright traces are required before and after performance work in Phase 8.
- **R12.2** `@tanstack/react-virtual` is currently not added; add only if thresholded comparable-table row virtualization proves necessary after profiling.
- **R12.3** Web Worker support is currently deferred to explicit profiling evidence of UI-blocking comparable transforms.
- **R12.4** Do not add Comlink unless message-passing complexity exceeds a small helper-function boundary.
- **R12.5** Do not add DuckDB-WASM or Arquero without a concrete in-browser analysis-workbench user story.
