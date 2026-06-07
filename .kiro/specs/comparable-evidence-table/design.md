# Design: Comparable Evidence Table

> Status: Draft. Add a high-density evidence table inside the Listing Price
> Check result so buyers can inspect the actual transactions behind a verdict.

## Problem

The current Listing Price Check panel shows a verdict card with summary
statistics (median, percentiles, delta) and a compact expandable list of
comparables (`ComparableTransactionsList`). The list shows only price, storey
range, floor area, and month — four fields per row, capped at 8 items.

This leaves buyers with three blind spots:

1. **No visibility into why these comparables were chosen.** The v2 engine
   computes a per-transaction similarity score and match reasons, but neither
   is surfaced. A buyer cannot tell whether a comparable is from the same block
   or a different town.

2. **Key columns are missing.** Lease commence year (or remaining lease),
   price per sqm, and time-adjusted price (when available) are absent. These
   are the columns that experienced buyers use to normalise and compare
   transactions.

3. **No sorting or exploration.** The list is static and ordered by the
   engine's similarity ranking. A buyer who wants to sort by date, price, or
   area to spot trends cannot do so.

4. **Mobile is unusable at table density.** A full-width table on a 375px
   viewport becomes a horizontal scroll nightmare. The current compact list
   avoids this by omitting columns, but that hides the evidence.

## Goals

- Replace the expandable `ComparableTransactionsList` inside
  `ListingCheckPanel` with a new `ComparableEvidenceTable` component that
  shows all requested columns.
- Surface similarity score and match reasons per comparable.
- Allow interactive sorting by date, price, price per sqm, floor area, and
  similarity.
- Default sort: highest similarity first (strongest comparables at top).
- On mobile (< 640px), render a card-based layout instead of a cramped table.
- Show caveats above the table (already rendered in the verdict card; the
  evidence table section adds its own contextual header).
- Include a "Why these comparables?" explainer.
- Virtualise the list when the comparable set exceeds a threshold (the v2
  engine returns up to 30, but future increases are possible).
- Keep all computation (sorting, formatting) outside React render loops.
- Do not introduce AI APIs, prediction models, or runtime external calls.

## Non-goals

- Modifying the comparable engine (`shared/comparable-engine.ts`) — it already
  returns all required fields.
- Modifying the API endpoint (`/api/comparable-transactions`) — the response
  shape already contains `similarity`, `matchReasons`, `leaseCommenceDate`,
  `pricePerSqm`, etc.
- Adding time-adjustment computation — this spec displays `timeAdjustedPrice`
  only if the engine provides it in the future. Until then, the column shows
  a dash or "N/A".
- Adding new API endpoints.
- Changing the verdict card, distribution bar, or caveat rendering (those
  remain unchanged above the evidence table).
- Server-side rendering or SSR concerns (this is a client-only SPA).

## Architecture

### 1. Data Flow

The evidence table consumes the same `ListingComparableSet` that is already
fetched by `ListingCheckPanel`. No new API calls are needed.

```
ListingCheckPanel fetches /api/comparable-transactions
  → receives ListingComparableSet { comparables, caveats, widenedSearch, ... }
  → passes comparables[] to <ComparableEvidenceTable />
  → table renders with client-side sorting
```

### 2. New Component: `src/components/ComparableEvidenceTable.tsx`

A self-contained component that receives sorted-ready data and handles its
own sort state. No data fetching, no side effects.

#### Props

```ts
type ComparableEvidenceTableProps = {
  comparables: ReadonlyArray<ComparableTransaction>;
  referenceMonth: string;       // for recency context display
  widenedSearch: boolean;       // controls the "why these" explainer content
  caveats: ReadonlyArray<string>; // engine-generated caveats
};
```

#### Columns

| Column | Field | Format | Sortable |
|--------|-------|--------|----------|
| Month | `month` | `YYYY-MM` → formatted via `formatMonth` | Yes |
| Block / Street | `block` + `streetName` | `"123A ANG MO KIO AVE 1"` | No |
| Flat Type | `flatType` | As-is (e.g. `"4 ROOM"`) | No |
| Storey | `storeyRange` | As-is (e.g. `"07 TO 09"`) | No |
| Area | `floorAreaSqm` | `"93 sqm"` | Yes |
| Lease | `leaseCommenceDate` | Year or remaining-lease string | No |
| Price | `resalePrice` | Currency (compact) | Yes |
| $/sqm | `pricePerSqm` | Currency (compact) | Yes |
| Adj. Price | (future field) | Currency or "—" | No |
| Similarity | `similarity` | `0–100` (displayed as percentage) | Yes |
| Match Reasons | `matchReasons` | Inline badges | No |

