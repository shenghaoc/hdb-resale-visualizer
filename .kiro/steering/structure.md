---
inclusion: always
---

# Repository Structure

## Current Layout

- `.kiro/steering/`: persistent project rules.
- `.kiro/specs/`: Kiro feature and bugfix specs.
- `.kiro/skills/`: reusable agent skills.
- `src/`: React application source. The current code is still mostly organized as `src/components`, `src/components/ui`, `src/hooks`, `src/lib`, and `src/types`.
- `functions/api/`: runtime API route modules backed by D1.
- `functions/_lib/`: D1 query, validation, shortlist, search, and rate-limit helpers.
- `worker/`: Cloudflare Worker entry point, API dispatch, SEO routing, sitemap, OG image generation, and Worker-only helpers.
- `shared/`: types and pure utilities used across frontend, Worker/API, tests, and scripts.
- `scripts/`: Node-only build-time data pipeline and guard scripts.
- `types/`: top-level ambient TypeScript declarations.
- `migrations/`: D1 schema migrations. Add new numbered migrations; never edit old migrations retroactively.
- `tests/`: Vitest unit/component/hook/integration suites and Playwright E2E.
- `tests/fixtures/public-data/`: small tracked fixture artifacts for tests. Use this for schema and UI fixture work instead of `public/data`.
- `public/`: static assets only, including PWA icons, manifest, headers, OG fallback, favicon, and generated Temporal polyfill.
- `docs/`: screenshots and architecture reference material.

## Desired Frontend Organization

Move new and meaningfully touched frontend code toward a feature-first layout:

```text
src/features/listing-check
src/features/shortlist
src/features/map-explorer
src/features/search-profile
src/entities/transaction
src/entities/block
src/entities/town
src/shared-ui
```

Use this target structure for new modules when the change is not a narrow bugfix in existing files. Do not churn unrelated files just to migrate structure.

## Feature Boundaries

- `src/features/listing-check`: asking price checks, comparable ranges, affordability fit, lease financing panels, buyer checklist, negotiation prep, and confidence explanations.
- `src/features/shortlist`: saved blocks, notes, target prices, shortlist ranking/comparison, local persistence, cloud sync UI, and sync conflict handling.
- `src/features/map-explorer`: MapLibre shell, map layers, amenity overlays, heatmap controls, marker visibility, map selection, and mobile/desktop map navigation.
- `src/features/search-profile`: global search, suggest/typeahead, profile wizard, profile chips, query-state hydration, and buyer preference matching.
- `src/entities/transaction`: transaction types, parsing, price-per-area calculations, trend points, comparable transaction utilities, and transaction-specific tests.
- `src/entities/block`: block summary/detail models, block-level derived facts, lease signals, amenity visibility, similar-block scoring, and block tests.
- `src/entities/town`: town profile, town comparison, town recommendations, town slugs, and town-flat-type trend logic.
- `src/shared-ui`: reusable presentation components, shadcn wrappers, icons, layout primitives, loading states, and UI-only helpers that do not know HDB domain concepts.

## Dependency Direction

- Features may import entities, `src/shared-ui`, shared frontend utilities, and `shared/*`.
- Entities must stay domain-focused and must not import from features.
- `src/shared-ui` must not import HDB domain logic, D1/API helpers, or feature modules.
- Cross-runtime code used by scripts, Worker/API, and frontend belongs in `shared/`, not `src/`.
- Node-executed scripts must not import from `src/`; `pnpm check:boundaries` enforces this.
- Runtime API modules under `functions/` should not import React UI code or browser-only modules.

## Migration Guidance

- For narrow fixes, edit the existing module in place.
- For new buyer workflows, create a feature folder and colocate component, hook, lib, and tests around the workflow.
- When extracting from `src/lib`, move domain-specific logic into the relevant entity or feature. Keep truly generic utilities in `src/lib` until there is a clearer shared home.
- When extracting from `src/components`, put reusable UI-only pieces in `src/shared-ui`; put workflow-specific UI under the owning feature.
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
