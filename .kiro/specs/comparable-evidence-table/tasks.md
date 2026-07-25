# Tasks: Comparable Evidence Table

> Execution checklist. Order respects dependencies: types & helpers → table
> component → integration → tests → cleanup. Each task names its acceptance
> check.
>
> Current integration contract: `ListingCheckPanel` is the sole listing-check
> UI and `ComparableEvidenceTable` is its sole comparable-evidence surface.

## Phase 1 — Types and sort helpers

- [ ] **T1.1** Define `SortKey` type (`'month' | 'floorAreaSqm' |
  'resalePrice' | 'pricePerSqm' | 'similarity'`) and `SortDirection` type
  (`'asc' | 'desc'`) in `ComparableEvidenceTable.tsx` (or a co-located
  types file). Define `VIRTUALIZATION_THRESHOLD = 50` constant. Define
  `DEFAULT_SORT_DIRECTIONS` record mapping each `SortKey` to its default
  direction (descending for price/pricePerSqm/similarity, ascending for
  month/floorAreaSqm).
  → `npm run typecheck` passes. (R2.1, R2.3, R8.1)

- [ ] **T1.2** Implement a pure `sortComparables(comparables, sortKey,
  sortDirection)` function that returns a new sorted array without mutating
  the input. Numeric fields sort numerically; `month` sorts
  lexicographically (YYYY-MM format is naturally sortable). Tie-break:
  similarity descending, then month descending.
  → `npm run typecheck` passes. (R2.4)

## Phase 2 — Evidence table component (desktop)

