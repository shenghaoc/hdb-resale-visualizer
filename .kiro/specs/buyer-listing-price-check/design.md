# Design: Buyer Listing Price Check

> Status: Active product contract. The primary Check tab is the sole
> user-facing workflow for evaluating a listing's asking price against
> historical comparable transactions.

## Problem

The Check tab made asking-price analysis a first-class buyer workflow, but a
second evaluator inside block detail would create two conflicting contracts:
one can infer unit facts from a block's transaction sample while the canonical
flow requires the buyer's actual listing facts. The two paths can then select
different comparables, save different fields, and show different conclusions
for the same listing.

The product must have one authoritative Check workflow. Block detail can supply
block context, but only the buyer can supply the unit's asking price, floor
area, flat type, and storey range.

## Goals

- A buyer can evaluate a listing's asking price without opening the map.
- The flow follows the existing tab/panel architecture: the "Check" tab sits
  alongside Filters, Results, and Saved.
- All analysis is deterministic: no AI, no predictions, no runtime API calls
  to data.gov.sg or OneMap.
- Use `POST /api/comparable-transactions?adjust=time` as the sole comparable
  selection path.
- Require the buyer to enter every listing-specific fact used by the analysis;
  do not infer flat type, floor area, or storey from another transaction.
- Show confidence (high/medium/low) and plain-English caveats alongside
  the price verdict.
- Results are shareable via URL and saveable to the shortlist.
- Block detail routes into the same Check panel instead of embedding a second
  asking-price engine.
- Work on mobile and desktop.

## Non-goals

- A sample/demo listing or synthetic listing defaults.
- A second asking-price evaluator inside `DetailDrawer` or any other feature.
- A new comparable-selection implementation in the browser.
- Adding seller-side listing or marketplace features.
- Prediction models, AI chat, or chatbot features.
- Runtime geocoding or walking-time computation.

## Architecture

### 1. Navigation — Canonical "Check" Tab

`usePanelState` includes a `"check"` member in both `LeftTab` and `PanelTab`:

```ts
export type LeftTab = "filters" | "results" | "check";
export type PanelTab = "filters" | "results" | "check" | "saved";
```

**Desktop:** `DesktopTabBar` exposes Check between Results and Saved. The left
panel renders `ListingCheckPanel` when
`leftTab === "check"`.

**Mobile:** `MobileTabBar` exposes Check between Results and Saved. The mobile
panel stack renders `ListingCheckPanel` when
`mobileTab === "check"`.

`AppTabBars` and `useAppShellController` route every Check entry to this panel.
When Results or block detail supplies an address, the controller carries over
only that address and clears listing-specific facts that belong to another
unit.

### 2. Data Flow

```
User selects "Check" tab
  → SearchCombobox to select a block (reuses /api/suggest)
  → Block selected → fetchAddressDetail(addressKey) via /api/details/{key}
  → User explicitly fills asking price, floor area, flat type, and storey
    (lease commencement year is optional)
  → "Check This Listing" remains disabled until every required fact is valid
  → Explicit submit:
      POST /api/comparable-transactions?adjust=time
      with block identity + unit facts + reference month
  → Canonical API returns selected comparables, match reasons, widening
    metadata, and time-adjustment metadata
  → listingCheckAnalysis derives the price assessment, evidence confidence,
    data-quality tag, and caveats from that response
  → Verdict card renders
  → URL updated with check state (shareable)
  → Optional: save to shortlist
```

The only runtime request is same-origin and D1-backed. The frontend does not
call data.gov.sg or OneMap, geocode an address, or select comparables from the
capped block-detail transaction sample.

### 3. Canonical Modules

- `src/features/listing-check/useListingCheckController.ts` owns form state,
  block-change clearing, URL sharing, and shortlist save behavior.
- `src/features/listing-check/useListingCheckAnalysis.ts` loads block detail,
  validates required facts, submits the canonical comparable request only after
  an explicit button action, and ignores stale responses.
- `src/features/listing-check/listingCheckAnalysis.ts` derives flat-type options
  from the complete block summary, exposes canonical HDB storey bands, builds
  the API request, and converts the response into presentation-ready evidence.
- `functions/api/comparable-transactions.ts` and the shared comparable engine
  own comparable selection and widening. There is no client-side alternative.
- `shared/confidence-system.ts` and `shared/caveat-codes.ts` derive confidence
  and caveats from factual evidence signals: record volume, recency, scope,
  listing-fact match, and time-adjustment status.

The pipeline separates **known flat types** from **recent flat-type cohorts**.
`BlockSummary.flatTypes` is canonicalized from all transactions at the block so
Listing Check never hides a real unit type. Median prices and cohort attributes
remain limited to the recent summary window. Ingestion canonicalizes aliases
before writing D1 transactions and town trends, and the comparable endpoint
canonicalizes request and row values defensively.

Per-type model, size, and date filters require complete cohort metadata. The
search API probes for both the column and a completed backfill; the full-corpus
client path makes the same inference from parsed block summaries. Until every
row is ready, the UI shows the explicit unsupported-refinement state instead of
presenting a confident empty result.

An empty comparable response produces a clear no-evidence state rather than a
verdict. A response with widened, stale, thin, or unadjusted evidence remains
usable only with the corresponding caveats visible.

### 4. Component Design

#### `src/features/listing-check/ListingCheckPanel.tsx`

The main Check tab panel receives controller-owned state:

