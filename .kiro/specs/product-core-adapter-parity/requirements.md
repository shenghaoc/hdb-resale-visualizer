# Requirements: Product Core Adapter Parity

## R1 - Adapter-vs-shared parity coverage

- **R1.1** `tests/unit/product-core-adapter-parity.test.ts` covers
  representative web-adapter outputs against the shared product core for
  search profile evaluation tier, profile visibility filtering, town/budget
  filtering, remaining lease filtering, MRT/geographic intent, commute anchor,
  and affordability integration.

- **R1.2** Adapter parity tests compare behavior, not references. Direct
  re-export helpers are covered through existing shared-core tests or through a
  non-trivial adapter wrapper.

- **R1.3** The adapter tests use typed local fixtures/helpers for block and
  profile setup, avoiding repeated ad hoc casts in scenario loops.

- **R1.4** The web adapter remains responsible for web-owned defaults such as
  `getCurrentYear()` and affordability verdict caching.

## R2 - Golden fixture reference

- **R2.1** `tests/fixtures/platform-parity/product-core-golden.json` includes
  only high-value additional scenarios needed by this PR, not the full product
  matrix.

- **R2.2** Year-sensitive lease scenarios encode expected results by explicit
  `currentYear` so a future Swift/macOS port can reproduce deterministic lease
  behavior without reading the JavaScript clock.

- **R2.3** Golden fixture expansion preserves the existing platform parity
  fixture shape and remains suitable for both TypeScript tests and future
  native parity tests.

## R3 - Runtime and architecture boundaries

- **R3.1** No runtime product behavior changes are introduced by this PR.

- **R3.2** No code in `src/`, `functions/`, or `worker/` fetches upstream public
  datasets, geocodes, or computes new OneMap routes at runtime.

- **R3.3** `public/data/` is not read, indexed, summarized, or added to agent
  context for this work.

- **R3.4** Fuse.js stays web-owned. Search parity for future Swift work is
  expressed through expected search/profile outputs, not by moving Fuse into
  `shared/`.

## R4 - Validation

- **R4.1** The focused parity suite passes under Node 26:
  `fnm exec --using 26 ./node_modules/.bin/vp test run product-core-adapter-parity product-core-parity shared-search-profile shared-filtering match-profile filtering`.

- **R4.2** The repo quality gates pass under Node 26:
  `fnm exec --using 26 ./node_modules/.bin/vp run typecheck`,
  `fnm exec --using 26 ./node_modules/.bin/vp run lint`,
  `fnm exec --using 26 ./node_modules/.bin/vp run check:boundaries`, and
  `fnm exec --using 26 ./node_modules/.bin/vp fmt --check .`.

- **R4.3** GitHub review threads are refreshed after each push, and active
  non-outdated actionable comments are resolved before calling the PR ready.
