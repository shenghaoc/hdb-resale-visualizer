# Tasks: Geospatial Programme

> Roadmap in priority order, set by the owner on 2026-10-10: data freshness first,
> then the production gates for nearby search, then multi-source POI integration
> and the standalone Go experiment (in parallel), then benchmarks, planning
> hierarchy and address search. Each item names its pull request or spec, its
> acceptance check, its approvals and its main risk. `[x]` means merged or fully
> evidenced; `[~]` means open as a draft or blocked.

## Phase P0 — Data freshness (`serving-data-refresh`)

- [~] **TP0.1** Land the recovered publisher: core (#423) and harness (#424).
  -> Both gates green; SQL identity equals the October identity. Approval: owner
  review and merge. Risk: 40k lines of unversioned work reviewed late.

- [~] **TP0.2** Spec and evidence (#422), including the schema-trigger trap, the
  cadence-versus-guard numbers and the Hyperdrive flip.
  -> Owner answers decisions 1 to 5 in `design.md`.

- [ ] **TP0.3** Target registry, server-side target assertion, plan-hash approval
  (Phase 2 of that spec).
  -> Unit tests for every refused target. Approval: none (offline).

- [ ] **TP0.4** Routine plan builder with derived pins (Phase 3), mirror digest
  proof, 24-month replay for guard and ceiling numbers, local executor rehearsal.
  -> Receipts for each executor mode on local PostgreSQL. Risk: the preparation
  scripts are one-shot research code and need real refactoring.

- [ ] **TP0.5** Rehearsal on one disposable Neon fork, promotion runbook, rollback
  drill (Phases 4 and 5).
  -> Measured wall time, WAL and storage. Approvals: fork and quota; each external
  step.

- [ ] **TP0.6** First refresh (Phase 6).
  -> Public manifest shows the new publication; previous child kept. Approval: the
  plan hash, the apply, the Hyperdrive origin change.

## Phase G — Production gates for nearby search (`nearby-search-production-gates`)

- [~] **TG.1** Rate limiting (#421).
  -> Gate green (216 files, 2,216 tests); four mutations caught.

- [~] **TG.2** Deployed-path verification on a disposable fork with a temporary
  Worker and Hyperdrive. Everything except the database credential is prepared and
  dry-run bundled.
  -> Equality with the shipped SQL for 13 recorded cases, cache and limiter paths
  observed, latency distribution. BLOCKED: the temporary Hyperdrive configuration
  needs a connection string; creating or entering credentials is the owner's step.

- [ ] **TG.3** Apply migration 001 to the serving branch.
  -> Row counts and verifier pass. Approval: owner. Risk: the staged executor
  refuses a migrated branch (register item 20); sequence with `serving-data-refresh`.

- [ ] **TG.4** Open `NEON_SPATIAL_ENABLED`.
  -> Approval: owner, after TG.2 and TG.3.

## Phase 1 — Multi-source POI integration (`poi-source-integration`)

- [~] **T1.1** Source inventory, licence analysis and admission recommendation
  (research in progress).
  -> Each licence read from its primary text; owner decision on any share-alike
  source. Risk: licence obligations that conflict with storing derived rows.

- [ ] **T1.2** CRS contract tests (register item 26 and `design.md` 2.4).
  -> Swap, relabel, degrees-as-metres and round-trip tests, run in CI.

- [ ] **T1.3** Ingestion of admitted sources (build-time) with provenance columns;
  MRT preflight validation so one bad feature cannot block a publication.
  -> Deterministic IDs; unchanged public contract. Approval: source admission.

- [ ] **T1.4** Resolution pipeline: SVY21 blocking, DBSCAN as candidate generator
  only, name similarity, the five decision classes.
  -> Property tests for determinism and order independence.

- [ ] **T1.5** Ground truth: owner-approved labels only (proposal exists, marked
  unapproved).
  -> No precision or recall before approval (R7.1). Approval: owner labels.

## Phase 2 — Standalone Go nearby-search experiment

- [~] **T2.1** Experiment in a separate local workspace (in progress): pure
  functions with golden vectors from the TypeScript implementation, a PostGIS
  backend running the same SQL, an in-memory backend with an ellipsoidal inverse,
  equivalence tests, load tests, KNN disagreement.
  -> Mismatches classified by cause; every number reproducible. No repository, no
  deployment, not a dependency of the website.

- [ ] **T2.2** Decision record: does the experiment justify anything beyond a
  report?
  -> Owner decision.

## Phase 3 — Benchmarks on local PostgreSQL/PostGIS

- [ ] **T3.1** Methodology and harness: synthetic datasets at 10k, 100k and 1M
  points, fixed seeds, warm and cold runs, p50/p95/p99, plans with buffers,
  hardware and version capture.
  -> One command regenerates the report. Risk: laptop numbers are not edge
  numbers; the report says so.

- [ ] **T3.2** Exact versus KNN versus grid candidate strategies with their
  disagreement rates.
  -> Extends the 500-block measurement in `design.md` 2.3.

## Phase 4 — Planning hierarchy

- [ ] **T4.1** Verify what planning data exists for the current Master Plan
  (subzone-level data found so far is Master Plan 2019 and 2014; 2025 is
  available at planning-area and region level only), its licence and version.
  -> Version and attribution kept per row. Approval: source admission.

## Phase 5 — Address search

- [ ] **T5.1** Trigram search with exact re-ranking; compare any KNN shortcut with
  the exact baseline and inspect plans.
  -> Disagreement reported; no change to the public contract without a spec.

## Phase D — Documentation reconciliation

- [ ] **TD.1** Fix register items 1 to 17 in one scoped pull request after #423
  merges (it edits the same files).
  -> Link and path check; a review against the code, line by line.

- [ ] **TD.2** Document the data-licence attribution once the licence is read
  (register item 25).
  -> `docs/guide/` updated in the same PR (R8.3).

## Phase Z — Case study

- [ ] **TZ.1** Technical case study: what was built, what was measured, what
  failed, what remains.
  -> Every figure traceable to a command or a source.
