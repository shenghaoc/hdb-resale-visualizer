# Requirements: Repo Quality Scripts Refinement

> Refine the existing package-script surface so contributors can run fast,
> targeted tests for buyer-critical listing-check and comparable-engine work,
> plus a single documented pre-PR gate. No parallel script system, no new test
> runner, no duplication of `vp run check`.

## R1 — Preserve the existing script surface

- **R1.1** All existing scripts continue to exist and behave identically:
  `dev`, `dev:functions`, `build`, `build:full`, `build:deploy`, `check`,
  `check:bundle`, `check:boundaries`, `typecheck`, `typecheck:libs`, `lint`,
  `test`, `test:watch`, `test:browser`, `test:browser:watch`, `test:e2e`,
  `test:e2e:smoke`, `test:e2e:reuse`, `setup:fixtures`, `sync-data`,
  `db:migrate:local`, `db:migrate:remote`.
- **R1.2** No existing script is renamed or removed.
- **R1.3** `check:pr` builds on the existing `check` package script
  rather than re-listing its steps.

## R2 — Targeted listing-check unit test script

- **R2.1** A `test:listing-check` script runs only the buyer listing-check
  unit/component tests via Vitest filename filtering against the existing
  Vitest config.
- **R2.2** It selects the coherently named listing verdict, confidence,
  caveat, presentation, analysis, state/controller, input, quality,
  portal-link, and `ListingCheckPanel` component tests.
- **R2.3** It uses the same `NODE_OPTIONS=--no-experimental-webstorage` prefix
  as the existing `test` script so storage-dependent tests behave identically.

## R3 — Targeted comparable-engine unit test script

- **R3.1** A `test:comparables` script runs only the comparable-engine
  unit/component tests via Vitest filename filtering.
- **R3.2** It selects comparable engine, fallback, determinism, range, API,
  `ComparableEvidenceTable`, time-adjustment, and transaction
  analysis/outlier tests — the modules that produce buyer-visible evidence.
- **R3.3** It uses the same `NODE_OPTIONS` prefix as `test`.

## R4 — Targeted shortlist / buyer-workflow unit test script

- **R4.1** A `test:buyer-workflow` script runs the shortlist and buyer-first
  homepage unit/integration/component tests via Vitest filename filtering.
- **R4.2** It selects the `shortlist*` test files (sync, merge, ranking,
  comparison, rate-limit, TTL, drawer, sync-queue) and the buyer-first
  homepage flow test.
- **R4.3** It uses the same `NODE_OPTIONS` prefix as `test`.

## R5 — Single local pre-PR command

- **R5.1** A `check:pr` script provides one command a contributor runs before
  opening a pull request.
- **R5.2** `check:pr` reuses `pnpm run check` (format, typed lint, typecheck,
  unit/integration tests, boundary check, production build, and bundle budget)
  and adds the Playwright E2E suite (`pnpm test:e2e`). It does not duplicate
  the steps inside `check`.
- **R5.3** `check:pr` reuses the existing Playwright config — no new E2E runner
  or config is introduced.
- **R5.4** The shared Playwright config SHALL default to the same two-worker
  execution locally and in CI so the pre-PR performance checks are not
  dominated by host contention.

## R6 — Tooling and packaging constraints

- **R6.1** All new test scripts use Vitest; the pre-PR command uses Vitest
  (via `check`) and Playwright. No additional test runner is introduced.
- **R6.2** All scripts reuse the existing `vitest.config.ts` and Playwright
  config — no new config files.
- **R6.3** pnpm remains the package manager, Vite+ remains the command runner,
  and `pnpm-lock.yaml` remains the sole lockfile. No `bun.lock`, `yarn.lock`,
  or `package-lock.json` is added.
- **R6.4** Node 24 assumptions (`engines.node >= 24.0.0`) are unchanged.
- **R6.5** Scripts contain no Kiro-specific behaviour — CI can invoke the same
  package scripts through `vp run …`.

## R7 — Documentation

- **R7.1** The README `## Scripts` section lists the new
  `test:listing-check`, `test:comparables`, `test:buyer-workflow`, `check`,
  and `check:pr` commands with one-line descriptions.
- **R7.2** The AGENTS.md `Useful local commands` section lists the same new
  commands.
- **R7.3** Documentation states that `check:pr` is the single pre-PR command,
  and accurately describes its relationship to CI (base CI invokes
  `vp run check`; the path-filtered E2E workflow remains separate).
- **R7.4** Documentation edits are additive — they do not remove or contradict
  existing command descriptions.

## R8 — Acceptance

- **R8.1** Every existing command still runs (`vp run <name>` resolves and
  behaves as before).
- **R8.2** `vp run test:listing-check` and `vp run test:comparables` each run
  only their targeted subset and pass.
- **R8.3** `vp run check:pr` runs the full pre-PR gate in one invocation with
  the deterministic two-worker Playwright default.
- **R8.4** README.md and AGENTS.md accurately list the useful commands.