The "Block / Street" column is a composite display column. On mobile cards,
block and street are shown on separate lines.

#### Sort Behaviour

Sort state is a `{ key: SortKey; direction: 'asc' | 'desc' }` object stored
in component-local `useState`. The default is `{ key: 'similarity', direction:
'desc' }`.

Sortable columns: `month`, `floorAreaSqm`, `resalePrice`, `pricePerSqm`,
`similarity`. Clicking a column header toggles direction if the same column
is already active; otherwise switches to that column with its default
direction (descending for price/similarity, ascending for date/area).

The sorted array is computed via `useMemo` keyed on `[comparables, sortKey,
sortDirection]`. The sort runs on the original `ComparableTransaction[]`
array — no mutation, no allocation inside render.

#### Virtualization

The v2 engine currently caps at `MAX_COMPARABLES = 30`. At this size,
virtualisation is unnecessary overhead. However, the design leaves a hook
for it:

- If `comparables.length > VIRTUALIZATION_THRESHOLD` (default 50), the table
  body switches to `@tanstack/react-virtual` with a fixed row height.
- At ≤ 50 rows, the table renders all rows directly (no virtualiser).
- The threshold is a named constant in the component file.

This avoids adding `@tanstack/react-virtual` as a dependency unless the
engine's `MAX_COMPARABLES` is raised above 50 in the future. For now, no
new dependency is needed.

**Revised approach:** Since `MAX_COMPARABLES = 30` today and this spec does
not raise it, virtualisation is deferred entirely. The component renders all
rows directly. The `VIRTUALIZATION_THRESHOLD` constant is defined but the
virtualisation code path is not implemented — it is a marker for a future
spec. This avoids premature dependency addition.

#### Mobile Card Layout

Below `640px` (Tailwind `sm:` breakpoint), the table is replaced with a
stacked card layout. Each card contains all columns in a vertical arrangement:

```
┌─────────────────────────────────────────┐
│ $485,000  ·  93 sqm  ·  $5,215/sqm     │  ← price row
│ 123A ANG MO KIO AVE 1                  │  ← location
│ 4 ROOM  ·  07 TO 09  ·  Lease 1983     │  ← details
│ Jan 2025                                │  ← month
│ ████████░░ 87%                          │  ← similarity bar
│ [Same block] [Similar floor area]       │  ← match reason badges
└─────────────────────────────────────────┘
```

The mobile/desktop switch uses a CSS-only approach: the table layout has
`hidden sm:table` and the card layout has `sm:hidden`. No JavaScript media
query or resize observer needed.

#### "Why These Comparables?" Explainer

A collapsible section above the table (default collapsed) with a brief
explanation:

- **Normal search (not widened):** "These are the most similar recent
  transactions in the same block, ranked by how closely they match your
  listing's flat type, storey, floor area, and lease. Price is never used to
  select comparables — only to display them."
- **Widened search:** "Not enough transactions were found in the same block,
  so the search was widened to [the same street / the entire town]. The
  similarity score reflects how closely each transaction matches your listing."
- **Low confidence:** "Very few comparable transactions were found. Treat
  this as directional only."

The content is derived from `widenedSearch` and `caveats.length`. It is a
static text block, not a chart or AI-generated explanation.

#### Caveat Banner

The evidence table section starts with a caveat banner if `caveats.length >
0`. This re-renders the API's string caveats as warning badges above the
table. Note: the verdict card already displays caveats; the evidence table
banner is a reinforcing duplicate so caveats remain visible when the verdict
card scrolls out of view.

### 3. Integration into `ListingCheckPanel.tsx`

The existing `ComparableTransactionsList` usage inside the verdict card is
replaced by the new `ComparableEvidenceTable`. The table renders below the
verdict card (after the distribution bar and caveats section), not inside
the card — it needs full panel width.

```tsx
{/* Verdict card (unchanged) */}
<Card>
  {/* ... verdict badge, stats grid, distribution bar, caveats ... */}
</Card>

{/* Evidence table (new) */}
{comparables.length > 0 && (
  <ComparableEvidenceTable
    comparables={comparables}
    referenceMonth={referenceMonth}
    widenedSearch={comparableSet?.widenedSearch ?? false}
    caveats={comparableSet?.caveats ?? []}
  />
)}
```

