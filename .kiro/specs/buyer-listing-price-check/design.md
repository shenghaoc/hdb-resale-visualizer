# Design: Buyer Listing Price Check

> Status: Draft. A new primary tab ("Check") that lets a buyer evaluate a
> specific listing's asking price against historical comparable transactions
> without touching the map.

## Problem

Today, asking-price checks are only accessible through the block detail
drawer: the user must find a block on the map or in results, open the
`DetailDrawer`, and navigate to the "Asking Price" tab. This requires map
interaction and discovery of a secondary feature buried three layers deep.

The product vision is a buyer-side due-diligence tool, not a map browser.
The "check a listing" workflow should be a primary, first-class entry point —
not a hidden tab inside a drawer.

## Goals

- A buyer can evaluate a listing's asking price without opening the map.
- The flow follows the existing tab/panel architecture: a new "Check" tab
  alongside Filters, Results, and Saved.
- All analysis is deterministic: no AI, no predictions, no runtime API calls
  to data.gov.sg or OneMap.
- Reuse existing APIs (`/api/suggest`, `/api/details/{addressKey}`) and
  analysis modules (`assessAskingPrice`, `findComparableTransactions`).
- Show confidence (high/medium/low) and plain-English caveats alongside
  the price verdict.
- Results are shareable via URL and saveable to the shortlist.
- Work on mobile and desktop.

## Non-goals

- Modifying the existing `AskingPriceCheck` inside `DetailDrawer`.
- Adding any new API endpoints.
- Adding seller-side listing or marketplace features.
- Prediction models, AI chat, or chatbot features.
- Runtime geocoding or walking-time computation.

## Architecture

### 1. Navigation — New "Check" Tab

`usePanelState` gains a `"check"` member in both `LeftTab` and `PanelTab`:

```ts
export type LeftTab = "filters" | "results" | "check";
export type PanelTab = "filters" | "results" | "check" | "saved";
```

**Desktop:** `DesktopTabBar` adds a 4th button between "Results" and the
divider before "Saved". The left panel renders `ListingCheckPanel` when
`leftTab === "check"`.

**Mobile:** `MobileTabBar` adds a 4th button between "Results" and "Saved".
The mobile panel stack renders `ListingCheckPanel` when
`mobileTab === "check"`.

`AppTabBars` / `useAppShellController` are extended to handle the new click
handlers.

### 2. Data Flow

```
User selects "Check" tab
  → SearchCombobox to select a block (reuses /api/suggest)
  → Block selected → fetchAddressDetail(addressKey) via /api/details/{key}
  → User fills listing form (asking price, floor area, flat type, storey,
    optional lease commence year)
  → Client-side analysis:
      findComparableTransactions(detail.recentTransactions, filters)
      assessAskingPrice({ askingPrice, floorAreaSqm, comparables })
      computeConfidence(comparables, referenceMonth)    [new]
      generateCaveats(result, confidence, lease)        [new]
  → Verdict card renders
  → URL updated with check state (shareable)
  → Optional: save to shortlist
```

No new API endpoints. No external fetch. All computation happens in the
browser using data already loaded from D1.

### 3. Domain Modules (new, `src/lib/`)

All modules are pure TypeScript functions. No React, no side effects, no
API calls.

#### `src/lib/listing-confidence.ts`

```ts
type ConfidenceLevel = "high" | "medium" | "low";

type ConfidenceResult = {
  level: ConfidenceLevel;
  comparableCount: number;
  newestComparableMonth: string | null;
  reason: string;
};

function computeConfidence(
  comparables: AddressDetailTransaction[],
  referenceMonth?: string,
): ConfidenceResult
```

Thresholds:
- ≥12 comparables → **high** (newest comparable >12 months → **medium**)
- 5–11 comparables → **medium** (newest comparable >12 months → **low**)
- 1–4 comparables → **low**

