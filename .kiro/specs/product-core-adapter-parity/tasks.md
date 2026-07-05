# Tasks: Product Core Adapter Parity

> Execution checklist. This PR is a completed test/spec slice: adapter parity
> tests, small golden fixture additions, review cleanup, and validation. Runtime
> product behavior is intentionally unchanged.

## Phase 1 - Spec and scope guardrails

- [x] **T1.1** Read steering and existing platform parity docs/specs:
  `.kiro/steering/product.md`, `.kiro/steering/tech.md`,
  `.kiro/steering/pipeline.md`, `.kiro/steering/structure.md`,
  `.kiro/steering/ui-standards.md`, `.kiro/steering/review.md`,
  `docs/architecture/platform-parity.md`,
  `tests/fixtures/platform-parity/product-core-golden.json`,
  `tests/unit/product-core-parity.test.ts`,
  `tests/unit/shared-search-profile.test.ts`,
  `tests/unit/shared-filtering.test.ts`, `tests/unit/match-profile.test.ts`,
  and `tests/unit/filtering.test.ts`.
  -> Scope confirmed as test-focused adapter parity with no runtime behavior
  changes.

- [x] **T1.2** Preserve explicit constraints: do not read `public/data/`, do
  not move Fuse.js into shared, and do not alter Cloudflare/D1/runtime pipeline
  behavior.
  -> Constraints preserved.

## Phase 2 - Adapter parity tests

- [x] **T2.1** Add `tests/unit/product-core-adapter-parity.test.ts` with
  focused adapter-vs-shared parity coverage for search profile evaluation tier,
  profile visibility, town/budget/flat type filtering, remaining lease
  filtering with explicit current year, MRT/geographic behavior, commute anchor,
  and affordability integration.
  -> Focused parity suite added. (R1.1, R1.4)

- [x] **T2.2** Avoid vacuous reference/identity assertions for direct
  re-exports. Cover direct shared behavior in shared-core tests and adapter
  behavior through non-trivial wrappers.
  -> Vacuous direct re-export tests removed. (R1.2)

- [x] **T2.3** Add typed fixture helpers for block and profile setup, including
  typed filter golden scenarios instead of repeated `Record<string, unknown>`
  casts in scenario loops.
  -> Review feedback addressed. (R1.3)

## Phase 3 - Golden fixture coverage

- [x] **T3.1** Add a small `leaseDeterminismScenarios` fixture group to
  `tests/fixtures/platform-parity/product-core-golden.json`.
  -> Explicit-year lease scenarios added. (R2.1, R2.2)

- [x] **T3.2** Update `tests/unit/product-core-parity.test.ts` to consume the
  new lease determinism scenarios through the shared product core.
  -> Golden fixture remains useful for Swift/macOS parity reference. (R2.3)

## Phase 4 - Review cleanup

- [x] **T4.1** Address the critical review finding about vacuous identity-check
  tests.
  -> Fixed in adapter parity tests.

- [x] **T4.2** Address important review findings: import
  `DEFAULT_FILTERS` from shared constants, improve doc comments, correct
  section labels, add `makeProfile`, add alternative flat-type and
  commute-anchor cases, and add an affordability integration test.
  -> Fixed.

- [x] **T4.3** Apply simplifications: use `toEqual` where clearer, remove dead
  aliases, extract nearest-MRT helpers, remove redundant determinism assertions,
  expand evaluator factory usage, and document walking-speed assumptions.
  -> Applied.

- [x] **T4.4** Refresh live review threads after the final push and confirm no
  active non-outdated actionable threads remain.
  -> Confirmed on PR #342.

## Phase 5 - Validation and publish

- [x] **T5.1** Run focused parity validation under Node 26:
  `fnm exec --using 26 ./node_modules/.bin/vp test run product-core-adapter-parity product-core-parity shared-search-profile shared-filtering match-profile filtering`.
  -> Passed.

- [x] **T5.2** Run quality gates under Node 26:
  `fnm exec --using 26 ./node_modules/.bin/vp run typecheck`,
  `fnm exec --using 26 ./node_modules/.bin/vp run lint`,
  `fnm exec --using 26 ./node_modules/.bin/vp run check:boundaries`, and
  `fnm exec --using 26 ./node_modules/.bin/vp fmt --check .`.
  -> Passed; lint reports the pre-existing warning in
  `src/hooks/useFilterPipeline.ts`.

- [x] **T5.3** Commit, push, update PR #342, and mark it ready after review
  cleanup is complete.
  -> Branch pushed and PR ready.
