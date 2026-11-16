# Tasks: Nearby Search Production Gates

`NEON_SPATIAL_MODE` is `off` or `blocks`. Arbitrary-coordinate search is not authorised in any mode.

## Phase 1 — Local implementation and safe tests

- [x] Preserve `GET /api/nearby-places`, the SQL differential verifier, the nearest-exit-per-station and tie semantics and the single labelled SELECT.
- [x] Per-client limiter 30/60 s before caching; origin limiter 300/60 s for valid cache misses.
- [x] **Both** missing/faulty rate-limiting bindings fail closed; pin in Worker and unit tests.
- [x] Replace fixed-name destructive scratch databases with uniquely named, owner-tracked databases. Test existing-name refusal and cleanup. The helper, its tests and the rehearsal that uses it are not in the repository; their last version is commit `c7b2f6b` in this pull request's history.
- [x] Remove the rejected D1-budget table, migration, helper, mocks, tests and runbook references.

## Phase 2 — Documentation and cost boundary

- [x] Document that the rate limits are per location, approximate, and cannot enforce the global Hyperdrive Free daily statement allowance.
- [x] Document the independent publish-time MRT-exit path in #432.

## Phase 3 — Isolated single-config deployed verification

> The harness for this phase is not in the repository. Its last version is commit `c7b2f6b` in this pull request's history: add it in a scratch worktree (`git worktree add ../harness c7b2f6b91be4e135d26757d999eb86cf09bb1e33`) and follow its [runbook](https://github.com/shenghaoc/hdb-resale-visualizer/blob/c7b2f6b91be4e135d26757d999eb86cf09bb1e33/tests/deployed-path/README.md).

- [ ] Record the disposable PostGIS fork identity and verify independent SQL fingerprints on it.
- [ ] With separate approval, create or use **one** temporary Hyperdrive config bound to the fork-specific SELECT-only role; never use the serving credentials.
- [ ] Deploy a temporary Worker with private namespace IDs and feature enabled **only there**.
- [ ] Exercise `functional`, `client-limit`, `origin-limit`, `latency`; capture outcomes as text, not uploaded evidence.
- [ ] Remove only verified disposable resources and report which ones were cleaned.

## Phase 4 — Block-only mode and the global budget

- [x] Replace `NEON_SPATIAL_ENABLED` with `NEON_SPATIAL_MODE` (`off` | `blocks`); `/api/nearby-capabilities` reports the mode in effect.
- [x] `GET /api/nearby-places?block=<address_key>` only; coordinates answer `400`; the block's location is looked up inside the single statement.
- [x] Unknown block: `404` from the published block list, with no nearby statement.
- [x] Global daily miss budget of 20,000 statements per UTC day in one Durable Object, consulted only on a cache miss, failing closed; the number pinned between `shared/nearby-limits.ts` and `wrangler.jsonc`.
- [x] The block drawer asks by address key; the D1 rollback path hides the control.
- [ ] Owner: merge, which deploys `NEON_SPATIAL_MODE=blocks` and creates the Durable Object. The serving branch must already carry `sql/neon/001_postgis_nearby.sql`.
- [ ] **NOT AUTHORISED:** search around arbitrary coordinates.
