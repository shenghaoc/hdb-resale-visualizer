# Platform parity architecture

The React web app is the canonical HDB resale buyer product. Its buyer workflow, data semantics, filters, pricing analysis, lease logic, shortlist behaviour, map overlays, and user-facing caveats define the product contract for any future macOS or native companion.

This repository does **not** contain a desktop implementation. Future platform-specific apps must consume the same shared product core instead of copying logic into a desktop-only fork.

## Shared product core

Framework-neutral product logic belongs in `shared/`, especially the focused modules under `shared/product/` and the existing shared modules they compose. Code in this layer must not import React, DOM APIs, browser storage, MapLibre, Cloudflare Worker APIs, D1 bindings, Wrangler, UI components, or route-specific modules.

The shared core is the right home for deterministic buyer semantics such as:

- transaction and block summary models from `shared/data-types.ts`;
- comparable transaction selection and summary calculations;
- asking-price verdicts, confidence inputs, and buyer caveats;
- affordability, budget matching, HDB loan assumptions, lease-to-95, and remaining-lease helpers;
- shortlist serialization and merge rules where they are platform-neutral;
- amenity and map-overlay data preparation that is not tied to MapLibre rendering.

## Web-only code

React components, hooks, shadcn composition, URL state, localStorage adapters, i18n text rendering, and visual layout remain in `src/`. The web app may adapt shared-core results into labels or components, but it must not reimplement the underlying buyer logic.

## Cloudflare/API-only code

Pages Functions, Worker routing, D1 access, rate limiting, runtime API request parsing, and the opt-in shortlist cloud-sync write path remain in `functions/` and `worker/`. Runtime API code reads D1 and may call shared deterministic logic, but it must not geocode, fetch upstream public datasets, or add new user-data write paths outside shortlist sync.

## Map rendering-only code

MapLibre source/layer IDs, paint expressions, camera behaviour, OneMap attribution, marker interactions, and DOM event handling stay in the map feature modules. If a future platform needs equivalent map overlays, it should share only neutral overlay inputs and thresholds; rendering code is platform-specific.

## Future macOS/native checklist

Every native-platform PR must include evidence that it has not drifted from the web product:

- [ ] No duplicated business logic for filters, transaction analysis, budget, lease, shortlist, listing verdicts, or caveats.
- [ ] Shared core modules under `shared/product/` are used for buyer-facing logic.
- [ ] Golden parity tests pass, including `vp test run product-core-parity`.
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
vp run build
vp run check:boundaries
```

For UI-affecting web changes, also run the relevant browser or Playwright tests. A future native implementation should add its own adapter/UI tests, but those tests supplement rather than replace the shared-core golden tests.
