# Tasks: Time-Adjusted Comparable Prices

> Execution checklist. Order respects dependencies: shared module → API
> endpoint → frontend wiring → tests. Each task names its acceptance check.
> No new D1 tables, no sync pipeline changes, no migrations.

## Phase 1 — Shared time-adjustment module

- [ ] **T1.1** Create `shared/time-adjustment.ts`:
  - Define `TrendPoint`, `TrendLookup`, `TimeAdjustmentResult` types.
  - Define `MIN_TREND_SAMPLE_SIZE = 5` constant.
  - Export Zod schemas for `TrendPoint` and `TimeAdjustmentResult`.
  → `npm run typecheck` passes. (R1.1, R1.3, R1.4, R3.1)

- [ ] **T1.2** Implement `computeTimeAdjustment(town, flatType, txMonth,
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
  → `npm run typecheck` passes. (R1.2, R1.5, R1.6, R1.7)

- [ ] **T1.3** Verify boundary compliance: the module only imports from
  `shared/` (no `src/`, no `functions/`). Run `npm run check:boundaries`.
  → `npm run check:boundaries` passes. (R1.8)

- [ ] **T1.4** Add `TimeAdjustedComparable` type to `shared/data-types.ts`.
  Extend the comparable shape with `rawResalePrice`, `rawPricePerSqm`,
  `adjustedResalePrice`, `adjustedPricePerSqm`, `adjustmentFactor`, and
  `adjustmentLabel` fields (all nullable for adjustment fields).
  → `npm run typecheck` passes. (R3.2, R3.3)

## Phase 2 — API endpoint

- [ ] **T2.1** Update `functions/api/comparable-transactions.ts`:
  - Parse `?adjust` from the request URL. If absent, proceed with existing
    logic unchanged.
  - If `?adjust=time`, after scoring comparables: query
    `SELECT town, flat_type, month, median_price_per_sqm, transaction_count
    FROM town_flat_type_trends`, build a `TrendLookup` map, and call
    `computeTimeAdjustment` for each comparable.
  - Extend the response to include `adjustmentApplied: boolean` and
    `adjustmentCaveats: string[]`. Each comparable gains
    `rawResalePrice`, `rawPricePerSqm`, `adjustedResalePrice`,
    `adjustedPricePerSqm`, `adjustmentFactor`, and `adjustmentLabel`.
  - If `?adjust` is anything other than `"time"`, return 400.
  → `npm run typecheck` passes. (R2.1, R2.2, R2.3, R2.4, R2.5)

- [ ] **T2.2** Verify the endpoint body size guard and Zod validation still
  work correctly after the change. The trends query must not be run before
  the body is validated (avoid wasted D1 reads on bad requests).
  → Manual code review: trends query is after body validation. (R2.6, R2.7)

## Phase 3 — Frontend toggle and display

- [ ] **T3.1** Add a toggle (`Switch` component from shadcn) to the
  comparable results section in `ListingCheckPanel.tsx`. Label:
  "Show time-adjusted prices". Subtitle / tooltip: "Prices adjusted using
  observed historical resale medians. This is not a price forecast."
  → `npm run typecheck` passes. (R4.1, R4.2, R4.3)

- [ ] **T3.2** Wire the toggle: when on, add `?adjust=time` to the API
  request URL. When off, omit it. Re-fetch on toggle change. Show a brief
  loading state during the re-fetch (spinner on the comparable list, not
  the full panel).
  → `npm run typecheck` passes. (R4.4)

- [ ] **T3.3** Update the comparable row component to display raw and
  adjusted prices side by side when toggle is on:
  - Raw price: `<s>` strikethrough, muted color.
  - Adjusted price: bold, accent color.
  - Adjustment label: small muted text below.
  - When adjusted fields are null: raw price normal, small "No adjustment
    data" indicator.
  → `npm run typecheck` passes. (R5.1, R5.2, R5.3)

- [ ] **T3.4** Render adjustment caveats from the API response below the
  comparable list. Include the mandatory "not a forecast" caveat and the
  per-count caveats. Style consistently with existing widening caveats.
  → `npm run typecheck` passes. (R6.1, R6.2, R6.3, R6.4)

## Phase 4 — Unit tests (shared module)

- [ ] **T4.1** Create `tests/unit/time-adjustment.test.ts`:
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
  → `npm run test` passes. (R8.1)

## Phase 5 — API + component tests

- [ ] **T5.1** Add adjustment tests to
  `tests/unit/comparable-transactions-api.test.ts`:
  - Request with `?adjust=time` → response has `adjustmentApplied: true`,
    comparables have `adjustedResalePrice`, `adjustedPricePerSqm`,
    `adjustmentFactor`, `adjustmentLabel` fields.
  - Request without `?adjust` → response matches existing shape
    (no adjusted fields — verify the new fields are absent or null,
    depending on implementation).
  - Request with `?adjust=invalid` → 400 response.
  → `npm run test` passes. (R8.3)

- [ ] **T5.2** Update `tests/components/ListingCheckPanel.test.tsx`:
  - Mock fetch to return adjusted data. Toggle on → adjusted prices
    rendered, raw prices have strikethrough styling.
  - Toggle off → only raw prices visible, no adjusted columns.
  - Mock fetch to return adjusted data with `adjustedResalePrice: null`
    for some comparables → "No adjustment data" indicator visible for
    those rows.
  - Mock fetch to return `adjustmentCaveats: [...]` → caveats rendered.
  → `npm run test` passes. (R8.2)

## Phase 6 — Verification

- [ ] **T6.1** `npm run typecheck` passes with no errors.
- [ ] **T6.2** `npm run lint` passes with no errors.
- [ ] **T6.3** `npm run test` passes — all existing + new tests green.
- [ ] **T6.4** `npm run check:boundaries` passes — no script/runtime import
  violations.
- [ ] **T6.5** `npm run dev:functions` manual smoke against local D1 (with
  `npm run db:migrate:local` and fixture seed):
  - Check tab opens, typeahead selects a block, form fills.
  - "Check This Listing" → verdict appears.
  - Toggle "Show time-adjusted prices" → adjusted prices render with
    strikethrough raw + bold adjusted.
  - Toggle off → raw prices only.
  - Block detail drawer Asking Price tab still works unchanged.
