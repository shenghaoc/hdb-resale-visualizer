# Design: Transaction-Level Comparable Engine v2

> Status: Draft. Replace block-scoped comparable filtering with a
> transaction-level similarity engine that searches across all HDB resale
> transactions, ranks by non-price factors, and supports widening fallback.

## Problem

The current comparable engine (`findComparableTransactions` in
`src/lib/transaction-analysis.ts`) operates on a single block's transaction
history. It filters by flat type, storey midpoint ±3 floors, and floor area
±5 sqm — all within the same address. This creates two fundamental issues:

1. **Circular price selection**: When the candidate block has very few
   transactions (e.g. a new BTO just reaching MOP, or a small block), the
   comparable set is too small to produce a meaningful verdict. The engine
   cannot widen the search to nearby blocks or the same town.

2. **No explicit similarity ranking**: The current engine returns a boolean
   filter (match / no-match). There is no ranked ordering by how similar
   each comparable is to the candidate listing. Users see a flat list with
   no indication of which comparables are the strongest evidence.

3. **Price taint risk (future)**: If similarity logic ever incorporates
   resale price (e.g. "similar price per sqm"), the comparable selection
   becomes circular — you'd be selecting comparables because their prices are
   similar, then using those same comparables to judge price fairness. The
   engine must guarantee that price plays no role in comparable selection.

## Goals

- Replace block-scoped filtering with a cross-block transaction search
  backed by a new normalized `transactions` D1 table.
- Rank comparables by a **deterministic, non-price similarity score**
  composed of: block proximity, street match, town match, flat type match,
  floor area distance, storey distance, lease commence year distance, and
  transaction recency.
- Guarantee that resale price and price per sqm are **never** inputs to the
  similarity score.
- Support progressive widening: same block → same street → same town + flat
  type, with explicit caveats when widening occurred.
- Surface match reasons per comparable so users understand why each
  transaction was selected.
- Return a structured result (`ListingComparableSet`) with counts per scope
  and caveats.

## Non-goals

- Modifying the existing `findComparableTransactions` or `assessAskingPrice`
  (v1 remains for the block-detail drawer until v2 is proven).
- AI, prediction models, embedding APIs, or hosted ranking services.
- Runtime geocoding or walking-time computation (use pre-computed
  `walking_time_cache` if already available).
- Changing the verdict or confidence modules (`listing-verdict.ts`,
  `listing-confidence.ts`, `listing-caveats.ts`) — they consume the new
  comparable set unchanged.
- Real-time MRT distance calculation (use cached values from
  `walking_time_cache` only).

## Architecture

### 1. New D1 Table: `transactions`

A normalized table with one row per resale transaction. Populated by
`scripts/sync-data.ts` alongside the existing `block_details` JSON blobs.

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,              -- unique transaction ID
  month TEXT NOT NULL,              -- 'YYYY-MM'
  town TEXT NOT NULL,               -- e.g. 'ANG MO KIO'
  block TEXT NOT NULL,              -- e.g. '123A'
  street_name TEXT NOT NULL,        -- e.g. 'ANG MO KIO AVE 1'
  address_key TEXT NOT NULL,        -- FK to blocks / block_details
  flat_type TEXT NOT NULL,          -- e.g. '4 ROOM'
  storey_range TEXT NOT NULL,       -- e.g. '07 TO 09'
  storey_midpoint REAL NOT NULL,    -- pre-computed midpoint
  floor_area_sqm REAL NOT NULL,
  lease_commence_year INTEGER,      -- nullable for edge cases
  resale_price INTEGER NOT NULL,
  price_per_sqm REAL NOT NULL,
  flat_model TEXT                   -- informational only
);

