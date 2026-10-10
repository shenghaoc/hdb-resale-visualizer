# Tasks: Nearby Search Production Gates

**No statement-budget counter is being implemented.** Keep `NEON_SPATIAL_ENABLED="false"` in the production Worker.

## Phase 1 — Local implementation and safe tests

- [x] Preserve `GET /api/nearby-places`, the SQL differential verifier, radius/grid/tie semantics and its single labelled SELECT.
- [x] Per-client limiter 30/60 s before caching; origin limiter 300/60 s for valid cache misses.
- [x] **Both** missing/faulty rate-limiting bindings fail closed; pin in Worker and unit tests.
- [x] Replace fixed-name destructive scratch databases with uniquely named, owner-tracked databases. Test existing-name refusal and cleanup.
- [x] Remove the rejected D1-budget table, migration, helper, mocks, tests and runbook references.

## Phase 2 — Documentation and cost boundary

- [x] Document that the rate limits are per location, approximate, and cannot enforce the global Hyperdrive Free daily statement allowance.
- [x] Keep production gate false. Public use is blocked until a new, explicitly approved global budget design.
- [x] Document the independent publish-time MRT-exit path in #432.

## Phase 3 — Isolated single-config deployed verification

- [ ] Record the disposable PostGIS fork identity and verify independent SQL fingerprints on it.
- [ ] With separate approval, create or use **one** temporary Hyperdrive config bound to the fork-specific SELECT-only role; never use the serving credentials.
- [ ] Deploy a temporary Worker with private namespace IDs and feature enabled **only there**.
- [ ] Exercise `functional`, `client-limit`, `origin-limit`, `latency`; capture outcomes as text, not uploaded evidence.
- [ ] Remove only verified disposable resources and report which ones were cleaned.

## Phase 4 — Production

- [ ] **NOT AUTHORISED:** enabling public `/api/nearby-places` requires a separate global budget control and independent approval, regardless of Phase 3 success.
