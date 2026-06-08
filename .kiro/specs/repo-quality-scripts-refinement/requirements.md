# Requirements: Repo Quality Scripts Refinement

> Refine the existing npm script surface so contributors can run fast,
> targeted tests for buyer-critical listing-check and comparable-engine work,
> plus a single documented pre-PR gate. No parallel script system, no new test
> runner, no duplication of `npm run check`.

## R1 — Preserve the existing script surface

- **R1.1** All existing scripts continue to exist and behave identically:
  `dev`, `dev:functions`, `build`, `build:full`, `build:deploy`, `check`,
  `check:bundle`, `check:boundaries`, `typecheck`, `typecheck:libs`, `lint`,
  `lint:fast`, `lint:typed`, `test`, `test:watch`, `test:e2e`,
  `test:e2e:reuse`, `setup:fixtures`, `sync-data`, `db:migrate:local`,
  `db:migrate:remote`.
- **R1.2** No existing script is renamed or removed.
- **R1.3** `npm run check` is NOT modified — `check:pr` builds on top of it
  rather than re-listing its steps.

## R2 — Targeted listing-check unit test script

- **R2.1** A `test:listing-check` script runs only the buyer listing-check
  unit/component tests via Vitest filename filtering against the existing
  Vitest config.
- **R2.2** It selects the listing verdict, listing confidence (and adapter),
  listing caveats, listing portal links, and `AskingPriceCheck` component
  tests.
- **R2.3** It uses the same `NODE_OPTIONS=--no-experimental-webstorage` prefix
  as the existing `test` script so storage-dependent tests behave identically.

## R3 — Targeted comparable-engine unit test script

- **R3.1** A `test:comparables` script runs only the comparable-engine
  unit/component tests via Vitest filename filtering.
- **R3.2** It selects the comparable engine, comparable engine fallback,
  comparable range, `ComparableEvidenceTable`, time-adjustment, and
  transaction analysis/outlier tests — the modules that produce the comparable
  evidence a buyer sees.
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
- **R5.2** `check:pr` reuses `npm run check` (boundaries + typecheck + lint +
  unit tests) and adds the Playwright E2E suite (`npm run test:e2e`). It does
  not re-implement or duplicate the steps inside `check`.
- **R5.3** `check:pr` reuses the existing Playwright config — no new E2E runner
  or config is introduced.

## R6 — Tooling and packaging constraints

- **R6.1** All new test scripts use Vitest; the pre-PR command uses Vitest
  (via `check`) and Playwright. No additional test runner is introduced.
- **R6.2** All scripts reuse the existing `vitest.config.ts` and Playwright
  config — no new config files.
- **R6.3** npm remains the only package manager. No `bun.lock`, `yarn.lock`,
  or `pnpm-lock.yaml` is added. `package-lock.json` stays the lockfile.
- **R6.4** Node 26 assumptions (`engines.node >= 26.0.0`) are unchanged.
- **R6.5** Scripts contain no Kiro-specific behaviour — CI can invoke the exact
  same `npm run …` commands.

## R7 — Documentation

- **R7.1** The README `## Scripts` section lists the new
  `test:listing-check`, `test:comparables`, `test:buyer-workflow`, `check`,
  and `check:pr` commands with one-line descriptions.
- **R7.2** The AGENTS.md `Useful local commands` section lists the same new
  commands.
- **R7.3** Documentation states that `check:pr` is the single pre-PR command
  and that CI calls the identical script.
- **R7.4** Documentation edits are additive — they do not remove or contradict
  existing command descriptions.

## R8 — Acceptance

- **R8.1** Every existing command still runs (`npm run <name>` resolves and
  behaves as before).
- **R8.2** `npm run test:listing-check` and `npm run test:comparables` each run
  only their targeted subset and pass.
- **R8.3** `npm run check:pr` runs the full pre-PR gate in one invocation.
- **R8.4** README.md and AGENTS.md accurately list the useful commands.
