# Tasks: Serving Data Refresh

> Execution checklist. Phase 0 is this PR (evidence and plan). Phases 1 to 3 are
> code that needs no external state. Phases 4 to 7 change external state and each
> carries its own owner approval. Nothing here is scheduled.

## Phase 0 — Evidence and plan

- [x] **T0.1** Recover the publisher and its notes to a preserved branch.
  -> `feat/neon-refresh-publisher` at `b804464`, verbatim, with a provenance
  README.

- [ ] **T0.2** Port the publisher onto `main` and split it for review.
  -> Core publisher (#423) and benchmark harness (#424) as two stacked PRs; this
  item closes when both merge.

- [x] **T0.3** Verify the facts this design rests on (F1 to F10).
  -> Read-only: Cloudflare Hyperdrive and Worker listing, a catalog query on a
  disposable fork of the serving branch, counts on the owner's local snapshot.
  (R1.1, R5.1)

- [x] **T0.4** Write requirements, design and tasks.
  -> This directory.

## Phase 1 — Schema-version-aware admission (offline)

- [ ] **T1.1** Build schema version 0 (the publisher schema,
  `scripts/neon-benchmark/schema.sql`) in a local database, capture
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
  disposable-fork target that requires an explicit branch id and the benchmark as
  its parent. The serving endpoint is not in the registry.
  -> Tests: serving host, unknown host, wrong database, wrong parent, missing TLS
  verification each refused. (R3.2)

- [ ] **T2.2** Make apply require `--approve-plan <sha256>`; recompute and refuse
  on mismatch; make `--plan` the default.
  -> Tests: no hash, wrong hash, hash of a different source each refused;
  workflow trigger test still shows `workflow_dispatch` only. (R3.1, R3.3)

## Phase 3 — Routine plan (offline, local PostgreSQL)

- [ ] **T3.1** Mirror: reconstruct the October state locally from the August
  snapshot plus the saved stage, and compare its digests with the receipts the
  owner recorded for the serving state.
  -> Equal digests for all nine tables, or the difference is reported. (R4.4)

- [ ] **T3.2** Derive the executor pins from the plan instead of the October
  allowance: source identity, positive-fact hash, retained ledger, schema
  version, storage reserves.
  -> Test: the October plan still reproduces its recorded identity. (R2.1, R4.2)

- [ ] **T3.3** Plan summary and hash (counts per table, affected blocks and
  cohorts, ledger, COPY size, statements, storage, transfer, compute,
  unlocated-address count and change).
  -> Deterministic; golden test on a fixture. (R1.3, R2.2)

- [ ] **T3.4** Replay 24 historical months against a mirror to measure stage
  sizes, change counts and statement counts; write the distribution to
  `docs/evidence`.
  -> Numbers for decisions 2 and 3, with the method. (R8.2, R8.3)

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

- [ ] **T7.1** Decide cadence and guards from T3.4 and record the decision in this
  file.
  -> Requirements R8.2 and R8.3 updated with the chosen values.

- [ ] **T7.2** Keep the workflow `workflow_dispatch` only until the owner approves a
  schedule.
  -> Existing pin test stays green. (R3.3)

## Phase 8 — Validation

- [ ] **T8.1** Run `vp run check` and `vp run check:pr` on each code PR and record
  the exit codes in the PR description.
