# Tasks: Buyer Listing Price Check

> Execution checklist. Order respects dependencies: canonical analysis
> contract → single panel → navigation/detail routing → URL and shortlist
> semantics → tests. Each task names its acceptance check.

## Phase 1 — Canonical analysis contract

- [x] **T1.1** Keep comparable selection in
  `POST /api/comparable-transactions?adjust=time`; the client must submit the
  explicit listing facts and must not run an independent comparable selector.
  → request-contract tests pass. (R4.1, R4.2, R4.4)

- [x] **T1.2** Keep request construction, canonical storey options,
  time-adjusted evidence mapping, and result derivation in
  `src/features/listing-check/listingCheckAnalysis.ts`.
  → focused unit tests pass. (R3.5, R4.2, R7)

- [x] **T1.3** Use `shared/confidence-system.ts` and
  `shared/caveat-codes.ts` for evidence confidence and caveats; preserve factual
  record-volume, recency, scope, match, lease, and time-adjustment signals.
  → shared confidence/caveat tests pass. (R5, R6)

## Phase 2 — Remove the second evaluator

- [x] **T2.1** Remove the user-facing legacy detail-drawer evaluator and any
  detail-drawer state or callbacks that execute it.
  → repository search finds one user-facing evaluator:
  `ListingCheckPanel`. (R10.1, R10.2)

- [x] **T2.2** Keep distribution and comparable-evidence presentation
  components feature-scoped under `src/features/listing-check/` and render them
  only from the canonical panel.
  → `vp run typecheck` passes. (R7, R10.1)

## Phase 3 — ListingCheckPanel component

- [x] **T3.1** Implement `src/features/listing-check/ListingCheckPanel.tsx`
  with SearchCombobox, block info, asking price, floor area, flat type, storey,
  optional lease year, explicit "Check This Listing" submit, and verdict card.
  Submit remains disabled until every required fact is valid.
  → component tests pass. (R2, R3, R7)

- [x] **T3.2** Implement verdict card display in `ListingCheckPanel`:
  verdict theme (colors/icons), confidence badge with reason text,
  statistics grid, DistributionBar, ComparableEvidenceTable,
  caveats list with severity icons. Action buttons (Save to Shortlist,
  Share). (R7.1, R7.2, R7.3)

- [x] **T3.3** Wire SearchCombobox selection in `ListingCheckPanel` to
  set `selectedAddressKey` and trigger `fetchAddressDetail()`. Populate
  flat type and storey selects from authoritative options without selecting
  defaults. (R2.1, R2.2, R2.3, R3.5)

- [x] **T3.4** Keep the empty state free of a sample CTA and synthetic unit
  facts. Changing blocks clears all listing-specific inputs and prior results.
  (R2.4, R3.6)

## Phase 4 — URL state & sharing

- [x] **T4.1** Add `useListingCheckUrlState()` hook in
  `src/features/listing-check/useListingCheckUrlState.ts`: encodes/decodes check state
  to/from URL query params. Follows `useUrlFilters` pattern (read on
  mount, sync on change). (R8.1)

- [x] **T4.2** Wire `ListingCheckPanel` to read/write state via
  `useListingCheckUrlState`. On mount with `checkAddress`, auto-load
  detail and hydrate only valid encoded facts; do not submit analysis
  automatically. Share button copies the full URL. (R8.2, R8.3)

## Phase 5 — Shortlist integration

- [x] **T5.1** Wire "Save to Shortlist" button in `ListingCheckPanel` to
  add the address when necessary and update only `askingPrice`. Preserve any
  existing `targetPrice` and notes. (R9.1, R9.2, R9.3)

## Phase 6 — Navigation wiring

- [x] **T6.1** Extend `usePanelState` types: add `"check"` to `LeftTab`
  and `PanelTab`. Add `setLeftTab("check")` and `setMobileTab("check")`
  support. → `vp run typecheck` passes. (R1.1, R1.2)

- [x] **T6.2** Add "Check" button to `DesktopTabBar` between Results and
  Saved, with icon (e.g. `Scale` from lucide). Wire click to
  `onCheckClick` handler. (R1.1)

- [x] **T6.3** Add "Check" button to `MobileTabBar` between Results and
  Saved. Wire click to `onCheckClick` handler. (R1.1)

- [x] **T6.4** Add `ListingCheckPanel` slot to `AppPanelShell` for both
  desktop (left panel when `leftTab === "check"`) and mobile (panel when
  `mobileTab === "check"`). (R1.2)

- [x] **T6.5** Wire `useAppShellController` and `App.tsx`: add
  `handleDesktopCheckClick`, `handleMobileCheckClick` handlers. Wire
  `SearchCombobox` `onSelectSuggestion` to work within the Check tab
  context. (R1.2)

- [x] **T6.6** Route the block-detail "Check this listing" action to the
  canonical Check tab with block identity only. Do not render or invoke a
  detail-local asking-price evaluator. (R2.4, R10.1, R10.2, R10.3)

## Phase 7 — Unit tests

- [x] **T7.1** Cover canonical confidence signals and caps in the shared
  confidence tests: record volume, recency, geographic scope, fact match,
  empty/single-transaction evidence. → focused tests pass. (R11.1)

- [x] **T7.2** Add `tests/unit/listing-caveats.test.ts`: low-sample, lease
  mismatch, stale/widened data, listing-fact mismatch, extreme outlier,
  time-adjustment status, and no duplicate caveats.
  → focused tests pass. (R11.1)

- [x] **T7.3** Extend `tests/unit/listingCheckAnalysis.test.ts` and
  `tests/unit/useListingCheckAnalysis.test.tsx` for full response derivation,
  explicit-submit gating, required-fact invalidation, canonical endpoint use,
  and verdict/confidence/caveat coherence. → focused tests pass. (R11.1)

## Phase 8 — Component & E2E tests

- [x] **T8.1** Extend `tests/components/ListingCheckPanel.inputs.test.tsx`:
  required fields start empty, options are not auto-selected, submit stays
  disabled until all facts are valid, and a submitted result shows confidence
  plus caveats. → focused tests pass. (R11.2)

- [x] **T8.2** Extend `tests/e2e/buyer-listing-check.spec.ts`: mobile and
  desktop explicit-fact flows, URL hydration followed by explicit submit,
  asking-price shortlist save, no-comparables state, and low-confidence
  caveats. → focused Playwright tests pass. (R11.3)

- [x] **T8.3** Add block-detail regression coverage proving its Check action
  opens the canonical panel with no inferred unit facts and that no sample CTA
  or second evaluator remains. (R11.4)

- [x] **T8.4** Localize confidence summaries, structured caveats, and all eight
  comparable match-reason identifiers at the UI boundary. Preserve the English
  tokens used by confidence counting, carry locale through compact currencies,
  and cover both locales with focused tests. (R5, R6, R11.6)

## Phase 9 — Verification

- [x] **T9.1** `vp run typecheck` passes with no errors.
- [x] **T9.2** `vp run lint` passes with no errors.
- [x] **T9.3** `vp run test` passes — all existing + new tests green.
- [ ] **T9.4** `vp run test:e2e` passes — all existing + new E2E tests green.
- [ ] **T9.5** Manual smoke via `vp run dev:functions` against local D1:
  Check tab opens, typeahead selects a block, form fills, verdict appears,
  URL sharing works, shortlist save preserves asking price, and block detail
  routes to the same panel. (R1.3, R10)
