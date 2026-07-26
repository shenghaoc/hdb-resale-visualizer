# Tasks: Confidence & Caveats System

> Status: Implementation complete. Final stacked-PR gates remain separate from
> this implementation checklist so they are not claimed before they run.

## Phase 1 — Shared engines

- [x] **T1.1** Implement `shared/confidence-system.ts` with typed inputs,
  weighted sample/recency/scope/match signals, `0.70`/`0.40` tiers, and
  low/medium caps. (R1)
- [x] **T1.2** Add `tests/unit/confidence-system.test.ts` coverage for signal
  boundaries, representative tiers, all caps, integration cases, output
  shape, and stable summaries. (R6.1)
- [x] **T1.3** Implement `shared/caveat-codes.ts` with all 17 codes, including
  `TIME_ADJUSTMENT_UNAVAILABLE`, structured values, API mapping,
  deduplication, and severity rules. (R2)
- [x] **T1.4** Add `tests/unit/caveat-codes.test.ts` coverage for every code,
  trigger boundaries, structured values, API mapping, deduplication, and
  severity. (R6.2)

## Phase 2 — Current adapters and ownership

- [x] **T2.1** Keep compatibility logic in
  `shared/product/listing-check.ts`, including shared confidence/caveat
  delegation and the `critical` to `warning` compatibility mapping. (R3.1)
- [x] **T2.2** Expose the frontend adapters from
  `src/entities/transaction/listing-confidence.ts` and
  `src/entities/transaction/listing-caveats.ts`. (R3.2)
- [x] **T2.3** Preserve the shared verdict contract through
  `src/features/listing-check/listing-verdict.ts`. (R3.3)
- [x] **T2.4** Route the count-only confidence helper in
  `src/features/listing-check/confidence.ts` through the shared engine and
  stable locale keys. (R3.4)
- [x] **T2.5** Cover compatibility exports and behavior in
  `tests/unit/listing-confidence-adapter.test.ts`,
  `tests/unit/listing-confidence.test.ts`,
  `tests/unit/listing-caveats.test.ts`,
  `tests/unit/listing-verdict.test.ts`, and
  `tests/unit/confidence.test.ts`. (R6.3)

## Phase 3 — Full-signal Listing Check

- [x] **T3.1** Assemble `ConfidenceInput` in
  `src/features/listing-check/listingCheckAnalysis.ts` from comparable count,
  recency, cumulative scope counts, and stable flat-type/floor-area/storey
  match identifiers. (R3.5)
- [x] **T3.2** Generate structured result caveats from percentile, lease,
  widening, and time-adjustment evidence, including the unavailable-adjustment
  branch. (R2.5, R3.5)
- [x] **T3.3** Cover full-signal derivation and identifier counting in
  `tests/unit/listingCheckAnalysis.test.ts`. (R6.4)

## Phase 4 — Localized presentation

- [x] **T4.1** Implement
  `src/features/listing-check/listingCheckPresentation.ts` so confidence
  summaries are rebuilt from structured input and caveats are translated from
  code plus values. (R4.1, R4.2)
- [x] **T4.2** Translate all eight stable match-reason identifiers only when
  their badges render; preserve unknown reasons and raw caveats. (R4.3, R4.4)
- [x] **T4.3** Carry the selected locale through Listing Check compact
  currencies and evidence ranges. (R4)
- [x] **T4.4** Cover both locales, all 17 caveats, all eight match reasons,
  structured interpolation, confidence summary branches, and unchanged engine
  identifiers in focused unit/component tests. (R6.4, R6.5)

## Phase 5 — Final verification

- [ ] **T5.1** Run the exact-head package gate: `vp run check`.
- [ ] **T5.2** Run the exact-head browser/E2E gate: `vp run check:pr`.
- [ ] **T5.3** Complete the final deployed-preview smoke for Listing Check
  confidence, caveats, evidence badges, and both locales.
