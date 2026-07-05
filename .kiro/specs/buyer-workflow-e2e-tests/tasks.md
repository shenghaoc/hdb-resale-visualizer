# Tasks: Buyer Workflow E2E Tests

> Execution checklist. Test-only; no product/runtime code changes. Each task
> names its acceptance check. Run with `npm run test:e2e` (WebKit required —
> `npx playwright install --with-deps webkit`).

## Phase 1 — Fixtures and mocks

- [x] **T1.1** Create `tests/e2e/listing-check.fixtures.ts` exporting the
  `ComparableTx` / `ComparableSet` shapes, the `CHECK_ADDRESS_KEY`
  (`bedok-106-lengkong-tiga`), and a `mockComparableTransactions(page, set)`
  helper that routes `**/api/comparable-transactions**` and fulfills JSON.
  → `npm run typecheck` passes. (R9.2, R9.3)

- [x] **T1.2** Add the `highConfidenceSet` (8 same-block recent comparables,
  median 1,200,000, full match reasons) and `lowSampleSet` (2 stale widened
  comparables + injected `LOW_SAMPLE_CAVEAT`) datasets, plus a `checkDeepLink()`
  builder for `?checkAddress=…` URLs. (R2.1, R3, R4)

## Phase 2 — Desktop tests

- [x] **T2.1** `buyer-listing-check.spec.ts`: "start from the Check tab without
  the map" — open the Check tab from `.desktop-tab-bar`, assert the primary
  action, block search input, select-block hint, and sample CTA.
  → test passes. (R1)

- [x] **T2.2** Happy path: deep-link facts, assert block info + entered floor
  area, type the asking price, assert verdict ("In line with market"),
  confidence label, fair range, and "8 comparable transactions".
  → test passes. (R2, R3)

- [x] **T2.3** Evidence: assert "Why these comparables?", the "Similarity"
  column header, and a "Same flat type" match-reason badge.
  → test passes. (R4)

- [x] **T2.4** Save-to-shortlist: click "Save to Shortlist", assert "Saved ✓",
  open the Saved tab, assert the saved block address and the preserved asking
  price ("$1.2M").
  → test passes. (R6, R7)

- [x] **T2.5** Low-confidence / low-sample: deep-link with `lowSampleSet`
  mocked, assert "2 comparable transactions", "Confidence: Low", and the
  low-sample caveat ("directional only").
  → test passes. (R3, R5 gap)

## Phase 3 — Mobile test

- [x] **T3.1** `test.describe("mobile")` with `viewport: 390×844`: deep-link the
  full flow, assert verdict + comparable count + evidence card, assert no
  horizontal scroll (`scrollWidth - clientWidth ≤ 1`) before and after saving to
  shortlist.
  → test passes. (R8)

## Phase 4 — Verification

- [ ] **T4.1** Run `npm run typecheck` and `npm run lint` — clean.
- [ ] **T4.2** Run `npm run test:e2e -- buyer-listing-check` — all new tests
  green; spot-check that the existing suite is unaffected.

## Notes / follow-ups (not in this spec)

- Time-adjusted toggle has no UI yet; `ListingCheckPanel` requests time
  adjustment by default. Add a toggle test if/when the control ships.
- `handleCheckSaveToShortlist` could be enriched to persist structured
  `fairRangeLow/Median/High` (the schema already supports them) so the saved
  item shows a fair range; the save test would then assert those columns.
