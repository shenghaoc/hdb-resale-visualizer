# Design: Time-Adjusted Comparable Prices

> Status: Implemented. Listing checks request deterministic time adjustment
> using observed historical HDB resale medians from the existing
> `town_flat_type_trends` D1 table. Adjusted evidence is the single default
> presentation; raw registered prices remain visible as provenance. No new
> tables, no sync changes, no AI.

## Problem

Comparable transactions returned by the v2 comparable engine span multiple
years. An older comparable (e.g., 2022) is shown alongside a recent one
(e.g., 2026) at its raw nominal price. This makes it harder for a buyer to
compare apples to apples — an older transaction's nominal price doesn't
reflect how the market in that town and flat type has moved since.

The app should help a buyer understand what an older transaction roughly
corresponds to in the latest market period, without making a price forecast
or prediction.

## Goals

- Add deterministic time adjustment to each comparable transaction using
  observed town × flat type × month median price per sqm from the existing
  `town_flat_type_trends` D1 table.
- The adjustment is a **deterministic ratio**: latest available median ÷
  transaction month median. This is not a forecast — it's a mechanical
  restatement of observed historical data.
- Use adjusted prices for the verdict and primary evidence when the API can
  compute them, while preserving raw registered prices in the evidence table.
- Fall back gracefully when trend data is missing, insufficient, or
  unavailable for the transaction's specific month.
- Fall back to raw prices with a visible caveat when adjustment is unavailable.

## Non-goals

- Price prediction, forecasting, or trend extrapolation.
- Machine learning, AI APIs, or statistical modeling.
- Modifying the similarity scoring or comparable selection logic
  (prices are still excluded from the scoring path per v2 design).
- New D1 tables, new sync pipeline steps, or new data ingestion.
- Runtime geocoding or external API calls.
- Adjusting prices based on individual block trends (town × flat type
  is the chosen granularity).

## Architecture

### 1. Data Source: Existing `town_flat_type_trends` Table

The table already exists and is populated by `scripts/lib/pipeline.ts`
during every sync run. It contains:

| Column | Type | Description |
|--------|------|-------------|
| `town` | TEXT | e.g. 'ANG MO KIO' |
| `flat_type` | TEXT | e.g. '4 ROOM' |
| `month` | TEXT | 'YYYY-MM' |
| `median_price` | INTEGER | Median resale price for the group |
| `median_price_per_sqm` | REAL | Median price per sqm for the group |
| `transaction_count` | INTEGER | Number of transactions in the group |

Primary key: `(town, flat_type, month)`. No new indexes are needed —
the existing composite PK already supports lookups by `(town, flat_type)`
and `(town, flat_type, month)`.

No sync pipeline changes are required. The table is already populated
by the existing pipeline.

### 2. Shared Adjustment Module: `shared/time-adjustment.ts`

Pure TypeScript module with no side effects. Runs in the API handler
(Cloudflare Workers) and in Vitest tests. Never imported by the browser
directly — the browser receives adjusted data from the API.

```ts
/** Threshold below which a monthly sample is considered unreliable. */
export const MIN_TREND_SAMPLE_SIZE = 5;

/** Result of time-adjusting a single comparable transaction. */
export type TimeAdjustmentResult = {
  /** The raw resale price (unchanged). */
  rawPrice: number;
  /** The raw price per sqm (unchanged). */
  rawPricePerSqm: number;
  /** timeAdjustedPrice = rawPrice * adjustmentFactor, or null if unavailable. */
  adjustedPrice: number | null;
  /** timeAdjustedPricePerSqm = rawPricePerSqm * adjustmentFactor, or null. */
  adjustedPricePerSqm: number | null;
  /** The computed adjustment factor, or null if unavailable. */
  adjustmentFactor: number | null;
  /** Structured label translated by the client. */
  adjustmentLabel:
    | { type: "at_latest" }
    | { type: "adjusted_from"; month: string }
    | null;
};

export type TrendLookup = Map<string, TrendPoint[]>;
// key = `${town}__${flatType}`
// value = array of { month, medianPricePerSqm, transactionCount } sorted by month

export type TrendPoint = {
  month: string;
  medianPricePerSqm: number;
  transactionCount: number;
};

/**
 * Compute a time-adjusted price for a single comparable transaction.
 *
 * Formula:
 *   latestPpsm = latestAvailableMedianPpsm(town, flatType, trendLookup)
 *   txMonthPpsm = medianPpsm(town, flatType, txMonth, trendLookup)
 *   adjustmentFactor = latestPpsm / txMonthPpsm
 *   adjustedPrice = rawPrice * adjustmentFactor
 *
 * Returns null adjustment when:
 * - No trend data exists for (town, flatType) at all
 * - No data point exists for the transaction's specific month
 * - The transaction month's sample count < MIN_TREND_SAMPLE_SIZE
 * - The latest available month's sample count < MIN_TREND_SAMPLE_SIZE
 * - The transaction month equals the latest available month (factor ≈ 1.0
 *   is pointless; treat as degenerate case — still compute but label as
 *   "already at latest period")
 * - The denominator median is zero (division guard)
 */
export function computeTimeAdjustment(
  town: string,
  flatType: string,
  txMonth: string,
  rawPrice: number,
  rawPricePerSqm: number,
  trendLookup: TrendLookup,
): TimeAdjustmentResult;
```

