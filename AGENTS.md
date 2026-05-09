# AI Agent Steering (Kiro Workflow)

This repository follows the **Kiro** spec-driven development workflow. All agent intelligence, architectural mandates, and transient specifications are centralized in the `.kiro/` directory.

## 🚀 Core Mandate: Read Steering First
Before executing any directive, agents MUST read the authoritative steering files to maintain the project's strict architectural boundaries:
- [**Product Vision**](.kiro/steering/product.md) — Map-first, deterministic facts only.
- [**Technical Constraints**](.kiro/steering/tech.md) — 100% static, Node 26 + npm-only, no runtime geocoding.
- [**Data Pipeline**](.kiro/steering/pipeline.md) — Strict separation between `scripts/` (build) and `src/` (runtime).
- [**Repository Structure**](.kiro/steering/structure.md) — Naming conventions and project layout.
- [**UI/UX Standards**](.kiro/steering/ui-standards.md) — Shadcn composition and high-density standards.

## 🛡️ Workspace MCP Config
Workspace MCP configuration lives in [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json).
Use it for repo-relevant tool integrations such as shadcn MCP, but keep generic external tooling and personal machine setup out of the committed repository configuration.

## 📈 Active Work (Specs)
Current initiatives follow the **Kiro Tech-Design-First** workflow. Specs are located in `.kiro/specs/` and follow a strict **Design → Requirements → Tasks** hierarchy.
- [**Header & Map Control Fixes**](.kiro/specs/header-blocks-map-controls/tasks.md) — PR#35 tracking.
- [**UI Redesign**](.kiro/specs/redesign-ui/tasks.md) — Visual grounding and sharing.
- [**IME Composition Input**](.kiro/specs/ime-composition-input/tasks.md) — Input-composition bugfix track.

## ⚡ Automation (Hooks)
Project-level automation triggers are defined in `.kiro/hooks/`. These hooks execute actions on file events or agent lifecycle stages.
- *No active hooks configured.*

## 🛠️ Local Commands
```bash
npm install           # Install dependencies
npm run dev           # Start development server (localhost:5173)
npm run sync-data     # Refresh precomputed artifacts (public/data/)
npm run typecheck     # Strict TypeScript verification
npm run lint          # ESLint check
npm run test          # Run Vitest unit/integration tests
npm run test:e2e      # Run Playwright end-to-end tests
npm run build         # Production build
```

## 🏗️ Architectural Boundary
1. **Zero Runtime APIs**: The frontend (`src/`) only loads from `public/data/`.
2. **Build-Time Data**: All geocoding and MRT distance calculations happen in `scripts/`.
3. **Persistence**: All user state is strictly browser-local (`localStorage`).

## 🔍 Code Review

Use the `/review-pr` slash command to trigger a full review. It spawns five specialist subagents in parallel and posts a structured top-level comment plus inline annotations.

Specialist agents live in [`.claude/agents/`](.claude/agents/):
- [`code-quality-reviewer`](.claude/agents/code-quality-reviewer.md) — React/TS correctness, semantic state bugs, dead code, CSS selector validity
- [`performance-reviewer`](.claude/agents/performance-reviewer.md) — hot-path allocations, MapLibre re-renders, memoisation gaps
- [`security-code-reviewer`](.claude/agents/security-code-reviewer.md) — URL payload abuse, CSV injection, XSS, data leakage
- [`test-coverage-reviewer`](.claude/agents/test-coverage-reviewer.md) — Vitest + Playwright gaps, edge cases, cache reset hygiene
- [`architecture-reviewer`](.claude/agents/architecture-reviewer.md) — pipeline/runtime boundary, artifact contract sync, package manager compliance

### Do Not Approve PRs That
- Introduce backend routes or runtime server-side logic
- Fetch data from external APIs at runtime (`src/` must only read `public/data/`)
- Break existing deployment assumptions or map attribution requirements
- Manually edit generated files under `public/data/` (owned by `scripts/sync-data.ts`)
- Include `bun.lock`, `yarn.lock`, or `pnpm-lock.yaml` (Node 26 + npm-only project)
