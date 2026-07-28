# Implementation Plan

> **Status of sections 1–5 (historical bootstrap).** These were the inventory,
> scaffolding, and early-extraction steps of the migration. They were delivered by
> the earlier migration PRs, before this file began tracking per-task evidence — the
> checkbox convention started at section 6, which is why they sat unticked and read
> like pending future work. They are not outstanding work, and no follow-up PR is
> planned for them.
>
> Marker convention used below:
>
> - `[x]` — delivered; the resulting code is present today.
> - `[-]` — **superseded**: deliberately not done, because a later decision made it
>   unnecessary. Two items fall here (1.4 and 2.2); both are called out inline rather
>   than quietly ticked.
>
> Sections 6–13 carry the detailed per-task evidence, and section 13 records the
> final parity gate.

## 1) Baseline and migration map (no runtime changes)

- [x] 1.1 Inventory all files referenced by each target feature domain:
  - Listing check pipeline and rendering.
  - Shortlist orchestration and persistence integration.
  - Map explorer state and interactions.
  - Search-profile flow and search-result rendering.
  - Block detail view and related computations.
- [x] 1.2 Build a cross-reference list: current file → intended target folder.
  - The durable form of this list is the ownership mapping in task 13.1.
- [x] 1.3 Run baseline tests for impacted surfaces and record snapshots/expectations.
- [-] 1.4 Add temporary migration notes file under `.kiro/specs/feature-first-refactor/` (internal only) with move plan and ownership decision.
  - **Superseded.** No such file was created and none is needed: the move plan and
    ownership decisions are recorded as per-phase evidence under sections 6–13, which
    outlast a temporary scratch file. The spec directory intentionally holds only
    `design.md`, `requirements.md`, and `tasks.md`.
- [x] 1.5 Validate criteria before moving:
  - `npm run test tests/unit/search-profile.test.ts`
  - `npm run test tests/unit/listing-confidence.test.ts tests/unit/listing-caveats.test.ts`
  - `npm run test tests/unit/shortlist.test.ts tests/unit/shortlist-sync.test.ts tests/unit/shortlist-comparison.test.ts`
  - `npm run test tests/unit/comparable-engine.test.ts tests/unit/transaction-analysis.test.ts`

## 2) Introduce target folders and compatibility strategy

- [x] 2.1 Create all target directories:
  - `src/features/listing-check`
  - `src/features/shortlist`
  - `src/features/map-explorer`
  - `src/features/search-profile`
  - `src/features/block-detail`
  - `src/entities/transaction`
  - `src/entities/block`
  - `src/entities/town`
  - `src/shared-ui`
  - `src/shared/lib`
  - All ten exist today.
- [-] 2.2 Add minimal `README.md` or index note files for each folder describing responsibility boundaries.
  - **Superseded.** No per-folder READMEs exist. Responsibility boundaries are
    documented centrally in the "Feature Boundaries" and "Dependency Direction"
    sections of `.kiro/steering/structure.md`, which agents already read as steering.
    Ten scattered READMEs would duplicate that and drift out of sync.
- [x] 2.3 Add non-invasive compatibility re-export files only where needed to avoid giant import rewrites.
  - Added during the move phases, then removed once consumers pointed at canonical
    owners (task 12.1). None remain.
- [x] 2.4 Run focused tests for import/build health.
  - `npm run typecheck`
  - `npm run lint`

## 3) Extract shared primitives first (`src/shared/lib`)

- [x] 3.1 Move/copy non-UI pure helpers used by multiple features (formatting, filtering, and utility helpers that do not own feature state) into `src/shared/lib`.
  - `src/shared/lib` now holds 18 modules.
- [x] 3.2 Keep behavior unchanged by preserving old import paths via temporary re-exports.
- [x] 3.3 Update consumers to prefer new `src/shared/lib` paths incrementally.
- [x] 3.4 Add/relocate tests near new modules:
  - Existing unit tests moved/copied to `tests/unit` for each extracted file.
- [x] 3.5 Validate with focused tests:
  - `npm run test tests/unit/format.test.ts tests/unit/filtering.test.ts tests/unit/filtering.edge-cases.test.ts`

## 4) Extract transaction entities first (lowest coupling)

- [x] 4.1 Move transaction type definitions and transaction analysis helpers into `src/entities/transaction`.
- [x] 4.2 Extract pure comparable/confidence/caveat calculators used in listing analysis into transaction/block entities as appropriate.
- [x] 4.3 Ensure no React imports in these new modules.
  - Verified zero React imports under `src/entities`, and now machine-enforced by
    `scripts/check-boundaries.ts` (framework packages incl. subpaths are rejected).
- [x] 4.4 Route all feature logic through these entity modules using compatibility exports temporarily.
  - Temporary exports removed in task 12.1.