#### Adjustment Formula (Deterministic)

```
adjustmentFactor = latestAvailableMedianPpsm / transactionMonthMedianPpsm
```

Where:
- `latestAvailableMedianPpsm` = the `median_price_per_sqm` for the most
  recent month in the trend data for the given `(town, flatType)`, provided
  that month's `transaction_count ≥ MIN_TREND_SAMPLE_SIZE`. If the latest
  month fails the threshold, walk backwards month by month until a
  qualifying month is found. If no qualifying month exists in the series,
  return null.
- `transactionMonthMedianPpsm` = the `median_price_per_sqm` for the
  transaction's own month, provided `transaction_count ≥ MIN_TREND_SAMPLE_SIZE`.
  If it fails the threshold, return null — the adjustment cannot be computed
  reliably.

The adjustment uses `median_price_per_sqm` (not absolute median price)
because price per sqm normalises for flat size differences within the
town × flat type group, making the ratio more stable.

#### TrendLookup Construction

The API handler collects the unique town × flat-type pairs in the selected
comparables, queries only those trend rows with a parameterized tuple `IN`
clause, and builds a `Map<string, TrendPoint[]>` keyed by
`"${town}__${flatType}"`. Each value array is sorted by month ascending and
reused for all comparables in the response.

### 3. API Changes: `POST /api/comparable-transactions`

Add an **optional query parameter** `?adjust=time` to the existing endpoint.

**Request:**
```
POST /api/comparable-transactions?adjust=time
Content-Type: application/json

{ ... CandidateListing ... }
```

**Response** (extended `ListingComparableSet`):

```ts
type TimeAdjustedComparableSet = {
  // ... all existing ListingComparableSet fields ...

  /** Whether time adjustment was requested and applied. */
  adjustmentApplied: boolean;
  /** Caveats specific to time adjustment. */
  adjustmentCaveats: string[];
  /** Comparables with time adjustment metadata. */
  comparables: TimeAdjustedComparable[];
};

type TimeAdjustedComparable = ComparableTransaction & {
  /** Raw resale price (already present as resalePrice — aliased for clarity). */
  rawResalePrice: number;
  /** Raw price per sqm (already present as pricePerSqm — aliased for clarity). */
  rawPricePerSqm: number;
  /** Time-adjusted resale price, or null if adjustment unavailable. */
  adjustedResalePrice: number | null;
  /** Time-adjusted price per sqm, or null if adjustment unavailable. */
  adjustedPricePerSqm: number | null;
  /** The computed adjustment factor, or null. */
  adjustmentFactor: number | null;
  /** Structured label translated by the client, or null. */
  adjustmentLabel: AdjustmentLabel | null;
};
```

**When `?adjust=time` is absent**, the endpoint behaves identically to
today — returns the existing `ListingComparableSet` with `ComparableTransaction[]`
(no adjusted fields). This preserves backwards compatibility.

**Handler flow with adjustment enabled:**
1. Validate body (unchanged).
2. Run parallel COUNT queries (unchanged).
3. Fetch and score comparable transactions (unchanged).
4. **New**: query `town_flat_type_trends` and build a `TrendLookup`.
5. **New**: for each comparable in the result set, call `computeTimeAdjustment`.
6. **New**: aggregate any adjustment caveats.
7. Return the extended response.

**Performance**: Step 4 adds one scoped D1 query for the unique pairs in at
most 30 comparables. Step 5 is an O(n) pass with map lookups and binary-search
month lookup.

### 4. Frontend Changes

`useListingCheckAnalysis` always requests
`/api/comparable-transactions?adjust=time` after an explicit listing-check
submission. There is no raw/adjusted preference toggle: two price modes would
make the verdict and evidence basis ambiguous.

