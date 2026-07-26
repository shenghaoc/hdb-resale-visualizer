# Design: Comparable Evidence Table

> Status: Implemented product contract. `ListingCheckPanel` is the sole
> listing-check UI, and `ComparableEvidenceTable` is its sole transaction
> evidence surface.

## Problem addressed

The earlier compact comparable list omitted similarity, match reasons, lease,
price-per-area, and original registered prices. It also could not be sorted and
did not preserve the full evidence set on mobile.

The implemented evidence surface gives buyers the rows behind the verdict
without adding another evaluator or data request.

## Goals

- Show the complete interpretation fields for each comparable.
- Default to the strongest non-price similarity match and allow deterministic
  client-side sorting.
- Render a dense semantic table on desktop and complete cards on mobile.
- Explain why rows were selected and repeat material caveats beside them.
- Preserve original registered price when adjusted price evidence is shown.
- Localize display text without changing comparable-engine identifiers.
- Directly render the bounded result set returned by the engine.

## Non-goals

- Changing `shared/comparable-engine.ts`, its `MAX_COMPARABLES = 30` cap, or
  its non-price scoring.
- Adding a virtualizer or virtualization dependency. Thirty rows are directly
  rendered on both layouts.
- Adding API endpoints or runtime external calls.
- Restoring the retired compact list or detail-drawer evaluator.

## Component and data flow

`src/features/listing-check/ListingCheckPanel.tsx` fetches and derives the
canonical result, then passes display-ready rows to
`src/features/listing-check/ComparableEvidenceTable.tsx`:

```ts
type ComparableEvidenceTableProps = {
  comparables: ReadonlyArray<DisplayComparable>;
  referenceMonth: string;
  widenedSearch: boolean;
  caveats: ReadonlyArray<Caveat | string>;
  adjustmentApplied?: boolean;
};
```

The component performs no fetching and has no domain side effects. A
`DisplayComparable` may carry `rawResalePrice` and `rawPricePerSqm` alongside
the adjusted display price.

## Desktop evidence table

The desktop table shows:

| Column | Source | Sortable |
| --- | --- | --- |
| Month | `month` | Yes |
| Block / Street | `block`, `streetName` | No |
| Flat Type | `flatType` | No |
| Storey | `storeyRange` | No |
| Area | `floorAreaSqm` | Yes |
| Lease | `leaseCommenceDate` | No |
| Price | `resalePrice` | Yes |
| $/sqm | `pricePerSqm` | Yes |
| Orig. Price | `rawResalePrice` | No |
| Similarity | `similarity` | Yes |
| Match Reasons | `matchReasons` | No |

The original-price column appears only when `adjustmentApplied` is true and at
least one row has `rawResalePrice`. Rows without a raw value display an em
dash.

## Sorting

Component-local state stores `sortKey` and `sortDirection`. The initial state
is similarity descending.

- Similarity, resale price, and price per sqm default to descending.
- Month and floor area default to ascending.
- Clicking the active column toggles direction.
- Clicking another column uses that column's default direction.
- `sortComparables` copies the input before sorting, then breaks ties by
  similarity descending and month descending.
- `useMemo` shares the same sorted rows across the desktop table and mobile
  cards.

Price is never used by the comparable engine to select rows; price sorting is
only a presentation action after the evidence set exists.

## Mobile evidence cards

The desktop table container uses `hidden sm:block`; the mobile card list uses
`sm:hidden`. No resize observer or JavaScript media query controls the branch.

Every mobile `<article>` contains adjusted display price, original price when
available, floor area, price per sqm, block/street, flat type, storey, lease
year, month, similarity, and match-reason badges. Mobile sort pills operate on
the same sort state and memoized rows as the desktop table.

## Explainer and caveats

The collapsed "Why these comparables?" control explains:

- same-block ranking when the search did not widen;
- street/town widening when it did;
- low-sample directionality below `LOW_SAMPLE_THRESHOLD`;
- the reference month and the fact that price is not a selection input.

The evidence section repeats caveats so they remain visible after the verdict
card scrolls away. Derived results provide structured caveats. Before a result
exists, known raw API fallbacks are localized and unknown server text remains
visible.

## Localization boundary

The comparable engine emits eight stable English match-reason identifiers.
`src/features/listing-check/listingCheckPresentation.ts` translates them only
when badges render. `listingCheckAnalysis.ts` counts the original identifiers
before presentation, so locale changes cannot alter confidence.

Currency, number, month, column, explainer, caveat, and accessibility text use
the selected locale.

## Accessibility

- Desktop evidence uses semantic table primitives.
- Sortable `<th>` elements expose `aria-sort` and contain real buttons.
- The explainer button exposes `aria-expanded` and `aria-controls`.
- Mobile cards are `<article>` elements with localized factual `aria-label`
  text.
- Decorative icons are hidden from assistive technology.

## Testing

`tests/components/ComparableEvidenceTable.test.tsx` covers columns, row count,
default order, price and month sorting, direction toggling, empty/caveat
states, adjusted/raw price display, similarity, match reasons, mobile cards,
mobile sort controls, explainer variants, and `aria-sort`.

`tests/unit/listingCheckPresentation.test.ts` and Listing Check component tests
cover structured caveats, all eight stable match reasons, both locales, and
localized compact prices.

`tests/e2e/buyer-listing-check.spec.ts` covers the integrated desktop evidence
table and match reason, plus visible mobile cards, a CSS-hidden desktop table,
no horizontal overflow, and shortlist continuation. Sorting is intentionally
covered by component tests rather than claimed as E2E coverage.

## Risks and invariants

- The 11-column desktop table is dense; the complete mobile card branch is the
  narrow-viewport alternative.
- `MAX_COMPARABLES` is 30. If that product limit changes materially,
  rendering strategy requires a separate measured decision.
- Structured caveats and stable match-reason identifiers must remain intact
  until the presentation boundary.
