# Repository Structure

## Directory Layout
- **`.kiro/`**: Centralized workspace steering and configuration.
  - **`steering/`**: Persistent repository rules, architecture, and UI standards. Loaded automatically by Kiro on every interaction.
  - **`specs/`**: Active or retained feature and bugfix specifications (Design → Requirements → Tasks).
  - **`skills/`**: Reusable agent skill packs with `SKILL.md` frontmatter, rules, and references.
  - **`settings/mcp.json`**: Workspace MCP configuration for repo-relevant tool integrations.
- **`src/`**: React application source code.
  - **`components/`**: UI components.
  - **`components/ui/`**: Base Shadcn components.
  - **`hooks/`**: Custom React hooks.
  - **`lib/`**: Domain logic, formatters, and i18n helpers.
  - **`types/`**: Zod schemas and TypeScript interfaces.
- **`functions/`**: Cloudflare Pages Functions.
  - **`api/`**: Runtime API endpoints backed by D1.
  - **`_lib/`**: Shared D1 helpers and query logic.
- **`shared/`**: Types and utilities shared between `src/` and `functions/`.
- **`worker/`**: Cloudflare Worker entry point (OG image generation, SEO routing).
- **`types/`**: Top-level ambient type declarations.
- **`scripts/`**: Build-time data pipeline.
  - **`lib/`**: Pipeline processing modules and shared sync helpers.
- **`migrations/`**: D1 schema migrations (`*.sql`). Never edit existing files — add new numbered migrations.
- **`tests/`**: Vitest and Playwright test suites.
  - **`fixtures/public-data/`**: Minimal static data fixtures for unit and E2E tests. **Tracked by git.**
- **`docs/`**: Screenshots and architecture reference docs.

## Naming Conventions
- **Components**: `PascalCase.tsx`.
- **Hooks**: `useCamelCase.ts`.
- **Lib/Utils**: `camelCase.ts`.
- **Steering files**: `kebab-case.md`.
- **Spec directories**: `kebab-case/` under `.kiro/specs/`.
- **Skill directories**: `kebab-case/` under `.kiro/skills/`, each with a `SKILL.md`.
- **Migrations**: `NNNN_description.sql` (monotonically increasing).

## Tooling Policy
- Do not vendor generic shadcn or design-system agent bundles into this repo.
- Use workspace MCP config (`.kiro/settings/mcp.json`) or external installs for generic external tooling.
- Agent-local config (`.agents/`) is untracked and out of repository history.