When adjustment succeeds, the listing verdict and primary Price / $/sqm
columns use adjusted values. `ComparableEvidenceTable` also shows the original
registered price so the transformation remains auditable. When adjustment is
unavailable for a row or for the set, the UI uses the raw price and surfaces
the API caveat instead of inventing an adjusted value.

#### 4.1 Caveats Display

Adjustment-specific caveats from the API response are shown below the
verdict card (same area as existing widening caveats):

- `"Time adjustment applied using town × flat type historical medians.
  This is not a price forecast."`
- `"N of X comparable transactions could not be time-adjusted due to
  insufficient trend data."` (when some but not all are adjusted)
- `"No trend data available for this town and flat type — showing raw
  prices only."` (when none are adjusted)

### 5. Component Architecture

```
ListingCheckPanel
├── VerdictCard (unchanged)
├── ComparableEvidenceTable
│   ├── AdjustedPriceDisplay        ← primary when available
│   ├── OriginalRegisteredPrice     ← provenance when adjusted
│   └── RawPriceFallback            ← used when adjustment is unavailable
└── CaveatsSection (updated)        ← includes adjustment caveats
```

### 6. Backwards Compatibility

- The `?adjust=time` parameter is optional. Omitting it returns the
  existing `ListingComparableSet` shape unchanged.
- `shared/comparable-engine.ts` is **not modified** — the adjustment
  logic lives in a separate module (`shared/time-adjustment.ts`).
- The existing `/api/comparable-transactions` endpoint continues to
  work for all current consumers (ListingCheckPanel, tests).
- `ListingCheckPanel` remains the sole listing-check UI, with adjusted
  comparable prices rendered through `ComparableEvidenceTable`.

## Testing

### Vitest Unit Tests (`tests/unit/time-adjustment.test.ts`)

1. **Normal adjustment**: a comparable from 2022-03 with trend data for
   that month and a latest month of 2026-05 → adjustment factor is computed
   as `latestPpsm / txMonthPpsm` and applied to both price and ppsm.
2. **Same as latest month**: transaction month equals latest available
   month → factor ≈ 1.0, label indicates "already at latest period".
3. **Missing month**: no trend data for the transaction's specific month →
   adjustment is null, label is null.
4. **Missing latest month**: latest month fails sample size threshold →
   walks back to find a qualifying month; if none found, adjustment is null.
5. **Low sample size fallback**: transaction month has `transaction_count < 5`
   → adjustment is null, caveat describes insufficient data.
6. **No trend data at all**: trendLookup has no entry for (town, flatType) →
   all comparables return null adjustments.
7. **Division guard**: `txMonthPpsm = 0` → adjustment is null (should never
   happen with real data, but the guard is required).
8. **Mixed results**: some comparables have adjustments, some don't →
   aggregate caveats correctly.

### Frontend Tests

9. Adjusted values are used as the primary evidence when
   `adjustmentApplied` is true.
10. Original registered prices remain visible beside adjusted evidence.
11. Raw values remain primary when adjustment data is unavailable.
12. Adjustment caveats render correctly.

### API Integration Tests (`tests/unit/comparable-transactions-api.test.ts`)

13. Request with `?adjust=time` returns `adjustmentApplied: true` and
    comparables with `adjustedResalePrice`, `adjustedPricePerSqm`,
    `adjustmentFactor`, and `adjustmentLabel` fields.
14. Request without `?adjust=time` returns the existing shape with no
    adjusted fields.
15. Invalid `?adjust` value returns 400.

## Risks / Trade-offs

- **Trend data coverage**: Some town × flat type combinations may have
  very sparse trend data (e.g., executive flats in small towns). The
  fallback to raw prices covers this gracefully, but users in those
  categories won't see adjusted prices.
- **Trend data staleness**: The trends table is refreshed on each sync
  (typically nightly). If the sync is stale, the "latest" month may lag
  the actual market. This is a known limitation documented in the UI.
- **Single town × flat type granularity**: Trends at the block level or
  by floor area bracket might be more precise, but town × flat type is
  the right trade-off between coverage and specificity. The UI labels
  should make the granularity clear.
- **No adjustment for flat type mismatches**: If the comparable has a
  different flat type than the candidate, the adjustment uses the
  comparable's town × flat type, not the candidate's. This is correct
  — we're adjusting the comparable's own price trajectory.
- **Response size**: Adding five optional fields per comparable (up to
  30) increases response size by ~1-2 KB. Acceptable.