When `referenceMonth` is omitted, no recency downgrade is applied (for
callers that don't have a reference point). The component passes
`manifest.dataWindow.maxMonth` when available.

`performListingCheck` guards against empty comparables: if
`findComparableTransactions` returns zero matches, it returns a sentinel
result with a descriptive reason. The component renders a "no comparable
transactions" message rather than a verdict.

#### `src/lib/listing-caveats.ts`

```ts
type Caveat = {
  severity: "info" | "warning";
  message: string;
};

function generateCaveats(params: {
  assessment: AskingPriceAssessment;
  confidence: ConfidenceResult;
  leaseCommenceYear?: number;
  comparableLeaseYears: number[];
}): Caveat[]
```

Caveat triggers:
- **Low sample**: `comparableCount < 5` → warning
- **Lease mismatch**: user lease year deviates from comparable median by
  >10 years → warning (does not affect comparable math)
- **Stale data**: newest comparable >12 months old → warning
- **Extreme outlier**: asking price at 0th or 100th percentile of
  comparables → info

#### `src/lib/listing-verdict.ts`

Thin glue module combining all three analysis steps:

```ts
type ListingCheckResult = {
  assessment: AskingPriceAssessment;
  confidence: ConfidenceResult;
  caveats: Caveat[];
};

function performListingCheck(params: {
  askingPrice: number;
  floorAreaSqm: number | null;
  comparables: AddressDetailTransaction[];
  leaseCommenceYear?: number;
  referenceMonth?: string;
}): ListingCheckResult
```

### 4. Component Design

#### `src/components/ListingCheckPanel.tsx` (new)

The main Check tab panel. Internal state:

- `selectedAddressKey: string | null` — set by SearchCombobox
- `askingPrice: number | null` — from input
- `floorAreaSqm: number | null` — from input
- `flatType: string | null` — from select, defaults to first option
- `storeyRange: string | null` — from select
- `leaseCommenceYear: number | null` — optional manual input

**Layout** (top to bottom):

1. **Block search** — `SearchCombobox` wired to set `selectedAddressKey`
2. **Selected block info** — town, block, street (read-only from block data)
3. **Listing form** — two-column grid: asking price, floor area, flat type
   select, storey select, optional lease commence year input
4. **"Check This Listing" button** — disabled until asking price and
   selectedAddressKey are present
5. **Verdict card** (when result computed) — reuses verdict themes from
   `AskingPriceCheck.tsx` (well_below/below/fair/above/well_above) plus:
   - Confidence badge (high/medium/low with reason text)
   - Statistics grid (median, P25/P75, $/sqm, percentile, delta)
   - Distribution bar (reused from existing)
   - Caveats section with severity icons
   - Comparable transactions list (expandable)
   - "Save to Shortlist" and "Share" buttons

#### Shared Components Extracted

- `DistributionBar` — extracted from `AskingPriceCheck.tsx` to
  `src/components/DistributionBar.tsx`
- `ComparableTransactionsList` — extracted from `AskingPriceCheck.tsx` to
  `src/components/ComparableTransactionsList.tsx`
- Existing `AskingPriceCheck.tsx` imports the shared components instead of
  owning them inline

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

- A new hook `useListingCheckUrlState()` reads and writes these params.
- When `checkAddress` is present on load, the Check tab opens, loads the
  detail, fills the form, and re-runs the analysis.
- The "Share" button copies the full URL with `?checkAddress=...` etc.
- Follows the same pattern as `useUrlFilters` (read on mount, sync on change).

### 6. Shortlist Integration

"Saving to Shortlist" converts the check into a `ShortlistItem`:

```ts
const item: ShortlistItem = {
  addressKey,
  notes: JSON.stringify({
    verdict, askingPrice, floorAreaSqm, flatType, storeyRange,
    confidence, caveats, timestamp
  }),
  targetPrice: askingPrice,
  addedAt: new Date().toISOString(),
};
```

The existing shortlist drawer renders `targetPrice` and `notes` without
changes. A saved listing check is visible alongside other shortlist items.

## Testing

### Vitest Unit Tests

1. `tests/unit/listing-confidence.test.ts`
   - Threshold tiers (1, 4, 5, 11, 12 comparables)
   - Recency downgrade when newest >12 months old
   - Edge: empty comparables, single comparable, exact border values

2. `tests/unit/listing-caveats.test.ts`
   - Low-sample caveat at each confidence tier
   - Lease mismatch caveat (year vs comparable median)
   - Stale-data caveat
   - Extreme-outlier caveat
   - No duplicate caveats
   - Empty caveats for clean high-confidence results

3. `tests/unit/listing-verdict.test.ts`
   - Full pipeline with fixture data
   - All output fields present and consistent
   - Verdict + confidence + caveats coherence

### Component Tests

4. `tests/components/ListingCheckPanel.test.tsx`
   - Renders form, types asking price, sees verdict
   - Sees confidence badge and caveats
   - Edge: no block selected, no comparables

### E2E Tests (Playwright)

5. `tests/e2e/listing-check.spec.ts`
   - Mobile: open Check tab, typeahead-select block, fill form, see verdict
   - Desktop: same flow with tile layout
   - URL sharing round-trip
   - Save to shortlist and verify in Saved tab
   - Edge: no comparables message
   - Edge: low confidence shows caveats

### Existing Tests

- `tests/unit/transaction-analysis.test.ts` — no changes needed (already
  covers `assessAskingPrice`, `findComparableTransactions`, `summarizeComparables`)
- `tests/components/AskingPriceCheck.test.tsx` — no changes needed
- All other existing tests continue to pass

## Risks / Trade-offs

- **4th mobile tab**: Slightly crowds the mobile tab bar, but the value of a
  dedicated entry point for the primary workflow justifies the space.
- **URL param namespace**: `checkAddress`, `checkPrice`, etc. are new params
  that must not collide with existing filter params. Namespaced prefix
  avoids collisions.
- **Block-detail doubling**: `AskingPriceCheck` inside `DetailDrawer` and
  `ListingCheckPanel` in the Check tab both serve the same analysis. They
  share domain modules but have different UX contexts (drawer vs full panel).
  This is intentional — the drawer variant stays for block-detail exploration,
  the panel is the primary buyer workflow.
