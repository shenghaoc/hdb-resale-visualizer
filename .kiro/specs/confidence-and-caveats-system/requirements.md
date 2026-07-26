# Requirements: Confidence & Caveats System

> Status: Implemented. These requirements describe the current engine,
> compatibility adapters, and localized Listing Check presentation.

## R1 — Deterministic confidence

- **R1.1** `shared/confidence-system.ts` is the canonical confidence engine.
- **R1.2** `ConfidenceInput` contains comparable count; cumulative same-block,
  same-street, and same-town counts; newest comparable age; flat-type,
  floor-area, and storey match counts; time-adjustment status; and trend sample
  size.
- **R1.3** `ConfidenceAssessment` contains `level`, raw `score`, the four
  normalized signals, a stable English `summary`, and the echoed `input`.
- **R1.4** Confidence is a weighted sum of sample `0.35`, recency `0.25`,
  scope `0.25`, and match `0.15`.
- **R1.5** Tier thresholds are `high >= 0.70`, `medium >= 0.40`, and `low`
  below `0.40`.
- **R1.6** Fewer than three comparables caps the tier at `low`; evidence older
  than 18 months or with neither same-block nor same-street matches caps it at
  `medium`. A cap never raises the computed tier.

## R2 — Structured caveats

- **R2.1** Every caveat carries a stable code, severity, stable English
  fallback message, and optional structured interpolation values.
- **R2.2** The fixed 17-code union is:
  `NO_COMPARABLES`, `VERY_LOW_SAMPLE`, `LOW_SAMPLE`, `STALE_DATA`,
  `NO_SAME_BLOCK`, `NO_SAME_STREET`, `WIDENED_TO_STREET`,
  `WIDENED_TO_TOWN`, `FLAT_TYPE_MISMATCH`, `FLOOR_AREA_MISMATCH`,
  `STOREY_MISMATCH`, `LEASE_MISMATCH`, `EXTREME_OUTLIER_LOW`,
  `EXTREME_OUTLIER_HIGH`, `TIME_ADJUSTMENT_APPLIED`,
  `TIME_ADJUSTMENT_UNAVAILABLE`, and `SMALL_TREND_SAMPLE`.
- **R2.3** Caveats are deduplicated by code.
- **R2.4** Only `NO_COMPARABLES` uses `critical`; compatibility adapters map
  it to `warning`.
- **R2.5** Recognized widening and missing-trend API messages map to structured
  codes. `TIME_ADJUSTMENT_UNAVAILABLE` suppresses
  `TIME_ADJUSTMENT_APPLIED`.

## R3 — Current ownership and compatibility

- **R3.1** Shared product compatibility behavior lives in
  `shared/product/listing-check.ts`.
- **R3.2** Frontend entity entry points live at
  `src/entities/transaction/listing-confidence.ts` and
  `src/entities/transaction/listing-caveats.ts`.
- **R3.3** `src/features/listing-check/listing-verdict.ts` preserves the
  shared `performListingCheck` contract.
- **R3.4** `src/features/listing-check/confidence.ts` derives count-only
  compatibility levels through the shared engine and returns stable locale
  keys.
- **R3.5** The canonical full-signal path is
  `src/features/listing-check/listingCheckAnalysis.ts`; it derives match counts
  and caveats from the comparable response without querying new data.

## R4 — Localization boundary

- **R4.1** Shared engines retain stable English summaries, caveat messages,
  codes, and match-reason identifiers.
- **R4.2** `src/features/listing-check/listingCheckPresentation.ts` translates
  confidence from structured level/input and caveats from code/values.
- **R4.3** The eight match-reason identifiers remain unchanged in engine and
  API data and are translated only when badges render.
- **R4.4** Known raw API caveats are localized at the presentation boundary;
  unknown raw text remains visible as a truthful fallback.
- **R4.5** Changing locale must not change confidence inputs, evidence counts,
  scores, or caveat codes.

## R5 — Architecture

- **R5.1** `shared/confidence-system.ts` and `shared/caveat-codes.ts` are pure
  TypeScript and do not import from `src/`, `functions/`, or platform APIs.
- **R5.2** Confidence and caveat logic does not call `Date.now()`, external
  APIs, AI services, or runtime geocoding.
- **R5.3** Callers supply explicit time and evidence inputs.

## R6 — Test contract

- **R6.1** Unit tests cover signal boundaries, all three caps, representative
  low/medium/high tiers, output shape, and summaries.
- **R6.2** Unit tests cover all 17 caveat codes, threshold boundaries,
  deduplication, recognized API mappings, structured values, and severity.
- **R6.3** Adapter tests cover the entity exports, shared product compatibility
  shape, verdict path, and count-only confidence labels.
- **R6.4** Analysis tests prove stable English match reasons are counted before
  presentation.
- **R6.5** Presentation tests cover both locales, all 17 caveat codes, all
  eight match reasons, confidence summary branches, interpolation values, and
  truthful unknown fallbacks.
