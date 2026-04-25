# Repository Structure

## Directory Layout
- **`.kiro/`**: Centralized intelligence and steering.
  - **`steering/`**: Persistent domain knowledge and rules.
  - **`specs/`**: Transient feature/bugfix specifications.
  - **`powers/`**: Dynamic MCP tool and steering bundles.
- **`src/`**: React application source code.
  - **`components/`**: UI components.
  - **`components/ui/`**: Base Shadcn components.
  - **`hooks/`**: Custom React hooks.
  - **`lib/`**: Domain logic, formatters, and I18n.
  - **`types/`**: Zod schemas and TypeScript interfaces.
- **`scripts/`**: Build-time data pipeline.
  - **`lib/`**: Pipeline processing modules.
- **`public/data/`**: Precomputed data artifacts (JSON/GeoJSON).
- **`data/cache/`**: Intermediate build caches (e.g., geocodes).
- **`tests/`**: Vitest and Playwright test suites.

## Naming Conventions
- **Components**: `PascalCase.tsx`.
- **Hooks**: `useCamelCase.ts`.
- **Lib/Utils**: `camelCase.ts`.
- **Data Artifacts**: `kebab-case.json`.
