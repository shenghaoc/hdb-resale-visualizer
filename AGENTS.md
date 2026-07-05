# AI Agent Quickstart (Kiro Workflow)

Use this file as a **thin router**. Keep task execution focused; treat deeper process docs as references only when relevant.

## 🚀 Core Mandate: Read Steering First

Before executing any directive, agents MUST read the authoritative steering files to maintain the project's strict architectural boundaries:

- [**Product Vision**](.kiro/steering/product.md) — Map-first, deterministic facts only.
- [**Technical Constraints**](.kiro/steering/tech.md) — Cloudflare Pages + D1 backend, Node 26 + Vite+, no runtime geocoding.
- [**Data Pipeline**](.kiro/steering/pipeline.md) — `scripts/sync-data.ts` writes D1; `functions/api/*` reads D1.
- [**Repository Structure**](.kiro/steering/structure.md) — Naming conventions and project layout.
- [**UI/UX Standards**](.kiro/steering/ui-standards.md) — Shadcn composition and high-density standards.
- [**Review Policy**](.kiro/steering/review.md) — Formal PR review workflow and severity framework.

## 🛡️ Workspace MCP Config

Workspace MCP configuration lives in [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json).
Use it for repo-relevant tool integrations such as shadcn MCP, but keep generic external tooling and personal machine setup out of the committed repository configuration.

## 🧠 Skills

Reusable agent skill packs live in [`.kiro/skills/`](.kiro/skills/). Each skill has a `SKILL.md` with YAML frontmatter (name, description, allowed-tools) and supporting rule/reference files.

- **shadcn** — Component composition, styling, forms, and CLI workflow rules.
- **composition-patterns** — React compound-component and state-lifting patterns.
- **react-best-practices** — Performance, rendering, async, and caching rules.
- **react-view-transitions** — View Transitions API patterns for React SPAs.
- **web-design-guidelines** — Vercel Web Interface Guidelines compliance checker.

## 📈 Specs

Specs are located in `.kiro/specs/` and follow the Kiro **Design → Requirements → Tasks** workflow (feature specs) or **Bugfix → Design → Tasks** workflow (bugfix specs). Each spec directory contains a `design.md`, `requirements.md` (or `bugfix.md`), and `tasks.md`. Kiro-generated specs also include a `.config.kiro` metadata file.

**Active:**

- [**Confidence & Caveats System**](.kiro/specs/confidence-and-caveats-system/tasks.md) — Unified evidence-based confidence scoring + machine-readable caveats.
- [**Comparable Evidence Table**](.kiro/specs/comparable-evidence-table/tasks.md) — High-density buyer evidence table for listing price check.
- [**Shortlist Offer Board**](.kiro/specs/shortlist-offer-board/tasks.md) — Buyer decision board with negotiation fields, decision workflow, and side-by-side comparison.
- [**Repo Quality Scripts Refinement**](.kiro/specs/repo-quality-scripts-refinement/tasks.md) — Targeted Vitest scripts + a single pre-PR command, refining existing npm scripts (no parallel runner).
- [**Data Quality & Source Transparency**](.kiro/specs/data-quality-and-source-transparency/tasks.md) — Freshness, provenance, and caveat consistency across views.

**Completed:**

- [**Platform Parity Extraction**](.kiro/specs/platform-parity-extraction/tasks.md) — Deterministic buyer/filter/search/profile logic moved to shared product core.
- [**Global Search Typeahead**](.kiro/specs/search-typeahead/tasks.md) — Ranked suggest endpoint + combobox UI.
- [**Header & Map Control Fixes**](.kiro/specs/header-blocks-map-controls/tasks.md) — Pointer-events fix + UI polish.
- [**UI Redesign**](.kiro/specs/redesign-ui/tasks.md) — Location scope, visual grounding, amenity data.
- [**IME Composition Input**](.kiro/specs/ime-composition-input/tasks.md) — CJK input composition bugfix.

## ⚙️ Useful local commands

