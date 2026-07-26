# Tasks: Time-Adjusted Comparable Prices

> Execution checklist. Order respects dependencies: shared module → API
> endpoint → frontend wiring → tests. Each task names its acceptance check.
> No new D1 tables, no sync pipeline changes, no migrations.

## Phase 1 — Shared time-adjustment module

- [x] **T1.1** Create `shared/time-adjustment.ts`:
  - Define `TrendPoint`, `TrendLookup`, `TimeAdjustmentResult` types.
  - Define `MIN_TREND_SAMPLE_SIZE = 5` constant.
  - Keep the module dependency-free and pure.
  → `vp run typecheck` passes. (R1.1, R1.3, R1.4, R3.1)

- [x] **T1.2** Implement `computeTimeAdjustment(town, flatType, txMonth,
  rawPrice, rawPricePerSqm, trendLookup): TimeAdjustmentResult`:
  - Look up `trendLookup.get("${town}__${flatType}")`. Return null
    adjustment if missing.
  - Find the transaction month's data point. Return null if missing
    or if `transaction_count < MIN_TREND_SAMPLE_SIZE`.
  - Find the latest qualifying month (walks backwards from the end of
    the sorted array, skipping months below threshold). Return null if
    no qualifying month exists.
  - Divide: `adjustmentFactor = latestPpsm / txMonthPpsm`. Guard against
    zero denominator.
  - Compute `adjustedPrice = Math.round(rawPrice * adjustmentFactor)` and
    `adjustedPricePerSqm = +(rawPricePerSqm * adjustmentFactor).toFixed(2)`.
  - Generate label: if txMonth === latestMonth → "Already at latest period";
    otherwise → `"Adjusted from ${txMonth} median"`.
  → `vp run typecheck` passes. (R1.2, R1.5, R1.6, R1.7)

- [x] **T1.3** Verify boundary compliance: the module only imports from
  `shared/` (no `src/`, no `functions/`). Run `vp run check:boundaries`.
  → `vp run check:boundaries` passes. (R1.8)

- [x] **T1.4** Add `TimeAdjustedComparable` type to `shared/data-types.ts`.
  Extend the comparable shape with `rawResalePrice`, `rawPricePerSqm`,
  `adjustedResalePrice`, `adjustedPricePerSqm`, `adjustmentFactor`, and
  a structured `adjustmentLabel` (all adjustment fields nullable).
  → `vp run typecheck` passes. (R3.2, R3.3, R3.4)

## Phase 2 — API endpoint

- [x] **T2.1** Update `functions/api/comparable-transactions.ts`:
  - Parse `?adjust` from the request URL. If absent, proceed with existing
    logic unchanged.
  - If `?adjust=time`, after scoring comparables: query only the unique
    town × flat-type pairs from
    `SELECT town, flat_type, month, median_price_per_sqm, transaction_count
    FROM town_flat_type_trends`, build a `TrendLookup` map, and call
    `computeTimeAdjustment` for each comparable.
  - Extend the response to include `adjustmentApplied: boolean` and
    `adjustmentCaveats: string[]`. Each comparable gains
    `rawResalePrice`, `rawPricePerSqm`, `adjustedResalePrice`,
    `adjustedPricePerSqm`, `adjustmentFactor`, and `adjustmentLabel`.
  - If `?adjust` is anything other than `"time"`, return 400.
  → `vp run typecheck` passes. (R2.1, R2.2, R2.3, R2.4, R2.5)

- [x] **T2.2** Verify the endpoint body size guard and Zod validation still
  work correctly after the change. The trends query must not be run before
  the body is validated (avoid wasted D1 reads on bad requests).
  → Manual code review: trends query is after body validation. (R2.6, R2.7)

## Phase 3 — Frontend request and display

- [x] **T3.1** Make `useListingCheckAnalysis` request `?adjust=time` after an
  explicit submission. Keep one evidence basis; do not add a raw/adjusted
  preference toggle. (R4.1, R4.2)

- [x] **T3.2** Use adjusted prices for the verdict and primary evidence when
  available, preserve the original registered price in
  `ComparableEvidenceTable`, and fall back to raw values when needed.
  (R5.1, R5.2, R5.3)

- [x] **T3.3** Render adjustment caveats from the API response below the
  comparable list. Include the mandatory "not a forecast" caveat and the
  per-count caveats. Style consistently with existing widening caveats.
  (R4.3, R6.1, R6.2, R6.3, R6.4)

## Phase 4 — Unit tests (shared module)

- [x] **T4.1** Create `tests/unit/time-adjustment.test.ts`:
  - **Normal adjustment**: build a TrendLookup with multiple months for
    "ANG MO KIO" × "4 ROOM". Call `computeTimeAdjustment` for a 2022-03
    transaction. Assert `adjustmentFactor = latestPpsm / txMonthPpsm`,
    `adjustedPrice = Math.round(rawPrice * factor)`, `adjustedPricePerSqm`
    is correct to 2 decimal places.
  - **Same as latest month**: transaction month equals the latest
    qualifying month → `adjustmentFactor` is 1.0, label is "Already at
    latest period".
  - **Missing month**: trend data exists for (town, flatType) but the
    specific month is not present → all adjusted fields are null.
  - **Missing latest month with walk-back**: the latest month has
    `transaction_count < 5` → function walks back to find a qualifying
    month. Assert the correct older month is used as latest.
  - **No qualifying latest month**: every month in the series has
    `transaction_count < 5` → all adjusted fields are null.
  - **Low sample size**: transaction month has `transaction_count = 3` →
    all adjusted fields are null.
  - **No trend data at all**: TrendLookup has no entry for the
    (town, flatType) key → all adjusted fields are null.
  - **Zero denominator guard**: median is 0 → all adjusted fields are
    null (edge case, should never happen with real data).
  - **TrendLookup key format**: verifies case sensitivity and exact
    match of `${town}__${flatType}`.
  → `vp run test` passes. (R8.1)

## Phase 5 — API + component tests

- [x] **T5.1** Add adjustment tests to
  `tests/unit/comparable-transactions-api.test.ts`:
  - Request with `?adjust=time` → response has `adjustmentApplied: true`,
    comparables have `adjustedResalePrice`, `adjustedPricePerSqm`,
    `adjustmentFactor`, `adjustmentLabel` fields.
  - Request without `?adjust` → response matches existing shape
    (no adjusted fields — verify the new fields are absent or null,
    depending on implementation).
  - Request with `?adjust=invalid` → 400 response.
  → `vp run test` passes. (R8.3)

- [x] **T5.2** Cover the frontend contract in listing-analysis and
  `ComparableEvidenceTable` tests: the request uses `?adjust=time`, adjusted
  evidence remains primary, original prices remain available, raw fallback is
  honest, and adjustment caveats render. (R8.2)

## Phase 6 — Verification

- [ ] **T6.1** `vp run typecheck` passes with no errors.
- [ ] **T6.2** `vp run lint` passes with no errors.
- [ ] **T6.3** `vp run test` passes — all existing + new tests green.
- [ ] **T6.4** `vp run check:boundaries` passes — no script/runtime import
  violations.
- [ ] **T6.5** `vp run dev:functions` manual smoke against local D1 (with
  `vp run db:migrate:local` and fixture seed):
  - Check tab opens, typeahead selects a block, form fills.
  - "Check This Listing" → verdict appears.
  - Adjusted evidence renders as the primary basis when available, with the
    original registered price visible.
  - Missing adjustment data falls back to raw prices with a caveat.
  - The Check workflow renders adjusted evidence in
    `ComparableEvidenceTable`; no duplicate detail-drawer checker exists.
