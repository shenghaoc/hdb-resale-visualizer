# Design: Shortlist Offer Board

> Status: Implemented (PR #293). Upgrade the shortlist from a saved-blocks
> collection into a buyer decision board with structured negotiation fields,
> qualitative notes, and side-by-side comparison.

## Problem

The shortlist started as a simple "save for later" list. Each item carried
only `addressKey`, `notes`, and `targetPrice`. As buyers progressed through
their flat search, they needed to track negotiation context (asking prices,
fair valuations, COV estimates), schedule viewings, record impressions
(noise, transport, renovation condition), and compare flats head-to-head
on objective metrics.

Without structured fields, buyers resorted to free-text notes for
everything — asking prices, agent remarks, pros/cons — making comparison
impossible. The existing comparison table showed only median price, lease,
and MRT context from the block summary; it could not surface per-item
buyer inputs because the data model had no place for them.

Three specific gaps:

1. **No negotiation tracking.** Buyers could not record asking price, fair
   range, opening offer, valuation received, or estimated COV. These are
   the core numbers a buyer discusses with agents and compares across
   flats.

2. **No decision workflow.** There was no way to mark a flat as
   "considering", "viewing booked", "offered", "rejected", "KIV", or
   "dropped". Status lived in the buyer's head or a separate spreadsheet.

3. **No qualitative structure.** Pros, cons, renovation state, noise
   observations, transport notes, and agent remarks were all collapsed
   into a single `notes` field. Comparing impressions across flats
   required re-reading each note in full.

## Goals

- Extend `ShortlistItem` with structured fields for negotiation, decision
  workflow, and qualitative notes — without breaking existing persistence.
- Surface the new fields in both the item editor (list view) and the
  side-by-side comparison table.
- Provide a mobile-friendly comparison layout that does not require
  horizontal scrolling on narrow viewports.
- Migrate old shortlist payloads transparently: no data loss, no user
  action required.
- Keep all persistence paths working: localStorage, anonymous cloud sync,
  URL share links, CSV export.

## Non-goals

- AI-powered valuation suggestions or price predictions.
- New API endpoints (the existing `/api/shortlist` sync endpoint accepts
  arbitrary JSON in `items_json`; new fields need no server-side changes
  beyond Zod schema validation).
- Monthly payment calculation (the column exists as a placeholder;
  implementing the calculation is a separate feature).
- Changes to the comparable engine or block-level data pipeline.

## Architecture

### 1. Extended Data Model: `shared/data-types.ts`

The `ShortlistItem` type gains optional fields grouped by purpose:

```ts
type ShortlistItem = {
  // Identity (existing)
  addressKey: string;
  addedAt: string;

  // Negotiation context (new)
  askingPrice?: number;
  fairRangeLow?: number;
  fairRangeMedian?: number;
  fairRangeHigh?: number;
  suggestedOfferCeiling?: number;
  buyerOpeningOffer?: number;
  valuationReceived?: number;
  estimatedCov?: number;

  // Decision workflow (new)
  viewingDate?: string;
  decisionStatus?:
    | "considering"
    | "viewing booked"
    | "offered"
    | "rejected"
    | "kiv"
    | "dropped";

  // Qualitative notes (new)
  pros?: string;
  cons?: string;
  renovation?: string;
  noiseNotes?: string;
  transportNotes?: string;
  buyerNotes?: string;
  agentRemarks?: string;

  // Legacy fields (preserved)
  notes: string;
  targetPrice: number | null;

  // Legacy aliases (kept for backward compat, normalized on load)
  noise?: string;
  transport?: string;
  offerCeiling?: number;
};
```

All new fields are optional with no default, so old payloads parse
without modification. The Zod schema uses `.optional().catch(undefined)`
for each, matching the existing pattern.

### 2. Migration: `normalizeShortlistItem` in `src/lib/shortlist.ts`

Migration is handled at parse time via a normalization function that runs
in both the client (`src/lib/shortlist.ts`) and server
(`functions/_lib/shortlist.ts`):

```ts
function normalizeShortlistItem(raw: ShortlistItemRaw): ShortlistItem {
  return {
    ...raw,
    // Alias legacy field names to canonical names
    noiseNotes: raw.noiseNotes ?? raw.noise ?? undefined,
    transportNotes: raw.transportNotes ?? raw.transport ?? undefined,
    buyerNotes: raw.buyerNotes ?? raw.notes || undefined,
    // Keep notes as shared fallback
    notes: raw.notes ?? "",
  };
}
```

Design decisions:

- **Idempotent**: running normalization twice produces the same result.
- **Non-destructive**: legacy fields (`noise`, `transport`, `notes`) are
  preserved alongside canonical names. Components read the canonical
  field; export includes both for interop.
- **No version flag**: the Zod `.catch()` pattern means every field is
  independently defaulted. A version flag would add complexity for no
  benefit since the normalization is already field-level.

### 3. Comparison Row Schema: `src/lib/shortlist-comparison.ts`

`ShortlistComparisonRow` is extended with fields derived from the item's
buyer inputs and the block summary:

```ts
type ShortlistComparisonRow = {
  // Identity
  addressKey: string;
  address: string;
  town: string;
  flatTypeLabel: string | null;

  // Market data (from block summary / detail)
  medianPrice: number;
  medianPricePerSqm: number | null;
  medianPricePerSqft: number | null;
  leaseCommenceRange: [number, number] | null;
  nearestMrt: { stationName: string; distanceMeters: number; walkingTimeSeconds: number | null } | null;
  monthlyPaymentEstimate: number | null;

  // Buyer inputs (from ShortlistItem)
  askingPrice: number | null;
  fairRangeLow: number | null;
  fairRangeMedian: number | null;
  fairRangeHigh: number | null;
  targetPrice: number | null;
  notes: string;
  decisionStatus: ShortlistItem["decisionStatus"] | null;

  // Computed fields
  deltaVsFairMedian: { amount: number; tone: "below" | "above" | "match" } | null;
  targetGap: { amount: number; tone: "below" | "above" | "match" } | null;
  confidenceLevelLabel: string;
  caveatKeys: string[];
};
```

`deltaVsFairMedian` is computed as `medianPrice - fairRangeMedian` when
both values exist. The `tone` classification uses the same threshold
logic as `targetGap`.

### 4. Desktop Comparison Table

The `ShortlistComparisonTable` component renders a `<Table>` with 16
columns inside a `hidden md:block overflow-x-auto` wrapper:

| # | Column | Source |
|---|--------|--------|
| 1 | Rank | Index in sorted order |
| 2 | Address | Block summary |
| 3 | Town | Block summary |
| 4 | Median Price | Block summary (with budget match badge) |
| 5 | Price/sqm | Detail summary |
| 6 | Asking Price | Buyer input |
| 7 | Fair Range | Buyer input (low — median — high) |
| 8 | Delta vs Fair Median | Computed |
| 9 | Confidence | Block transaction count |
| 10 | Remaining Lease | Block summary |
| 11 | Nearest MRT | Walking time cache |
| 12 | Monthly Payment | Placeholder (null) |
| 13 | Decision Status | Buyer input |
| 14 | Caveats | Computed from confidence + data quality |
| 15 | Target Price | Buyer input |
| 16 | Notes | Buyer input |

The table uses `min-w-[60rem]` to ensure horizontal scroll rather than
column cramming.

### 5. Mobile Comparison Cards

On mobile (below `md` breakpoint), the comparison renders as a vertical
card stack instead of a table. Each card shows:

- Rank number and address (as a clickable button to navigate to block)
- Flat type label
- Key metrics as `Badge` chips: median price, confidence level, decision
  status
- Two-column grid of secondary metrics: asking price, price/sqm, target
  price, lease, MRT, monthly payment, fair range, delta

This avoids horizontal scrolling and keeps all metrics scannable in a
single vertical scroll.

### 6. Item Editor

The item editor is integrated into the existing `ShortlistDrawer` list
view. Each expanded item card gains collapsible sections:

- **Pricing & Valuation**: asking price, fair range (low/median/high),
  suggested offer ceiling, buyer opening offer, valuation received,
  estimated COV, target price
- **Decision**: decision status dropdown, viewing date picker
- **Notes**: pros, cons, renovation, noise, transport, agent remarks,
  buyer notes (each as a `<Textarea>`)

All fields persist on change via the existing `onUpdate` callback, which
writes to localStorage and enqueues a sync push.

### 7. Removal Recovery

Removal recovery preserves the complete item rather than reconstructing a
minimal item from its address:

- `restoreShortlistItem` owns deterministic restoration: it rejects
  duplicates, respects `MAX_SHORTLIST_ITEMS`, and inserts the original item at
  its bounded previous index.
- `useShortlist.restore` applies that helper through the existing state setter,
  so local persistence and optional cloud sync observe the restored item.
- `useShortlistRemovalUndo` owns the five-second timer and pending removal
  state outside the already-large drawer component.
- `ShortlistDrawer` passes the exact removed item and index to that hook and
  exposes a live-status Undo action. It never routes Undo through the
  add/remove toggle.

This separation keeps persistence rules in the shortlist hook, transient UI
state in a focused hook, and rendering in the drawer.

### 8. CSV Export

`buildShortlistCsvContent` in `src/lib/export.ts` includes the new
fields as additional columns. Formula injection sanitization already
covers all string fields. New numeric fields (asking price, fair range,
COV) are exported as raw numbers.

### 9. I18n

All new labels, placeholders, and empty-value strings are added to
`src/lib/i18n/messages.ts` under the `shortlist.*` namespace,
following the existing pattern of `shortlist.compare.col.*` for
comparison column headers and `shortlist.decisionStatus.*` for
status labels.

## Testing

### Unit Tests

1. **`tests/unit/shortlist.test.ts`** — Migration coverage:
   - Old item without new fields parses successfully
   - Mixed old+new payload round-trips through encode/decode
   - Legacy `noise`/`transport` aliases normalize to `noiseNotes`/`transportNotes`
   - Malformed items are dropped without affecting valid items
   - New fields survive sync payload serialization

2. **`tests/unit/shortlist-comparison.test.ts`** — Comparison rows:
   - `deltaVsFairMedian` computed correctly for all tone values
   - Fair range formatting with partial/complete/missing data
   - Confidence and caveat propagation from block data
   - Decision status passthrough

3. **`tests/unit/shortlist-sync.test.ts`** — Sync compatibility:
   - Server-side Zod schema accepts both legacy and upgraded payloads
   - Payload size limits enforced for enlarged items

4. **`tests/unit/ShortlistDrawer.test.tsx`** — Component rendering:
   - Comparison table renders correct column count
   - Comparison rows match item count
   - Removing and undoing passes the exact item and original index to the
     explicit restore callback without issuing a second remove

5. **`tests/hooks/useShortlist.test.tsx`** — Restoration behavior:
   - Restoring an item preserves every offer-board field and note
   - Restoring an item returns it to its previous list position

### E2E Tests

6. **`tests/e2e/mobile-regression.spec.ts`** — Mobile usability:
   - Comparison view renders card layout (not table) on mobile viewport
   - Cards display expected count matching shortlisted items
   - View toggle between list and comparison modes works

### Boundary Tests

7. **`tests/unit/check-boundaries.test.ts`** — Architecture:
   - No runtime external API calls in `src/` or `functions/`
   - No geocoding or data ingestion in frontend code

## Risks / Trade-offs

- **Payload size growth**: each shortlist item can now carry 15+
  additional fields. The URL share encoding is bounded by
  `MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH` (2048 bytes after base64). Items
  with many populated fields may not fit in a share URL. The fallback is
  cloud sync (which stores as `items_json` blob with no practical size
  limit per item).

- **Dual Zod schemas**: the client (`src/lib/shortlist.ts`) and server
  (`functions/_lib/shortlist.ts`) maintain independent but near-identical
  Zod schemas. Adding a field to one but not the other silently drops the
  field during sync. Mitigated by the review policy requiring both files
  to be updated together.

- **No server-side migration**: the D1 `shortlists` table stores items
  as a JSON blob. Old items in cloud sync are normalized on the client
  when pulled. If a client running old code pushes after a client running
  new code, the new fields are silently dropped. This is acceptable for
  an anonymous, opt-in sync feature with no conflict resolution beyond
  "last write wins".

- **Monthly payment placeholder**: the comparison table includes a
  monthly payment column that always shows "—". This is intentional —
  the column exists for the eventual implementation. Removing it later
  would be more disruptive than leaving it empty now.