```bash
vp install             # Clean install from the lockfile (what CI runs)
vp dev                 # Start development server (localhost:5173)
vp run sync-data       # Refresh precomputed artifacts (public/data/)
vp run format          # Write formatting fixes
vp run format:check    # Check formatting only
vp run typecheck       # Strict TypeScript verification
vp run lint            # Oxlint with type-aware rules
vp run test            # Run Vitest unit/integration tests
vp run test:e2e        # Run Playwright end-to-end tests
vp run build           # Production build
vp run check           # Full quality gate: format check + lint + typecheck + tests + build
```

The targeted `test:*` scripts reuse the existing Vitest config (filename
filters, no new runner) for fast feedback on buyer-critical listing-check and
comparable-engine work. `check:pr` is the single documented pre-PR command and
is a plain package script with no Kiro-specific behaviour. Base CI
(`.github/workflows/ci.yml`) runs `vp install` followed by `vp check`; the
Playwright smoke subset runs in a separate workflow
(`.github/workflows/e2e.yml`) when UI-affecting paths change.

## 🏗️ Architectural Boundary

1. **Runtime API**: The frontend (`src/`) loads all data from `/api/*` Pages Functions (`functions/api/*`), backed by Cloudflare D1.
2. **Build-Time Ingestion**: `scripts/sync-data.ts` fetches data.gov.sg / OneMap and writes to D1. Geocoding and walking-time computation are one-time and persisted in `geocode_cache` / `walking_time_cache` D1 tables — they never re-run for an already-cached address or pair.
3. **Schema Migrations**: D1 schema lives in `migrations/*.sql`. Apply with `vp run db:migrate:remote` (prod) or `vp run db:migrate:local` (Wrangler emulator).
4. **Persistence**: User state is browser-local (`localStorage`) by default and works fully offline. The shortlist additionally supports **opt-in** cloud sync via an anonymous sync code (no account, no PII), persisted in the `shortlists` D1 table and written at runtime by `functions/api/shortlist/*`. This is the _only_ runtime D1 write path; every other D1 write stays build-time (`scripts/sync-data.ts`).
5. **Agent Context**: Agents MUST NOT read, glob, index, summarize, or load `public/data/` into context unless explicitly asked. Respect `.gitignore` by default. Use `tests/fixtures/public-data/` if data schema analysis is required.

## 🔍 Code Review Policy

This policy applies to **all review agents** (Claude, Gemini, Kiro, Codex). Platform-specific tooling is configured separately per agent (see below).

### Review Process

1. **Read ALL changed files** in full — never comment on a diff excerpt in isolation.
2. **Cross-reference existing automated reviews** — confirm which flagged issues are already fixed in the latest commit and which remain open. Acknowledge both explicitly.
3. **Trace semantic dependencies** — when a refactor splits or merges state, find every consumer of the old shape and verify each condition is correctly updated.
4. **Inspect CSS against the real DOM hierarchy** — descendant selectors require the target to be _inside_ the ancestor in JSX; a conditionally applied class needs a compound selector (`.a.b`), not a descendant one.
5. **Scan for dead code** — computed values, compat shims, or returned properties that no consumer uses.
6. **Audit edge cases** — independent-state combinations, keyboard interactions, mobile vs desktop branches, empty inputs, boundary values.

### What to Check

**Code quality & React correctness**

- Semantic bugs in derived/composed state (e.g. `!panelOpen` that should now be `!leftOpen && !rightOpen`)
- Missing or incorrect `useEffect` dependency arrays; unnecessary re-renders from unstable references
- `type` over `interface`; no `any`; named constants instead of magic values
- Dead backwards-compat code with no remaining consumers

**Performance** (hot paths run against 10 000+ block records)

- Per-iteration allocations: `new RegExp(...)`, `.trim().toUpperCase()`, inline object literals inside filter/search loops
- Short-circuit opportunities on empty query or empty filter set
- Memoisation gaps; unbounded caches without eviction
- MapLibre: source mutations that force full re-renders instead of `setFilter`/`setPaintProperty`

**Security**

