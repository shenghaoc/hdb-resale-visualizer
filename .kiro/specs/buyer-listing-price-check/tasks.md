# Tasks: Buyer Listing Price Check

> Execution checklist. Order respects dependencies: domain modules →
> shared components → panel component → navigation wiring → URL state →
> tests. Each task names its acceptance check.

## Phase 1 — Domain modules (pure TypeScript)

- [ ] **T1.1** Add `src/lib/listing-confidence.ts`:
  `computeConfidence(comparables, referenceMonth?)` with sample-size tiers
  (≥12→high, 5–11→medium, 1–4→low) and recency downgrade.
  → `npm run typecheck` passes. (R5.1, R5.2, R5.3)

- [ ] **T1.2** Add `src/lib/listing-caveats.ts`:
  `generateCaveats(params)` with triggers for low sample, lease mismatch,
  stale data, extreme outlier. Returns `Caveat[]` with severity and message.
  → `npm run typecheck` passes. (R6.1, R6.2)

- [ ] **T1.3** Add `src/lib/listing-verdict.ts`:
  `performListingCheck(params)` glue combining `assessAskingPrice` +
  `computeConfidence` + `generateCaveats` into a single `ListingCheckResult`.
  → `npm run typecheck` passes. (R4.1, R4.2)

## Phase 2 — Shared UI components (extracted from AskingPriceCheck)

- [ ] **T2.1** Extract `DistributionBar` from `AskingPriceCheck.tsx` to
  `src/components/DistributionBar.tsx`. Wire `AskingPriceCheck` to import
  from the new file. Verify existing tests pass. (R10.1)

- [ ] **T2.2** Extract `ComparableTransactionsList` from `AskingPriceCheck.tsx`
  to `src/components/ComparableTransactionsList.tsx`. Wire `AskingPriceCheck`
  to import from the new file. Verify existing tests pass. (R10.1)

## Phase 3 — ListingCheckPanel component

- [ ] **T3.1** Add `src/components/ListingCheckPanel.tsx`: the full Check tab
  panel with SearchCombobox, block info display, listing form grid
  (asking price, floor area, flat type select, storey select, lease year),
  "Check This Listing" button, and verdict card.
  → Component renders in isolation with mock data. (R2, R3, R7)

- [ ] **T3.2** Implement verdict card display in `ListingCheckPanel`:
  verdict theme (colors/icons), confidence badge with reason text,
  statistics grid, DistributionBar, ComparableTransactionsList,
  caveats list with severity icons. Action buttons (Save to Shortlist,
  Share). (R7.1, R7.2, R7.3)

- [ ] **T3.3** Wire SearchCombobox selection in `ListingCheckPanel` to
  set `selectedAddressKey` and trigger `fetchAddressDetail()`. Populate
  flat type and storey selects from loaded data. (R2.1, R2.2, R2.3)

## Phase 4 — URL state & sharing

- [ ] **T4.1** Add `useListingCheckUrlState()` hook in
  `src/hooks/useListingCheckUrlState.ts`: encodes/decodes check state
  to/from URL query params. Follows `useUrlFilters` pattern (read on
  mount, sync on change). (R8.1)

- [ ] **T4.2** Wire `ListingCheckPanel` to read/write state via
  `useListingCheckUrlState`. On mount with `checkAddress`, auto-load
  detail and re-run analysis. Share button copies full URL. (R8.2, R8.3)

## Phase 5 — Shortlist integration

- [ ] **T5.1** Wire "Save to Shortlist" button in `ListingCheckPanel` to
  `useShortlist().addItem()` with verdict metadata in `notes` and
  `targetPrice` set to asking price. (R9.1, R9.2)

## Phase 6 — Navigation wiring

- [ ] **T6.1** Extend `usePanelState` types: add `"check"` to `LeftTab`
  and `PanelTab`. Add `setLeftTab("check")` and `setMobileTab("check")`
  support. → `npm run typecheck` passes. (R1.1, R1.2)

- [ ] **T6.2** Add "Check" button to `DesktopTabBar` between Results and
  Saved, with icon (e.g. `Scale` from lucide). Wire click to
  `onCheckClick` handler. (R1.1)

- [ ] **T6.3** Add "Check" button to `MobileTabBar` between Results and
  Saved. Wire click to `onCheckClick` handler. (R1.1)

- [ ] **T6.4** Add `ListingCheckPanel` slot to `AppPanelShell` for both
  desktop (left panel when `leftTab === "check"`) and mobile (panel when
  `mobileTab === "check"`). (R1.2)

- [ ] **T6.5** Wire `useAppShellController` and `App.tsx`: add
  `handleDesktopCheckClick`, `handleMobileCheckClick` handlers. Wire
  `SearchCombobox` `onSelectSuggestion` to work within the Check tab
  context. (R1.2)

## Phase 7 — Unit tests

- [ ] **T7.1** Add `tests/unit/listing-confidence.test.ts`: threshold tiers
  (1, 4, 5, 11, 12 comparables), recency downgrade, empty/single-transaction
  edge cases. → `npm run test` passes. (R11.1)

- [ ] **T7.2** Add `tests/unit/listing-caveats.test.ts`: low-sample, lease
  mismatch, stale data, extreme outlier, no duplicate caveats, empty result
  for clean high-confidence. → `npm run test` passes. (R11.1)

- [ ] **T7.3** Add `tests/unit/listing-verdict.test.ts`: full pipeline with
  fixture data, all fields present, verdict+confidence+caveats coherence.
  → `npm run test` passes. (R11.1)

## Phase 8 — Component & E2E tests

- [ ] **T8.1** Add `tests/components/ListingCheckPanel.test.tsx`: renders
  form, type asking price, see verdict with confidence badge and caveats,
  edge cases (no block, no comparables). → `npm run test` passes. (R11.2)

- [ ] **T8.2** Add `tests/e2e/listing-check.spec.ts`: mobile flow (open
  Check tab, select block, fill form, verdict visible), desktop flow, URL
  sharing round-trip, save to shortlist, no-comparables message, low
  confidence caveats. → `npm run test:e2e` passes. (R11.3)

## Phase 9 — Verification

- [ ] **T9.1** `npm run typecheck` passes with no errors.
- [ ] **T9.2** `npm run lint` passes with no errors.
- [ ] **T9.3** `npm run test` passes — all existing + new tests green.
- [ ] **T9.4** `npm run test:e2e` passes — all existing + new E2E tests green.
- [ ] **T9.5** Manual smoke via `npm run dev:functions` against local D1:
  Check tab opens, typeahead selects a block, form fills, verdict appears,
  URL sharing works, shortlist save visible. (R1.3, R10.2, R10.3)
