# Requirements: CI Quality Gate Refinement

> Refine the existing GitHub Actions CI so it keeps protecting the repo after
> the buyer-listing work and the feature-first (`src/features`, `src/entities`,
> `src/shared-ui`) restructure described in `.kiro/steering/structure.md`.
> This spec only touches workflow configuration — no application code changes.

## R1 — E2E smoke triggers for buyer workflow changes

- **R1.1** The `changes` job's `e2e` path filter MUST trigger the
  `e2e-smoke` job when any of the following buyer-workflow paths change:
  - `src/features/listing-check/**`
  - `src/features/shortlist/**`
  - `src/features/search-profile/**`
  - `src/features/map-explorer/**`
  - `src/entities/**`
  - `src/shared-ui/**`
  - `src/shared/**`
  - `tests/e2e/**`
  - `tests/fixtures/**`
  - `playwright.config.*`
- **R1.2** Because the feature-first restructure is in progress, the `e2e`
  filter MUST ALSO keep matching the legacy layout that still exists in `src/`
  today (`src/components/**`, `src/hooks/**`, `src/lib/**`, `src/types/**`)
  and the app shell entry points (`src/App.tsx`, `src/main.tsx`,
  `src/styles.css`). This prevents a regression where a buyer-UI change in the
  pre-migration layout silently skips E2E.
- **R1.3** The `e2e` filter MUST keep matching `shared/**` (top-level domain
  logic such as the comparable engine) because it drives listing-check
  results exercised by E2E.
- **R1.4** The `e2e` filter MUST keep matching `.github/workflows/ci.yml` so a
  change to the workflow itself re-runs the full gate.
- **R1.5** `workflow_dispatch` MUST continue to force `e2e-smoke` to run
  regardless of changed paths.

## R2 — Build verification triggers for runtime/API/build changes

- **R2.1** The `changes` job's `build` path filter MUST trigger the
  `build` job when any of the following change:
  - `src/**`
  - `shared/**`
  - `functions/**`
  - `worker/**`
  - `scripts/**`
  - `public/**`
  - `index.html`
  - `package.json`
  - `package-lock.json`
  - `tsconfig*.json`
  - `vite.config.*`
  - `wrangler.*`
  - `.github/workflows/ci.yml`
- **R2.2** `workflow_dispatch` MUST continue to force the `build` job to run.

## R3 — Functions / API / Worker changes are not silently excluded

- **R3.1** The workflow-level `on.pull_request.paths` and `on.push.paths`
  trigger lists MUST include `functions/**`, `worker/**`, `shared/**`, and
  `wrangler.*`, so a PR or push that touches only Functions, the Cloudflare
  Worker entrypoint (`worker/**`, declared in `wrangler.jsonc` and typechecked
  via `tsconfig.functions.json`), shared domain logic, or the Wrangler config
  still starts CI.
- **R3.2** Functions/API/Worker changes MUST run the always-on quality gates
  (`typecheck`, `lint`, `unit-tests`) and the `build` job (via R2.1's
  `functions/**` / `worker/**` entries).
- **R3.3** Functions/API/Worker changes are NOT required to run `e2e-smoke`:
  the Playwright suite mocks `/api/*` (see `tests/e2e/fixtures.ts`) and runs
  against the prebuilt `dist/` via `vite preview`, never the live Functions or
  Worker. The `e2e` filter therefore intentionally omits `functions/**` and
  `worker/**` to keep PR feedback fast.

## R4 — Targeted listing-check / comparable test scripts

- **R4.1** A separate targeted Vitest invocation (e.g. a
  `comparable`-scoped run) MUST be added ONLY if it is meaningfully faster or
  clearer than the existing single `npm run test`.
- **R4.2** Given Vitest already runs the full unit/integration suite quickly
  in one process and a scoped run would duplicate coverage, drift from the
  documented commands, and add maintenance, this spec deliberately does NOT
  add a targeted script. The single `npm run test` step remains the unit gate.

## R5 — Fast, secret-free pull request checks

- **R5.1** Normal PR jobs (`changes`, `typecheck`, `lint`, `unit-tests`,
  `build`, `e2e-smoke`) MUST NOT depend on repository secrets. They may use
  the auto-provided `github.token` only (for `dorny/paths-filter` and the
  docs reminder).
- **R5.2** Conditional jobs MUST stay gated behind the `changes` filters (or
  `workflow_dispatch`) so unaffected PRs skip the slow E2E and build steps.
- **R5.3** The `concurrency` group MUST keep cancelling superseded in-progress
  runs for the same PR/branch.

## R6 — Preserve existing behaviour

- **R6.1** The artifact uploads MUST be preserved: the `build` job's `dist`
  artifact (consumed by `e2e-smoke`) and the Playwright report upload
  (`actions/upload-artifact` with `if: always()`).
- **R6.2** The `docs-check` reminder job MUST remain unchanged.
- **R6.3** `.github/workflows/typecheck-libs.yml` (scheduled/manual strict
  dependency typecheck) MUST remain unchanged.
- **R6.4** `.github/workflows/refresh-data.yml` (scheduled/manual data
  refresh) MUST remain unchanged.
- **R6.5** The job dependency graph MUST be preserved: `build` `needs:
  [changes]` (running on `run_build || run_e2e` so `e2e-smoke` always has a
  `dist` artifact), and `e2e-smoke` `needs: [changes, build]`. The quality
  gates (`typecheck`, `lint`, `unit-tests`) remain independent always-on jobs.

## R7 — Documented commands match CI commands

- **R7.1** Every CI step that runs project tooling MUST invoke a script
  documented in `AGENTS.md` / `README.md`: `npm run typecheck`,
  `npm run lint`, `npm run test`, `npm run test:e2e` (and its
  `test:e2e:smoke` PR subset), and the build command used by the `build` job
  (`npm run build:deploy`).
- **R7.2** No CI step may introduce an undocumented inline command that
  diverges from what a contributor can run locally.

## R8 — Verifiability

- **R8.1** The updated `ci.yml` MUST be valid YAML and parse without error.
- **R8.2** Each filter/trigger change MUST be traceable to an acceptance
  scenario:
  - A PR changing listing-check UI runs `e2e-smoke`.
  - A PR changing comparable or transaction logic runs `unit-tests`.
  - A PR changing Functions/API/Worker code runs the quality gates and `build`.
