# Requirements: Time-Adjusted Comparable Prices

## R1 — Shared time-adjustment module
- **R1.1** A new pure TypeScript module `shared/time-adjustment.ts` exports a
  `computeTimeAdjustment` function and supporting types (`TrendPoint`,
  `TrendLookup`, `TimeAdjustmentResult`).
- **R1.2** The function accepts `town`, `flatType`, `txMonth`, `rawPrice`,
  `rawPricePerSqm`, and a `TrendLookup` map. It returns a
  `TimeAdjustmentResult` with `rawPrice`, `rawPricePerSqm`, `adjustedPrice`,
  `adjustedPricePerSqm`, `adjustmentFactor`, and `adjustmentLabel`.
- **R1.3** The `TrendLookup` map is keyed by `"${town}__${flatType}"` and maps
  to a sorted array of `{ month, medianPricePerSqm, transactionCount }` objects.
- **R1.4** `MIN_TREND_SAMPLE_SIZE` is a named constant (value: 5). Months with
  `transaction_count` below this threshold are treated as unreliable.
- **R1.5** The adjustment formula is `adjustmentFactor = latestMedianPpsm /
  txMonthMedianPpsm`, where `latestMedianPpsm` is the most recent qualifying
  month's median. When the latest month's sample count is too low, the function
  walks backwards to find a qualifying month.
- **R1.6** The function returns `null` for all adjusted fields when:
  - No trend data exists for the given `(town, flatType)`.
  - No data point exists for the transaction's specific month.
  - The transaction month's sample count is below `MIN_TREND_SAMPLE_SIZE`.
  - No qualifying latest month can be found.
  - The transaction month's median is zero (division guard).
- **R1.7** When the transaction month equals the latest available qualifying
  month, the adjustment is still computed (factor ≈ 1.0) and the label reads
  "Already at latest period".
- **R1.8** The module imports only from `shared/` — no `src/`, `functions/`,
  or external dependencies beyond the TypeScript standard library.
- **R1.9** `shared/comparable-engine.ts` is **not modified**. The time
  adjustment module is a separate concern.

## R2 — API endpoint updates
- **R2.1** `POST /api/comparable-transactions` accepts an optional query
  parameter `?adjust=time`. When absent, behaviour is identical to today
  (backwards compatible).
- **R2.2** When `?adjust=time` is present, the handler queries the
  `town_flat_type_trends` D1 table, builds a `TrendLookup`, and applies
  `computeTimeAdjustment` to each comparable in the result set.
- **R2.3** The response type is extended: each comparable includes
  `rawResalePrice`, `rawPricePerSqm`, `adjustedResalePrice`,
  `adjustedPricePerSqm`, `adjustmentFactor`, and `adjustmentLabel`.
  The top-level response includes `adjustmentApplied: boolean` and
  `adjustmentCaveats: string[]`.
- **R2.4** When `?adjust=time` is present but no comparables could be adjusted
  (e.g., no trend data), `adjustmentApplied` is `false` and
  `adjustmentCaveats` explains why.
- **R2.5** Invalid values for the `?adjust` parameter (anything other than
  `"time"` or absent) return a 400 error with a descriptive message.
- **R2.6** The trends query uses the existing `town_flat_type_trends` table
  and the existing composite PK — no new indexes, no new migrations.
- **R2.7** No external API calls, no AI, no runtime geocoding.

## R3 — Zod schemas and type definitions
- **R3.1** `shared/time-adjustment.ts` exports Zod schemas for
  `TrendPoint` and `TimeAdjustmentResult` for use in tests and API
  validation.
- **R3.2** `shared/data-types.ts` exports a `TimeAdjustedComparable` type
  extending the comparable shape with adjustment fields.
- **R3.3** All types use `type` (not `interface`), follow existing naming
  conventions, and avoid `any`.

## R4 — Frontend toggle
- **R4.1** The comparable results section in `ListingCheckPanel` includes a
  toggle (Switch or segmented control) labeled "Show time-adjusted prices".
- **R4.2** A subtitle or tooltip on the toggle reads: "Prices adjusted using
  observed historical resale medians. This is not a price forecast."
- **R4.3** Default state: toggle off (raw prices only).
- **R4.4** Toggling sends a new request to the API with `?adjust=time` (or
  omits it when off). The toggle state is not persisted across sessions
  (local component state only).

## R5 — Comparable row display
- **R5.1** When the toggle is on and a comparable has valid adjusted prices:
  - Raw price is shown with strikethrough styling.
  - Adjusted price is shown in bold next to it.
  - A small muted label reads the `adjustmentLabel` (e.g., "Adjusted from
    2022-03 median").
- **R5.2** When the toggle is on and a comparable has no adjusted prices
  (null): raw price is shown as normal, with a small muted indicator
  "No adjustment data".
- **R5.3** When the toggle is off: raw prices only, as today. No adjusted
  fields are shown.

## R6 — Caveats display
- **R6.1** Adjustment caveats from the API response are rendered below the
  comparable list, alongside existing widening caveats.
- **R6.2** The mandatory caveat reads: "Time adjustment applied using town ×
  flat type historical medians. This is not a price forecast."
- **R6.3** When some comparables could not be adjusted: "N of X comparable
  transactions could not be time-adjusted due to insufficient trend data."
- **R6.4** When no comparables could be adjusted: "No trend data available for
  this town and flat type — showing raw prices only."

## R7 — Backwards compatibility
- **R7.1** Omitting `?adjust=time` returns the existing response shape
  unchanged.
- **R7.2** `shared/comparable-engine.ts` is not modified.
- **R7.3** `src/lib/transaction-analysis.ts`, `src/lib/listing-verdict.ts`,
  `listing-confidence.ts`, and `listing-caveats.ts` are not modified.
- **R7.4** The block detail drawer's `AskingPriceCheck` is not affected.
- **R7.5** Existing tests continue to pass.

## R8 — Tests
- **R8.1** Unit tests for `computeTimeAdjustment`: normal adjustment, same
  as latest month, missing month, missing latest month (walks back), low
  sample size fallback, no trend data at all, division guard (zero median),
  mixed results caveats.
- **R8.2** Component tests for `ListingCheckPanel`: toggle off → raw only;
  toggle on → adjusted visible; toggle on with null adjusted → indicator
  visible; adjustment caveats render.
- **R8.3** API tests for the endpoint: `?adjust=time` returns extended shape;
  no parameter returns existing shape; invalid parameter returns 400.
