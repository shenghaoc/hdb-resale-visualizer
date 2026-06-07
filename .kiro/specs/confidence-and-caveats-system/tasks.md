# Tasks: Confidence & Caveats System

> Execution checklist. Order respects dependencies: shared types →
> confidence engine → caveat codes → adapters → component wiring →
> tests. Each task names its acceptance check.

## Phase 1 — Shared confidence engine

- [ ] **T1.1** Create `shared/confidence-system.ts`: export
  `ConfidenceInput`, `ConfidenceAssessment`, `ConfidenceLevel` types
  and `computeConfidence(input: ConfidenceInput): ConfidenceAssessment`
  function. Implement weighted sub-signal scoring (sample 0.35,
  recency 0.25, scope 0.25, match 0.15), tier mapping (0.70/0.40),
  override rules (count < 3 → low, age > 18 → medium cap,
  no same-block/street → medium cap), and summary builder.
  → `npm run typecheck` passes. (R1.1, R1.2, R1.3, R2.1–R2.4, R6.1, R6.2)

- [ ] **T1.2** Vitest `tests/unit/confidence-system.test.ts`: cover
  each sub-signal at boundaries (0, saturation, 1), tier thresholds
  at exact values (0.3999/0.40/0.6999/0.70), all three override
  rules, verify overrides only cap (never raise), integration cases
  (same-block heavy → high, town-wide stale → low), summary non-empty.
  → `npm run test` passes. (R7.1, R7.2, R7.3)

## Phase 2 — Caveat codes

- [ ] **T2.1** Create `shared/caveat-codes.ts`: export `CaveatCode`
  union, `CaveatSeverity`, `Caveat` type, and
  `generateCaveats(params): Caveat[]`. Implement all 16 caveat
  triggers per the design (NO_COMPARABLES through SMALL_TREND_SAMPLE).
  Include `apiCaveats` string-to-code mapper and deduplication by code.
  → `npm run typecheck` passes. (R3.1, R3.2, R3.3, R3.4, R6.1)

- [ ] **T2.2** Vitest `tests/unit/caveat-codes.test.ts`: cover every
  caveat code at its trigger threshold and below, deduplication,
  `critical` severity only for `NO_COMPARABLES`, clean input produces
  empty array, `apiCaveats` mapping.
  → `npm run test` passes. (R7.4, R7.5)

## Phase 3 — Adapter layers

- [ ] **T3.1** Update `src/lib/listing-confidence.ts`: delegate to
  `shared/confidence-system.ts` internally while preserving the
  existing `computeConfidence` signature and `ConfidenceResult` shape.
  Build `ConfidenceInput` from `AddressDetailTransaction[]` by
  deriving match counts from property comparison (exact flat type,
  floor area ±10 sqm, storey range overlap).
  → `npm run typecheck` passes; existing tests pass. (R4.1)

- [ ] **T3.2** Update `src/lib/listing-caveats.ts`: delegate to
  `shared/caveat-codes.ts` internally while preserving the existing
  `generateCaveats` signature and `{ severity, message }` shape. Map
  `critical` → `warning` in adapter output. Remove the `Date.now()`
  fallback.
  → `npm run typecheck` passes; existing tests pass. (R4.2, R6.2)

- [ ] **T3.3** Update `src/lib/confidence.ts`: route
  `getDataConfidenceLevel` through the shared engine with
  `sameBlockCount = recentTransactionCount` (all transactions are
  same-block at the block level).
  → `npm run typecheck` passes; existing tests pass. (R4.3)

- [ ] **T3.4** Vitest `tests/unit/listing-confidence-adapter.test.ts`:
  verify adapter output shape matches `ConfidenceResult`, level
  agrees with shared engine, `reason` is populated from `summary`.
  → `npm run test` passes. (R7.6)

- [ ] **T3.5** Verify `listing-verdict.ts` works without changes:
  `performListingCheck` returns the same shape via the adapter.
  → Existing `tests/unit/listing-verdict.test.ts` passes. (R4.4)

## Phase 4 — Component wiring

- [ ] **T4.1** Update `ListingCheckPanel.tsx`: when
  `ListingComparableSet` is available from the API, build a full
  `ConfidenceInput` from it (extracting match counts from
  `matchReasons`). Import `computeConfidence` from
  `shared/confidence-system.ts` and `generateCaveats` from
  `shared/caveat-codes.ts` directly for the enriched path. Display
  the `ConfidenceAssessment.summary` in the confidence badge tooltip.
  Render caveats with `critical` severity using a distinct style.
  → `npm run typecheck` passes. (R5.1, R5.2, R5.3)

- [ ] **T4.2** Verify `DetailDrawer.tsx` and `ShortlistDrawer.tsx`
  display the same confidence tier labels via the updated
  `getDataConfidenceLevel` adapter. No component changes needed if
  the adapter output is correct.
  → Manual smoke test; existing component tests pass. (R5.1)

## Phase 5 — Verification

- [ ] **T5.1** Run `npm run typecheck` — clean.

- [ ] **T5.2** Run `npm run lint` — clean.

- [ ] **T5.3** Run `npm run test` — all unit tests pass, including
  updated threshold tests in `listing-confidence.test.ts` and
  `listing-caveats.test.ts`. (R7.7)

- [ ] **T5.4** Run `npm run build` — production build succeeds.

- [ ] **T5.5** Manual smoke via `npm run dev:functions`: verify
  listing check shows enriched confidence badge, caveats render with
  correct severity styles, block detail drawer and shortlist rows
  show consistent confidence labels.
