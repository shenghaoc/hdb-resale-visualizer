# Tasks: Comparable Evidence Table

> Status: Implementation complete. Final exact-head and deployed-preview gates
> remain unchecked until they are run.

## Phase 1 — Component and sorting

- [x] **T1.1** Implement
  `src/features/listing-check/ComparableEvidenceTable.tsx` with readonly
  display comparables, reference month, widened-search state,
  structured-or-raw caveats, and adjustment status. (R1)
- [x] **T1.2** Implement immutable sorting for month, area, price, price per
  sqm, and similarity with per-column default directions and stable
  tie-breakers. (R2.1–R2.5)
- [x] **T1.3** Expose desktop sort state through buttons, chevrons, active
  styling, and `aria-sort`. (R2.6)
- [x] **T1.4** Render all bounded rows directly under the engine's
  `MAX_COMPARABLES = 30` contract, with no fictional virtualization threshold
  or dependency. (R6)

## Phase 2 — Evidence presentation

- [x] **T2.1** Render every desktop interpretation column, including
  conditional original registered price for adjusted results. (R1.1, R5)
- [x] **T2.2** Render the explicit no-comparables state and caveat banner.
  (R1.4, R4.5)
- [x] **T2.3** Implement the collapsed normal/widened/low-sample explainer,
  reference month, and non-price-selection explanation. (R4.4)
- [x] **T2.4** Render similarity percentages/bars and localized match-reason
  badges. (R4.1–R4.3)
- [x] **T2.5** Render complete mobile cards and mobile sort controls from the
  same memoized order, using CSS-only responsive branches. (R3)

## Phase 3 — Canonical integration and locale

- [x] **T3.1** Render `ComparableEvidenceTable` from the canonical
  `ListingCheckPanel` and remove the retired compact evidence list and
  detail-local evaluator. (R7.1–R7.3)
- [x] **T3.2** Preserve structured evidence caveats and original price fields
  from `listingCheckAnalysis.ts`. (R4.5, R5)
- [x] **T3.3** Translate structured caveats and all eight stable match-reason
  identifiers only at render time; preserve unknown fallbacks. (R4.3, R4.5)
- [x] **T3.4** Carry the selected locale through compact currency, number,
  month, explainer, column, badge, and accessibility text. (R7.4)

## Phase 4 — Automated coverage

- [x] **T4.1** Cover headers, row count, default order, price/month sorting,
  direction toggling, empty state, and caveat state in
  `tests/components/ComparableEvidenceTable.test.tsx`. (R8.1)
- [x] **T4.2** Cover adjusted/original prices, similarity, match reasons,
  explainer branches, desktop `aria-sort`, mobile cards, and mobile sort
  controls in the same component suite. (R8.1)
- [x] **T4.3** Cover both locales, all eight match reasons, structured
  caveats, compact prices, and unchanged analysis identifiers in focused
  Listing Check tests. (R8.2)
- [x] **T4.4** Add integrated coverage in
  `tests/e2e/buyer-listing-check.spec.ts` for desktop evidence/match reasons
  and mobile visible cards, hidden desktop table, horizontal overflow, and
  shortlist continuation. Sorting remains component-tested. (R8.3, R8.4)

## Phase 5 — Final verification

- [ ] **T5.1** Run the exact-head package gate: `vp run check`.
- [ ] **T5.2** Run the exact-head browser/E2E gate: `vp run check:pr`.
- [ ] **T5.3** Complete the final deployed-preview smoke at desktop and mobile
  widths, including both locales.
- [x] **T5.4** Verify by repository search that
  `ComparableEvidenceTable` is the sole Listing Check transaction-evidence
  surface.
