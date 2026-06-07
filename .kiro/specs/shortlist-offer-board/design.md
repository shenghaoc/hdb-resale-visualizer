# Design: shortlist-offer-board

## Vision

Upgrade shortlist from a notes-only collection to a buyer decision board where each
saved flat carries structured investment and decision context.

The board should support:

- Asking price and targeting context
- Fair valuation context
- Buyer-facing decision state
- Qualitative notes grouped by decision workflow
- Side-by-side comparison for prioritisation across saved flats

The implementation should preserve all existing persistence paths (`localStorage`,
sync code, share links, CSV/JSON export) and only change the in-repo schema and
UI contracts that consume it.

## Existing baseline

- Existing saved item model is `ShortlistItem` in `shared/data-types.ts`.
- Current fields include:
  `addressKey`, `notes`, `pros`, `cons`, `renovation`, `noise`, `transport`,
  `offerCeiling`, `agentRemarks`, `targetPrice`, `addedAt`.
- Persistence is already tolerant using `zod.catch` in `src/lib/shortlist.ts` and
  `functions/_lib/shortlist.ts`, and `tests/unit/shortlist.test.ts` includes an
  old/new format compatibility case.
- Side-by-side compare currently renders `ShortlistComparisonRow` in
  `src/lib/shortlist-comparison.ts` and `ShortlistDrawer.tsx`.

## Proposed model for offer-board items

Keep `addressKey` as the primary key and keep storage key unchanged.

- Add new short-list item properties:
  - `askingPrice?: number`
  - `fairRangeLow?: number`
  - `fairRangeMedian?: number`
  - `fairRangeHigh?: number`
  - `suggestedOfferCeiling?: number`
  - `buyerOpeningOffer?: number`
  - `valuationReceived?: number`
  - `estimatedCov?: number`
  - `viewingDate?: string`
  - `decisionStatus?: "considering" | "viewing booked" | "offered" | "rejected" | "kiv" | "dropped"`
  - `noiseNotes?: string`
  - `transportNotes?: string`
  - `buyerNotes?: string`
- Keep existing fields to preserve behavior:
  - `targetPrice`
  - `pros`, `cons`, `renovation`, `noise`, `transport`, `agentRemarks`, `offerCeiling`
- Add mapping/alias layer so existing screens that read `notes` and
  `noise/transport` keep functioning even if only alias versions exist.

### Migration strategy

- Introduce an explicit migration path:
  - V1 -> V2 parser transforms old objects and fills new fields with safe defaults
    without dropping unknown data.
  - If `targetPrice` exists but `buyerOpeningOffer` does not, keep
    `targetPrice` and seed `buyerOpeningOffer` from it.
  - If `askingPrice` is absent, fallback to `targetPrice` for UI continuity.
  - Map old `notes` into `buyerNotes` only when `buyerNotes` is missing.
  - Preserve legacy field `notes` as the shared fallback note for components still
    keyed to it.
- Migration function should be idempotent and run in both local and worker-side
  parsing functions.
- No destructive conversions: malformed items are dropped, valid items are kept
  with partial migration.

## Side-by-side comparison design

- Comparison view keeps existing shortlist table on desktop and adds columns:
  - asking price
  - fair range
  - delta vs fair median
  - price per sqm
  - lease situation (existing remaining-lease rendering style)
  - monthly payment estimate (only when profile/data is already available)
  - MRT + walking context (existing nearestMrt fields)
  - confidence level
  - caveats
- Keep compare sorting logic compatible with existing modes and extend it with the
  new decision fields where reasonable.
- Fair-range calculations:
  - Show as a compact string `low — median — high`.
  - `delta vs fair median` uses the existing row median and selected offer value.

## Decision board behavior

- Add or repurpose a board section in shortlist UI so each item can show:
  - current decision status
  - quick update controls for:
    - asking price
    - buyer opening offer
    - valuation received
    - estimated COV
    - viewing date
  - textual sections for pros, cons, renovation notes, noise notes,
    transport notes, agent remarks, and buyer notes.
- Decision status is a first-class field on each item and should be persisted.

## Mobile usability

- Keep desktop compare table as a horizontally scrollable baseline.
- Add mobile fallback presentation:
  - each row renders as a compact card stack with all required metrics visible.
- Preserve `localStorage` save-on-change behavior and sync queue behavior from
  `useShortlist` and `functions/_lib/shortlist.ts`.
- Avoid introducing any third-party AI API calls; all valuation values shown in UI
  come from local data and existing project helpers.

## Acceptance sketch

- Existing users loading old shortlist payloads continue to see at least one row
  per valid item, and old notes remain visible.
- New fields are editable and rendered in both list and compare contexts.
- Mobile users can access comparison values without pinch-zoom or clipped text.
- Sync/import/export/share continue to include or ignore the new fields without data loss.

