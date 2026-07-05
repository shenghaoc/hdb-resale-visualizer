# Platform parity architecture

The React web app is the canonical HDB resale buyer product. Its buyer workflow, data semantics, filters, pricing analysis, lease logic, shortlist behaviour, map overlays, and user-facing caveats define the product contract for any future macOS or native companion.

This repository does **not** contain a desktop implementation. Future platform-specific apps must consume the same shared product core instead of copying logic into a desktop-only fork.

## Shared product core

Framework-neutral product logic belongs in `shared/`, especially the focused modules under `shared/product/` and the existing shared modules they compose. Code in this layer must not import React, DOM APIs, browser storage, MapLibre, Cloudflare Worker APIs, D1 bindings, Wrangler, UI components, or route-specific modules.

### Modules under `shared/product/`

| Module                    | Purpose                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `affordability.ts`        | HDB loan assumptions, affordability verdicts, affordability-mode filter predicate                                                                                                      |
| `budget.ts`               | Budget match signals and thresholds                                                                                                                                                    |
| `filtering.ts`            | Filter predicate (`matchesFilter`), geographic search intent resolution, station name matching, coordinate/radius filtering, effective median price helpers, search text normalization |
| `filter-pipeline.ts`      | Pure filter pipeline: `filterScopedBlocks`, `computeMapFilteredBlocks`, scope detection                                                                                                |
| `lease.ts`                | Remaining-lease helpers, lease-to-95, age eligibility                                                                                                                                  |
| `listing-check.ts`        | Listing confidence, asking-price assessment, caveats                                                                                                                                   |
| `search-aliases.ts`       | Multilingual (CJK) search alias resolver — pure static data + string transform                                                                                                         |
| `search-profile.ts`       | `SearchProfile` types, profile matching (flat type / lease / budget / commute), profile visibility                                                                                     |
| `transaction-analysis.ts` | Comparable transaction selection and summary calculations                                                                                                                              |

### Other shared modules

| Module                   | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `data-types.ts`          | Block, transaction, filter, and manifest types            |
| `filter-options.ts`      | Canonical flat-type normalization and filter menu builder |
| `comparable-engine.ts`   | Comparable selection and summary engine                   |
| `confidence-system.ts`   | Confidence scoring inputs and calculations                |
| `caveat-codes.ts`        | Machine-readable caveat codes                             |
| `shortlist-limits.ts`    | Shortlist size constants                                  |
| `shortlist-merge.ts`     | Shortlist merge rules                                     |
| `time-adjustment.ts`     | Time-adjustment factors for comparables                   |
| `geo.ts`                 | Geographic utility helpers                                |
| `mrt-station-details.ts` | MRT station metadata                                      |
| `mrt-colors.ts`          | MRT line color mappings                                   |

## Web-only code

React components, hooks, shadcn composition, URL state, localStorage adapters, i18n text rendering, and visual layout remain in `src/`. The web app may adapt shared-core results into labels or components, but it must not reimplement the underlying buyer logic.

### Web adapter pattern

When shared-core modules provide the deterministic logic, `src/` modules act as thin adapters:

- `src/types/searchProfile.ts` — re-exports `SearchProfile` from `shared/product/search-profile`
- `src/features/search-profile/matchProfile.ts` — wraps shared evaluators with `getCurrentYear()` defaults
- `src/shared/lib/filtering.ts` — wraps shared `matchesFilter` with affordability caching, re-exports geographic search
- `src/shared/lib/affordability.ts` — wraps shared affordability with WeakMap verdict caching
- `src/shared/lib/i18n/domain.ts` — re-exports `resolveMultilingualSearchAliases` from shared

The hook `src/hooks/useFilterPipeline.ts` orchestrates React state, debouncing, URL inspection, and `useBlockLoading`, then delegates to shared pure functions for filtering.

## Cloudflare/API-only code

Pages Functions, Worker routing, D1 access, rate limiting, runtime API request parsing, and the opt-in shortlist cloud-sync write path remain in `functions/` and `worker/`. Runtime API code reads D1 and may call shared deterministic logic, but it must not geocode, fetch upstream public datasets, or add new user-data write paths outside shortlist sync.

## Map rendering-only code

MapLibre source/layer IDs, paint expressions, camera behaviour, OneMap attribution, marker interactions, and DOM event handling stay in the map feature modules. If a future platform needs equivalent map overlays, it should share only neutral overlay inputs and thresholds; rendering code is platform-specific.

## Future macOS/native checklist

Every native-platform PR must include evidence that it has not drifted from the web product:

- [ ] No duplicated business logic for filters, transaction analysis, budget, lease, shortlist, listing verdicts, or caveats.
- [ ] Shared core modules under `shared/product/` are used for buyer-facing logic.
- [ ] Golden parity tests pass, including `vp test run product-core-parity`.
- [ ] Shared-core tests pass: `vp test run shared-search-profile`, `vp test run shared-filtering`, `vp test run shared-filter-pipeline`.
- [ ] Fixture output in `tests/fixtures/platform-parity/` is unchanged unless the PR explicitly explains an intentional product-semantics update.
- [ ] Web app behaviour is verified with the existing unit/type/build checks.
- [ ] Screenshots or test evidence are provided for any UI behaviour change.
- [ ] Any intentional divergence from the canonical web UX is documented in the PR and justified as platform adaptation, not product logic drift.

## Parity validation gate

Before a platform implementation is considered valid, run at minimum:

```bash
vp run format:check
vp run lint
vp run typecheck
vp run test
vp test run product-core-parity
vp test run shared-search-profile
vp test run shared-filtering
vp test run shared-filter-pipeline
vp run build
vp run check:boundaries
```

For UI-affecting web changes, also run the relevant browser or Playwright tests. A future native implementation should add its own adapter/UI tests, but those tests supplement rather than replace the shared-core golden tests.

## Adding a new golden fixture

When product semantics change (new filter, new tier rule, new affordability assumption):

1. Add a scenario to `tests/fixtures/platform-parity/product-core-golden.json` with stable, descriptive fields.
2. Add a corresponding test in `tests/unit/product-core-parity.test.ts` that asserts the expected outcome.
3. Run `vp test run product-core-parity` to confirm the new fixture passes.
4. Document the semantic change in the PR description.

## What counts as product logic drift

- A native implementation that reimplements `matchesFilter` or `evaluateBlockForProfile` instead of importing from `shared/product/`.
- A native implementation that hardcodes affordability constants instead of importing from `shared/product/affordability`.
- A native implementation that uses different stretch/budget/commute thresholds than the shared core.
- Any module under `shared/product/` that imports from `src/`, React, MapLibre, or browser globals.
