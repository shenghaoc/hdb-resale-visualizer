---
inclusion: always
---

# Repository Structure

## Current Layout

- `.kiro/steering/`: persistent project rules.
- `.kiro/specs/`: Kiro feature and bugfix specs.
- `.kiro/skills/`: reusable agent skills.
- `src/`: React application source, organized feature-first:
  - `src/features/listing-check`
  - `src/features/shortlist`
  - `src/features/map-explorer`
  - `src/features/search-profile`
  - `src/features/block-detail`
  - `src/entities/transaction`
  - `src/entities/block`
  - `src/entities/town`
  - `src/shared-ui` — generic presentation only
  - `src/shared/lib` — generic frontend helpers
  - `src/components/ui` — shadcn primitives
  - `src/components` — app-shell or HDB-aware components that do not belong to a single feature
  - `src/hooks` — residual cross-feature app orchestration hooks
  - `src/types` — frontend type re-exports and local types
- `functions/api/`: runtime API route modules backed by D1.
- `functions/_lib/`: D1 query, validation, shortlist, search, and rate-limit helpers.
- `worker/`: Cloudflare Worker entry point, API dispatch, SEO routing, sitemap, OG image generation, and Worker-only helpers.
- `shared/`: types and pure utilities used across frontend, Worker/API, tests, and scripts.
- `scripts/`: Node-only build-time data pipeline and guard scripts.
- `types/`: top-level ambient TypeScript declarations.
- `migrations/`: D1 schema migrations. Add new numbered migrations; never edit old migrations retroactively.
- `tests/`: Vitest unit/component/hook/integration suites and Playwright E2E.
- `tests/fixtures/public-data/`: small tracked fixture artifacts for tests. Use this for schema and UI fixture work instead of `public/data`.
- `public/`: static assets only, including PWA icons, manifest, headers, OG fallback, and favicon.
- `docs/`: screenshots and architecture reference material.

## Frontend Organization

Completed feature-first layout:

```text
src/features/listing-check
src/features/shortlist
src/features/map-explorer
src/features/search-profile
src/features/block-detail

src/entities/transaction
src/entities/block
src/entities/town

src/shared-ui
src/shared/lib
src/components/ui
```

New buyer workflows should land under the owning feature. Not every remaining multi-consumer component must move into `shared-ui` — only genuinely generic presentation belongs there. Domain-aware shared pieces (budget badges, MRT dots, lease warnings, buyer checklist, etc.) stay outside `shared-ui` intentionally.

## Feature Boundaries

- `src/features/listing-check`: asking price checks, comparable ranges, affordability fit, buyer checklist composition, negotiation prep, and confidence explanations.
- `src/features/shortlist`: saved blocks, notes, target prices, shortlist ranking/comparison, local persistence, cloud sync UI, and sync conflict handling.
- `src/features/map-explorer`: MapLibre shell, map layers, amenity overlays, heatmap controls, marker visibility, map selection, and mobile/desktop map navigation.
- `src/features/search-profile`: global search, suggest/typeahead, profile wizard, profile chips, query-state hydration, and buyer preference matching.
- `src/features/block-detail`: block detail drawer, lease financing panel, flat-type ladder, trend chart, and block-detail orchestration.
- `src/entities/transaction`: transaction types, parsing, price-per-area calculations, trend points, comparable transaction utilities, confidence/caveat pure logic, and transaction-specific tests.
- `src/entities/block`: block summary/detail models, block-level derived facts, lease signals, financing math, flat-type ladder, school proximity, similar-block scoring, and block tests.
- `src/entities/town`: town profile, town comparison, town slugs, and town-flat-type trend logic.
- `src/shared-ui`: generic presentation only (e.g. ErrorBoundary, ShareButton, DrawerSkeleton). No HDB domain concepts, no feature/entity imports.
- `src/components/ui`: existing shadcn primitives (do not rename or relocate).
- `src/components`: app-shell or HDB-aware components that span features without a single feature owner.

## Dependency Direction

- Features may import entities, `src/shared-ui`, `src/shared/lib`, `src/components` (including ui), and repository-level `shared/*`.
- Entities must stay domain-focused. They may import only `src/entities`, `src/shared/lib`, `src/types`, and repository-level `shared/*` — never features, shared-ui, components, or `src/hooks`. Entities are also framework-free: no runtime import of `react`, `react-dom`, `maplibre-gl`, or `recharts` (subpaths such as `react-dom/client` included). Type-only imports of framework types are allowed.
- `src/shared-ui` is generic presentation only. It may import npm presentation packages (React, icon/UI libraries) and, under `src/`, only `src/shared-ui`, `src/components/ui`, and `src/shared/lib`. It must not import features, entities, non-ui components, `src/hooks`, or HDB-domain type modules (`src/types/data`, `src/types/searchProfile`, `shared/data-types`).
- Cross-runtime code used by scripts, Worker/API, and frontend belongs in `shared/`, not `src/`.
- Node-executed scripts must not import from `src/`; `pnpm check:boundaries` enforces this.
- Runtime API modules under `functions/` should not import React UI code or browser-only modules.
- Feature-internal files must not import their own feature barrel (`@/features/<name>`); use direct relative or explicit module paths. This one is convention, not enforced by the checker.
- The boundary checker enforces the entity and shared-ui allowlists above and detects runtime import cycles under `src/` (type-only edges are excluded). Direction rules apply to type-only imports too; only the framework-package rule is runtime-only.

## Migration Guidance

- Feature-first migration (phases 1–13) is complete for the planned domains.
- For narrow fixes, edit the owning feature/entity module in place.
- For new buyer workflows, create or extend a feature folder and colocate component, hook, lib, and tests around the workflow.
- Put reusable UI-only pieces in `src/shared-ui` only when they are free of HDB domain concepts.
- Keep tests close in naming and ownership: feature tests should exercise the feature API, entity tests should exercise pure domain logic, and E2E should cover cross-feature buyer journeys.

## Naming Conventions

- Components: `PascalCase.tsx`.
- Hooks: `useCamelCase.ts`.
- Lib and utilities: `camelCase.ts`.
- Tests: `*.test.ts` or `*.test.tsx`.
- Steering files: `kebab-case.md`.
- Spec directories: `kebab-case/` under `.kiro/specs/`.
- Skill directories: `kebab-case/` under `.kiro/skills/`, each with a `SKILL.md`.
- Migrations: `NNNN_snake_case_description.sql`.

## Tooling Policy

- Do not vendor generic shadcn or design-system agent bundles into the repo.
- Use `.kiro/settings/mcp.json` only for workspace-relevant MCP integrations.
- Agent-local config such as `.agents/` stays out of repository history unless explicitly requested.
