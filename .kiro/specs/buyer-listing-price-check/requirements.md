# Requirements: Buyer Listing Price Check

## R1 — New "Check" tab in navigation
- **R1.1** A 4th primary tab labelled "Check" is present in both
  `DesktopTabBar` (between Results and Saved) and `MobileTabBar` (between
  Results and Saved).
- **R1.2** Clicking the Check tab opens the `ListingCheckPanel` in the
  left panel (desktop) or full-width panel (mobile).
- **R1.3** The existing Filters, Results, and Saved tabs continue to work
  exactly as before.

## R2 — Block selection via typeahead
- **R2.1** The Check panel presents a `SearchCombobox` (existing typeahead)
  for block selection, reusing `/api/suggest`.
- **R2.2** Selecting a block sets `selectedAddressKey` and auto-displays the
  block's town, block number, and street name as read-only info.
- **R2.3** Block selection triggers `fetchAddressDetail(addressKey)` via
  the existing `/api/details/{key}` endpoint to load comparable transactions.

## R3 — Listing detail form
- **R3.1** The form accepts: asking price (numeric input), floor area in sqm
  (numeric input), flat type (select populated from block's available flat
  types), storey range (select populated from block's available storey ranges).
- **R3.2** Optional: lease commence year (numeric input). If provided, it
  influences caveats only — it does not narrow or alter comparable matching.
- **R3.3** The "Check This Listing" button is disabled until both
  `selectedAddressKey` and a valid `askingPrice` are present.
- **R3.4** Form inputs use `type="number"`, `inputMode="numeric"`, and
  appropriate ARIA labels for mobile usability.

## R4 — Deterministic price verdict
- **R4.1** The analysis reuses `findComparableTransactions` (filters by flat
  type, storey midpoint ±3 floors, floor area ±5 sqm) and `assessAskingPrice`
  (computes median, P25/P75, min/max, percentile, $/sqm deltas, verdict).
- **R4.2** Verdicts: `well_below` (≤−10% vs median), `below` (−10% to −3%),
  `fair` (−3% to +3%), `above` (+3% to +10%), `well_above` (≥+10%).
- **R4.3** No AI, prediction models, or external API calls are involved.

## R5 — Confidence level
- **R5.1** Confidence is computed by `computeConfidence()` as a separate
  metadata field alongside the verdict.
- **R5.2** Tiers: ≥12 comparables → high; 5–11 → medium; 1–4 → low.
- **R5.3** Recency adjustment: if the newest comparable is >12 months old,
  confidence is downgraded one tier (high→medium, medium→low).
- **R5.4** The confidence badge and plain-English reason text are displayed
  prominently in the verdict card.

## R6 — Plain-English caveats
- **R6.1** `generateCaveats()` produces a list of caveat messages with
  severity levels (`info` or `warning`).
- **R6.2** Triggers: low sample count (<5), lease mismatch (>10 year
  difference from comparable median), stale data (>12 months), extreme outlier.
- **R6.3** Caveats are displayed in the verdict card with severity icons.

## R7 — Verdict card display
- **R7.1** Shows: verdict label with themed colors, confidence badge,
  comparable count, fair range (P25–P75), median price, asking delta vs
  median (absolute and %), asking $/sqm, median $/sqm, percentile among
  comparables, distribution bar.
- **R7.2** An expandable section lists the actual comparable transactions
  used as evidence (price, month, storey, floor area).
- **R7.3** "Save to Shortlist" and "Share" action buttons are present.

## R8 — URL sharing
- **R8.1** The check state is encoded in URL query params:
  `checkAddress`, `checkPrice`, `checkSqm`, `checkFlatType`, `checkStorey`,
  `checkLease`.
- **R8.2** Opening a shared URL auto-opens the Check tab, loads the block
  detail, fills the form, and re-runs the analysis.
- **R8.3** The "Share" button copies the full URL to the clipboard.

## R9 — Shortlist save
- **R9.1** "Save to Shortlist" adds a `ShortlistItem` with `targetPrice`
  set to the asking price and `notes` containing structured verdict metadata.
- **R9.2** Saved listing checks are visible in the Saved tab alongside
  other shortlist items without changes to the shortlist UI.

## R10 — Existing code preservation
- **R10.1** `AskingPriceCheck.tsx` inside `DetailDrawer` is not modified
  (beyond extracting shared subcomponents as independent files).
- **R10.2** `transaction-analysis.ts` is not modified.
- **R10.3** All existing tests continue to pass.

## R11 — Tests
- **R11.1** Vitest unit tests cover confidence thresholds, recency
  downgrade, all caveat triggers, and the full listing check pipeline.
- **R11.2** Component test covers form rendering, verdict display,
  confidence badge, and caveats.
- **R11.3** Playwright E2E covers the full buyer flow on mobile and desktop,
  URL sharing round-trip, shortlist save, and edge cases (no comparables,
  low confidence).
