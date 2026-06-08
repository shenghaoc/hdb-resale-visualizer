# Tasks: CI Quality Gate Refinement

> Execution checklist. Configuration-only changes to
> `.github/workflows/ci.yml`. Order: triggers → filters → verify → docs.
> Each task names its acceptance check and the requirement(s) it satisfies.

## Phase 1 — Workflow-level trigger paths

- [x] **T1.1** In `ci.yml`, unify `on.pull_request.paths` and
  `on.push.paths` via a YAML anchor and add the missing entries `shared/**`,
  `functions/**` (push), `worker/**`, `wrangler.*`, and `vitest.config.*` so
  shared-logic / Functions / Worker / Wrangler-only changes still start CI.
  → YAML parses; both trigger lists are identical. (R3.1, R7.2)

## Phase 2 — `changes` job filters

- [x] **T2.1** Replace the `e2e` filter with the union of: app shell
  (`src/App.tsx`, `src/main.tsx`, `src/styles.css`), feature-first buyer dirs
  (`src/features/{listing-check,shortlist,search-profile,map-explorer}/**`,
  `src/entities/**`, `src/shared-ui/**`, `src/shared/**`), legacy layout
  (`src/components/**`, `src/hooks/**`, `src/lib/**`, `src/types/**`),
  `shared/**`, and the harness (`tests/e2e/**`, `tests/fixtures/**`,
  `playwright.config.*`, `.github/workflows/ci.yml`). Do NOT add
  `functions/**` (E2E mocks `/api/*`).
  → YAML parses; listing-check + legacy paths both map to `e2e`.
  (R1.1, R1.2, R1.3, R1.4, R3.3)

- [x] **T2.2** Replace the `build` filter with `src/**`, `shared/**`,
  `functions/**`, `worker/**`, `scripts/**`, `public/**`, `index.html`,
  `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.*`,
  `wrangler.*`, `.github/workflows/ci.yml`.
  → YAML parses; `functions/**`, `worker/**`, and `wrangler.*` map to `build`.
  (R2.1, R3.2)

- [x] **T2.3** (review follow-up) Add `worker/**` to the trigger anchor and
  the `build` filter so changes to the Cloudflare Worker entrypoint
  (`worker/index.ts`, SEO/OG, static-asset fallback — typechecked in CI by
  `build:deploy`'s `tsc -b` via the `tsconfig.functions.json` project
  reference; bundled by Wrangler at deploy) start CI and run the `build` job.
  Kept out of the `e2e` filter (E2E never exercises the Worker).
  → `worker/**` maps to `build`, not `e2e`. (R2.1, R3.1, R3.2)

## Phase 3 — Preserve & confirm unchanged behaviour

> Baseline is the post-#300 ci.yml: parallel `typecheck`/`lint`/`unit-tests`
> quality gates, a `build` job that uploads a `dist` artifact, and a
> Dockerized `e2e-smoke` that downloads it.

- [x] **T3.1** Confirm the job dependency graph is intact: `build`
  `needs: [changes]` (runs on `run_build || run_e2e`) and `e2e-smoke`
  `needs: [changes, build]`, with their `workflow_dispatch ||
  needs.changes.outputs.*` conditions.
  → Conditions unchanged. (R1.5, R2.2, R6.5)

- [x] **T3.2** Confirm both artifact uploads are untouched: the `build`
  job's `dist` upload and the `e2e-smoke` Playwright `actions/upload-artifact`
  step (`if: always()`, `name: playwright-report`).
  → Artifact uploads preserved. (R6.1)

- [x] **T3.3** Confirm the quality-gate steps (`npm run typecheck`,
  `npm run lint`, `npm run test`), `build` (`npm run build:deploy`),
  `e2e-smoke` (`npm run test:e2e:smoke` / `test:e2e`), `concurrency`,
  `permissions`, and `docs-check` are unchanged, and no secrets are
  referenced by PR jobs.
  → CI commands match `AGENTS.md`; no `secrets.*` in PR jobs.
  (R5.1, R5.2, R5.3, R6.2, R7.1)

- [x] **T3.4** Confirm `typecheck-libs.yml` and `refresh-data.yml` are not
  modified by this change.
  → Both files untouched. (R6.3, R6.4)

## Phase 4 — Decision record (no targeted Vitest script)

- [x] **T4.1** Record that no targeted comparable/listing-check Vitest CI
  step is added — the single `npm run test` remains the unit gate (see
  design §5).
  → No new `vitest run <scope>` step in CI. (R4.1, R4.2)

## Phase 5 — Verification

- [x] **T5.1** Validate `ci.yml` is parseable YAML.
  → YAML parser loads the file without error. (R8.1)

- [x] **T5.2** Trace each acceptance scenario against the §4 coverage matrix:
  - listing-check UI change → `e2e-smoke` runs.
  - comparable/transaction logic change → `unit-tests` runs.
  - Functions/API/Worker change → quality gates + `build` run, `e2e-smoke`
    skipped.
  → All scenarios resolve to the intended jobs. (R8.2)

- [x] **T5.3** Diff CI step commands against documented `AGENTS.md` /
  `README.md` scripts.
  → Every CI tooling step uses a documented `npm run *` script. (R7.1, R7.2)
