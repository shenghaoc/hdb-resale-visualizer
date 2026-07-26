# Requirements: Comparable Evidence Table

> Status: Implemented. `ListingCheckPanel` owns the only listing-check
> workflow, and `ComparableEvidenceTable` owns its only transaction evidence
> surface.

## R1 — Evidence component

- **R1.1** `src/features/listing-check/ComparableEvidenceTable.tsx` renders
  month, block/street, flat type, storey, floor area, lease year, price, price
  per sqm, conditional original price, similarity, and match reasons.
- **R1.2** Props are readonly display comparables, reference month,
  `widenedSearch`, structured-or-raw evidence caveats, and optional
  `adjustmentApplied`.
- **R1.3** The component performs no fetch and receives all evidence from
  `ListingCheckPanel`.
- **R1.4** An empty comparable array renders an explicit empty state and no
  table.

## R2 — Sorting

- **R2.1** Default order is similarity descending.
- **R2.2** Month, floor area, resale price, price per sqm, and similarity are
  sortable.
- **R2.3** A repeated click toggles direction. A newly selected key defaults
  to descending for prices/similarity and ascending for month/area.
- **R2.4** Sorting copies rather than mutates the input and uses similarity
  descending then month descending as tie-breakers.
- **R2.5** One memoized sorted array drives desktop rows and mobile cards.
- **R2.6** Active and inactive sort states are visually distinct and desktop
  headers expose `aria-sort`.

## R3 — Desktop and mobile presentation

- **R3.1** The desktop branch uses a semantic table inside a
  `hidden sm:block` container.
- **R3.2** The mobile branch uses a `sm:hidden` card list with no JavaScript
  breakpoint logic.
- **R3.3** Each mobile article preserves price, area, price per sqm,
  conditional original price, location, flat type, storey, lease, month,
  similarity, and match reasons.
- **R3.4** Mobile sort controls change the same shared sort state.
- **R3.5** Each mobile card has a factual, localized `aria-label`.

## R4 — Evidence interpretation

- **R4.1** Similarity is displayed as
  `Math.round(similarity * 100)` with a proportional micro bar.
- **R4.2** Match reasons render as compact outline badges.
- **R4.3** The engine's eight English match-reason identifiers stay unchanged
  in data and are translated only when badges render.
- **R4.4** The collapsed explainer distinguishes normal and widened searches,
  identifies low samples, shows reference-month context, and states that price
  is not used to select comparables.
- **R4.5** Non-empty caveats render above the evidence. Structured caveats use
  code/value translation; known raw fallbacks are localized; unknown text
  remains visible.

## R5 — Adjusted and original price

- **R5.1** Adjusted `resalePrice` and `pricePerSqm` are the primary displayed
  values when time adjustment applies.
- **R5.2** "Orig. Price" appears only when `adjustmentApplied` is true and at
  least one row has `rawResalePrice`.
- **R5.3** A row without a raw value displays an em dash in that conditional
  column.

## R6 — Bounded direct rendering

- **R6.1** The comparable engine caps results at `MAX_COMPARABLES = 30`.
- **R6.2** All bounded rows render directly; this component has no
  virtualization threshold, virtualizer path, or virtualization dependency.
- **R6.3** Raising the engine cap materially requires a separate measured
  rendering decision.

## R7 — Canonical integration and localization

- **R7.1** `ListingCheckPanel.tsx` renders `ComparableEvidenceTable` below the
  verdict content.
- **R7.2** No compact-list or detail-drawer listing evaluator is retained.
- **R7.3** `ComparableEvidenceTable` does not change verdict calculation or
  evidence selection.
- **R7.4** Currency, number, month, explainer, caveat, column, and badge text
  follow the selected locale without changing analysis identifiers.

## R8 — Tests

- **R8.1** `tests/components/ComparableEvidenceTable.test.tsx` covers columns,
  row count, default and interactive sort order, empty/caveat states,
  adjusted/original prices, similarity, badges, explainer variants, mobile
  cards, mobile sorting, and `aria-sort`.
- **R8.2** Locale-focused unit/component tests cover structured caveats, all
  eight match reasons, compact prices, and unchanged engine identifiers.
- **R8.3** `tests/e2e/buyer-listing-check.spec.ts` proves desktop evidence and
  match reasons render after a listing check and that mobile uses visible
  cards with the desktop table hidden and no horizontal overflow.
- **R8.4** Evidence-table sorting is component-tested; it is not represented
  as existing E2E coverage.