- [x] 4.5 Add unit coverage adjacent to modules in feature/entity area.
- [x] 4.6 Validate parity:
  - `npm run test tests/unit/transaction-analysis.test.ts`
  - `npm run test tests/unit/listing-confidence.test.ts tests/unit/listing-caveats.test.ts tests/unit/listing-confidence-adapter.test.ts`

## 5) Extract block and town entities

- [x] 5.1 Create `src/entities/block` with block type definitions and block-only helpers (explanations, matching, similar blocks where purely domain logic).
- [x] 5.2 Create `src/entities/town` with town-level helpers (comparisons, profiles, recommendations where domain-only).
- [x] 5.3 Keep imports explicit; add barrels only if multiple submodules are consumed together.
  - Imports are explicit. The `index.ts` barrels under `src/features/*` and
    `src/entities/*` had no consumers and have been removed, matching the
    `src/shared-ui` decision in task 11.3 (design rule 4, R6). The only surviving
    barrel under `src/` is `src/shared/lib/i18n/index.ts`, with 71 direct import
    declarations across 68 modules.
- [x] 5.4 Migrate tests near modules; keep fixture use unchanged.
- [x] 5.5 Validate:
  - `npm run test tests/unit/town-profile.test.ts tests/unit/town-compare.test.ts tests/unit/town-recommendations.test.ts`

## 6) Move listing-check feature logic

- [x] 6.1 Extract listing check orchestration from mixed components into `src/features/listing-check`.
  - Completed via `src/features/listing-check/useListingCheckController.ts`.
- [x] 6.2 Keep calculation functions in entities/shared/lib modules; move only orchestration and component composition into feature.
  - Completed: panel at `src/features/listing-check/ListingCheckPanel.tsx`; async orchestration in `useListingCheckAnalysis.ts`; pure composition in `listingCheckAnalysis.ts` (orchestrates entity/shared calculations without reimplementing them).
- [x] 6.3 Ensure `ListingCheckPanel`, verdict presentation, and comparable evidence producers import from new feature/entity modules.
  - `ListingCheckPanel`, `ComparableEvidenceTable`, and `DistributionBar` now live in `src/features/listing-check/`; retired duplicate listing-check components were removed.
  - Consolidated shared verdict presentation in `src/features/listing-check/listingVerdictPresentation.ts`.
  - Evidence components now consume feature analysis types (`DisplayComparable`, `ListingAdjustmentInfo`) rather than parallel local contracts.
  - Listing-check feature boundary is complete (tasks 6.1–6.5).
- [x] 6.4 Add a feature-level test boundary:
  - unit tests for pure math (in entity/shared-lib),
  - component tests for listing check UI under `tests/components` or `tests/unit` near feature.
  - Added `tests/unit/listingCheckAnalysis.test.ts`, `tests/unit/useListingCheckAnalysis.test.tsx`, `tests/unit/useListingFactInput.test.tsx`; retained `tests/components/ListingCheckPanel.inputs.test.tsx`.
- [x] 6.5 Validate:
  - `npm run test tests/unit/listing-verdict.test.ts tests/unit/listing-confidence.test.ts tests/unit/comparable-engine.test.ts`
  - `npm run test tests/components/ComparableEvidenceTable.test.tsx tests/components/ListingCheckPanel.inputs.test.tsx`
  - Plus focused feature tests, buyer listing-check E2E, `vp run check`, and `vp run check:pr`.

## 7) Move shortlist feature logic

- [x] 7.1 Move shortlist orchestration into `src/features/shortlist`:
  - ranking helper calls,
  - local/local-sync adapter boundaries,
  - mutation paths for notes/target price.
  - Local persistence, URL import, and mutation paths extracted to
    `src/features/shortlist/useLocalShortlist.ts`.
  - Cloud-sync orchestration extracted to
    `src/features/shortlist/useShortlistSync.ts`.
  - Public `useShortlist` now composes separate local and sync hooks.
  - Artifact loading and canonical shortlist-row construction now live in the
    shortlist feature.
- [x] 7.2 Keep UI components as composition layers only.
  - Ranking, comparison, share, export, highlights, checklist coordination,
    and drawer interaction state are owned by
    `useShortlistDrawerController`.
  - `ShortlistDrawer` and `ShortlistSyncSection` now live under
    `src/features/shortlist`.
  - The shortlist feature boundary is complete.
- [x] 7.3 Preserve sync contract and retry/queue behavior unchanged.
  - Added operation/lifecycle invalidation so late hydration, enable/link,
    debounced-push, and queued-flush results cannot resurrect disabled or
    unmounted sync state or trigger a follow-up flush after unmount.
  - Regression coverage verifies queue-flush cancellation on disable/unmount
    and enable cancellation while preserving merge precedence, queue format,
    and retry behavior.
