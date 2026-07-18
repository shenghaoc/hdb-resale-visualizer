# Tasks: Shortlist Offer Board

> Execution checklist. Order respects dependencies: shared types →
> Zod schemas → migration logic → comparison rows → UI components →
> export/i18n → tests → verification. Each task names its acceptance
> check and traces to requirements.

## Phase 1 — Data model and Zod schemas

- [x] **T1.1** Extend `ShortlistItem` in `shared/data-types.ts` with
  offer-board fields: `askingPrice`, `fairRangeLow`, `fairRangeMedian`,
  `fairRangeHigh`, `suggestedOfferCeiling`, `buyerOpeningOffer`,
  `valuationReceived`, `estimatedCov`, `viewingDate`, `decisionStatus`,
  `pros`, `cons`, `renovation`, `noiseNotes`, `transportNotes`,
  `buyerNotes`, `agentRemarks`. All optional.
  → `npm run typecheck` passes. (R1.1, R1.2, R1.3)

- [x] **T1.2** Update client-side Zod schema in `src/lib/shortlist.ts`:
  add `.optional().catch(undefined)` entries for each new field. Add
  max-length constraints on string fields. Ensure existing fields
  (`notes`, `targetPrice`, `addedAt`) retain their defaults.
  → `npm run typecheck` passes. (R1.4)

- [x] **T1.3** Mirror schema additions in `functions/_lib/shortlist.ts`
  `shortlistItemSchema` using the same max-length constraints.
  → `npm run typecheck` passes. (R1.5)

## Phase 2 — Migration logic

- [x] **T2.1** Implement `normalizeShortlistItem` in
  `src/lib/shortlist.ts`: alias `noise` → `noiseNotes`,
  `transport` → `transportNotes`, `notes` → `buyerNotes` (when
  canonical field is absent). Ensure idempotency.
  → `npm run typecheck` passes. (R2.3, R2.4)

- [x] **T2.2** Wire normalization into `loadShortlist`,
  `mergeImportedShortlistItems`, and the URL share decode path so
  every entry point applies migration before returning items.
  → `npm run typecheck` passes. (R2.1, R2.2, R2.5)

- [x] **T2.3** Duplicate normalization logic in
  `functions/_lib/shortlist.ts` for server-side sync validation.
  → `npm run typecheck` passes. (R2.6)

- [x] **T2.4** Add migration unit tests in
  `tests/unit/shortlist.test.ts`:
  - Old item without new fields parses with `undefined` for new fields
  - Legacy alias fields normalize to canonical names
  - Mixed old+new payload round-trips through encode/decode
  - Malformed items are dropped; valid items are preserved
  → `npm run test -- tests/unit/shortlist.test.ts` passes. (R9.1)

## Phase 3 — Comparison row schema and computation

- [x] **T3.1** Extend `ShortlistComparisonInputRow` and
  `ShortlistComparisonRow` in `src/lib/shortlist-comparison.ts` with:
  `askingPrice`, `fairRangeLow`, `fairRangeMedian`, `fairRangeHigh`,
  `deltaVsFairMedian`, `confidenceLevelLabel`, `caveatKeys`,
  `decisionStatus`, `monthlyPaymentEstimate`.
  → `npm run typecheck` passes. (R3.1, R3.2, R3.3)

- [x] **T3.2** Implement `deltaVsFairMedian` computation:
  `medianPrice - fairRangeMedian` with tone classification. Return
  `null` when either value is missing.
  → `npm run typecheck` passes. (R3.2)

- [x] **T3.3** Add comparison row unit tests in
  `tests/unit/shortlist-comparison.test.ts`:
  - Delta calculation for below/above/match tones
  - Fair range formatting with complete, partial, and missing data
  - Confidence and caveat propagation from block data
  - Decision status passthrough from ShortlistItem
  → `npm run test -- tests/unit/shortlist-comparison.test.ts` passes.
  (R9.3)

## Phase 4 — UI: comparison table and mobile cards

- [x] **T4.1** Update `ShortlistComparisonTable` in
  `src/components/ShortlistDrawer.tsx` with desktop table columns:
  rank, address, town, median price (with budget badge), price/sqm,
  asking price, fair range, delta vs fair median, confidence, lease,
  MRT, monthly payment, decision status, caveats, target price, notes.
  Table wrapped in `hidden md:block overflow-x-auto` with
  `min-w-[60rem]`.
  → `npm run typecheck` passes. (R3.1, R3.4, R3.5)

