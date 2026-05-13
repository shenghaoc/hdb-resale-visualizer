# AI Agent Quickstart (Kiro Workflow)

Use this file as a **thin router**. Keep task execution focused; treat deeper process docs as references only when relevant.

## 🚀 Core Mandate: Read Steering First
Before executing any directive, agents MUST read the authoritative steering files to maintain the project's strict architectural boundaries:
- [**Product Vision**](.kiro/steering/product.md) — Map-first, deterministic facts only.
- [**Technical Constraints**](.kiro/steering/tech.md) — 100% static, Node 26 + npm-only, no runtime geocoding.
- [**Data Pipeline**](.kiro/steering/pipeline.md) — Strict separation between `scripts/` (build) and `src/` (runtime).
- [**Repository Structure**](.kiro/steering/structure.md) — Naming conventions and project layout.
- [**UI/UX Standards**](.kiro/steering/ui-standards.md) — Shadcn composition and high-density standards.
- [**Review Policy**](.kiro/steering/review.md) — Formal PR review workflow and severity framework.

## 🛡️ Workspace MCP Config
Workspace MCP configuration lives in [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json).
Use it for repo-relevant tool integrations such as shadcn MCP, but keep generic external tooling and personal machine setup out of the committed repository configuration.

## 📈 Active Work (Specs)
Current initiatives follow the **Kiro Tech-Design-First** workflow. Specs are located in `.kiro/specs/` and follow a strict **Design → Requirements → Tasks** hierarchy.
- [**Header & Map Control Fixes**](.kiro/specs/header-blocks-map-controls/tasks.md) — PR#35 tracking.
- [**UI Redesign**](.kiro/specs/redesign-ui/tasks.md) — Visual grounding and sharing.
- [**IME Composition Input**](.kiro/specs/ime-composition-input/tasks.md) — Input-composition bugfix track.

## 4) Useful local commands
```bash
npm install           # Install dependencies
npm run dev           # Start development server (localhost:5173)
npm run sync-data     # Refresh precomputed artifacts (public/data/)
npm run typecheck     # Strict TypeScript verification
npm run lint          # ESLint with type-aware rules (default)
npm run lint:fast     # ESLint syntax-focused pass (faster local fallback)
npm run test          # Run Vitest unit/integration tests
npm run test:e2e      # Run Playwright end-to-end tests
npm run build         # Production build
```

## 🏗️ Architectural Boundary
1. **Zero Runtime APIs**: The frontend (`src/`) only loads from `public/data/`.
2. **Build-Time Data**: All geocoding and MRT distance calculations happen in `scripts/`.
3. **Persistence**: All user state is strictly browser-local (`localStorage`).
4. **Agent Context**: Agents MUST NOT read, glob, index, summarize, or load `public/data/` into context unless explicitly asked. Respect `.gitignore` by default. Use `tests/fixtures/public-data/` if data schema analysis is required.

## 🔍 Code Review Policy

This policy applies to **all review agents** (Claude, Gemini, Kiro, Codex). Platform-specific tooling is configured separately per agent (see below).

### Review Process
1. **Read ALL changed files** in full — never comment on a diff excerpt in isolation.
2. **Cross-reference existing automated reviews** — confirm which flagged issues are already fixed in the latest commit and which remain open. Acknowledge both explicitly.
3. **Trace semantic dependencies** — when a refactor splits or merges state, find every consumer of the old shape and verify each condition is correctly updated.
4. **Inspect CSS against the real DOM hierarchy** — descendant selectors require the target to be *inside* the ancestor in JSX; a conditionally applied class needs a compound selector (`.a.b`), not a descendant one.
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
- `fetch()` in `src/` targeting external domains (OneMap, data.gov.sg) — critical
- Geocoding or MRT distance calculations in `src/` — critical
- `public/data/` files manually edited — owned by `scripts/sync-data.ts`
- `scripts/lib/schemas.ts` changed without matching update to the corresponding TypeScript types in `shared/data-types.ts` (or vice versa)
- `bun.lock`, `yarn.lock`, or `pnpm-lock.yaml` present — Node 26 + npm only

### Output Format
The following structured format applies to the overall PR review summary comment, not individual inline line-level comments:
- **Overview** — one paragraph on the approach and whether it is sound.
- **Automated Review Status** — which bot-flagged issues are resolved vs. still open.
- **Issues Found** — severity (**Critical/High/Medium/Low**), `file:line`, before/after snippet (where applicable), impact, concrete fix.
- **Positives** — what the PR does well.
- **Summary** — two to three sentences on real bugs found, correctness, and overall quality.

### Do Not Approve PRs That
- Introduce backend routes or runtime server-side logic
- Fetch data from external APIs at runtime (`src/` must only read `public/data/`)
- Break existing deployment assumptions or map attribution requirements
- Manually edit generated files under `public/data/` (owned by `scripts/sync-data.ts`)
- Include `bun.lock`, `yarn.lock`, or `pnpm-lock.yaml` (Node 26 + npm-only project)

### Platform-Specific Review Tooling
- **Claude**: triggered via `@claude review` PR comment.
- **Kiro**: review hooks configured in `.kiro/`.
- **Gemini / Codex**: triggered via PR comments (`/gemini review`, `@codex review`).

## Cursor Cloud specific instructions

### Environment
- **Node.js 26** is required (`engines.node >= 26.0.0`). The update script installs it via nvm and sets it as default.
- **npm** is the only package manager (no yarn/pnpm/bun). `package-lock.json` is the lockfile.

### Data fixtures for local dev
The app loads static JSON from `public/data/` at runtime. This directory is gitignored and empty by default.
For local development and E2E tests, copy test fixtures: `mkdir -p public/data && cp -R tests/fixtures/public-data/. public/data/`.
Running `npm run sync-data` fetches live data from data.gov.sg/OneMap APIs and is **not** needed for development or testing.

### Running services
- `npm run dev` starts Vite on `localhost:5173`. No backend or database is required.
- Playwright E2E tests (`npm run test:e2e`) auto-start a dev server on port 4173; no manual server start needed.
- Unit tests use `NODE_OPTIONS=--no-experimental-webstorage` (already wired into `npm run test`).

### Standard commands
All lint/test/build/typecheck commands are listed in the "Useful local commands" section above and in `README.md`. Playwright requires Chromium: `npx playwright install --with-deps chromium`.