The `ComparableTransactionsList` import and usage are removed from
`ListingCheckPanel`. The component file itself (`ComparableTransactionsList.tsx`)
is preserved because `AskingPriceCheck.tsx` in the `DetailDrawer` still uses it.

### 4. Styling

Follow the existing UI standards:

- **Table headers:** `text-[0.62rem] font-extrabold uppercase tracking-[0.14em]
  text-muted-foreground` (same as existing label style).
- **Table cells:** `text-xs tabular-nums` for numeric columns,
  `text-xs` for text.
- **Similarity bar:** A micro progress bar (4px height, rounded) using
  `bg-primary` fill. Width = `similarity * 100%`. The percentage label sits
  to the right of the bar.
- **Match reason badges:** `Badge variant="outline"` with
  `text-[0.55rem]` — smaller than standard badges to fit multiple per row.
- **Sortable column headers:** Cursor pointer, with a small chevron icon
  indicating sort direction. Active sort column gets `text-foreground`
  instead of `text-muted-foreground`.
- **Card layout (mobile):** `rounded-md bg-muted/20 p-3` per card, with
  `gap-2` between cards.

### 5. Empty and Low-Confidence States

- **Empty state (0 comparables):** A centered message with an `Info` icon:
  "No comparable transactions found for this listing." This matches the
  existing empty state pattern in the codebase.
- **Low-confidence state (< 5 comparables):** The table renders normally
  but the caveat banner above it shows the low-sample warning. The
  "Why these comparables?" explainer mentions the low count.

### 6. Accessibility

- Table uses semantic `<table>` / `<thead>` / `<tbody>` elements (via shadcn
  `Table` primitives).
- Sortable column headers use `<button>` inside `<th>` with `aria-sort`
  attributes (`ascending`, `descending`, `none`).
- Mobile cards use `<article>` with an `aria-label` summarising the
  transaction (e.g. "Transaction: $485,000, 123A ANG MO KIO AVE 1, Jan 2025").
- The "Why these comparables?" section uses a `<details>` / `<summary>`
  element (or the shadcn `Collapsible` component) for native expand/collapse.

## Testing

### Vitest Unit Tests

1. `tests/components/ComparableEvidenceTable.test.tsx`
   - Renders all column headers.
   - Renders correct number of rows for a given comparables array.
   - Default sort: first row has highest similarity.
   - Click "Price" header: re-sorts by price descending.
   - Click "Price" header twice: toggles to ascending.
   - Click "Month" header: sorts by date ascending.
   - Empty state: shows "no comparables" message when array is empty.
   - Low-confidence state: shows caveat banner when caveats are non-empty.
   - Match reason badges render for each comparable.
   - Similarity percentage displays correctly (0.87 → "87%").
   - Mobile card layout renders when viewport is narrow (test via
     class assertion, not actual resize).
   - "Why these comparables?" explainer renders different text for
     `widenedSearch: true` vs `false`.

### E2E Tests

2. `tests/e2e/listing-check.spec.ts` (updated)
   - Evidence table is visible after a listing check completes.
   - Sorting a column header reorders rows.
   - Mobile viewport: card layout renders instead of table.
   - Evidence table shows match reason badges.

## Risks / Trade-offs

- **Column density on tablet (640px–768px):** The table has 11 columns. On
  narrow desktops / tablets, some columns may need to be hidden or
  abbreviated. The "Block / Street" column is the widest — it can be
  truncated with `truncate` on desktop. On mobile, the card layout avoids
  the problem entirely.
- **Deferred virtualisation:** If `MAX_COMPARABLES` is raised above 50
  without implementing the virtualisation code path, performance may degrade.
  The `VIRTUALIZATION_THRESHOLD` constant serves as a reminder.
- **Duplicate caveat display:** Caveats appear both in the verdict card and
  above the evidence table. This is intentional — the table may scroll below
  the verdict card on long results. If users find it redundant, the verdict
  card caveats can be removed in a follow-up.
- **Time-adjusted price column:** The column is present but shows "—" until
  the engine provides a `timeAdjustedPrice` field. This avoids a schema
  change now but means the column is initially inert. If this feels
  premature, the column can be conditionally hidden when no adjusted prices
  exist in the dataset.
- **No `@tanstack/react-virtual` dependency added:** The threshold-based
  virtualisation approach means no new dependency is introduced. If
  virtualisation is needed later, `@tanstack/react-virtual` (~3 KB gzipped)
  is the recommended library.
