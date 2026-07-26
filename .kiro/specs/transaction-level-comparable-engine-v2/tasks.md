# Tasks: Transaction-Level Comparable Engine v2

> Execution checklist. Order respects dependencies: shared engine → D1
> schema → sync pipeline → API endpoint → frontend wiring → tests → cleanup.
> Each task names its acceptance check.

## Phase 1 — Shared similarity engine (pure TypeScript, no D1 dependency)

- [x] **T1.1** Add `shared/comparable-engine.ts` with `CandidateListing`,
  `ComparableTransaction`, `SimilarityResult`, and `ListingComparableSet`
  types. Define weight constants (`BLOCK_WEIGHT`, `STREET_WEIGHT`, etc.).
  → `vp run typecheck` passes. (R3.1, R3.2, R7.2)

- [x] **T1.2** Implement `scoreSimilarity(candidate: CandidateListing, tx: ScoringInput)`:
  computes weighted similarity score from block, street, town, flat type,
  floor area, storey, lease, and recency components. `ScoringInput` excludes
  `resalePrice` and `pricePerSqm` — the type system enforces the price-free
  invariant. When either lease is null, the lease component is excluded and
  remaining weights are re-scaled to sum to 1.0. Returns
  `{ similarity, matchReasons }`.
  → `vp run typecheck` passes. (R3.2, R3.3, R3.4, R3.6)

- [x] **T1.3** Implement `buildComparableSet(params)`: orchestrates the
  three widening passes given pre-filtered transaction arrays for each
  scope. Applies `MIN_COMPARABLES` / `MAX_COMPARABLES` thresholds. Sets
  `widenedSearch` and generates caveats. Returns `ListingComparableSet`.
  → `vp run typecheck` passes. (R4.1–R4.6)

- [x] **T1.4** Move `parseStoreyMidpoint` to `shared/comparable-engine.ts`
  so the sync pipeline can use it without importing from `src/`. Re-export
  from `src/entities/transaction/transaction-analysis.ts` for the web adapter.
  → `vp run typecheck` passes; existing tests pass. (R1.3, R8.1)

## Phase 2 — D1 schema migration

- [x] **T2.1** Add `migrations/0007_transactions.sql`: CREATE TABLE
  `transactions` with all columns and indexes as specified in the design.
  → `vp run db:migrate:local` succeeds. (R1.1, R1.2)

- [x] **T2.2** Update `scripts/lib/schemas.ts`: add Zod schema for
  `TransactionRow` matching the new table + new migration tracking.
  → `vp run typecheck` passes. (R1.1)

- [x] **T2.3** Update `shared/data-types.ts`: add `TransactionRow` type
  matching the new table schema.
  → `vp run typecheck` passes. (R7.1)

## Phase 3 — Sync pipeline

- [x] **T3.1** Add `scripts/lib/sync/store.ts` function
  `insertTransactions(db, transactions)`: truncates and batch-inserts into
  the `transactions` table using the D1 HTTP API (same pattern as
  `insertBlocks`).
  → `vp run typecheck` passes.

- [x] **T3.2** In `scripts/sync-data.ts` (or a new
  `scripts/lib/sync/extract-transactions.ts`), during `buildArtifacts()`:
  after sorting all transactions for each block, write the **full** sorted
  array (not the 20-row capped slice) to a `TransactionRow[]`. Compute
  `storeyMidpoint` via the shared `parseStoreyMidpoint`. Handle missing
  `leaseCommenceDate` and `floorAreaSqm` gracefully. The 20-row cap for
  `block_details` JSON is applied separately.
  → `vp run typecheck` passes. (R2.1, R2.3)

- [x] **T3.3** Wire the extraction + insert into the main sync flow in
  `scripts/sync-data.ts`. The `transactions` table is truncated and
  re-inserted on each run (same as `blocks`).
  → `vp run typecheck` passes. (R2.2, R2.4)

## Phase 4 — API endpoint

- [x] **T4.1** Add `functions/api/comparable-transactions.ts`: POST handler
  that validates the request body with Zod (`CandidateListing` schema),
  runs parallel `SELECT COUNT(*)` queries for all three scopes, then
  executes the narrowest winning pass for data + scoring, and returns
  `ListingComparableSet` with all three scope counts populated.
  → `vp run typecheck` passes. (R5.1, R5.2, R5.3, R5.5)

- [x] **T4.2** Add `shared/comparable-engine.ts` Zod schemas for
  `CandidateListing` (request validation) and `ListingComparableSet`
  (response shape). Used by both the API handler and tests.
  → `vp run typecheck` passes. (R5.2)

- [x] **T4.3** Wire the endpoint into the Worker router:
  add a new `ApiRouteId` entry and `URLPattern` definition in
  `worker/api-route-match.ts` (method: `"POST"`, pathname:
  `"/api/comparable-transactions"`), then register the handler import and
  dispatch case in `worker/index.ts`.
  → `vp run typecheck` passes. (R5.4)

## Phase 5 — Frontend wiring

- [x] **T5.1** Update `ListingCheckPanel.tsx`: replace client-side
  `findComparableTransactions` + `performListingCheck` calls with
  `fetch('/api/comparable-transactions', { method: 'POST', body: ... })`.
  Add loading state (spinner / skeleton) while the API request is in flight.
  → `vp run typecheck` passes. (R6.1, R6.2)

