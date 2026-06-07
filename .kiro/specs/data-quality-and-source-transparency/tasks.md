# Tasks: Data Quality and Source Transparency

> Execution checklist. Order follows shared metadata normalization → UI wiring →
> surface consistency → validation.

## Phase 1 — Shared metadata normalization

- [ ] **T1.1** Add `src/lib/dataQuality.ts`:
  - `deriveDataQualityState(manifest: Partial<Manifest> | null)`
  - `formatDataQualityState(state, locale)`
  - `getComparableSourceTags(sources)`
  Return stable values for missing/partial manifests and expose stale/missing/partial state.
  → `npm run typecheck` passes. (R1.1, R1.2, R2.2, R2.4)

- [ ] **T1.2** Update manifest validation flow in `src/lib/dataSchemas.ts` and consumers
  in a compatibility-safe way:
  - allow safe fallback path for missing optional/partial source fields at UI boundary
    (without weakening backend storage schema).
  → No runtime crash on partial manifest payloads. (R5.1, R5.2)

- [ ] **T1.3** Add unit tests `tests/unit/dataQuality.test.ts`:
  - stale state when `maxMonth` exceeds configured freshness threshold,
  - missing `generatedAt` / `dataWindow.maxMonth`,
  - partial `sources` object.
  → `npm run test` includes staleness/missing/partial coverage. (R5.1, R5.2, R5.3)

## Phase 2 — Canonical comparable quality status

- [ ] **T2.1** Add `src/lib/listing-quality.ts`:
  - `getComparableSetQualityTag(input: { comparableSet; confidence; caveats })`
  - `getComparableStateCopy(codeSet)` from shared caveat codes.
  Ensure deterministic mapping to `strong | weak | widened | stale`.
  → `npm run typecheck` passes. (R3.1, R3.2)

- [ ] **T2.2** Update `src/components/ListingCheckPanel.tsx`:
  - show latest month used by check result (`result.assessment.summary.latestMonth` fallback
    to manifest `dataWindow.maxMonth`),
  - display quality badge from shared helper,
  - show explicit time-adjustment caveat for non-adjusted paths.
  → `npm run test`/component tests updated. (R2.1, R3.1–R3.4, R4.1, R4.3)

## Phase 3 — Source attribution and global freshness

- [ ] **T3.1** Update `src/components/AppHeader.tsx` (and any mobile-expanded info surface)
  to render source attribution and sync/build timestamps from `manifest` with fallback labels.
  → no crash on missing fields. (R2.2, R2.3, R5.1, R5.2)

- [ ] **T3.2** Update `src/components/ComparableEvidenceTable.tsx`:
  - replace duplicated caveat text with shared map from `shared/caveat-codes.ts`/adapter,
  - preserve explicit widened note and low-sample explanation using shared phrasing.
  → `npm run test` + existing E2E assertions remain stable. (R3.3, R4.1, R4.2)

## Phase 4 — Cross-view consistency

- [ ] **T4.1** Update `src/components/DetailDrawer.tsx` to show a compact data-quality
  tag/caveat summary derived from shared helper (no duplicated wording).
  → `npm run test`. (R4.1, R4.4)

- [ ] **T4.2** Update `src/components/ShortlistDrawer.tsx` comparable rows to consume the
  same quality/caveat adapter output used by listing check.
  → `npm run test`. (R4.1, R4.2)

- [ ] **T4.3** Update `src/components/ResultsPane.tsx` confidence labels and caveat micro-copy
  to use shared quality tags/messages.
  → `npm run test`. (R4.1, R4.4)

## Phase 5 — Data-state validation and regression coverage

- [ ] **T5.1** Extend `tests/unit/dataFetchValidation.test.ts`:
  - verify stale manifest handling is accepted by parser boundary where required,
  - verify missing and partial manifest payloads parse through fallback path.
  → `npm run test`. (R5.1, R5.2)

- [ ] **T5.2** Add/extend component tests:
  - `tests/components/ListingCheckPanel.test.tsx` for stale/widened/weak badge and latest month.
  - `tests/components/ComparableEvidenceTable.test.tsx` for shared caveat language assertions.
  - `tests/unit/DetailDrawer.test.tsx`/`tests/unit/ShortlistDrawer.test.tsx` for metadata fallback.
  → `npm run test`. (R3–R4)

- [ ] **T5.3** Manual smoke run (`npm run dev:functions`) verifies:
  - no render blockers with missing metadata fixture,
  - visible stale/partial/empty data states,
  - consistent caveat copy between listing check, block detail, shortlist, comparisons.
  → Visual acceptance by reviewer. (R4, R5, acceptance criteria)

## Phase 6 — Verification

- [ ] **T6.1** `npm run typecheck` passes.
- [ ] **T6.2** `npm run lint` passes.
- [ ] **T6.3** `npm run test` passes (new data-quality tests included).
- [ ] **T6.4** `npm run build` passes.
