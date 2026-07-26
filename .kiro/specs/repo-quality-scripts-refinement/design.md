# Design: Repo Quality Scripts Refinement

> Status: Implemented. Refine the existing package-script surface — do not build a
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

1. `vp run test` — runs the entire Vitest suite, slow for a
   tight edit loop.
2. `vp test run <pattern>` — works, but the pattern is undocumented tribal
   knowledge and easy to get wrong (case sensitivity, which files belong to
   "listing-check").

And there is no one command that runs the full pre-PR gate (boundaries +
format + typecheck + lint + unit + build + E2E). `vp run check` stops short
of E2E.

## Goals

- Add `test:listing-check`, `test:comparables`, and `test:buyer-workflow` as
  thin Vitest filename-filter wrappers over the existing config.
- Add `check:pr` as a single pre-PR gate that reuses `check` and adds E2E.
- Document all of the above in README and AGENTS.md.
- Keep pnpm + Vite+ and the existing configs/runners.

## Non-goals

- Creating a parallel script runner, task runner, or Makefile.
- Introducing a second test runner (no Jest, no node:test) — Vitest and
  Playwright only.
- Adding new Vitest or Playwright config files.
- Reorganising the `tests/` directory or renaming test files.
- Re-listing the full gate inside `check:pr`.
- Changing CI workflow files (CI can adopt the new scripts separately; they are
  plain package scripts with no Kiro coupling).

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
"check:pr": "pnpm run check && pnpm test:e2e",
"test:listing-check": "NODE_OPTIONS=--no-experimental-webstorage vp test run listing ListingCheckPanel",
"test:comparables":   "NODE_OPTIONS=--no-experimental-webstorage vp test run comparable time-adjustment transaction-analysis transaction-outliers",
"test:buyer-workflow":"NODE_OPTIONS=--no-experimental-webstorage vp test run shortlist buyer-first",
```

#### `test:listing-check` → patterns `listing`, `ListingCheckPanel`

The `listing` substring is case-insensitive and catches the verdict,
confidence, caveat, presentation, analysis, controller, URL-state, fact-input,
quality, and portal-link suites. `ListingCheckPanel` is added explicitly
because it is the sole listing price-check UI and its component filename is
capitalized. The list is intentionally pattern-defined so new coherently named
listing-check tests join the focused suite automatically.

#### `test:comparables` → patterns `comparable`, `time-adjustment`, `transaction-analysis`, `transaction-outliers`

`comparable` (case-insensitive) catches the engine plus the
API/determinism/range suites and `ComparableEvidenceTable` component.
`time-adjustment`, `transaction-analysis`, and `transaction-outliers` are
included because the v2 engine relies on them to produce buyer-visible
evidence. The explicit transaction patterns avoid sweeping in unrelated future
transaction-history tests.

#### `test:buyer-workflow` → patterns `shortlist`, `buyer-first`

Resolves to the `shortlist*` unit/hook/component/integration files plus
`tests/integration/buyer-first-homepage.test.tsx`. `shortlist` is
case-insensitive so it also matches `ShortlistDrawer` and `useShortlist`.

#### `check:pr`

`pnpm run check && pnpm test:e2e`. `check` chains
`format:check → lint → typecheck → test → build`; `build` in turn runs the
boundary and bundle-budget checks. `check:pr` reuses that package script
verbatim and appends the Playwright E2E suite, so the full gate remains
defined in one place. The shared Playwright config uses two workers locally and
in CI so interaction-latency traces measure the production build rather than
machine-dependent runner contention.

### Why not other approaches

- **Vitest projects / workspace** — overkill; would add a config file and a
  second source of truth for what "listing-check" means.
- **Custom test tags / `describe` filters** — would require touching every
  test file and a `--grep` convention; filename filters need zero test edits.
- **A shell/Make wrapper** — introduces a parallel entry point instead of
  reusing the package scripts exposed through Vite+.

## Documentation

- README `## Scripts` block gains `test:listing-check`, `test:comparables`,
  `test:buyer-workflow`, `check`, and `check:pr` entries plus a short note that
  the targeted scripts reuse the Vitest config and that `check:pr` is the
  single pre-PR command. Base CI invokes `vp run check`; the path-filtered E2E
  workflow remains separate.
- AGENTS.md `Useful local commands` gains the same entries and note.
- AGENTS.md spec router lists this spec under **Active**.

## Risks / Trade-offs

- **Filename-filter drift** — if a future listing-check test is named without
  either the `listing` substring or the canonical panel name, it will be missed by
  `test:listing-check`. Mitigation: the patterns are documented here and in the
  spec; new buyer-critical tests should either follow the naming convention or
  the pattern list is extended. The full `vp run test` / `vp run check` remains the
  authoritative complete run, so nothing is silently skipped in CI.
- **Transaction filter precision** — the filter names the two existing
  comparable-domain files explicitly (`transaction-analysis`,
  `transaction-outliers`) instead of a broad `transaction-` prefix. This
  guarantees no unrelated future `transaction*` test (e.g. the
  "transaction history" block-detail feature) is accidentally pulled into the
  comparable run. The trade-off: a genuinely new comparable-domain transaction
  test must be added to the pattern list explicitly — caught by the same
  filename convention this spec documents.
- **No E2E in the targeted scripts** — intentional; targeted scripts are fast
  unit loops. E2E is covered by `check:pr` and `test:e2e`.
- **Two E2E workers** — this is slower than machine-dependent 75% fan-out, but
  matches CI and keeps the documented pre-PR command deterministic. Callers can
  still override the worker count explicitly for non-gating exploratory runs.

## Testing / Verification

This change is script-and-docs only; verification is operational:

1. `vp run test:listing-check` runs the listing-check subset and passes.
2. `vp run test:comparables` runs the comparable subset and passes.
3. `vp run test:buyer-workflow` runs the shortlist + buyer-first subset.
4. `vp run check:pr` chains the package full gate and Playwright E2E.
5. Every pre-existing script still resolves and runs unchanged.
6. README.md and AGENTS.md list the new commands accurately.