- `selectedAddressKey: string | null` — set by SearchCombobox
- `askingPrice: number | null` — from input
- `floorAreaSqm: number | null` — from input
- `flatType: string | null` — explicitly chosen from block-summary options
- `storeyRange: string | null` — from select
- `leaseCommenceYear: number | null` — optional manual input

There is no sample CTA and no default flat type, storey, floor area, or asking
price. Selecting a block exposes valid options but does not choose on the
buyer's behalf.

**Layout** (top to bottom):

1. **Block search** — `SearchCombobox` wired to set `selectedAddressKey`
2. **Selected block info** — town, block, street (read-only from block data)
3. **Listing form** — two-column grid: asking price, floor area, flat type
   select, storey select, optional lease commence year input
4. **"Check This Listing" button** — disabled until block, asking price, floor
   area, flat type, and storey range are valid
5. **Verdict card** (after explicit submit) — renders:
   - Confidence badge (high/medium/low with reason text)
   - Data-quality badge and factual caveats
   - Statistics grid (median, P25/P75, $/sqm, percentile, delta)
   - Distribution bar
   - Caveats section with severity icons
   - Comparable evidence table/cards with match reasons and original prices
     when time adjustment applies
   - "Save to Shortlist" and "Share" buttons

#### Block-detail integration

`DetailDrawer` may show block-level medians, history, and comparable-range
context, but it does not ask for an asking price or render a verdict. Its
"Check this listing" action:

1. selects the block in the listing-check controller,
2. opens the Check tab,
3. clears facts and results belonging to a previously selected block, and
4. leaves every listing-specific field for the buyer to complete.

This keeps one comparable request contract, one verdict implementation, and one
shortlist-save behavior.

### 5. URL Sharing

URL query params encode the check state:

```
?checkAddress={addressKey}
&checkPrice={askingPrice}
&checkSqm={floorArea}
&checkFlatType={flatType}
&checkStorey={storeyRange}
&checkLease={leaseYear}
```

- `useListingCheckUrlState()` reads and writes these params.
- When `checkAddress` is present on load, the Check tab opens, loads the
  detail, and fills only valid facts present in the URL.
- URL hydration never submits automatically. The buyer must activate "Check
  This Listing" after reviewing the facts.
- The "Share" button copies the full URL with `?checkAddress=...` etc.
- Follows the same pattern as `useUrlFilters` (read on mount, sync on change).

### 6. Shortlist Integration

"Saving to Shortlist" preserves the seller's asking price without repurposing
buyer-owned fields:

```ts
const item: ShortlistItem = {
  addressKey,
  askingPrice,
  addedAt: new Date().toISOString(),
  notes: existingNotes,
  targetPrice: existingTargetPrice,
};
```

The controller adds the address when necessary and then updates
`ShortlistItem.askingPrice`. It does not store confidence as a listing fact or
overwrite target price and notes.

## Testing

### Vitest Unit Tests

1. `tests/unit/listingCheckAnalysis.test.ts`
   - Request body requires floor area, flat type, storey, and reference month
   - Flat-type options use the complete block summary
   - Storey options use canonical HDB bands
   - Time-adjusted prices drive assessment while raw prices remain evidence
   - Verdict, confidence, quality tag, and caveats remain coherent

2. `tests/unit/useListingCheckAnalysis.test.tsx`
   - No request before explicit submit
   - Submit targets `/api/comparable-transactions?adjust=time`
   - Stale requests are cancelled or ignored
   - Required-fact changes invalidate an earlier result

3. Shared confidence/caveat tests
   - Sample, recency, scope, and fact-match signals
   - Low/no-sample, stale, widened, mismatch, outlier, and adjustment caveats

### Component Tests

4. `tests/components/ListingCheckPanel.inputs.test.tsx`
   - Required facts begin empty and keep submit disabled
   - Selecting a block exposes options without auto-selecting them
   - Renders form, enters all required facts, submits, and sees verdict
   - Sees confidence badge and caveats
   - Edge: no block selected, no comparables

### E2E Tests (Playwright)

5. `tests/e2e/buyer-listing-check.spec.ts`
   - Mobile: open Check tab, typeahead-select block, fill form, see verdict
   - Desktop: same flow with explicit submit
   - URL hydration followed by explicit submit
   - Save to shortlist and verify asking price in Saved
   - Entry state has no sample CTA or synthetic unit defaults
   - Edge: no comparables message
   - Edge: low confidence shows caveats

6. Block-detail regression coverage
   - Block detail has no independent asking-price evaluator
   - "Check this listing" opens the canonical Check tab with block identity only

### Existing Tests

- `tests/unit/transaction-analysis.test.ts` continues to cover price-summary
  arithmetic such as `assessAskingPrice`.
- Tests for the retired detail-drawer evaluator are removed with that second
  implementation.
- All other existing tests continue to pass

## Risks / Trade-offs

- **Explicit facts add friction**: asking for floor area, flat type, and storey
  takes longer than guessing. That friction is necessary because substituting a
  different unit's facts can produce a materially misleading verdict.
- **URL param namespace**: `checkAddress`, `checkPrice`, etc. are new params
  that must not collide with existing filter params. Namespaced prefix
  avoids collisions.
- **No automatic deep-link result**: shared URLs require one explicit submit
  after hydration. This gives the buyer a chance to verify unit facts and avoids
  treating URL input as trusted listing truth.
