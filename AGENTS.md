# AI Agent Steering (Kiro Workflow)

This repository follows the **Kiro** spec-driven development workflow. All agent intelligence, architectural mandates, and transient specifications are centralized in the `.kiro/` directory.

## 🚀 Core Mandate: Read Steering First
Before executing any directive, agents MUST read the authoritative steering files to maintain the project's strict architectural boundaries:
- [**Product Vision**](.kiro/steering/product.md) — Map-first, deterministic facts only.
- [**Technical Constraints**](.kiro/steering/tech.md) — 100% static, Bun-only, no runtime geocoding.
- [**Data Pipeline**](.kiro/steering/pipeline.md) — Strict separation between `scripts/` (build) and `src/` (runtime).
- [**Repository Structure**](.kiro/steering/structure.md) — Naming conventions and project layout.
- [**UI/UX Standards**](.kiro/steering/ui-standards.md) — Shadcn composition and high-density standards.

## 🛡️ Active Powers (MCP & Steering Bundles)
Powers bundle steering with specific tool capabilities (MCP). 
- [**HDB Visualizer Core**](.kiro/powers/core/POWER.md) — Tech stack and UI onboarding.
- [**MCP Developer Tools**](.kiro/powers/mcp/POWER.md) — Filesystem, Playwright, and GitHub integration.

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
bun install           # Install dependencies
bun run dev           # Start development server (localhost:5173)
bun run sync-data     # Refresh precomputed artifacts (public/data/)
bun run typecheck     # Strict TypeScript verification
bun run lint          # ESLint check
bun run test          # Run Vitest unit/integration tests
bun run test:e2e      # Run Playwright end-to-end tests
bun run build         # Production build
```

## 🏗️ Architectural Boundary
1. **Zero Runtime APIs**: The frontend (`src/`) only loads from `public/data/`.
2. **Build-Time Data**: All geocoding and MRT distance calculations happen in `scripts/`.
3. **Persistence**: All user state is strictly browser-local (`localStorage`).

## 🔍 Code Review Policy
When reviewing pull requests, check for:
- Functional correctness and logical bugs
- Code quality, maintainability, and unnecessary complexity
- React performance (state/effect/lifecycle mistakes, unnecessary rerenders)
- Data pipeline contract violations (ensure `scripts/lib/schemas.ts` and `src/types/data.ts` are synchronized)
- Package manager drift (Bun-only — no npm/yarn/pnpm lockfiles)
- Runtime geocoding violations (all coordinates must be precomputed in `scripts/`)
- Runtime fetching from external APIs (all data must be loaded from precomputed `public/data/` artifacts)
- Missing tests for non-trivial logic changes
- Weak TypeScript types and type safety issues

Do not approve PRs that:
- Introduce backend routes or runtime server-side logic
- Fetch data from external APIs at runtime
- Break existing deployment assumptions or map attribution requirements
- Manually edit generated files under `public/data/` (these are owned by `scripts/sync-data.ts`)
- Include `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` (Bun-only project)
