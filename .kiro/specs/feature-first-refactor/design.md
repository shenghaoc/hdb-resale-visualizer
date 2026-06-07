# Feature-First Refactor

## Overview

This spec defines a staged refactor that reorganizes the codebase into **feature-first**
application structure while preserving user-facing behavior.

The final target structure is:

- `src/features/listing-check`
- `src/features/shortlist`
- `src/features/map-explorer`
- `src/features/search-profile`
- `src/features/block-detail`
- `src/entities/transaction`
- `src/entities/block`
- `src/entities/town`
- `src/shared-ui`
- `src/shared/lib`

The migration is intentionally incremental to reduce risk:

- No behavior changes are permitted at any stage.
- Each phase is small and independently verifiable through tests.
- Existing imports are kept stable through compatibility export points during transitions.
- Rollback is possible at each phase.

## Why this direction

Current structure places domain logic, data transformation, and React orchestration in mixed folders.  
Moving to feature-first structure improves:

- Change locality (related code in one directory)
- Reviewability (logic and UI grouped by business area)
- Test locality (tests colocated with feature logic)
- Long-term maintainability (clear boundaries between entities and features)

## Architecture boundaries for this refactor

- `entities/*`:
  - Pure TypeScript types and business logic (no React dependencies).
  - Shared by multiple features.
  - Includes determinism-heavy logic (listing confidence, caveats, pricing comparables where it is domain math).
- `features/*`:
  - Feature orchestration, adapters, and state flow.
  - Owns hooks, components, and feature-specific selectors/DTO mapping.
  - Delegates pricing/comparable/confidence/caveat computations to `entities` or `shared/lib`.
- `shared-ui/*`:
  - Reusable, presentation-oriented UI primitives that span multiple features.
- `shared/lib/*`:
  - Cross-cutting pure utilities used by multiple features/entities.
  - No runtime or framework side-effects.
- `components/*` and `hooks/*` can continue to host legacy code during migration, but new work should land in target folders.

## Scope rules

1. Preserve behavior. Output, UI states, sorting, filtering, calculations, and persistence semantics must remain unchanged.
2. Move pure business logic out of React components and into feature/entity modules.
3. Keep listing-pricing, comparable, confidence, and caveat logic in pure TypeScript modules.
4. Keep imports understandable:
   - Prefer explicit relative imports within feature/entity boundaries.
   - Add barrel exports only where they measurably reduce import noise.
5. Keep tests near feature logic and logic modules (component tests near their feature; unit logic tests near domain modules).
6. Do not change API, schema, or runtime architecture boundaries.

## Proposed phased topology

- Phase 1: Inventory, boundaries, and compatibility layer
  - Identify all current owners of target logic and consumers.
  - Add thin re-export files so behavior is unchanged while moving modules.
- Phase 2: Extract entities
  - Pull transaction/block/town domain types and logic into entity folders.
- Phase 3: Move feature logic
  - Relocate feature-specific orchestration and components by one feature at a time.
  - Keep UI untouched during domain extraction; move behavior in a later step only after pure logic is available.
- Phase 4: Defer component churn and tighten imports
  - Replace `components/*` and `hooks/*` imports with feature/entity imports.
  - Drop compatibility exports when no consumers remain.

## Test and verification strategy

Every phase must complete with:

- Targeted tests for affected logic/features passing.
- Existing broader suites for unchanged behavior where affected by phase.
- A parity checklist comparing:
  - listings/pricing outputs,
  - shortlist operations (add/remove/update notes/target price, sync metadata),
  - map interactions and selection flow,
  - search-profile and block-detail navigation and data rendering.

No phase is complete without explicit behavioral verification against pre-refactor output.