- [x] 7.4 Add/relocate tests next to feature logic and update existing shortlist tests.
  - Moved sync state-machine coverage to
    `tests/hooks/useShortlistSync.test.tsx` and added public-composition
    coverage in `tests/hooks/useShortlist.test.tsx`.
  - Existing shortlist unit, queue, drawer, and sync-section suites remain
    green.
- [x] 7.5 Validate:
  - `vp test run tests/unit/shortlist.test.ts tests/unit/shortlist-sync.test.ts`
  - `vp test run tests/unit/shortlistSyncQueue.test.ts tests/unit/shortlist-ranking.test.ts tests/unit/shortlist-comparison.test.ts`
  - `vp test run tests/unit/ShortlistDrawer.test.tsx tests/components/ShortlistSyncSection.test.tsx`
  - `vp test run tests/hooks/useShortlistSync.test.tsx tests/hooks/useShortlist.test.tsx tests/components/ShortlistSyncSection.test.tsx`
  - Node 24 focused and full suites, format, lint, typecheck, build, and
    exact-head CI checks all passed for this extraction slice.

## 8) Move map-explorer feature logic

- [x] 8.1 Move map explorer orchestration into `src/features/map-explorer`:
  - selected block state coordination,
  - map-layer visibility flow,
  - zoom/fit bounds and map interaction handlers.
  - MapLibre lifecycle, layer, fit, selection, interaction, radius, heatmap, and
    amenity synchronization hooks now live in `src/features/map-explorer`.
  - `useMapExplorerController` owns geolocation actions, overlay visibility,
    automatic fit-key derivation, map-background interaction behavior, and
    floating-control state.
- [x] 8.2 Separate reusable domain utilities from map-only transforms.
  - Shared school-distance classification lives in
    `src/entities/block/school-proximity.ts` and is consumed by both map
    explorer and block detail.
  - Map-only GeoJSON, heatmap, amenity-visibility, and overlay-selection
    modules remain feature-owned and React-free.
- [x] 8.3 Consolidate feature-level UI shells for map and control interactions.
  - `MapView` and map-specific floating controls now live under the feature.
- [x] 8.4 Update tests close to feature:
  - integration tests for map interactions,
  - any unit tests for map state transitions.
  - Added `tests/hooks/useMapExplorerController.test.tsx`; updated map hook and
    component import paths to the feature boundary.
  - `tests/unit/school-proximity.test.ts` covers the entity-owned distance
    classification and the feature-owned overlay/GeoJSON transforms.
- [x] 8.5 Validate:
  - `vp test run tests/unit/school-proximity.test.ts tests/unit/fixture-comparisons.test.ts tests/unit/mrt.test.ts tests/unit/amenity-visibility.test.ts`
  - `vp test run tests/hooks/useMapExplorerController.test.tsx tests/integration/map-interactions-flow.test.tsx tests/components/MapView.test.tsx`
  - `CI=1 vp run check:pr` (matches the two-worker CI configuration)
  - The map-explorer feature boundary is complete.

## 9) Move search-profile feature logic

- [x] 9.1 Move search-profile orchestration into `src/features/search-profile`.
  - Search-profile persistence and orchestration now live in the feature.
- [x] 9.2 Keep i18n, suggestions, and profile serialization deterministic and test-backed.
  - Wizard validation and payload construction are deterministic pure functions.
- [x] 9.3 Ensure UI components consume entities/shared libs for profile matching and parsing.
  - `SearchProfileWizard` is feature-owned and consumes the pure wizard logic module.
- [x] 9.4 Update/add tests near the feature.
  - Added controller and wizard-logic coverage under `tests/hooks` and `tests/unit`.
  - Town recommendation and profile-chip composition are owned by
    `useSearchProfileController`.
- [x] 9.5 Validate:
  - `npm run test tests/unit/search-profile.test.ts tests/unit/match-profile.test.ts tests/unit/search-handler.test.ts`
  - `npm run test tests/unit/suggest-lib.test.ts tests/unit/suggest-handler.test.ts tests/unit/search-query.test.ts`
  - The search-profile feature boundary is complete.

## 10) Move block-detail feature logic

- [x] 10.1 Move block detail orchestration into `src/features/block-detail`.
  - `DetailDrawer` and block-detail-specific UI now live in the feature.
- [x] 10.2 Move any pure block-detail-only calculations to `src/entities/block`.
  - Pure lease, financing, and flat-type ladder calculations now live in `src/entities/block`.
- [x] 10.3 Keep render-only behavior in feature components.
  - `useBlockDetailController` owns block-detail state and derived analysis.
