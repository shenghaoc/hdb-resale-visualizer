# Design: Product Core Adapter Parity

> Status: Complete. This is a test-focused follow-up to Platform Parity
> Extraction that proves the current web adapters still mirror shared product
> core behavior for high-value buyer/filter/search/profile cases.

## Problem

The completed Platform Parity Extraction moved deterministic product logic into
`shared/product/`, with web modules acting as thin adapters for browser-owned
defaults and hot-path integration. That extraction already had shared-core
coverage, but a future Swift/macOS port also needs confidence that the web
adapters continue to preserve the same semantics after local wrapper behavior
is applied.

The specific risk is adapter drift: the shared core can remain correct while a
web adapter changes defaults, affordability integration, fixture wiring, or
year-sensitive lease context in a way that silently diverges from the shared
semantics future native tests will mirror.

## Goals

- Add focused adapter-vs-shared parity tests.
- Cover representative high-value cases rather than the full matrix.
- Add small golden fixture coverage for deterministic lease behavior.
- Keep all changes test/spec-only.
- Keep Fuse.js owned by the web layer.
- Preserve the existing runtime product behavior.

## Non-goals

- Build a native/macOS app.
- Move Fuse.js or fuzzy search implementation into `shared/`.
- Re-extract product logic or change shared function signatures.
- Read or regenerate `public/data/`.
- Change Cloudflare, D1, Pages Function, Worker, or sync-pipeline behavior.
- Add UI, user-facing docs, or E2E coverage for this test-only slice.

## Architecture

### Adapter parity test

`tests/unit/product-core-adapter-parity.test.ts` is the focused test surface.
It compares the web adapter layer with the shared product core for:

- search profile evaluation tier;
- profile visibility filtering;
- town, budget, flat type, remaining lease, and MRT filter behavior;
- explicit filter evaluation context propagation;
- geographic intent matching with existing small fixtures;
- commute-anchor matching through profile evaluation;
- web affordability integration through the filtering adapter.

The test file owns small typed helpers for block/profile construction so
scenario setup stays readable and reviewable. Direct re-export helpers are not
tested by reference equality because that is vacuous; behavior is covered by
the existing shared tests or by exercising wrapper behavior that actually adds
web-owned integration.

### Golden fixture extension

`tests/fixtures/platform-parity/product-core-golden.json` receives a small
`leaseDeterminismScenarios` group. Each scenario uses an explicit `currentYear`
and expected result, allowing future Swift tests to assert the same
year-sensitive lease semantics without inheriting a JavaScript clock or web
adapter default.

`tests/unit/product-core-parity.test.ts` consumes the same fixture group through
the shared core so the golden file remains a shared platform reference, not a
web-only artifact.

### Web adapter boundary

The PR intentionally leaves the web adapters in place:

- `src/features/search-profile/matchProfile.ts` supplies current-year defaults
  for search-profile matching.
- `src/shared/lib/filtering.ts` supplies current-year defaults and web
  affordability caching.
- Fuse.js remains a browser/search implementation detail. Future native search
  parity should use expected output fixtures, not a shared JavaScript fuzzy
  search dependency.

## Risks / Trade-offs

- The parity suite is representative, not exhaustive. Exhaustive matrix testing
  stays in the shared-core tests and golden platform parity fixtures.
- Adapter tests can become brittle if they duplicate shared-core internals. To
  avoid that, they assert semantic outputs and use compact fixture helpers.
- Lease determinism is only useful when `currentYear` is explicit. Tests should
  continue to pass the year through fixtures or evaluation contexts.

## Validation

Required validation for this slice:

```bash
fnm exec --using 26 ./node_modules/.bin/vp test run product-core-adapter-parity product-core-parity shared-search-profile shared-filtering match-profile filtering
fnm exec --using 26 ./node_modules/.bin/vp run typecheck
fnm exec --using 26 ./node_modules/.bin/vp run lint
fnm exec --using 26 ./node_modules/.bin/vp run check:boundaries
fnm exec --using 26 ./node_modules/.bin/vp fmt --check .
```

After pushes, refresh PR #342 review threads and CI status before marking the
branch ready.