CREATE INDEX IF NOT EXISTS idx_tx_town ON transactions(town);
CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(town, block);
CREATE INDEX IF NOT EXISTS idx_tx_street ON transactions(street_name);
CREATE INDEX IF NOT EXISTS idx_tx_flat_type ON transactions(flat_type);
CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_tx_lease ON transactions(lease_commence_year);
CREATE INDEX IF NOT EXISTS idx_tx_floor_area ON transactions(floor_area_sqm);
```

The sync pipeline extracts transactions from each `block_details` JSON row
and inserts them into this table. The `storey_midpoint` is pre-computed
during sync using the existing `parseStoreyMidpoint` logic (moved to
`shared/` so it can be used at build time).

### 2. Shared Similarity Engine: `shared/comparable-engine.ts`

Pure TypeScript module with no side effects. Runs in both the API handler
(Cloudflare Workers) and in Vitest tests. Never imported by the browser
directly (the browser calls the API endpoint instead).

```ts
export type CandidateListing = {
  town: string;
  block: string;
  streetName: string;
  flatType: string;
  storeyRange: string;        // e.g. '07 TO 09'
  floorAreaSqm: number;
  leaseCommenceYear: number | null;
  // Optional MRT context if pre-computed data is available
  nearestMrtDistance?: number;  // meters, from walking_time_cache
};

export type ComparableTransaction = {
  transactionId: string;
  month: string;
  town: string;
  block: string;
  streetName: string;
  flatType: string;
  storeyRange: string;
  floorAreaSqm: number;
  leaseCommenceYear: number | null;
  resalePrice: number;
  pricePerSqm: number;
  similarity: number;         // 0–1, higher = more similar
  matchReasons: string[];     // human-readable labels
};

export type ListingComparableSet = {
  comparables: ComparableTransaction[];
  sameBlockCount: number;
  sameStreetCount: number;
  sameTownCount: number;
  newestComparableAgeMonths: number | null;
  widenedSearch: boolean;
  caveats: string[];
};
```

#### Similarity Score Design

The similarity score is a weighted sum of component scores. **Resale price
and price per sqm are never inputs.** The weights and formulas are
deterministic constants — no learned parameters, no AI.

```
similarity = w_block * blockMatch
           + w_street * streetMatch
           + w_town * townMatch
           + w_flatType * flatTypeMatch
           + w_floorArea * floorAreaSimilarity
           + w_storey * storeySimilarity
           + w_lease * leaseSimilarity
           + w_recency * recencyScore