- [x] 10.4 Update feature-adjacent tests.
  - Shared multi-feature UI remains outside the feature for the final shared-UI cleanup phase.
- [x] 10.5 Validate:
  - `npm run test tests/unit/DetailDrawer.test.tsx tests/unit/town-compare.test.ts`
  - `npm run test tests/unit/search-regression.test.ts tests/unit/block-explanation.test.ts`
  - The block-detail feature boundary is complete.

## 11) Shared UI consolidation

- [x] 11.1 Move shared presentational UI from multiple features to `src/shared-ui` (e.g., reusable panel blocks, chips, list cells, labels where shared).
  - ErrorBoundary, ShareButton, and DrawerSkeleton now live in src/shared-ui.
  - Domain-aware shared components remain outside shared-ui intentionally.
- [x] 11.2 Keep business logic out of shared-ui modules.
  - Shared UI imports only generic presentation dependencies.
- [x] 11.3 Add/repoint exports and adjust imports.
  - Canonical paths: `@/shared-ui/ErrorBoundary`, `@/shared-ui/ShareButton`, `@/shared-ui/DrawerSkeleton`.
  - No compatibility files remain at old `src/components/` paths.
  - No `src/shared-ui` barrel: all 7 consumers import direct module paths, so a barrel would
    add a dead export surface without reducing import noise (design rule 4, R6).
- [x] 11.4 Validate a representative UI slice with render tests and lint.
  - Representative render tests and lint/typecheck/build gates pass.
  - Render tests moved with their subjects to `tests/shared-ui/` (R7 test locality).

## 12) Import cleanup and compatibility removal

- [x] 12.1 Remove temporary compatibility re-export points one domain at a time.
  - Obsolete migration compatibility paths are removed.
- [x] 12.2 Replace ambiguous imports with feature/entity paths where readability improves.
  - Canonical feature/entity/shared-ui imports are used.
  - Feature-internal self-barrel imports are removed, as are the unconsumed
    `src/features/*` and `src/entities/*` barrels themselves (see task 5.3).
- [x] 12.3 Ensure all moved modules have no cyclic dependencies.
  - Frontend boundary and runtime-cycle checks pass.
- [x] 12.4 Re-run:
  - `vp run lint`
  - `vp run typecheck`
  - `vp run test` / focused + full gates (recorded in task 13).

## 13) End-state checks

- [x] 13.1 Confirm acceptance criteria mapping:
  - listing-check -> `src/features/listing-check`
  - shortlist -> `src/features/shortlist`
  - map explorer -> `src/features/map-explorer`
  - search profile -> `src/features/search-profile`
  - block detail -> `src/features/block-detail`
  - transaction logic -> `src/entities/transaction`
  - block logic -> `src/entities/block`
  - town logic -> `src/entities/town`
  - generic presentation -> `src/shared-ui`
  - pricing/comparable/confidence/caveat logic in pure entity/shared modules
- [x] 13.2 Run full parity verification:
  - Unit: 165 test files, 1663 tests passed
  - Playwright: 76 passed, 0 failed. A re-run showed 75 passed + 1 flaky
    (`performance-trace.spec.ts` "map remains interactive during filter operations",
    green on retry) — pre-existing timing sensitivity in a perf trace test, unrelated
    to this PR, which changes no runtime code.
  - Lint: 1 pre-existing warning (`useFilterPipeline` exhaustive-deps), 0 errors
  - Typecheck: passed
  - Boundaries: passed (26 script modules, 190 src modules architecture-checked; no runtime cycles)
  - Build: passed
  - Bundle: passed (9 modulepreloads, 81764 B gzip total)
  - `CI=1 vp run check:pr` / `CI=1 pnpm run check:pr` passed
- [x] 13.4 Close boundary-checker enforcement gaps found in review:
  - Forbidden entity packages now match subpaths (`react-dom/client`, `react/jsx-runtime`),
    reusing the same predicate as the `shared/product` check.
  - `shared/data-types` added to the shared-ui HDB-domain-type denylist (was reachable via `@shared/`).
  - Entity and shared-ui rules are now allowlists, closing `src/hooks` and other unnamed trees;
    steering docs and R5 updated to match what is actually enforced.
  - Regression tests added for each gap plus the runtime/type-only asymmetry,
    `require()` cycles, and star re-export cycles (23 -> 34 boundary tests).
- [x] 13.3 Add final spec notes for any deferred follow-up tasks only (no behavior-critical work left in TODO).
  - Deferred (non-critical): domain-aware multi-feature components (`BudgetMatchBadge`, `MrtLineDots`, `LeaseWarningPanel`, `BuyerChecklist`) remain under `src/components` intentionally; residual app-shell hooks under `src/hooks` are not behavior-critical migration work.
  - No behavior-critical migration TODO remains.
