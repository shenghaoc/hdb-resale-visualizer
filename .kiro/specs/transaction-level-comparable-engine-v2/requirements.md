# Requirements: Transaction-Level Comparable Engine v2

## R1 — Normalized transactions D1 table
- **R1.1** A new `transactions` D1 table exists with columns: `id`, `month`,
  `town`, `block`, `street_name`, `address_key`, `flat_type`, `storey_range`,
  `storey_midpoint`, `floor_area_sqm`, `lease_commence_year`, `resale_price`,
  `price_per_sqm`, `flat_model`.
- **R1.2** The table has indexes on `(town, block)`, `(street_name)`,
  `(town, flat_type)`, `(month)`, `(lease_commence_year)`, and
  `(floor_area_sqm)`.
- **R1.3** `storey_midpoint` is pre-computed during sync using
  `parseStoreyMidpoint` (shared between sync pipeline and runtime).
- **R1.4** `lease_commence_year` is nullable for historical transactions
  where the field is unavailable.

## R2 — Sync pipeline populates the transactions table
- **R2.1** `scripts/sync-data.ts` extracts all transactions from each
  `block_details` JSON row and inserts them into the `transactions` table.
- **R2.2** The `transactions` table is truncated and fully re-inserted on
  each sync run (same pattern as `blocks` and `block_details`).
- **R2.3** The extraction logic handles missing `leaseCommenceDate` and
  `floorAreaSqm` gracefully (nulls for lease, skips rows with missing
  critical fields).
- **R2.4** Existing sync behavior for other tables is unchanged.

## R3 — Similarity scoring engine (shared module)
- **R3.1** A pure TypeScript module `shared/comparable-engine.ts` exports a
  `scoreSimilarity(candidate: CandidateListing, transaction: TransactionRow): SimilarityResult`
  function.
- **R3.2** The similarity score is a weighted sum of: block match (0.25),
  street match (0.10), town match (0.05), flat type match (0.20), floor area
  similarity (0.15), storey similarity (0.10), lease similarity (0.10),
  recency (0.05). All weights are named constants.
- **R3.3** Resale price and price per sqm are **never** read or used in any
  similarity computation. This invariant is enforced at the type level:
  `scoreSimilarity` accepts a `ScoringInput` type that excludes `resalePrice`
  and `pricePerSqm`. The TypeScript compiler rejects any attempt to read
  price fields during scoring.
- **R3.4** Match reasons are derived from individual component scores ≥ 0.9
  and returned as human-readable labels (e.g. "Same block", "Similar floor
  area (±3 sqm)").
- **R3.5** The module also exports `buildComparableSet(params):
  ListingComparableSet` which orchestrates the widening passes and returns
  the final ranked set.
- **R3.6** When either the candidate or the comparable transaction has a null
  `leaseCommenceYear`, the lease component is excluded from the similarity
  score and the remaining weights are dynamically re-scaled to sum to 1.0
  (each weight divided by 0.90). This prevents historical transactions with
  missing lease data from being unfairly penalised.

## R4 — Widening / fallback logic
- **R4.1** Pass 1 queries same block + same flat type. If ≥ 8 results, returns
  top 30 ranked by similarity.
- **R4.2** Pass 2 (triggered when pass 1 yields < 8) queries same street +
  same flat type. If ≥ 8 results, returns top 30. Sets `widenedSearch = true`
  and adds a caveat.
- **R4.3** Pass 3 (triggered when pass 2 yields < 8) queries same town + same
  flat type. Returns top 30 regardless of count. Sets `widenedSearch = true`
  and adds a caveat.
- **R4.4** If pass 3 yields 0 results, returns an empty `ListingComparableSet`
  with `caveats: ["No comparable transactions found for this listing."]`.
- **R4.5** `sameBlockCount`, `sameStreetCount`, and `sameTownCount` in the
  result reflect the actual counts from each scope (not limited by top-N).
- **R4.6** The minimum comparable threshold (`MIN_COMPARABLES = 8`) and
  maximum return count (`MAX_COMPARABLES = 30`) are named constants.

## R5 — New API endpoint
- **R5.1** `POST /api/comparable-transactions` accepts a JSON body matching
  the `CandidateListing` schema.
- **R5.2** The handler enforces a body size limit (8 KB) before parsing JSON,
  then validates the request body with Zod. Returns 400 with error details on
  oversize or invalid input.
- **R5.3** The handler queries the `transactions` D1 table with the widening
  passes, scores results using the shared engine, and returns a
  `ListingComparableSet` JSON response.
- **R5.4** The endpoint sets appropriate CORS headers (reuses existing
  CORS middleware / patterns from other API routes).
- **R5.5** The handler runs lightweight `SELECT COUNT(*)` queries for all
  three scopes in parallel before the scoring pass, so `sameBlockCount`,
  `sameStreetCount`, and `sameTownCount` are always populated regardless of
  which pass wins.
- **R5.6** No external API calls, no AI, no runtime geocoding.

## R6 — Frontend integration
- **R6.1** `ListingCheckPanel.tsx` calls `POST /api/comparable-transactions`
  instead of running `findComparableTransactions` client-side.
- **R6.2** The panel shows a loading state while the API request is in
  flight.
- **R6.3** The panel shows an error state if the API returns 4xx/5xx.
- **R6.4** The verdict card displays the `widenedSearch` indicator and
  per-caveat messages from the API response.
- **R6.5** The expandable comparable transactions list shows match reasons
  per comparable.
- **R6.6** The existing `AskingPriceCheck` inside `DetailDrawer` is **not
  modified** — it continues to use the v1 block-scoped logic.

## R7 — Type definitions
- **R7.1** `shared/data-types.ts` gains a `TransactionRow` type matching
  the new D1 table schema.
- **R7.2** `shared/comparable-engine.ts` exports `CandidateListing`,
  `ComparableTransaction`, `ListingComparableSet`, and `SimilarityResult`
  types.
- **R7.3** All types use `type` (not `interface`), follow existing naming
  conventions, and avoid `any`.

## R8 — Backwards compatibility
- **R8.1** `src/lib/transaction-analysis.ts` is not modified.
- **R8.2** `src/lib/listing-verdict.ts`, `listing-confidence.ts`, and
  `listing-caveats.ts` are not modified — they consume the new comparable
  array unchanged.
- **R8.3** Existing tests continue to pass.
- **R8.4** Existing API endpoints are not modified.

## R9 — Tests
- **R9.1** Unit tests for `scoreSimilarity`: each component produces correct
  values; weights sum to 1.0; price does not affect similarity.
- **R9.2** Unit tests for `buildComparableSet`: widening passes trigger
  correctly; `widenedSearch` flag; caveat messages; empty result handling.
- **R9.3** Unit tests for the API endpoint: valid request → 200 with correct
  shape; invalid body → 400; missing required fields → 400.
- **R9.4** Component tests for `ListingCheckPanel`: loading state, error
  state, widened search indicator, match reasons display.
- **R9.5** E2E tests: comparable results include match reasons; low-sample
  listing triggers widening caveats.
