# Requirements: Buyer Listing Price Check

## R1 — "Check" tab in navigation
- **R1.1** A primary tab labelled "Check" is present in both `DesktopTabBar`
  and `MobileTabBar`, between Results and Saved.
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
  the existing `/api/details/{key}` endpoint to load block metadata and form
  options.
- **R2.4** Entering Check from Results or block detail carries over only the
  selected block. Changing blocks clears asking price, floor area, flat type,
  storey range, lease year, and any prior result.

## R3 — Listing detail form
- **R3.1** The form accepts: asking price (numeric input), floor area in sqm
  (numeric input), flat type (select populated from block's available flat
  types), storey range (select populated with canonical HDB storey bands).
- **R3.2** Optional: lease commence year (numeric input). If provided, it
  contributes to comparable similarity and lease caveats. If omitted, the
  comparable engine rescales the remaining similarity signals.
- **R3.3** The "Check This Listing" button is disabled until a block, positive
  asking price, positive floor area, valid flat type, and valid storey range are
  all present.
- **R3.4** Form inputs use `type="number"`, `inputMode="numeric"`, and
  appropriate ARIA labels for mobile usability.
- **R3.5** Flat-type options come from the block's complete summary and storey
  options use the canonical HDB storey bands. Neither field auto-selects the
  first available value.
- **R3.6** The empty state has no sample/demo listing and does not prefill
  synthetic unit facts.

## R4 — Canonical deterministic price verdict
- **R4.1** Explicitly submitting the form sends the listing facts to the
  same-origin `POST /api/comparable-transactions?adjust=time` endpoint. That
  endpoint is the authoritative comparable-selection path.
- **R4.2** The panel derives the asking-price assessment from the returned
  comparable set using the canonical listing-check analysis module; it does not
  run an independent legacy comparable selector.
- **R4.3** Verdicts: `well_below` (≤−10% vs median), `below` (−10% to −3%),
  `fair` (−3% to +3%), `above` (+3% to +10%), `well_above` (≥+10%).
- **R4.4** No AI, prediction models, runtime geocoding, or external API calls
  are involved.

## R5 — Confidence level
- **R5.1** Confidence is computed by the shared `computeConfidence()` module as
  separate evidence metadata alongside the verdict.
- **R5.2** Confidence uses the comparable count, recency, geographic scope, and
  unit-fact match signals from the canonical comparable response.
- **R5.3** Low sample volume, stale evidence, or a lack of block/street evidence
  caps the tier according to the shared confidence contract.
- **R5.4** The confidence badge and plain-English reason text are displayed
  prominently in the verdict card.

## R6 — Plain-English caveats
- **R6.1** `generateCaveats()` produces a list of caveat messages with
  severity levels (`info`, `warning`, or `critical`).
- **R6.2** Triggers include no/low sample volume, stale or widened evidence,
  listing-fact match gaps, lease mismatch, extreme outliers, and unavailable or
  applied time adjustment.
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
  detail, and fills only the facts present in the URL. It does not run analysis
  until the buyer explicitly selects "Check This Listing".
- **R8.3** The "Share" button copies the full URL to the clipboard.

## R9 — Shortlist save
- **R9.1** "Save to Shortlist" adds or updates a `ShortlistItem` with
  `askingPrice` set to the seller's asking price.
- **R9.2** Saved listing checks are visible in the Saved tab alongside
  other shortlist items.
- **R9.3** Saving a check does not overwrite the buyer's `targetPrice` or notes
  and does not persist a generic confidence verdict as a durable listing fact.

## R10 — One user-facing Check engine
- **R10.1** `ListingCheckPanel` is the only user-facing asking-price evaluator.
- **R10.2** Block detail may offer a "Check this listing" action, but it routes
  to the canonical Check panel with the selected block only; it does not embed
  or execute a second evaluator.
- **R10.3** No flow auto-selects a flat type or storey range from a block's
  transaction sample as if it were a listing fact.
- **R10.4** All existing non-listing-check behavior and tests continue to pass.

## R11 — Tests
- **R11.1** Vitest unit tests cover confidence signals and tier caps, all caveat
  triggers, and the full listing-check pipeline.
- **R11.2** Component test covers form rendering, verdict display,
  explicit required-fact gating, confidence badge, and caveats.
- **R11.3** Playwright E2E covers the full buyer flow on mobile and desktop,
  explicit submission after URL hydration, shortlist asking-price preservation,
  and edge cases (no comparables, low confidence).
- **R11.4** Regression coverage proves block detail routes to the canonical
  Check panel and that no sample/default unit facts or second evaluator remain.