```

| Component | Weight | Formula |
|-----------|--------|---------|
| `blockMatch` | 0.25 | 1 if same block, 0 otherwise |
| `streetMatch` | 0.10 | 1 if same street (different block), 0 otherwise |
| `townMatch` | 0.05 | 1 if same town, 0 otherwise |
| `flatTypeMatch` | 0.20 | 1 if exact flat type match, 0 otherwise |
| `floorAreaSimilarity` | 0.15 | `1 - clamp(|diff| / max(candidate.sqm, 200), 0, 1)` — cap at 200 sqm so small flats aren't penalised disproportionately |
| `storeySimilarity` | 0.10 | `1 - clamp(|diff| / 25, 0, 1)` — 25 floors as max range |
| `leaseSimilarity` | 0.10 | `1 - clamp(|diff| / 50, 0, 1)` — 50 years as max range; 0 if either lease is null |
| `recencyScore` | 0.05 | `1 - clamp(ageInMonths / 60, 0, 1)` — decays linearly over 5 years |

Weights sum to 1.0. All components are [0, 1]. The final similarity is [0, 1].

**Match reasons** are derived from components that score ≥ 0.9 on their
individual metric:
- `"Same block"` (blockMatch = 1)
- `"Same street"` (streetMatch = 1)
- `"Same town"` (townMatch = 1)
- `"Same flat type"` (flatTypeMatch = 1)
- `"Similar floor area (±X sqm)"` (floorAreaSimilarity ≥ 0.9)
- `"Similar storey"` (storeySimilarity ≥ 0.9)
- `"Similar lease"` (leaseSimilarity ≥ 0.9)
- `"Recent transaction"` (recencyScore ≥ 0.9)

#### Fallback / Widening Logic

The search is executed in up to three passes. Each pass runs the same
similarity scoring but with a different candidate pool:

1. **Pass 1 — Same block, same flat type**: Query transactions where
   `town = candidate.town AND block = candidate.block AND flat_type = candidate.flatType`.
   Score and sort all results. If count ≥ `MIN_COMPARABLES` (default 8),
   return the top `MAX_COMPARABLES` (default 30).

2. **Pass 2 — Same street, same flat type**: Query transactions where
   `street_name = candidate.streetName AND flat_type = candidate.flatType`.
   Score and sort all results. If count ≥ `MIN_COMPARABLES`, return top N.
   Set `widenedSearch = true`, add caveat.

3. **Pass 3 — Same town, same flat type**: Query transactions where
   `town = candidate.town AND flat_type = candidate.flatType`.
   Score and sort all results. Return top N regardless of count.
   Set `widenedSearch = true`, add caveat.

If any pass returns 0 results, the engine returns an empty
`ListingComparableSet` with `caveats: ["No comparable transactions found
for this listing."]`.

**Caveats added during widening:**
- Pass 2 triggered: `"Few comparable transactions in the same block — search
  widened to the same street."`
- Pass 3 triggered: `"Few comparable transactions on the same street — search
  widened to the entire town."`
- Count < `LOW_SAMPLE_THRESHOLD` (5): `"Only N comparable transactions found
  — this assessment is directional only."`

### 3. New API Endpoint: `POST /api/comparable-transactions`

Accepts a `CandidateListing` JSON body. Queries the `transactions` D1 table
with the widening passes described above. Runs the similarity engine on the
candidate set. Returns a `ListingComparableSet` JSON response.

```
POST /api/comparable-transactions
Content-Type: application/json

{
  "town": "ANG MO KIO",
  "block": "123A",
  "streetName": "ANG MO KIO AVE 1",
  "flatType": "4 ROOM",
  "storeyRange": "07 TO 09",
  "floorAreaSqm": 93,
  "leaseCommenceYear": 2015
}

→ 200
{
  "comparables": [...],
  "sameBlockCount": 12,
  "sameStreetCount": 12,
  "sameTownCount": 45,
  "newestComparableAgeMonths": 3,
  "widenedSearch": false,
  "caveats": []
}
```

The endpoint handler lives at `functions/api/comparable-transactions.ts`.
It imports the similarity engine from `shared/comparable-engine.ts`.

**Why POST not GET:** The candidate listing is a structured object with
many fields. Encoding it as query params would be unwieldy and hit URL
length limits. POST with a JSON body is cleaner.

**Validation:** The handler validates the request body with a Zod schema
before querying D1. Returns 400 on invalid input.

**Performance:** The `transactions` table with indexes on `(town, block)`,
`(street_name)`, `(town, flat_type)` keeps each pass to a single indexed
scan. The similarity scoring runs on the result set in the Worker (typically
< 500 rows after filtering), which is fast enough for a synchronous
response.

### 4. Frontend Integration

The `ListingCheckPanel` component is updated to call the new endpoint
instead of running `findComparableTransactions` + `assessAskingPrice`
client-side on a single block's data.

#### Data Flow (updated)

```
User fills listing form in Check tab
  → "Check This Listing" clicked
  → POST /api/comparable-transactions with candidate listing
  → API queries transactions D1 table, scores, ranks, returns
  → Panel receives ListingComparableSet
  → Verdict computed client-side with existing assessAskingPrice
     (fed the ranked comparables)
  → Confidence + caveats computed client-side as before
  → Verdict card renders
```

The `assessAskingPrice`, `computeConfidence`, and `generateCaveats`
functions continue to work unchanged — they consume an array of
transactions, which the v2 engine now provides from the API.

#### Component Changes

`ListingCheckPanel.tsx`:
- Remove client-side `findComparableTransactions` call
- Add `fetch('/api/comparable-transactions', { method: 'POST', body: ... })`
- Loading state while the API request is in flight
- Error state if the API returns 4xx/5xx
- Display `widenedSearch` indicator and per-caveat messages
- Display match reasons per comparable in the expandable transactions list

### 5. Sync Pipeline Changes

`scripts/sync-data.ts` (or a new module in `scripts/lib/sync/`):
- After populating `block_details`, extract all transactions from each
  block's JSON, compute `storey_midpoint`, and batch-insert into the
  `transactions` table.
- The `transactions` table is truncated and re-inserted on each sync run
  (same pattern as `blocks`, `block_details`, etc.).

`scripts/lib/sync/store.ts`:
- Add `insertTransactions(db: D1Database, transactions: TransactionRow[]): Promise<void>`

`shared/comparable-engine.ts`:
- The `parseStoreyMidpoint` logic moves here from
  `src/lib/transaction-analysis.ts` (or is duplicated in `shared/`) so the
  sync pipeline can compute midpoints without importing from `src/`.

### 6. Type Definitions

New types in `shared/data-types.ts`:

```ts
export type TransactionRow = {
  id: string;
  month: string;
  town: string;
  block: string;
  streetName: string;
  addressKey: string;
  flatType: string;
  storeyRange: string;
  storeyMidpoint: number;
  floorAreaSqm: number;
  leaseCommenceYear: number | null;
  resalePrice: number;
  pricePerSqm: number;
  flatModel: string;
};
```

The `CandidateListing`, `ComparableTransaction`, and `ListingComparableSet`
types live in `shared/comparable-engine.ts` (the source of truth for the
engine's public API).

### 7. Backwards Compatibility

- The existing `findComparableTransactions` in
  `src/lib/transaction-analysis.ts` is **preserved unchanged**. The
  `AskingPriceCheck` inside `DetailDrawer` continues to use it.
- The new engine is opt-in: `ListingCheckPanel` switches to it; the drawer
  does not.
- Once the v2 engine is proven stable (several weeks of production use),
  a follow-up spec can deprecate the v1 block-scoped path.

## Testing

### Vitest Unit Tests

1. `tests/unit/comparable-engine.test.ts`
   - Similarity scoring: each component produces correct value for known
     inputs (same block = 1.0, different town = 0 for town component, etc.)
   - Resale price does not affect similarity (assert same score when price
     field is changed)
   - Weight sum = 1.0
   - Floor area similarity edge cases: 0 sqm, very large sqm
   - Storey similarity edge cases: identical storey, extreme difference
   - Lease similarity edge cases: null lease, identical lease, 50+ year gap
   - Recency: current month vs 5+ years old
   - Match reasons: correct labels for each component
   - Same-block comparable outranks same-town comparable (integration-style)

2. `tests/unit/comparable-engine-fallback.test.ts`
   - Pass 1 yields ≥8 results → no widening
   - Pass 1 yields <8 → widens to pass 2
   - Pass 2 yields <8 → widens to pass 3
   - Pass 3 yields 0 → empty result with caveat
   - `widenedSearch` flag correctness
   - Caveats contain correct widening messages

### API Integration Tests

3. `tests/unit/comparable-transactions-api.test.ts`
   - Valid request returns 200 with correct shape
   - Invalid body returns 400
   - Missing required fields returns 400
   - Response matches `ListingComparableSet` schema

### Component Tests (updated)

4. `tests/components/ListingCheckPanel.test.tsx`
   - Mock the API call; verify loading → result transition
   - Verify widened search indicator renders
   - Verify match reasons appear in comparable list
   - Error state when API fails

### E2E Tests (updated)

5. `tests/e2e/listing-check.spec.ts`
   - Add assertion: comparable results include match reasons
   - Add assertion: low-sample listing triggers widening caveats

## Risks / Trade-offs

- **New D1 table**: Adds ~1M rows for the full resale dataset (~30 years ×
  ~20k transactions/year). D1's free tier includes 5GB storage and 5B row
  reads/month. Indexed queries on `town + block` and `town + flat_type` keep
  reads low. This is within D1 limits.
- **Sync pipeline complexity**: Extracting transactions from `block_details`
  JSON adds a step to the sync pipeline. The extraction logic must handle
  missing fields gracefully (some historical transactions may lack lease
  commence year or floor area).
- **API latency**: Three sequential D1 queries (one per widening pass) in
  the worst case. Each is an indexed scan returning < 500 rows. Total
  latency < 500ms in practice. If this becomes a concern, the three passes
  can be combined into a single query with a UNION + computed scope column.
- **Weight tuning**: The similarity weights are initial estimates. They
  should be reviewed after real-world usage and adjusted based on user
  feedback. The weight constants should be named exports so they can be
  overridden in tests.
- **Duplication with v1**: The v1 `findComparableTransactions` and v2 engine
  coexist. This is intentional to avoid regression risk. The v2 engine is
  the path forward; v1 is legacy once v2 is proven.
