# Design: Repo Quality Scripts Refinement

> Status: Implemented. Refine the existing npm script surface — do not build a
> parallel script system. Add only the quality-of-life scripts missing for
> buyer-critical listing-check work, reusing Vitest, Playwright, and the
> existing config.

## Problem

The repo already has a complete script surface for dev, build, lint,
typecheck, unit tests, E2E tests, data sync, and D1 migrations. What it lacks
is *fast targeted feedback* for the two buyer-critical areas that change most
often — the listing price check and the comparable engine — and a single,
documented "run this before you open a PR" command.

Today a contributor working on listing-check logic has two options:

1. `npm run test` — runs the entire Vitest suite (~120 files), slow for a
   tight edit loop.
2. `npx vitest run <pattern>` — works, but the pattern is undocumented tribal
   knowledge and easy to get wrong (case sensitivity, which files belong to
   "listing-check").

And there is no one command that runs the full pre-PR gate (boundaries +
typecheck + lint + unit + E2E). `npm run check` stops short of E2E.

## Goals

- Add `test:listing-check`, `test:comparables`, and `test:buyer-workflow` as
  thin Vitest filename-filter wrappers over the existing config.
- Add `check:pr` as a single pre-PR gate that reuses `check` and adds E2E.
- Document all of the above in README and AGENTS.md.
- Change nothing about existing scripts, configs, runners, or the package
  manager.

## Non-goals

- Creating a parallel script runner, task runner, or Makefile.
- Introducing a second test runner (no Jest, no node:test) — Vitest and
  Playwright only.
- Adding new Vitest or Playwright config files.
- Reorganising the `tests/` directory or renaming test files.
- Modifying `npm run check` or any other existing script.
- Changing CI workflow files (CI can adopt the new scripts separately; they are
  plain npm scripts with no Kiro coupling).

## Design

### Vitest filename filtering

Vitest treats trailing positional arguments to `vitest run` as
case-insensitive substring filters against the test file path, OR-combined.
This is the entire mechanism the targeted scripts rely on — no config, no tags,
no separate projects. The existing `vitest.config.ts` `include` globs and
`setupFiles` apply unchanged.

The `NODE_OPTIONS=--no-experimental-webstorage` prefix from the existing
`test` script is preserved on every targeted script so `localStorage`-backed
tests (shortlist storage, etc.) behave identically.

### Script definitions

```jsonc
// package.json "scripts"
"check:pr": "npm run check && npm run test:e2e",
"test:listing-check": "NODE_OPTIONS=--no-experimental-webstorage vitest run listing AskingPriceCheck",
"test:comparables":   "NODE_OPTIONS=--no-experimental-webstorage vitest run comparable time-adjustment transaction-",
"test:buyer-workflow":"NODE_OPTIONS=--no-experimental-webstorage vitest run shortlist buyer-first",
```

#### `test:listing-check` → patterns `listing`, `AskingPriceCheck`

Resolves to (verified via `vitest list --filesOnly`):

- `tests/unit/listing-verdict.test.ts`
- `tests/unit/listing-confidence.test.ts`
- `tests/unit/listing-confidence-adapter.test.ts`
- `tests/unit/listing-caveats.test.ts`
- `tests/unit/listingPortalLinks.test.ts`
- `tests/components/AskingPriceCheck.test.tsx`

The `listing` substring is case-insensitive and catches every `listing*` file
including `listingPortalLinks`. `AskingPriceCheck` is added explicitly because
its filename does not contain "listing" but it is the listing price-check UI.

#### `test:comparables` → patterns `comparable`, `time-adjustment`, `transaction-`

Resolves to:

- `tests/unit/comparable-engine.test.ts`
- `tests/unit/comparable-engine-fallback.test.ts`
- `tests/unit/comparable-range.test.ts`
- `tests/components/ComparableEvidenceTable.test.tsx`
- `tests/unit/time-adjustment.test.ts`
- `tests/unit/transaction-analysis.test.ts`
- `tests/unit/transaction-outliers.test.ts`

`comparable` (case-insensitive) catches the engine plus the
`ComparableEvidenceTable` component. `time-adjustment` and `transaction-` are
included because the v2 comparable engine relies on time-adjusted prices and
transaction-level analysis/outlier handling to produce the evidence a buyer
sees. The trailing hyphen on `transaction-` scopes the filter to the existing
`transaction-analysis` / `transaction-outliers` files and avoids accidentally
matching future generic `transaction*` tests (e.g. DB or API transaction
middleware).

#### `test:buyer-workflow` → patterns `shortlist`, `buyer-first`

Resolves to the `shortlist*` unit/hook/component/integration files plus
`tests/integration/buyer-first-homepage.test.tsx`. `shortlist` is
case-insensitive so it also matches `ShortlistDrawer` and `useShortlist`.

#### `check:pr`

`npm run check && npm run test:e2e`. `check` already chains
`check:boundaries → typecheck → lint → test`; `check:pr` reuses it verbatim
and appends the Playwright E2E suite. This satisfies "do not duplicate
`npm run check`" — the steps live in exactly one place. The bundle-budget
check (`check:bundle`) is intentionally left to the `build` pipeline, where it
already runs against a real `dist/` output; `check:pr` is a source-and-test
gate, not a build.

### Why not other approaches

- **Vitest projects / workspace** — overkill; would add a config file and a
  second source of truth for what "listing-check" means.
- **Custom test tags / `describe` filters** — would require touching every
  test file and a `--grep` convention; filename filters need zero test edits.
- **A shell/Make wrapper** — introduces a non-npm entry point, violating the
  npm-only constraint and the "no parallel script system" rule.

## Documentation

- README `## Scripts` block gains `test:listing-check`, `test:comparables`,
  `test:buyer-workflow`, `check`, and `check:pr` entries plus a short note that
  the targeted scripts reuse the Vitest config and that `check:pr` is the
  pre-PR command CI also calls.
- AGENTS.md `Useful local commands` gains the same entries and note.
- AGENTS.md spec router lists this spec under **Active**.

## Risks / Trade-offs

- **Filename-filter drift** — if a future listing-check test is named without
  the `listing` substring (like `AskingPriceCheck`), it will be missed by
  `test:listing-check`. Mitigation: the patterns are documented here and in the
  spec; new buyer-critical tests should either follow the naming convention or
  the pattern list is extended. The full `npm run test` / `check` remains the
  authoritative complete run, so nothing is silently skipped in CI.
- **`transaction-` breadth** — the filter is scoped with a trailing hyphen so
  it matches the existing `transaction-analysis` / `transaction-outliers`
  files (which belong to the comparable/transaction domain) without sweeping in
  future unrelated `transaction*` tests. New comparable-domain transaction
  tests should keep the `transaction-` prefix to stay in scope.
- **No E2E in the targeted scripts** — intentional; targeted scripts are fast
  unit loops. E2E is covered by `check:pr` and `test:e2e`.

## Testing / Verification

This change is script-and-docs only; verification is operational:

1. `npm run test:listing-check` runs exactly the 6 listing files and passes.
2. `npm run test:comparables` runs exactly the 7 comparable files and passes.
3. `npm run test:buyer-workflow` runs the shortlist + buyer-first files.
4. `npm run check:pr` chains `check` then `test:e2e`.
5. Every pre-existing script still resolves and runs unchanged.
6. README.md and AGENTS.md list the new commands accurately.