- URL parameter payloads parsed without a size guard (client-side DoS)
- CSV export formula injection — sanitisation must target the start of the field; avoid the `m` flag to prevent over-sanitising multi-line cell values
- `dangerouslySetInnerHTML` or dynamic `href`/`src` from user input
- `localStorage` reads without Zod validation

**Test coverage**

- Non-trivial new logic without a Vitest unit test
- Missing edge-case tests: empty input, oversized payload, invalid data
- Module-level cache mutations without `resetFilteringCachesForTests()` in teardown
- Brittle E2E assertions on computed CSS values — prefer visible text, aria roles, `data-testid`

**Architecture** (hard constraints — any violation blocks merge)

- `fetch()` in `src/` or `functions/` targeting external domains (OneMap, data.gov.sg) — critical (those calls belong only in `scripts/sync-data.ts`)
- Geocoding or MRT distance calculations in `src/` or `functions/` — critical (build-time only)
- D1 schema changes in `migrations/*.sql` without matching updates to `scripts/lib/sync/store.ts`, `functions/_lib/d1.ts`, `shared/data-types.ts`, and `scripts/lib/schemas.ts`
- `scripts/lib/schemas.ts` changed without matching update to the corresponding TypeScript types in `shared/data-types.ts` (or vice versa)
- `bun.lock`, `yarn.lock`, or `package-lock.json` present — Node 26 + pnpm

### Output Format

The following structured format applies to the overall PR review summary comment, not individual inline line-level comments:

- **Overview** — one paragraph on the approach and whether it is sound.
- **Automated Review Status** — which bot-flagged issues are resolved vs. still open.
- **Issues Found** — severity (**Critical/High/Medium/Low**), `file:line`, before/after snippet (where applicable), impact, concrete fix.
- **Positives** — what the PR does well.
- **Summary** — two to three sentences on real bugs found, correctness, and overall quality.

### Do Not Approve PRs That

- Fetch data from external APIs (OneMap, data.gov.sg) at runtime — those calls belong in `scripts/sync-data.ts` only
- Bypass D1 by hand-editing static data files or hosting JSON elsewhere
- Modify `migrations/*.sql` files retroactively — add a new numbered migration instead
- Break existing deployment assumptions or map attribution requirements
- Include `bun.lock`, `yarn.lock`, or `package-lock.json` (Node 26 + pnpm project)

### Review priorities

P1 (must fix before merge):

- Missing or outdated user-facing documentation in `docs/guide/` for user-visible changes.

### Platform-Specific Review Tooling

- **Claude**: triggered via `@claude review` PR comment.
- **Kiro**: review hooks configured in `.kiro/`.
- **Gemini / Codex**: triggered via PR comments (`/gemini review`, `@codex review`).

## Cursor Cloud specific instructions

### Environment

- **Node.js 26** is required (`engines.node >= 26.0.0`). Cursor Cloud's VM bootstrap script installs it via nvm and sets it as the default.
- **Vite+** (`vp`) is the package manager and task runner. `pnpm-lock.yaml` is the lockfile.

### Local data dev

The app loads all data from `/api/*` Pages Functions backed by Cloudflare D1. For local development:

- **UI-only iteration**: `vp dev` (Vite on `localhost:5173`) — useful for component work that doesn't exercise live data.
- **Full stack with D1**: `vp run dev:functions` runs `wrangler pages dev` against the local D1 emulator. Seed it once with `vp run db:migrate:local` and a fixture import (see `tests/fixtures/public-data/`).
- **Production sync**: `vp run sync-data` writes directly to remote D1; requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_D1_DATABASE_ID` env vars. Run from CI normally, not from a local box.

### Running services

- `vp dev` starts Vite on `localhost:5173` for UI work.
- `vp run dev:functions` starts Wrangler Pages dev with the D1 binding.
- Playwright E2E tests mock the `/api/*` Pages Functions (see `tests/e2e/fixtures.ts`); they do not require a live D1 binding.
- Unit tests use `NODE_OPTIONS=--no-experimental-webstorage` (already wired into `vp run test`).

### Standard commands

All lint/test/build/typecheck commands are listed in the "Useful local commands" section above and in `README.md`. Playwright E2E tests use Chromium exclusively.
