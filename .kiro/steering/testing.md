---
inclusion: always
---

# Testing And Validation

## Default Validation

- For source changes, run the smallest focused test first, then run the relevant broader checks.
- `pnpm check` is the local quality bundle: boundary check, typecheck, typed lint, and Vitest.
- Before claiming a broad source change is complete, prefer `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
- For deployment, Worker, routing, PWA, bundle, Temporal, or import-boundary changes, run `pnpm build` or `pnpm build:deploy`.
- For UI changes touching tabs, drawers, focus behavior, keyboard interactions, map shell, mobile layout, or mount semantics, add or run Playwright coverage. Unit tests alone often miss these regressions.

## Test Suites

- `vitest.config.ts` includes `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `src/**/__tests__/**/*.test.{ts,tsx}`.
- Unit tests live under `tests/unit`.
- Component tests live under `tests/components`.
- Hook tests live under `tests/hooks`.
- Integration tests live under `tests/integration`.
- Source-owned pure library tests may live under `src/lib/__tests__`, while feature and entity tests should be colocated within their respective directories.
- E2E tests live under `tests/e2e` and run with Playwright Chromium against a production build on `localhost:4173`.
- E2E uses `vp run setup:fixtures`, `vp run build`, and `vp preview` through `playwright.config.ts`.

## Fixtures And Data

- Use `tests/fixtures/public-data/` for schema, API, and E2E fixture work.
- Do not read, glob, index, summarize, or load `public/data/` into agent context unless explicitly asked.
- Tests that validate API responses or stored browser state should use the same Zod schemas as runtime code where practical.
- Keep fixture data minimal and representative. Prefer targeted fixtures over large static snapshots.

## What To Cover

- Deterministic buyer logic: price fairness, comparable ranges, affordability signals, lease financing, shortlist ranking, town comparison, and filter behavior.
- Boundary and security cases: oversized URL or sync payloads, invalid localStorage data, CSV formula injection, malformed API rows, missing D1 rows, and rate-limit failures.
- Search behavior: empty query, typo tolerance, case normalization, town/block/street matching, invalid query params, and IME composition preservation.
- Map behavior: selected block preservation, layer visibility, radius overlays, marker filters, heatmap toggles, and mobile/desktop control access.
- Accessibility: keyboard paths, focus-visible styling, dialog/sheet/drawer titles, roles, labels, and axe gates in E2E where applicable.
- Caches: module-level caches need explicit reset helpers and teardown coverage.

## Test Style

- Prefer visible text, roles, labels, and `data-testid` for E2E assertions.
- Avoid brittle assertions on exact computed CSS unless the style itself is the contract.
- Use property or table-driven tests for parsing, filtering, query-state, and boundary-value logic.
- Keep hot-path tests aware of scale: filtering/search code runs against 10,000+ block records, so tests should catch per-item allocations and missing short-circuits where possible.
- Mock same-origin `/api/*` through fixtures for frontend and E2E tests. Do not hit live D1 or upstream official datasets in normal tests.

## CI Parity

GitHub CI runs Node 26 with pnpm. The quality job installs with `pnpm install`, then runs:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Relevant path changes may also run:

- `pnpm test:e2e`
- `pnpm build:deploy`

Local validation should mirror these commands rather than substituting unrelated checks.
