# Requirements: Shortlist Offer Board

## R1 — Offer-board data model

- **R1.1** `ShortlistItem` in `shared/data-types.ts` includes all buyer
  decision fields: asking price, fair range (low, median, high), suggested
  offer ceiling, buyer opening offer, valuation received, estimated COV,
  viewing date, decision status, pros, cons, renovation notes, noise notes,
  transport notes, agent remarks, and buyer notes.

- **R1.2** Decision status is a string union accepting exactly:
  `"considering"`, `"viewing booked"`, `"offered"`, `"rejected"`,
  `"kiv"`, `"dropped"`. No other values are valid.

- **R1.3** All new fields are optional. An item with only `addressKey`,
  `notes`, `targetPrice`, and `addedAt` is valid.

- **R1.4** The Zod schema in `src/lib/shortlist.ts` validates all new
  fields with `.optional().catch(undefined)` so unknown or malformed
  values degrade gracefully.

- **R1.5** The server-side Zod schema in `functions/_lib/shortlist.ts`
  mirrors the client schema for every field, including max-length
  constraints on string fields.

## R2 — Migration and persistence compatibility

- **R2.1** Shortlist items persisted in `localStorage` under the existing
  `hdb_resale_shortlist_v1` key load without data loss after the upgrade.

- **R2.2** Old items without new fields are parsed as valid items with
  new fields set to `undefined`.

- **R2.3** Legacy field aliases are normalized at parse time:
  `noise` → `noiseNotes`, `transport` → `transportNotes`,
  `notes` → `buyerNotes` (when `buyerNotes` is absent).

- **R2.4** Normalization is idempotent: applying it to an already-normalized
  item produces the same result.

- **R2.5** Legacy payloads round-trip through URL share encoding
  (`encodeShortlistForUrl` / decode) without losing existing fields.

- **R2.6** Legacy payloads pass through the cloud sync push/pull cycle
  without breaking the sync queue.

- **R2.7** The `localStorage` storage key does not change. No key
  migration is needed.

## R3 — Side-by-side comparison

- **R3.1** The comparison view displays all shortlisted items with
  columns for: asking price, fair range (formatted as
  `low — median — high`), delta vs fair median, price per sqm,
  remaining lease, monthly payment estimate (placeholder if not
  computable), nearest MRT with walking time, confidence level,
  and caveats.

- **R3.2** `deltaVsFairMedian` is computed as the difference between
  the block's median price and the item's `fairRangeMedian`. It is
  `null` when either value is missing.

- **R3.3** Price per sqm, lease, MRT, confidence, and caveats are
  derived from existing block summary and detail data — not from
  buyer inputs.

- **R3.4** Monthly payment estimate degrades gracefully to a dash or
  placeholder when the underlying calculation is not yet implemented.

- **R3.5** Comparison rows include the item's `decisionStatus` and
  `notes` alongside market-derived metrics.

## R4 — Editability and decision workflow

- **R4.1** Every new field on `ShortlistItem` is editable from the
  item editor in the shortlist drawer.

- **R4.2** Decision status is selectable from a dropdown with all six
  valid options plus an "Unknown" default.

- **R4.3** Field updates persist immediately to `localStorage` via the
  existing `onUpdate` callback and enqueue a cloud sync push if sync
  is enabled.

- **R4.4** The item editor groups fields into logical sections:
  pricing/valuation, decision/workflow, and qualitative notes.

- **R4.5** Removing an item presents a five-second, screen-reader-announced
  Undo action so an accidental removal can be reversed without leaving the
  shortlist workflow.

- **R4.6** Undo restores the exact removed `ShortlistItem`, including every
  buyer-entered offer-board field and note, at its previous list position.
  The restored item follows the same local persistence and opt-in sync path as
  any other shortlist mutation.

## R5 — Preservation of existing behavior

- **R5.1** Shortlist capacity cap (`MAX_SHORTLIST_ITEMS`), ordinary add/remove
  semantics, share payload encoding limits, and sync debounce cadence remain
  unchanged. Removal recovery uses an explicit restore operation rather than
  reusing the add/remove toggle.

- **R5.2** No new external API calls are introduced in `src/` or
  `functions/`. All data shown in the offer board comes from
  existing local data, buyer inputs, or existing API responses.

- **R5.3** No runtime geocoding or data ingestion is introduced.

- **R5.4** Existing shortlist ranking modes (`target-gap`, `median`,
  `median-asc`, `median-desc`, `lease`, `mrt`) continue to work.
  New fields participate in sorting where applicable (e.g. items with
  decision status "dropped" could be deprioritized).

## R6 — Mobile usability

- **R6.1** The comparison view on mobile viewports (below Tailwind `md`
  breakpoint) renders a card-based layout instead of a horizontally
  scrolling table.

- **R6.2** Each mobile comparison card shows all key metrics: median
  price, confidence, decision status, asking price, price/sqm, target
  price, lease, MRT, fair range, and delta vs fair median.

- **R6.3** The item editor is touch-friendly: input fields and dropdowns
  are large enough for mobile tap targets.

## R7 — Export compatibility

- **R7.1** CSV export (`buildShortlistCsvContent`) includes offer-board
  fields as additional columns when populated.

- **R7.2** CSV export sanitizes string fields against formula injection,
  following the existing sanitization pattern.

- **R7.3** JSON export (via share URL) includes all populated fields.
  Fields that exceed the share URL payload limit are handled by the
  existing truncation/fallback mechanism.

## R8 — I18n

- **R8.1** All user-facing labels, column headers, status options,
  placeholders, and empty-value strings for new fields are defined in
  `src/lib/i18n/messages.ts`.

- **R8.2** New keys follow the existing namespace convention:
  `shortlist.compare.col.*` for comparison columns,
  `shortlist.decisionStatus.*` for status labels.

## R9 — Testing

- **R9.1** Unit tests cover migration from old shortlist payloads to the
  new schema: old items without new fields, mixed old+new payloads,
  malformed item fallback, legacy alias normalization.

- **R9.2** Unit tests cover persistence round-trips: encode/decode with
  new fields, sync payload validation with both legacy and upgraded
  shapes.

- **R9.3** Unit tests cover comparison row derivation: delta vs fair
  median calculation, fair range formatting, confidence and caveat
  propagation, decision status passthrough.

- **R9.4** E2E tests verify mobile comparison renders card layout with
  correct item count on mobile viewport width.

- **R9.5** Sync payload validation tests cover server-side Zod schema
  acceptance of both legacy and upgraded fields.
