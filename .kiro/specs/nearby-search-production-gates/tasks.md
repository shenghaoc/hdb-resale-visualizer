# Tasks: Nearby Search Production Gates

> Execution checklist. Phases 1, 2 and 4a are done in this PR. Phase 3 is open and
> blocked on the owner creating the temporary Hyperdrive configuration. The
> feature flag is untouched.

## Phase 1 — Rate limiting

- [x] **T1.1** Add `shared/nearby-limits.ts` with the window, both limits and the
  shared origin key.
  -> One definition for code, config and docs. (R1.7)

- [x] **T1.2** Add `functions/_lib/nearby-rate-limit.ts`: `nearbyClientRateLimitKey`,
  `checkNearbyClientRateLimit`, `checkNearbyOriginRateLimit`.
  -> IPv4, IPv4-mapped and `/64` keys; fallback key; 429 and 503 with
  `Retry-After` and `no-store`; fail closed on a missing binding and on a throwing
  origin limiter, fail open only on a throwing client limiter. (R1.2, R1.4, R1.5,
  R1.6)

- [x] **T1.3** Wire the checks into `worker/index.ts`: client check before the
  cache, origin check inside the cache's miss path.
  -> Limited requests touch neither cache nor database; hits spend no origin
  budget. (R1.1, R1.3)

- [x] **T1.4** Declare `NEARBY_IP_LIMITER` and `NEARBY_ORIGIN_LIMITER` in
  `wrangler.jsonc` and `cloudflare-env.d.ts`.
  -> Namespaces `1003` and `1004`; flag still `"false"`. (R1.7, R3.1)

- [x] **T1.2a** The origin limiter fails closed: a throwing limiter refuses the request
  (503, `no-store`, logged); cache hits are unaffected. The client limiter stays
  fail-open.
  -> `tests/unit/nearby-rate-limit.test.ts`, `nearby-places-worker-gate.test.ts`.
  (R1.6)

- [x] **T1.5** Tests: `tests/unit/nearby-rate-limit.test.ts` and the extended
  `tests/unit/nearby-places-worker-gate.test.ts`.
  -> Key table, both checks, config pin, closed-gate tripwire, Worker-entry
  behaviour. Four mutations of the Worker code were caught. (R1.1-R1.7, R3.1)

## Phase 2 — Documentation

- [x] **T2.1** Add "Rate limiting and origin protection" to
  `docs/architecture/postgis-nearby.md` and update its release gates.
  -> Limits, key derivation, failure handling, approximation caveat, the
  remaining deployed-path gate. (R1.1-R1.7, R2.1)

## Phase 3 — Deployed-path verification (open)

- [x] **T3.1** Fork the serving branch, apply `sql/neon/001_postgis_nearby.sql`
  to the fork only and check the row counts.
  -> Done on `postgis-realpath-20261010` (`br-broad-cake-b3wl94ei`): 9,730
  blocks, 9,730 block points, 190 stations, 613 exits, 2 triggers. (R2.2)

- [x] **T3.1a** Local rehearsal of the whole check against a seeded local PostGIS
  database and the real Worker under workerd (`tests/deployed-path/`).
  -> 11 of 11 samples equal the shipped SQL; MISS then HIT on a canonical key;
  `429` after exactly 30 requests; `503` once the origin budget is spent; neither
  cached. Not the Hyperdrive path. (R2.4, R2.5)

- [ ] **T3.2** Create a temporary Hyperdrive configuration (query caching off,
  origin limit 5) for the fork.
  -> BLOCKED on the owner: it needs the runtime role's password (the fork inherits
  the serving branch's `hdb_benchmark_runtime` and its password), and generating or
  entering credentials is not something this work may do. The two commands are in
  `tests/deployed-path/README.md`. (R2.3)

- [ ] **T3.3** Build and deploy the temporary Worker with its own name, its own
  rate-limit namespace ids, a throwaway D1 database carrying migration 0012, the
  flag on and the origin limit lowered.
  -> Not started. (R2.3)

- [ ] **T3.4** Run the checks listed in the design (including the daily ceiling with
  a small `NEARBY_DAILY_STATEMENT_CEILING`) and record results in
  `docs/architecture/postgis-nearby.md`.
  -> Not started. (R2.4-R2.6)

- [ ] **T3.5** Tear down: delete the temporary Worker, its throwaway D1 database and
  the Hyperdrive configuration, and the local credential file. The disposable
  forks are deleted by the owner's instruction once this phase is done.
  -> Not started. (R2.7)

## Phase 4 — Validation

- [ ] **T4.1** Run `vp run check` and `vp run check:pr`; record the exit codes.
  -> Phase 1-2 gate recorded in the PR description.

- [x] **T4.2** Protect the Hyperdrive Free daily budget before the flag opens.
  -> Done as T4.4 to T4.6 below: one statement per miss, a global daily ceiling
  that fails closed, and an evaluation of precomputing the UI path. (R4.1-R4.7)

- [x] **T4.4** One statement per nearby miss: `NEARBY_LABELLED_SQL`, the
  `AtomicRead` cache mode, `readNearbyPlaces`, `PublicationLabel`.
  -> Measured on PostgreSQL 18.6: 10 misses, exactly 10 statements; a control
  route through the shared cache costs 3. Other routes unchanged. (R4.1, R4.5)

- [x] **T4.5** The global daily statement ceiling: `functions/_lib/nearby-budget.ts`,
  migration `0012_nearby_statement_budget.sql`, `NEARBY_DAILY_STATEMENT_CEILING`.
  -> Fails closed in every case listed in R4.4; real SQLite and the real D1
  emulator. (R4.2-R4.4, R4.6, R4.7)

- [x] **T4.6** Evaluate precomputing the nearest exits per block at publish time.
  -> `docs/architecture/nearby-exits-precompute-evaluation.md`: measured on the
  fork, recommended for the block panel as part of the serving-refresh work, not
  built.

- [ ] **T4.7** Owner decisions: the ceiling value (10,000, chosen without a
  measurement of the site's current Hyperdrive use); D1 against a Durable Object
  in a separate Worker for the counter; whether to adopt the precomputed list.

- [ ] **T4.3** Ask for approval before the spatial migration is applied to the
  serving branch, migration 0012 is applied to the remote D1 database, or the flag
  is opened. (R3.2, R4.7)
