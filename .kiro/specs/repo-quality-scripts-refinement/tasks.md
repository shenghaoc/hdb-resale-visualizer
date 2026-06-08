# Tasks: Repo Quality Scripts Refinement

> Execution checklist. Order: audit → add targeted test scripts → add pre-PR
> gate → document → verify. Each task names its acceptance check. This is a
> script-and-docs change — no source/runtime code is touched.

## Phase 1 — Audit existing scripts

- [x] **T1.1** Enumerate the current `package.json` scripts and confirm the
  baseline (`dev`, `dev:functions`, `build`, `build:full`, `build:deploy`,
  `check`, `check:bundle`, `check:boundaries`, `typecheck`, `typecheck:libs`,
  `lint`, `lint:fast`, `lint:typed`, `test`, `test:watch`, `test:e2e`,
  `test:e2e:reuse`, `setup:fixtures`, `sync-data`, `db:migrate:*`). Identify
  the gaps: no targeted listing-check / comparable / buyer-workflow runs, and
  no single pre-PR gate above `check`.
  → Confirmed against `package.json`. (R1.1)

- [x] **T1.2** Map the buyer-critical test files to Vitest filename-filter
  patterns and verify with `vitest list --filesOnly <patterns>` that each
  pattern selects exactly the intended files and nothing extraneous.
  → `listing AskingPriceCheck`, `comparable time-adjustment transaction-analysis
  transaction-outliers`, and `shortlist buyer-first` resolve to the documented
  file sets. (R2.2, R3.2,
  R4.2)

## Phase 2 — Targeted test scripts

- [x] **T2.1** Add `test:listing-check` using the existing `test` prefix
  (`NODE_OPTIONS=--no-experimental-webstorage vitest run`) with filters
  `listing AskingPriceCheck`.
  → `npm run test:listing-check` runs the 6 listing/AskingPriceCheck files and
  passes. (R2.1, R2.2, R2.3)

- [x] **T2.2** Add `test:comparables` with filters
  `comparable time-adjustment transaction-analysis transaction-outliers`.
  → `npm run test:comparables` runs the 7 comparable/time-adjustment/
  transaction files and passes. (R3.1, R3.2, R3.3)

- [x] **T2.3** Add `test:buyer-workflow` with filters `shortlist buyer-first`.
  → `npm run test:buyer-workflow` runs the shortlist + buyer-first files.
  (R4.1, R4.2, R4.3)

## Phase 3 — Pre-PR gate

- [x] **T3.1** Add `check:pr` as `npm run check && npm run test:e2e`. Do not
  modify or re-list the steps inside `check`.
  → `check:pr` resolves; `check` is unchanged. (R1.3, R5.1, R5.2, R5.3)

## Phase 4 — Documentation

- [x] **T4.1** Update the README `## Scripts` block with
  `test:listing-check`, `test:comparables`, `test:buyer-workflow`, `check`,
  and `check:pr`, plus a note that targeted scripts reuse the Vitest config and
  that CI runs the same underlying scripts as separate parallel jobs rather
  than invoking `check:pr` directly.
  → README lists the commands accurately. (R7.1, R7.3, R8.4)

- [x] **T4.2** Update the AGENTS.md `Useful local commands` block with the same
  commands and note.
  → AGENTS.md lists the commands accurately. (R7.2, R7.3, R8.4)

- [x] **T4.3** Add this spec to the AGENTS.md **Active** spec router list.
  → Router entry present. (R7.4)

## Phase 5 — Verification

- [x] **T5.1** Confirm `package.json` is valid JSON and every new script
  resolves via `npm run <name>`.
  → `node -e` print of each script string succeeds. (R8.1)

- [x] **T5.2** Confirm no second test runner, no new test/Playwright config,
  and no `bun.lock`/`yarn.lock`/`pnpm-lock.yaml` were introduced; npm + Node 26
  assumptions unchanged.
  → Only `package.json` scripts + docs changed. (R6.1–R6.5)

- [ ] **T5.3** (Reviewer) Run `npm run check:pr` in an environment with
  Playwright WebKit installed (`npx playwright install --with-deps webkit`) to
  confirm the full pre-PR gate passes end to end. Targeted unit scripts are
  already verified locally. (R8.3)