- [x] **T5.2** Add error state to `ListingCheckPanel.tsx`: when the API
  returns 4xx/5xx, show an error message with a retry button.
  → `vp run typecheck` passes. (R6.3)

- [x] **T5.3** Update the verdict card in `ListingCheckPanel.tsx` to display
  `widenedSearch` indicator (e.g. "Search widened to same town" badge) and
  per-caveat messages from the API response.
  → `vp run typecheck` passes. (R6.4)

- [x] **T5.4** Update `ComparableEvidenceTable` to show match reasons per
  comparable (e.g. small tags: "Same block", "Similar floor area").
  → `vp run typecheck` passes. (R6.5)

- [x] **T5.5** Verify `ListingCheckPanel.tsx` is the sole listing-check UI and
  renders transaction evidence through `ComparableEvidenceTable`.
  → Manual smoke: open Check, submit exact listing facts, and inspect evidence.
  (R6.6, R8.1)

## Phase 6 — Unit tests (shared engine)

- [x] **T6.1** Add `tests/unit/comparable-engine.test.ts`:
  - `scoreSimilarity` returns 1.0 for identical candidate and transaction
  - Block match: same block → 0.25 contribution; different block → 0
  - Street match: same street → 0.10; different → 0 (same-block
    transactions also receive street match = 1, allowing max score of 1.0)
  - Town match: same town → 0.05; different → 0
  - Flat type match: exact → 0.20; different → 0
  - Floor area: identical → 0.15; 10 sqm diff → scaled; 50+ sqm diff on a
    50 sqm flat → approaches 0 (denominator floored at max(sqm, 50))
  - Storey: identical midpoint → 0.10; 25+ floor diff → 0
  - Lease: identical year → 0.10; 50+ year diff → 0; null lease → component
    excluded, remaining weights re-scaled to sum to 1.0
  - Null lease: score reaches 1.0 when all other components match
    (identical transaction but missing lease year)
  - Recency: same month → 0.05; 60+ months old → 0
  - Weight sum equals 1.0
  - Resale price change does not affect similarity (change price field,
    assert identical score)
  - Match reasons: correct labels for high-scoring components
  → `vp run test` passes. (R9.1)

- [x] **T6.2** Add `tests/unit/comparable-engine-fallback.test.ts`:
  - Pass 1 (same block): ≥8 results → no widening, `widenedSearch = false`
  - Pass 1: 3 results → widens to pass 2
  - Pass 2: ≥8 results → no further widening, `widenedSearch = true`
  - Pass 2: 2 results → widens to pass 3
  - Pass 3: 0 results → empty result with caveat
  - `sameBlockCount`, `sameStreetCount`, `sameTownCount` are correct
  - Caveats contain correct widening messages
  - Top-N cap: >30 results → only top 30 returned
  → `vp run test` passes. (R9.2)

## Phase 7 — API + component tests

- [x] **T7.1** Add `tests/unit/comparable-transactions-api.test.ts`:
  - Valid POST body returns 200 with `ListingComparableSet` shape
  - Missing `town` → 400
  - Missing `flatType` → 400
  - Empty body → 400
  - Response `comparables` array is sorted by similarity descending
  - Uses Vitest with a mocked D1 binding (or a test fixture DB)
  → `vp run test` passes. (R9.3)

- [x] **T7.2** Cover the panel request lifecycle and presentation across the
  listing-check hook/component suites:
  - Mock `fetch` to return a valid `ListingComparableSet`; assert verdict
    renders
  - Mock `fetch` to return `widenedSearch: true`; assert widening indicator
    visible
  - Mock `fetch` to return match reasons; assert they appear in the list
  - Mock `fetch` to return 500; assert error state with retry button
  - Loading state visible before fetch resolves
  → Focused tests cover loading, errors, widening, and match reasons. (R9.4)

## Phase 8 — E2E tests

- [x] **T8.1** Cover the transaction evidence journey in
  `tests/e2e/buyer-listing-check.spec.ts`:
  - Add assertion: comparable results include match reason tags
  - Add scenario: block with very few transactions triggers widening caveats
  - Add assertion: low-sample widened evidence surfaces its caveat
  → The focused buyer workflow covers match reasons and widened low-sample
  evidence. (R9.5)

## Phase 9 — Verification

- [ ] **T9.1** `vp run typecheck` passes with no errors.
- [ ] **T9.2** `vp run lint` passes with no errors.
- [ ] **T9.3** `vp run test` passes — all existing + new tests green.
- [ ] **T9.4** `vp run test:e2e` passes — all existing + new E2E tests green.
- [ ] **T9.5** `vp run check:boundaries` passes — no script/runtime import
  violations (shared module imports from `src/` or vice versa).
- [ ] **T9.6** Manual smoke via `vp run dev:functions` against local D1
  (with `vp run db:migrate:local` and fixture seed):
  - Check tab opens, typeahead selects a block, form fills
  - "Check This Listing" triggers API call, loading state visible
  - Verdict card renders with comparables and match reasons
  - Low-sample block triggers widening caveats
  - No duplicate block-detail listing-check surface is present
