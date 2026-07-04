# Requirements: Comparable Evidence Table

## R1 — Evidence table component

- **R1.1** A new component `ComparableEvidenceTable` in
  `src/components/ComparableEvidenceTable.tsx` renders a table of comparable
  transactions with columns: month, block/street, flat type, storey range,
  floor area sqm, lease commence year, resale price, price per sqm,
  original registered price when time adjustment is available, similarity
  score, and match reasons.
- **R1.2** The component accepts props: `comparables` (readonly array of
  `ComparableTransaction`), `referenceMonth` (string), `widenedSearch`
  (boolean), and `caveats` (readonly array of string).
- **R1.3** WHEN the `comparables` array is empty THEN the component renders
  an empty state message ("No comparable transactions found") with an info
  icon.
- **R1.4** The component does not fetch data — it receives all data via props
  from `ListingCheckPanel`.

## R2 — Sorting

- **R2.1** The default sort is by similarity descending (strongest
  comparables first).
- **R2.2** The user can sort by: month, floor area sqm, resale price, price
  per sqm, and similarity. Each sortable column header is clickable.
- **R2.3** WHEN a sortable column header is clicked THEN the table sorts by
  that column. If the column is already the active sort, the direction
  toggles. If it is a new column, the default direction is: descending for
  price, price per sqm, and similarity; ascending for month and floor area.
- **R2.4** The sorted array is computed in a `useMemo` keyed on
  `[comparables, sortKey, sortDirection]`. No array mutation or allocation
  occurs inside the render path.
- **R2.5** The active sort column header displays a directional chevron icon
  and uses `text-foreground` instead of `text-muted-foreground`.
- **R2.6** Sortable column headers include `aria-sort` attributes
  (`ascending`, `descending`, or `none`) for accessibility.

## R3 — Mobile card layout

- **R3.1** Below the `sm:` breakpoint (640px), the table is replaced with a
  stacked card layout. Each card shows all columns in a vertical arrangement.
- **R3.2** The desktop table has `hidden sm:table` and the mobile card list
  has `sm:hidden`. No JavaScript media query or resize observer is used.
- **R3.3** Mobile cards display: price + area + $/sqm on the first line,
  original registered price when time adjustment is available, block + street
  on the second line, flat type + storey + lease on the third line, month, a
  similarity bar with percentage, and match reason badges.
- **R3.4** Mobile cards use `<article>` elements with an `aria-label`
  summarising the transaction.

## R4 — Similarity display

- **R4.1** The similarity score is displayed as a percentage (0–100%),
  computed as `Math.round(similarity * 100)`.
- **R4.2** A micro progress bar (4px height) visualises the similarity score
  using `bg-primary` fill with width proportional to the score.
- **R4.3** Match reasons are rendered as small inline badges
  (`Badge variant="outline"`, smaller font) next to or below the similarity
  score.

## R5 — "Why these comparables?" explainer

- **R5.1** A collapsible section above the table explains how comparables
  were selected. Default state is collapsed.
- **R5.2** WHEN `widenedSearch` is false THEN the explainer states that
  comparables are from the same block, ranked by non-price similarity.
- **R5.3** WHEN `widenedSearch` is true THEN the explainer mentions that the
  search was widened and explains why.
- **R5.4** WHEN the comparable count is below the low-sample threshold THEN
  the explainer mentions the low count and advises treating the result as
  directional.
- **R5.5** The explainer explicitly states that price is never used to select
  comparables.

## R6 — Caveat banner

- **R6.1** WHEN `caveats` is non-empty THEN a caveat banner renders above
  the table showing each caveat as a warning-styled item.
- **R6.2** The caveat banner is a reinforcing duplicate of the verdict card
  caveats — it remains visible when the verdict card scrolls out of view.

## R7 — Original price column for adjusted comparables

- **R7.1** WHEN any comparable includes `rawResalePrice` THEN the "Orig. Price"
  column is present in the table header.
- **R7.2** WHEN a comparable transaction includes `rawResalePrice` THEN the
  cell displays the registered resale price before time adjustment.
- **R7.3** WHEN no comparable in the dataset has `rawResalePrice` THEN the
  entire column is hidden to avoid a column of dashes.

## R8 — Virtualisation readiness

- **R8.1** A named constant `VIRTUALIZATION_THRESHOLD` (default 50) is
  defined in the component file.
- **R8.2** The current implementation renders all rows directly (no
  virtualisation library) because `MAX_COMPARABLES = 30` is below the
  threshold.
- **R8.3** No new npm dependency is added for virtualisation in this spec.

## R9 — Integration into ListingCheckPanel

- **R9.1** `ListingCheckPanel.tsx` renders `ComparableEvidenceTable` below
  the verdict card (after the distribution bar and caveats section).
- **R9.2** The `ComparableTransactionsList` usage inside `ListingCheckPanel`
  is removed and replaced by the new evidence table.
- **R9.3** `ComparableTransactionsList.tsx` is preserved — it is still used
  by `AskingPriceCheck.tsx` inside `DetailDrawer`.
- **R9.4** The verdict card, distribution bar, and caveat rendering inside
  the card remain unchanged.

## R10 — Styling and accessibility

- **R10.1** Table headers use the existing label style: `text-[0.62rem]
  font-extrabold uppercase tracking-[0.14em] text-muted-foreground`.
- **R10.2** Numeric cells use `tabular-nums` for alignment.
- **R10.3** The table uses semantic `<table>` / `<thead>` / `<tbody>`
  elements via shadcn `Table` primitives.
- **R10.4** Sortable column headers use `<button>` inside `<th>` with
  `aria-sort` attributes.
- **R10.5** Match reason badges use `Badge variant="outline"` with a smaller
  font (`text-[0.55rem]`).

## R11 — Tests

- **R11.1** Vitest component tests for `ComparableEvidenceTable`:
  - Renders all column headers.
  - Renders correct row count for a given comparables array.
  - Default sort: first row has highest similarity.
  - Sorting by price: click header → re-sorts descending; click again →
    ascending.
  - Empty state: shows "no comparables" message when array is empty.
  - Low-confidence state: shows caveat banner when caveats are non-empty.
  - Match reason badges render for each comparable.
  - Similarity percentage displays correctly (0.87 → "87%").
  - "Why these comparables?" explainer renders different text for widened vs
    non-widened search.
- **R11.2** E2E tests (updated `tests/e2e/listing-check.spec.ts`):
  - Evidence table visible after a listing check completes.
  - Sorting a column header reorders rows.
  - Match reason badges visible.

## R12 — Preservation

- **R12.1** `ComparableTransactionsList.tsx` is not deleted.
- **R12.2** `AskingPriceCheck.tsx` inside `DetailDrawer` is not modified.
- **R12.3** The comparable engine (`shared/comparable-engine.ts`) is not
  modified.
- **R12.4** The API endpoint (`/api/comparable-transactions`) is not
  modified.
- **R12.5** Existing tests continue to pass.
