# Design: CI Quality Gate Refinement

> Status: Draft. Tighten the existing `.github/workflows/ci.yml` path filters
> and trigger lists so the quality gate keeps firing the right jobs after the
> buyer-listing feature work and the feature-first directory restructure
> (`src/features`, `src/entities`, `src/shared-ui`) documented in
> `.kiro/steering/structure.md`.

## Problem

The CI pipeline (`ci.yml`, post-#300 baseline) is structured as:

- Three always-on, parallel quality-gate jobs: `typecheck`, `lint`,
  `unit-tests` (each `npm run typecheck` / `lint` / `test`).
- A `changes` job using `dorny/paths-filter` to compute two booleans
  (`run_e2e`, `run_build`).
- A conditional `build` job (`needs: [changes]`, runs on `run_build ||
  run_e2e`) that stages fixtures, runs `npm run build:deploy`, and uploads a
  `dist` artifact.
- A conditional `e2e-smoke` job (`needs: [changes, build]`) that runs in the
  Playwright Docker image, downloads `dist`, and runs the smoke subset on
  PR/push (full suite on `workflow_dispatch`).
- A `docs-check` reminder job.

Its path filters were written against the **old** `src/` layout
(`src/components`, `src/hooks`, `src/lib`, `src/types`). Two forces now make
those filters stale:

1. **Feature-first restructure.** `structure.md` defines the target layout as
   `src/features/{listing-check,shortlist,map-explorer,search-profile}`,
   `src/entities/{transaction,block,town}`, and `src/shared-ui`. Once code
   moves there, the current `e2e` filter (which only lists `src/components/**`
   etc.) would stop triggering E2E for buyer-UI changes.

2. **Coverage gaps for Functions / Worker / shared logic.**
   - The workflow-level `on.push.paths` omits `functions/**`, and **both**
     `pull_request.paths` and `push.paths` omit `shared/**`, `worker/**`, and
     `wrangler.*`. A PR or push touching only those starts no CI at all —
     even though `worker/**` (the deployed Cloudflare Worker entrypoint
     `wrangler.jsonc` declares as `main`, bundled by Wrangler at deploy) is
     typechecked in CI by `build:deploy`'s `tsc -b` step, which builds the
     `tsconfig.functions.json` project reference (it includes `worker/**/*.ts`).
   - The `build` filter omits `functions/**`, `worker/**`, and `wrangler.*`,
     so a Functions/API, Worker, or Wrangler-config change skips the `build`
     job.

The refinement is configuration-only: no application code, no new jobs, no
new secrets.

## Goals

- E2E smoke runs for every buyer-workflow change, in **both** the legacy and
  feature-first layouts (transition-safe).
- Build verification runs for every runtime/API/build-sensitive change,
  including `functions/**`, `worker/**`, and `wrangler.*`.
- Functions/API/Worker changes always hit the quality gates + `build`.
- PR feedback stays fast (E2E/build stay conditional) and secret-free.
- CI commands stay 1:1 with documented local commands.

## Non-goals

- Restructuring jobs, adding matrix builds, or merging/splitting the quality
  gates (the parallel `typecheck`/`lint`/`unit-tests` layout from #300 stays).
- Adding a live-D1 E2E path (Playwright keeps mocking `/api/*`).
- Touching `typecheck-libs.yml` or `refresh-data.yml`.
- Adding repository secrets to PR jobs.

## Architecture

### 1. Workflow-level trigger paths (`on.pull_request.paths` / `on.push.paths`)

Both lists are unified via a YAML anchor (`&ci_paths` / `*ci_paths`) so they
cannot drift, and the gaps are closed by adding `shared/**`, `functions/**`
(push), `worker/**`, and `wrangler.*`:

```yaml
paths: &ci_paths
  - 'src/**'
  - 'functions/**'
  - 'worker/**'
  - 'scripts/**'
  - 'shared/**'
  - 'tests/**'
  - 'public/**'
  - '.github/workflows/**'
  - 'index.html'
  - 'package.json'
  - 'package-lock.json'
  - 'types/**'
  - 'tsconfig*.json'
  - 'vite.config.*'
  - 'vitest.config.*'
  - 'playwright.config.*'
  - 'eslint.config.*'
  - 'wrangler.*'
```

This is the coarse "should CI start at all?" gate. The fine-grained decision
of *which* conditional jobs run is delegated to the `changes` job.

### 2. `changes` job — `e2e` filter

The filter is the **union** of: feature-first buyer directories (target),
the legacy layout (still present mid-migration), the app shell, shared domain
logic, and the test harness. Listing both layouts is the key transition-safe
decision — a path that does not yet exist simply never matches, so there is no
downside to listing it early, and no regression when code moves.

```yaml
e2e:
  # App shell / entry points
  - 'src/App.tsx'
  - 'src/main.tsx'
  - 'src/styles.css'
  # Feature-first buyer workflows (target architecture)
  - 'src/features/listing-check/**'
  - 'src/features/shortlist/**'
  - 'src/features/search-profile/**'
  - 'src/features/map-explorer/**'
  - 'src/entities/**'
  - 'src/shared-ui/**'
  - 'src/shared/**'
  # Legacy layout (still present during the restructure)
  - 'src/components/**'
  - 'src/hooks/**'
  - 'src/lib/**'
  - 'src/types/**'
  # Shared domain logic that drives listing-check results
  - 'shared/**'
  # E2E harness + fixtures + workflow self-change
  - 'tests/e2e/**'
  - 'tests/fixtures/**'
  - 'playwright.config.*'
  - '.github/workflows/ci.yml'
```

`functions/**` and `worker/**` are intentionally **excluded** from `e2e`: the
Playwright suite mocks `/api/*` (`tests/e2e/fixtures.ts`) and runs against the
prebuilt `dist/` via `vite preview`, so neither the Functions nor the Worker
runtime is exercised — adding them would only slow PRs.

`tests/fixtures/**` (broadened from the old `tests/fixtures/public-data/**`)
covers the mock/api fixtures that E2E depends on.

### 3. `changes` job — `build` filter

Matches the required runtime/API/build-sensitive set verbatim, adding the
previously-missing `functions/**`, `worker/**`, and `wrangler.*`:

```yaml
build:
  - 'src/**'
  - 'shared/**'
  - 'functions/**'
  - 'worker/**'
  - 'scripts/**'
  - 'public/**'
  - 'index.html'
  - 'package.json'
  - 'package-lock.json'
  - 'tsconfig*.json'
  - 'vite.config.*'
  - 'wrangler.*'
  - '.github/workflows/ci.yml'
```

`src/**` is a superset of every `src/...` E2E entry, which is correct: any
source change should at least be build-verified.

### 4. Coverage matrix

Quality gates (`typecheck`, `lint`, `unit-tests`) are always-on, so they run
for every change that starts the workflow.

| Change kind | quality gates | e2e-smoke | build |
|-------------|:-------------:|:---------:|:-----:|
| `src/features/listing-check/**` (feature-first UI) | ✅ | ✅ | ✅ |
| `src/components/**` (legacy UI, pre-migration) | ✅ | ✅ | ✅ |
| `shared/comparable-engine.ts` / `src/entities/transaction/**` | ✅ | ✅ | ✅ |
| `functions/api/**` (Functions/API) | ✅ | — (mocked) | ✅ |
| `worker/**` (Worker entrypoint / SEO / OG) | ✅ | — (mocked) | ✅ |
| `wrangler.jsonc` | ✅ | — | ✅ |
| `scripts/sync-data.ts` | ✅ | — | ✅ |
| `docs/guide/**` only | — (no CI trigger) | — | — |

The always-on quality gates cover typecheck + lint + unit/integration tests
for **all** triggering changes, so comparable/transaction logic and
Functions/API/Worker code always get unit + type + lint coverage even when E2E
is skipped. (`build` runs on `run_build || run_e2e` so `e2e-smoke` always has a
`dist` artifact to download.)

### 5. Targeted comparable/listing-check test script (decision)

Considered: a `vitest run comparable` (or project-scoped) CI step to give
faster, clearer feedback on comparable/transaction changes. **Rejected for
this spec.** The full `npm run test` already runs the whole unit/integration
suite in a single Vitest process; a scoped run would re-cover the same files,
risk diverging from the documented `npm run test`, and violate R7 (CI ==
local commands) for marginal time savings. The single `npm run test` step
stays the unit gate. (Re-open if the suite grows enough that a scoped pre-flight
is demonstrably faster.)

### 6. Preserved elements

This spec changes only the `on.*.paths` lists and the two `changes` filters.
Everything #300 introduced is left intact:

- `typecheck`, `lint`, `unit-tests` job steps — unchanged.
- `build` job: fixture staging, `npm run build:deploy`, and the `dist`
  artifact upload — unchanged.
- `e2e-smoke`: Playwright Docker image, `dist` download, smoke/full split,
  and the `actions/upload-artifact` report upload (`if: always()`) —
  unchanged.
- `docs-check` reminder job — unchanged.
- `concurrency` cancellation, `permissions`, `workflow_dispatch` override,
  and the job dependency graph (`build needs [changes]`,
  `e2e-smoke needs [changes, build]`) — unchanged.
- `typecheck-libs.yml`, `refresh-data.yml` — untouched.

## Testing / Verification

CI workflow logic cannot be unit-tested in Vitest; verification is by review
plus YAML validity:

1. **YAML parse check** — load `ci.yml` with a YAML parser; must not error.
2. **Filter trace** — for each acceptance scenario, confirm the changed path
   matches the intended filter entry (see §4 matrix).
3. **Command parity** — diff CI step commands against `AGENTS.md` scripts.
4. **Behavioural confirmation (post-merge)** — a PR touching a buyer feature
   directory shows `e2e-smoke` running; a Functions-only PR shows `build` +
   the quality gates running and `e2e-smoke` skipped.

## Risks / Trade-offs

- **Listing not-yet-existing paths.** Feature-first dirs may not exist until
  the restructure lands. `dorny/paths-filter` simply never matches a missing
  path, so this is inert until code arrives — the intended transition-safe
  behaviour.
- **Dual-layout breadth.** Listing both legacy and feature-first dirs makes
  the `e2e` filter long, but each entry is a documented directory and the
  legacy entries can be deleted in a follow-up once migration completes.
- **`shared/**` double-listing.** It appears in both `e2e` and `build`
  filters; that is correct — shared domain logic affects both E2E results and
  the build.
- **Functions excluded from E2E.** If E2E ever stops mocking `/api/*` and
  exercises live Functions, `functions/**` must be added to the `e2e` filter;
  noted here so the assumption is explicit.
