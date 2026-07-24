# Feature-First Refactor Requirements

## Requirements

### R1 — Target Feature Boundaries

WHEN the refactor is complete,
THEN the following directories SHALL exist and become the owning source locations:

- `src/features/listing-check`
- `src/features/shortlist`
- `src/features/map-explorer`
- `src/features/search-profile`
- `src/features/block-detail`

### R2 — Target Entity Boundaries

WHEN transaction domain data, helpers, and computations are needed,
THEN they SHALL be defined in `src/entities/transaction` and not recreated inside components.

WHEN block-specific domain data, helpers, and computations are needed,
THEN they SHALL be defined in `src/entities/block`.

WHEN town-specific domain data, helpers, and computations are needed,
THEN they SHALL be defined in `src/entities/town`.

### R3 — Business Logic Separation

WHEN a listing check, comparable range, confidence score, or caveat calculation is performed,
THEN the computation SHALL run from pure TypeScript modules under:

- `src/entities/transaction`, `src/entities/block`, `src/entities/town`, or
- `src/shared/lib`.

UI components SHALL consume computed results and SHALL NOT perform those calculations inline.

### R4 — Feature-Local Logic Placement

WHEN listing-check behavior is implemented (pricing verdicts, comparable matching, caveat generation),
THEN its orchestration files SHALL live in `src/features/listing-check`.

WHEN shortlist behavior is implemented (list state operations, ranking helper calls, sync handoff),
THEN its orchestration files SHALL live in `src/features/shortlist`.

WHEN map browsing interactions are implemented,
THEN map orchestration files SHALL live in `src/features/map-explorer`.

WHEN search profile flow is implemented,
THEN related flow files SHALL live in `src/features/search-profile`.

WHEN block-level detail rendering and local block computations are implemented,
THEN related files SHALL live in `src/features/block-detail`.

### R5 — Shared UI and Utility Boundaries

WHEN a UI abstraction is used by two+ features,
THEN it SHALL be moved to `src/shared-ui` or `src/shared/lib` depending on its type.

### R6 — Barrel exports policy

WHEN import readability is materially improved,
THEN barrel exports may be added.

WHEN imports are already explicit and readable,
THEN avoid new barrels to reduce hidden coupling.

### R7 — Test locality

WHEN feature/domain logic is moved,
THEN related tests SHALL be located close to the owning feature/entity.
This includes `tests` adjacency for non-component behavior where practical.

### R8 — Non-functional constraints

WHEN refactor code compiles and tests run,
THEN there SHALL be:

- No intended user-visible runtime behavior change. A correctness fix MAY
  prevent stale asynchronous work from violating an existing documented
  contract, but SHALL NOT redefine that contract.
- No API contract changes.
- No navigation/state regressions.
- No pricing/logic output drift.

### R9 — Incremental delivery and validation

WHEN any migration step is completed,
THEN:

- Existing tests for that area remain passing.
- Broader smoke checks pass for impacted surfaces.
- No behavior delta is introduced before proceeding to the next migration step.

### R10 — Shortlist sync lifecycle safety

WHEN a shortlist sync request resolves after sync has been disabled, a newer
sync operation has started, or the hook has unmounted,
THEN the stale result SHALL NOT restore the sync code or status, apply stale
items, clear newer queued data, or schedule a follow-up flush.

WHEN cloud-sync orchestration is extracted into the shortlist feature,
THEN hydration, enable/link, debounced push, queued flush, and rate-limit retry
paths SHALL retain their existing merge, queue, and retry semantics while
honouring this lifecycle-safety rule.

## Completion Criteria

- Listing check logic has an owning feature path in `src/features/listing-check`.
- Transaction types/helpers are in `src/entities/transaction`.
- Shortlist logic has an owning feature path in `src/features/shortlist`.
- UI components only render/compose and do not own pricing math.
- The refactor is behavior-neutral according to test evidence and manual parity checks.