- [ ] **T2.1** Create
  `src/features/listing-check/ComparableEvidenceTable.tsx` with the props type:
  `{ comparables, referenceMonth, widenedSearch, caveats }`.
  Scaffold the outer container, "Why these comparables?" collapsible
  section, caveat banner, and table skeleton with column headers. Use shadcn
  `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
  primitives.
  → `npm run typecheck` passes. (R1.1, R1.2, R10.3)

- [ ] **T2.2** Implement column headers with sort controls. Each sortable
  header contains a `<button>` with a chevron icon indicating sort
  direction. Clicking toggles sort state. Active column uses
  `text-foreground`; inactive columns use `text-muted-foreground`. Add
  `aria-sort` attributes.
  → `npm run typecheck` passes. (R2.2, R2.3, R2.5, R2.6, R10.1, R10.4)

- [ ] **T2.3** Implement table body rows. Each row renders: formatted month,
  `block streetName` composite, flat type, storey range, floor area with
  unit, lease commence year (or "—"), compact currency for resale price,
  compact currency for $/sqm, original registered price when present,
  similarity percentage with micro progress bar, and match reason badges.
  → `npm run typecheck` passes. (R1.1, R4.1, R4.2, R4.3, R7.1, R7.2, R10.2,
  R10.5)

- [ ] **T2.4** Wire up sort state via `useState` for `sortKey` and
  `sortDirection`. Compute sorted array via `useMemo` calling
  `sortComparables`. Set default to `{ key: 'similarity', direction: 'desc' }`.
  → `npm run typecheck` passes. (R2.1, R2.4)

- [ ] **T2.5** Implement the "Why these comparables?" collapsible explainer.
  Use shadcn `Collapsible` (or native `<details>`/`<summary>`). Content
  varies based on `widenedSearch` flag and caveat count. Default collapsed.
  Explicitly state that price is not used for selection.
  → `npm run typecheck` passes. (R5.1–R5.5)

- [ ] **T2.6** Implement the caveat banner above the table. Render each
  caveat string as a warning-styled item (icon + text). Only renders when
  `caveats.length > 0`.
  → `npm run typecheck` passes. (R6.1, R6.2)

- [ ] **T2.7** Implement the empty state: when `comparables.length === 0`,
  render a centered message with an `Info` icon instead of the table.
  → `npm run typecheck` passes. (R1.3)

- [ ] **T2.8** Implement original-price column visibility: when no comparable
  in the array has a `rawResalePrice` field (or all are undefined), hide the
  entire column. Otherwise show "—" for individual rows missing the value.
  → `npm run typecheck` passes. (R7.2, R7.3)

## Phase 3 — Mobile card layout

- [ ] **T3.1** Add the mobile card layout below the desktop table in the
  same component. Desktop table uses `hidden sm:table`; mobile cards use
  `sm:hidden`. Each card is an `<article>` with `aria-label`.
  → `npm run typecheck` passes. (R3.1, R3.2, R3.4)

- [ ] **T3.2** Implement card content: price row (price + area + $/sqm),
  original registered price when present, location row (block + street),
  details row (flat type + storey + lease), month, similarity bar with
  percentage, and match reason badges.
  → `npm run typecheck` passes. (R3.3)

- [ ] **T3.3** Mobile cards respect the same sort order as the desktop table
  (shared `useMemo` sorted array).
  → `npm run typecheck` passes. (R2.4)

## Phase 4 — Integration into ListingCheckPanel

- [ ] **T4.1** Import `ComparableEvidenceTable` in `ListingCheckPanel.tsx`.
  Render it below the verdict card, passing `comparables`,
  `referenceMonth`, `widenedSearch`, and `caveats` from the existing
  `comparableSet` state.
  → `npm run typecheck` passes. (R9.1)

- [ ] **T4.2** Remove the legacy compact comparable-list import, usage, and
  component. Verify `ListingCheckPanel.tsx` renders only
  `ComparableEvidenceTable` for transaction evidence.
  → `npm run typecheck` passes; no duplicate listing-check surface builds.
  (R9.2, R9.3, R12.1)

- [ ] **T4.3** Remove the `comparablesExpanded` state from
  `ListingCheckPanel` (no longer needed without the collapsible list).
  → `npm run typecheck` passes. (R9.2)

## Phase 5 — Component tests

- [ ] **T5.1** Add `tests/components/ComparableEvidenceTable.test.tsx`:
  - Renders all column headers (Month, Block/Street, Flat Type, Storey,
    Area, Lease, Price, $/sqm, Similarity).
  - Renders correct number of rows for a 5-item comparables array.
  - Default sort: first row has the highest similarity value.
  → `npm run test` passes. (R11.1)

- [ ] **T5.2** Add sort interaction tests:
  - Click "Price" header → first row has highest price.
  - Click "Price" header again → first row has lowest price.
  - Click "Month" header → first row has earliest month.
  - Click "Similarity" header → back to default sort.
  → `npm run test` passes. (R11.1)

- [ ] **T5.3** Add empty state test:
  - Pass empty `comparables` array → "No comparable transactions found"
    message is visible.
  - Table headers are not rendered.
  → `npm run test` passes. (R11.1)

- [ ] **T5.4** Add low-confidence / caveat tests:
  - Pass non-empty `caveats` array → caveat banner is visible.
  - Pass `widenedSearch: true` → explainer mentions widened search.
  - Pass `widenedSearch: false` → explainer mentions same-block search.
  → `npm run test` passes. (R11.1)

- [ ] **T5.5** Add display format tests:
  - Similarity of 0.87 → cell shows "87%".
  - Match reasons array → correct number of badges rendered.
  - Price formatted with currency formatter.
  → `npm run test` passes. (R11.1)

## Phase 6 — E2E tests

- [ ] **T6.1** Update `tests/e2e/listing-check.spec.ts`:
  - After completing a listing check, the evidence table is visible.
  - At least one row contains match reason badges.
  - Clicking a sortable column header changes the order of the first row.
  → `npm run test:e2e` passes. (R11.2)

## Phase 7 — Verification

- [ ] **T7.1** `npm run typecheck` passes with no errors.
- [ ] **T7.2** `npm run lint` passes with no errors.
- [ ] **T7.3** `npm run test` passes — all existing + new tests green.
- [ ] **T7.4** `npm run test:e2e` passes — all existing + new E2E tests green.
- [ ] **T7.5** Manual smoke via `npm run dev:functions`:
  - Check tab: select a block, fill form, run listing check.
  - Evidence table appears below the verdict card with all columns.
  - Click column headers to verify sorting works.
  - Resize to mobile width: card layout replaces table.
  - "Why these comparables?" collapsible expands and collapses.
  - Empty state visible when no comparables found.
  - `ListingCheckPanel` remains the only listing-check workflow.
- [ ] **T7.6** Verify `ComparableEvidenceTable` is the sole transaction-
  evidence surface and no retired listing-check components remain.
  (R12.1, R12.2)
