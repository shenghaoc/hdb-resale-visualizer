# Tasks: Serving Data Refresh

> Execution checklist. Phase 0 is this PR (evidence and plan). Phases 1 to 3 are
> code that writes no external state; the only external read is the mirror
> bootstrap in T3.1, which needs the owner's approval. Phases 4 to 7 change
> external state and each carries its own owner approval. Nothing here is scheduled.

## Phase 0 — Evidence and plan

- [x] **T0.1** Recover the publisher and its notes to a preserved branch.
  -> `feat/neon-refresh-publisher` at `b804464`, verbatim, with a provenance
  README.

- [ ] **T0.2** Port the publisher onto `main` and split it for review.
  -> Core publisher and its `workflow_dispatch` workflow (#423, below this PR in
  the stack). The benchmark and pilot harness stays in the recovery snapshot
  (`b804464`) and #424 carries only a documentation change. This item closes
  when #423 merges. What is left after that is not a port but the work of
  Phases 1 to 3 on top of #423: the manual publisher still validates one
  benchmark endpoint (T2.1), still applies without an approved plan hash (T2.2),
  still uses the D1-derived guards that reject a routine delta (T3.2), and the
  staged executor is still outside the repository.

- [x] **T0.3** Verify the facts this design rests on (C1 to C10).
  -> Read-only: Cloudflare Hyperdrive and Worker listing, a catalog query on a
  disposable fork of the serving branch, counts on the owner's local snapshot.
  (R1.1, R5.1)

- [x] **T0.4** Write requirements, design and tasks.
  -> This directory.

## Phase 1 — Schema-version-aware admission (offline; needed only for in-place publication)

> Blue/green is decided (2026-10-10): the publisher only ever writes the
> benchmark branch (schema version 0), so version 1 never needs admitting and an
> unknown catalog is already refused today. Build this phase only if the owner
> later reverses decision 1 and chooses in-place publication on a migrated
> branch.

- [ ] **T1.1** Build schema version 0 (the publisher schema,
  [`scripts/neon-benchmark/schema.sql`](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/scripts/neon-benchmark/schema.sql)
  in the recovery snapshot) in a local database, capture
  `SCHEMA_CATALOG_SQL`, and store it as `golden-catalog-v0.json`.
  -> Reproducible with one documented command. (R5.1, R5.2)

- [ ] **T1.2** Apply `sql/neon/001_postgis_nearby.sql` to a copy, capture the
  catalog, store `golden-catalog-v1.json`; pin the two triggers and three
  functions by definition.
  -> The only differences from v0 are the migration's own objects. (R5.2)

- [ ] **T1.3** Replace the executor's per-snapshot catalog pin with a lookup of the
  known versions; refuse an unknown catalog, an extra trigger or rule, or a
  changed function body, and print the difference.
  -> Tests: v0 and v1 admitted; a third trigger, a dropped trigger, an edited
  function body and a changed column type each refused. (R5.3)

## Phase 2 — Target registry and approval gate (offline)

- [ ] **T2.1** Add `neon-targets` with the benchmark target and a
  disposable-fork target that requires an explicit branch id. The serving and
  default branches are on a deny list, and the serving endpoint is not in the
  registry.
  -> Tests: serving host, unknown host, wrong database, deny-listed branch,
  missing TLS verification each refused. (R3.2)

- [ ] **T2.1a** Assert the target from the server, not only from the host name:
  Neon exposes `neon.project_id`, `neon.branch_id` and `neon.endpoint_id` as
  settings (read on a fork on 2026-10-10), so the publisher can compare them with
  the registry before the transaction begins.
  -> A URL whose host looks right but whose branch is not the registered one
  fails before any statement that reads data. The extra command is added to the
  command-shape pin. (R3.2)

- [ ] **T2.2** Make apply require `--approve-plan <sha256>`; recompute and refuse
  on mismatch; make `--plan` the default. The plan identity includes the
  publisher revision: the commit of a clean checkout and a SHA-256 digest of the
  SQL and schema files the run executes. A dirty working tree refuses both plan
  and apply. The workflow's apply mode checks out the commit named in the
  approved plan, not the branch tip.
  -> Tests: no hash, wrong hash, hash of a different source, the same plan from
  another commit, a dirty tree and an edited migration file each refused;
  workflow trigger test still shows `workflow_dispatch` only. (R3.1, R3.3)

## Phase 3 — Routine plan (offline, local PostgreSQL)

- [ ] **T3.1** Mirror bootstrap, reproducible from a clean checkout. The August
  `source.sqlite`, the saved October stage and the owner's digest receipts are
  on the owner's machine only, so the procedure does not depend on them:
  1. **approval:** one full read of the benchmark branch's nine public tables
     into a local PostgreSQL database, in one `REPEATABLE READ, READ ONLY`
     transaction. It is bounded: about 494 MB of transfer (493,707,924 B
     measured for the full corpus), counted as that month's one full read (R7.2,
     R8.4) and refused when the usage reading leaves less than the reserve.
  2. Compute the nine-table digests on the target, in the same snapshot, and on
     the local copy with the same SQL. The mirror is accepted only when all nine
     are equal (R4.4).
  3. Record the nine digests, the row counts and the manifest hash in the
     description of the pull request that implements this task. Every later run
     repeats step 2, so a damaged or stale mirror is detected before a plan.
  The owner's local files may be used to skip step 1, but a mirror built from
  them is accepted only by the same digest proof in step 2.
  -> Equal digests for all nine tables from a clean checkout, or the difference
  is reported and no plan is produced. (R4.4, R7.2)

