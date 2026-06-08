# Tasks: Data Quality and Source Transparency

> Execution order: shared utilities -> quality derivation -> listing check
> integration -> source attribution -> cross-view consistency -> tests ->
> verification.

## Phase 1 — Shared data-quality facade

- [x] **T1.1** Create `src/lib/dataQuality.ts`:
  - `deriveDataQualityState(manifest: Partial<Manifest> | null)` returning
    `{ latestMonth, generatedAt, lastUpdatedAt, syncState, syncMessage, sourceAttribution }`.
  - `formatRelativeTime(iso: string | null)` for human-readable timestamps.
  - All fields nullable; missing values produce fallback labels, never throw.
  -> `npm run typecheck` passes; no runtime errors on `null` input. (R1.1, R1.2, R6.1)

- [x] **T1.2** Ensure manifest Zod schema in `src/lib/dataSchemas.ts` accepts
  partial `sources` and optional fields at the UI boundary without weakening
  the backend storage contract.
  -> Partial manifest payloads parse without throwing. (R6.1, R6.2)

- [x] **T1.3** Add unit tests `tests/unit/dataQuality.test.ts`:
  - Stale state when `maxMonth` is >3 months behind current month.
  - Missing manifest (`null` input).
  - Partial manifest (missing `generatedAt`, missing `sources`, missing
    `dataWindow`).
  - `formatRelativeTime` with valid ISO, invalid string, `null`.
  -> `npm run test` passes with staleness/missing/partial coverage. (R6.1-R6.4)

## Phase 2 — Comparable quality status

- [x] **T2.1** Create `src/lib/listing-quality.ts`:
  - `deriveComparableSetQuality(input)` returning
    `{ tag, reasonCodes, latestComparableMonth }`.
  - Mapping: stale (`newestComparableAgeMonths > 12` or `STALE_DATA`) ->
    widened (`WIDENED_TO_STREET` / `WIDENED_TO_TOWN`) -> weak (`LOW_SAMPLE`,
    `VERY_LOW_SAMPLE`, or low confidence) -> strong.
  -> `npm run typecheck` passes. (R4.1, R4.2)

- [x] **T2.2** Add unit tests `tests/unit/listing-quality.test.ts`:
  - Each quality tag path (strong, weak, widened, stale).
  - Priority ordering: stale overrides widened overrides weak.
  - Edge case: empty caveats + high confidence -> strong.
  - Edge case: town/flat type with low sample -> `LOW_SAMPLE` caveat present.
  -> `npm run test` passes. (R4.1-R4.5)

## Phase 3 — Listing check integration

- [x] **T3.1** Update `src/components/ListingCheckPanel.tsx`:
  - Show latest month used by the check result (from comparable set, falling
    back to manifest `dataWindow.maxMonth`).
  - Display quality badge (`strong` / `weak` / `widened` / `stale`) from
    `deriveComparableSetQuality`.
  - Show explicit time-adjustment caveat when adjustment was not applied.
  -> Component renders badge and latest month; `npm run test` passes.
  (R2.1, R4.1, R4.3, R5.3)

- [x] **T3.2** Update `src/components/ComparableEvidenceTable.tsx`:
  - Replace any inline caveat strings with shared adapter from
    `shared/caveat-codes.ts`.
  - Preserve widened-search and low-sample explanations using shared phrasing.
  -> Existing E2E assertions remain stable. (R4.3, R5.1, R5.2)

## Phase 4 — Source attribution and global freshness

- [x] **T4.1** Update the appropriate global info surface (e.g.,
  `AppHeader.tsx`) to render:
  - "Data through {latest month}" from manifest.
  - Sync/build timestamp with graceful fallback.
  - Optional source attribution (collection ID / dataset count).
  -> No crash on missing fields. (R2.2, R2.3, R3.1, R3.2)

## Phase 5 — Cross-view caveat consistency

- [x] **T5.1** Update `src/components/DetailDrawer.tsx`:
  - Show compact data-quality tag and caveat summary from shared adapter.
  -> `npm run test` passes. (R5.1, R5.4)

- [x] **T5.2** Update `src/components/ShortlistDrawer.tsx`:
  - Per-row quality indicator using the same quality/caveat adapter as listing
    check.
  -> `npm run test` passes. (R5.1, R5.2)

- [x] **T5.3** Update `src/components/ResultsPane.tsx`:
  - Confidence label and caveat micro-copy from shared quality tags.
  -> `npm run test` passes. (R5.1, R5.4)

## Phase 6 — Test coverage

- [x] **T6.1** Add/extend component tests:
  - `ListingCheckPanel` renders quality badge and latest month for each tag.
  - `ComparableEvidenceTable` uses shared caveat language (no inline strings).
  - `DetailDrawer` and `ShortlistDrawer` show fallback on missing metadata.
  -> `npm run test` passes. (R4, R5, R6)

- [x] **T6.2** Add/extend E2E tests (Playwright):
  - Listing check flow with full metadata -> quality badge visible.
  - Partial metadata fixture -> no render crash, fallback labels shown.
  -> `npm run test:e2e` passes. (R6.1-R6.4)

- [x] **T6.3** Manual smoke run (`npm run dev:functions`):
  - No render blockers with missing metadata.
  - Stale / partial / empty data states render correctly.
  - Consistent caveat copy across listing check, block detail, shortlist,
    and comparison views.
  -> Visual acceptance by reviewer. (Acceptance criteria)

## Phase 7 — Verification

- [x] **T7.1** `npm run typecheck` passes.
- [x] **T7.2** `npm run lint` passes.
- [x] **T7.3** `npm run test` passes (all new tests included).
- [x] **T7.4** `npm run build` passes.
- [x] **T7.5** `npm run test:e2e` passes.