- [x] **T4.2** Add mobile card layout in `ShortlistComparisonTable`:
  render inside `grid gap-2 px-2 py-3 md:hidden`. Each card shows
  rank, address, flat type, metric badges (median price, confidence,
  decision status), and a two-column grid of secondary metrics.
  → `npm run typecheck` passes. (R6.1, R6.2)

- [x] **T4.3** Verify existing list view behaviors remain intact:
  notes display, rank badges, empty-state rendering, existing sort
  modes.
  → Manual smoke test. (R5.1, R5.4)

## Phase 5 — UI: item editor

- [x] **T5.1** Add offer-board field editor sections in the shortlist
  item cards within `ShortlistDrawer.tsx`:
  - Pricing & Valuation: asking price, fair range (low/median/high),
    suggested offer ceiling, buyer opening offer, valuation received,
    estimated COV, target price
  - Decision: decision status dropdown (6 options + unknown default),
    viewing date input
  - Notes: pros, cons, renovation, noise, transport, agent remarks,
    buyer notes (each as `<Textarea>`)
  → `npm run typecheck` passes. (R4.1, R4.2, R4.4)

- [x] **T5.2** Wire all field updates through the existing `onUpdate`
  callback for immediate localStorage persistence and sync queue
  enqueue.
  → `npm run typecheck` passes. (R4.3)

- [x] **T5.3** Make shortlist removal recoverable without data loss:
  preserve the complete removed item and its index, expose an explicit restore
  operation through `useShortlist`, announce a five-second Undo action, and
  test exact offer-board-field restoration.
  → Focused shortlist tests and `vp run typecheck` pass. (R4.5, R4.6, R5.1)

## Phase 6 — Export, i18n, and share compatibility

- [x] **T6.1** Update `buildShortlistCsvContent` in `src/lib/export.ts`
  to include new columns for all offer-board fields. Apply existing
  formula injection sanitization to new string fields.
  → `npm run typecheck` passes; `npm run test -- tests/unit` passes.
  (R7.1, R7.2)

- [x] **T6.2** Add i18n keys in `src/lib/i18n/messages.ts`:
  - `shortlist.compare.col.*` for all new comparison column headers
  - `shortlist.decisionStatus.*` for all six decision status options
    plus "unknown"
  - `shortlist.compare.gapBelow`, `shortlist.compare.gapAbove`,
    `shortlist.compare.gapMatch` for delta formatting
  - `shortlist.compare.caveats.none` for empty caveat display
  - `shortlist.compare.fairDeltaBelow`, `shortlist.compare.fairDeltaAbove`
    for delta vs fair median
  → `npm run typecheck` passes. (R8.1, R8.2)

- [x] **T6.3** Verify URL share round-trip with new fields: encode
  items with offer-board fields populated, decode, verify fields
  survive. Add test case in `tests/unit/shortlist.test.ts`.
  → `npm run test -- tests/unit/shortlist.test.ts` passes. (R7.3, R9.2)

## Phase 7 — Sync and server-side validation

- [x] **T7.1** Add sync payload tests in `tests/unit/shortlist-sync.test.ts`:
  - Server-side Zod schema accepts legacy payload shape
  - Server-side Zod schema accepts upgraded payload with new fields
  - Payload size limits are enforced
  → `npm run test -- tests/unit/shortlist-sync.test.ts` passes.
  (R9.2, R9.5)

- [x] **T7.2** Verify `functions/_lib/shortlist.ts` validation limits
  and normalization handle both old and new payload shapes without
  rejecting valid items.
  → `npm run typecheck` passes. (R2.6, R5.1)

## Phase 8 — E2E and mobile verification

- [x] **T8.1** Add mobile comparison card layout test in
  `tests/e2e/mobile-regression.spec.ts`: verify comparison view
  renders card layout (not table) on mobile viewport, with correct
  item count matching shortlisted items.
  → `npm run test:e2e` passes. (R9.4, R6.1)

- [x] **T8.2** Add or update Playwright coverage for shortlist field
  editing on mobile: fill asking price, change decision status, verify
  persistence after reload.
  → `npm run test:e2e` passes. (R9.4, R4.1)

## Phase 9 — Verification

- [x] **T9.1** Run full unit test suite:
  `npm run test -- tests/unit/shortlist*.test.ts tests/unit/ShortlistDrawer.test.tsx`
  — all pass.

- [x] **T9.2** Run `npm run typecheck` — clean.

- [x] **T9.3** Run `npm run lint` — clean.

- [x] **T9.4** Run `npm run build` — production build succeeds.

- [x] **T9.5** Run `npm run test:e2e` — all E2E tests pass, including
  mobile regression suite.