- [ ] **T3.2** Derive the executor pins from the plan instead of the October
  allowance: publisher revision (T2.2), source identity, positive-fact hash,
  retained ledger, schema version, storage reserves.
  -> Test: the October plan still reproduces its recorded identity. (R2.1, R4.2)

- [ ] **T3.3** Plan summary and hash (publisher commit and input digest, counts
  per table, affected blocks and cohorts, ledger, COPY size, statements,
  storage, transfer, compute, unlocated-address count and change).
  -> Deterministic; golden test on a fixture; the hash changes when only the
  publisher revision changes. (R1.3, R2.1, R2.2, R3.1)

- [ ] **T3.4** Replay 24 historical months against a mirror, one transaction
  month at a time, to measure stage sizes, change counts and statement counts;
  record the distribution in the description of the pull request that
  implements this task.
  -> The change count per transaction month and the stage sizes for decision 3,
  with the method. The replay does not claim a weekly distribution: the dataset carries
  the transaction month, not the day a row appeared, so weekly batches and late
  or revised rows cannot be reconstructed. (R8.2, R8.3)

- [ ] **T3.4a** Make every plan summary carry the capture time of its source
  snapshot and the change count since the previous publication, so that real
  runs build the weekly record that history cannot give.
  -> Golden test: the summary has both fields. The record is the list of plan
  summaries in the run pull requests or workflow summaries, not a file in the
  repository. (R8.2)

- [ ] **T3.5** Run the executor against a local database restored from the
  mirror, including `snapshot-rejection`, `failure-before-manifest`, success,
  replay and the lost-commit recovery path.
  -> Receipts for each mode; replay is a no-op. (R4.1, R4.3, R9.1)

## Phase 4 — Rehearsal on Neon (owner approval: one disposable fork, quota)

- [ ] **T4.1** Fork the benchmark; run the digest proof, the plan and the apply on
  the fork with a fresh usage receipt.
  -> Measured wall time, WAL and storage growth; the fork is left for the owner to
  delete. (R7.1, R9.1)

## Phase 5 — Promotion runbook (owner approval at each marked step)

- [ ] **T5.1** Script and rehearse: fork, role defaults, migration 001, differential
  verifier, temporary Worker and Hyperdrive acceptance, teardown.
  -> Receipts; the verifier reports zero mismatches. (R6.1, R6.3)

- [ ] **T5.1a** After the benchmark base digest proof, run `sql/neon/publish_block_detail_nearby_mrt_exits.sql` on the unserved serving child (after PostGIS migration 001), then `sql/neon/verify_block_detail_nearby_mrt_exits.sql`: one independent SQL check per block detail in the candidate (key set and count derived from the candidate's `block_details`, not a fixed number), full coverage, the manifest marker, and the two digests of the candidate without its derived data, which must equal the benchmark's. Run the publication a second time and confirm it writes nothing. Measure JSON text growth, physical and WAL growth and the DML time separately. The child-only stage must not inflate the old COPY stage or alter upstream change-count guards. The procedure is in `docs/architecture/postgis-precomputed-mrt-exits.md`.
  -> Approve only if all checks pass and budgets have headroom. (R6.1a, R6.1b)

- [x] **T5.1b** Give the materialized exits a consumer. `nearbyMrtExits` is an optional field of the block detail in `shared/data-types.ts` and `addressDetailSchema`; `DetailDrawer` passes the parsed field to `NearbyMrtExits`, which renders it and makes no request. A populated array renders the exits, an empty array renders "none within range" and an absent field hides the section. The capability probe and the `/api/nearby-places` fetch are removed from the client (`nearbyMrtExitsApi.ts` is deleted); the endpoint and its tests stay, gated off. `docs/guide/` describes the visible change.
  -> Tests: each of the three states makes no request to `/api/nearby-capabilities` or `/api/nearby-places`; a detail without the field (the D1 shape) parses; the Neon and D1 detail routes return a populated list, an empty list and a missing field unchanged (`tests/unit/public-data-parity.test.ts`). (R6.1c)

- [ ] **T5.2** Rehearse the rollback: origin back to the previous child, pool
  restart, manifest check.
  -> Measured time to a consistent public manifest. (R6.2)

## Phase 6 — First refresh (owner approval)

- [ ] **T6.1** Run steps 1 to 5 of the runbook against current upstream and hand the
  plan hash to the owner.
  -> A plan the owner can approve or refuse.

- [ ] **T6.2** After approval: apply to the benchmark, verify, promote, flip,
  observe.
  -> Public manifest shows the new publication; previous child kept. (R1.1, R6.1)

## Phase 7 — Cadence (owner approval)

- [x] **T7.1a** Decide the cadence: weekly under the existing 1,000 guard, once the
  monthly transfer cost is confirmed to fit (2026-10-10).
  -> Design "Cadence budget": about 0.50 GB of 5 GB for the mirror-verified
  procedure. Requirements R8.1, R8.2 and R8.4 updated.

- [ ] **T7.1** Re-check the guard with the monthly figures from T3.4 and, once
  eight weekly runs have been recorded, the weekly change counts from T3.4a;
  record any change to R8.2 and R8.3 (a changed guard is a reviewed repository
  change).
  -> Requirements R8.2 and R8.3 updated with the measured values.

- [ ] **T7.2** Keep the workflow `workflow_dispatch` only until the owner approves a
  schedule.
  -> Existing pin test stays green. (R3.3)

## Phase 8 — Validation

- [ ] **T8.1** Run `vp run check` and `vp run check:pr` on each code PR and record
  the exit codes in the PR description.
