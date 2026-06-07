# Tasks: shortlist-offer-board

## Phase 1 — Data model and migration

- [x] **T1.1** Extend `ShortlistItem` in `shared/data-types.ts` with new board
  fields, including `buyerOpeningOffer`, `valuationReceived`, `estimatedCov`,
  `viewingDate`, `decisionStatus`, `noiseNotes`, `transportNotes`, and
  `buyerNotes`.
- [x] **T1.2** Mirror the server-side schema additions in
  `functions/_lib/shortlist.ts` `shortlistItemSchema` using existing max-length
  patterns.
- [x] **T1.3** Add migration helpers in `src/lib/shortlist.ts`:
  - parse legacy raw objects without throwing
  - apply alias fallback for existing `targetPrice`/`notes`
  - preserve unknown fields when safe
  - keep `loadShortlist`, `mergeImportedShortlistItems`, and share encode/decode paths untouched
- [x] **T1.4** Add migration coverage in `tests/unit/shortlist.test.ts` for:
  - old item without new fields
  - mixed old+new payload
  - malformed old item fallback

## Phase 2 — Comparison row schema and sort

- [x] **T2.1** Extend `ShortlistComparisonInputRow` and
  `ShortlistComparisonRow` in `src/lib/shortlist-comparison.ts` with offer-board
  fields and precomputed derived values:
  - asking price
  - fair range fields
  - `deltaVsFairMedian`
  - confidence label/caveats inputs
- [x] **T2.2** Implement deterministic `delta` display helpers for compare rows
  and add sorting behavior that supports decision/status-aware ordering.
- [x] **T2.3** Add unit tests in `tests/unit/shortlist-comparison.test.ts` for:
  - delta calculation
  - fair range formatting behavior
  - confidence and caveat propagation

## Phase 3 — UI board and editor surface

- [x] **T3.1** Add an offer-board item editor in `src/components/ShortlistDrawer.tsx`
  so each item can capture:
  - asking price
  - fair range triple
  - suggested offer ceiling
  - buyer opening offer
  - valuation received
  - estimated COV
  - viewing date
  - decision status
  - pros/cons/renovation/noise/transport/agent remarks/buyer notes
- [x] **T3.2** Add compare table columns in shortlist compare mode for:
  asking price, fair range, delta vs fair median, price per sqm, lease,
  monthly payment estimate (if supported), MRT/walking context, confidence level,
  and caveats.
- [x] **T3.3** Keep legacy visible behaviors:
  notes display remains, existing rank badges/empty-state behaviors remain.
- [x] **T3.4** Add missing i18n keys in `src/lib/i18n/messages.ts` for new labels,
  actions, and empty-value placeholders.

## Phase 4 — Export, share, and sync compatibility

- [x] **T4.1** Update shortlist CSV/summary exports (`src/lib/export.ts` and
  `src/components/ShortlistDrawer.tsx`) to include offer-board fields where
  available without breaking existing column consumers.
- [x] **T4.2** Update shortlist import/export tests:
  - `tests/unit/shortlist.test.ts` round-trip with new fields
  - `tests/unit/shortlist-sync*` for payload parse limits and sync body schema compatibility
- [x] **T4.3** Ensure `functions/_lib/shortlist.ts` retains payload size and validation
  limits while accepting legacy and upgraded payload shapes.

## Phase 5 — Mobile usability and validation

- [x] **T5.1** Add mobile-friendly compare rendering in `ShortlistDrawer.tsx`:
  - touch-friendly controls
  - no clipped essential fields
  - readable status/metric chips in narrow viewports
- [ ] **T5.2** Add or update Playwright coverage for shortlist board on mobile
  width, including editing fields and comparing rows.

## Phase 6 — Verification

- [ ] **T6.1** Run unit test suite for shortlist modules:
  `tests/unit/shortlist*.test.ts`, `tests/unit/shortlist-comparison.test.ts`.
- [ ] **T6.2** Add migration/integration regression checks for share + sync path.
- [ ] **T6.3** Run `npm run build` and relevant e2e flows for shortlist compare editing.
