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

- No intended user-visible behavior changes are permitted at any stage.
- Correctness fixes that enforce an existing documented contract are allowed when
  their scope is explicit and they have focused regression coverage.
- Each phase is small and independently verifiable through tests.
- Compatibility export points were used during transitions and removed once consumers pointed at canonical owners.
- Rollback was possible at each phase; the migration is now complete for the planned domains.

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
  - May import only `src/entities`, `src/shared/lib`, `src/types`, and repository-level `shared/*`.
  - No runtime import of `react`, `react-dom`, `maplibre-gl`, or `recharts`, including subpaths
    such as `react-dom/client`. Type-only imports of framework types are allowed.
  - Shared by multiple features.
  - Includes determinism-heavy logic (listing confidence, caveats, pricing comparables where it is domain math).
- `features/*`:
  - Feature orchestration, adapters, and state flow.
  - Owns hooks, components, and feature-specific selectors/DTO mapping.
  - Delegates pricing/comparable/confidence/caveat computations to `entities` or `shared/lib`.
- `shared-ui/*`:
  - Generic presentation only (no HDB domain concepts, no feature/entity imports).
  - May import React, presentation libraries, `src/components/ui`, and `src/shared/lib`.
- `shared/lib/*`:
  - Cross-cutting pure utilities used by multiple features/entities.
  - No runtime or framework side-effects.
- `components/*` holds app-shell or HDB-aware multi-feature UI that is not generic enough for `shared-ui`.
- Dependency direction and runtime source cycles are enforced by `scripts/check-boundaries.ts`.

## Scope rules

1. Preserve intended behavior. Output, UI states, sorting, filtering, calculations, and persistence semantics must remain unchanged. A correctness fix may prevent stale asynchronous work from violating an existing contract, but it must not redefine that contract.
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
- Phase 4: Shared UI, import cleanup, and architecture enforcement
  - Move generic presentation into `src/shared-ui`.
  - Drop obsolete compatibility paths.
  - Enforce entity/shared-ui direction and runtime cycle freedom via the boundary checker.

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

## Shortlist cloud-sync extraction slice

The shortlist phase may extract cloud-sync orchestration into
`src/features/shortlist/useShortlistSync.ts` while keeping the public
`useShortlist` surface unchanged. Hydration, enable/link operations, debounced
pushes, queued flushes, and rate-limit retries must ignore late results after
sync is disabled, a newer sync operation starts, or the hook unmounts. These
lifecycle guards protect the existing sync contract without changing API,
schema, merge precedence, queue format, or retry semantics.
