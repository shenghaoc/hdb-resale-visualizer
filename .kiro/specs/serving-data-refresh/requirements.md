# Requirements: Serving Data Refresh

## R1 — Fresh, attributable data

- **R1.1** The data the Worker serves is produced from official sources by a
  documented, repeatable procedure, and the published manifest identifies the
  source snapshot, the generation time and the publication it belongs to.
- **R1.2** WHEN the procedure has not run for longer than its cadence THEN the
  gap is reported in the next plan summary. Staleness is never silent.
- **R1.3** Coverage that the procedure cannot provide (addresses without a
  cached coordinate, which the cache-only policy omits from blocks) is counted
  in every plan summary, with the change since the previous publication.

## R2 — Plan before write

- **R2.1** A plan is computed with zero writes to any database. It is
  deterministic: the same sources, mirror and code produce the same plan hash.
- **R2.2** The plan summary states, per table, the inserts and updates, the
  affected blocks and town/flat-type cohorts, the retained-occurrence ledger,
  the COPY size, the statement count, the projected storage, and the transfer
  and compute reservations, together with every identity hash that the apply
  step will check.
- **R2.3** WHEN a guard (change count, statement count, COPY size, storage
  headroom, checkpoint gap) is not met THEN the plan says which one and by how
  much, and no apply is possible. A guard is changed only by a reviewed change to
  the repository, never by a flag.

## R3 — Explicit approval and pinned targets

- **R3.1** Applying a plan requires the plan hash, supplied by the owner after
  reading the summary. The apply step recomputes the plan and refuses on any
  difference.
- **R3.2** The publisher can write only to targets in a repository registry. The
  registry lists the benchmark branch (publisher target) and disposable forks of
  it by explicit branch id. The serving branch is never a publisher target.
- **R3.3** No scheduled or automatic trigger can reach an apply step. The refresh
  workflow stays `workflow_dispatch` only until the owner approves otherwise.

## R4 — Publication integrity

- **R4.1** A publication is one PostgreSQL transaction on one connection: stage,
  verify preconditions, set-based DML with per-table affected-row receipts,
  verify postconditions, write the manifest last by compare-and-set, commit.
- **R4.2** Stable integer transaction identities and the multiplicity of
  duplicate facts are preserved. A fact that disappears from the source is never
  deleted or corrected by inference; it is retained, listed in the ledger, and
  counted against the retention limits.
- **R4.3** WHEN the commit response is lost THEN the outcome is decided by one
  bounded manifest read, never by a blind retry. Replaying a published plan is a
  no-op.
- **R4.4** The mirror that the plan was computed against is proven equal to the
  target by server-side digests before the plan is applied.

## R5 — Schema-version-aware admission

- **R5.1** The publisher admits a target only when its live schema catalog equals
  the golden catalog of a known schema version stored in the repository.
- **R5.2** Schema version 0 is the publisher schema without triggers on the stage
  tables. Schema version 1 is version 0 plus `sql/neon/001_postgis_nearby.sql`,
  with its two triggers and three `SECURITY DEFINER` functions pinned by
  definition.
- **R5.3** An unknown catalog, an extra trigger or rule, or a changed function
  fails closed with the difference reported.

## R6 — Promotion and rollback

- **R6.1** (decided 2026-10-10: blue/green) The serving branch is always a
  copy-on-write child of a verified benchmark publication. Promotion applies the role defaults and the PostGIS
  migration to the child, verifies it, and only then changes the Hyperdrive
  origin.
- **R6.1a** The serving child materializes the five nearest MRT exits per block from PostGIS into `block_details.json` using the shipped API's 1,500 m snapping/grouping/tie semantics. This happens **after** benchmark base-table digest equality and **before** promotion; all 9,730 lists must pass an independent SQL differential check, including empty and short-code exits. The derived JSON and private manifest marker change atomically, with manifest last. Re-running is idempotent. The benchmark COPY stage and upstream transaction change guard remain unchanged.
- **R6.1b** The plan separately measures JSON text growth, physical/WAL growth, child-only DML time and branch storage budget. It refuses promotion when a derived verifier fails or headroom is inadequate. Only the new child is mutated; serving is untouched until approved cutover.
- **R6.2** The previous serving child is kept until the owner retires it, so that
  rollback is one Hyperdrive origin change. The D1 rollback target is unchanged.
- **R6.3** Every promotion step that changes Cloudflare or Neon state is listed
  in the runbook with its approval point, its verification, and its undo.

## R7 — Budgets

- **R7.1** Before an apply, egress, compute and storage reservations are checked
  against a fresh provider reading. An unknown reading fails closed.
- **R7.2** The monthly reconciliation reads no more than server-side digests and
  the minimum needed rows from the target; a full corpus read is an explicit,
  separately budgeted choice.

## R8 — Cadence and guards

- **R8.1** (decided 2026-10-10) Refreshes are **weekly**: one explicit run, one
  plan and one approval each, plus one reconciliation per UTC month. Upstream
  hints stay observational, and nothing schedules a run (R3.3). The weekly cadence
  is conditional on R8.4.
- **R8.2** (decided 2026-10-10: the cadence is changed so that the existing guard
  holds) The change-count guard stays at 1,000. Over 36 full months (2023-07 to
  2026-06) transactions per month were: minimum 1,338, median 2,134, mean 2,166,
  maximum 3,036, which is about 491 a week for the median month and 685 for the
  busiest. The source publishes daily, so arrivals are spread rather than
  monthly, but how they spread over weeks is **not measured** (the dataset
  carries the transaction month, not the day a row appeared). A week above 1,000
  stops the run for review; a guard is changed only by a reviewed change to the
  repository (R2.3). T3.4 measures the weekly distribution.
- **R8.4** (confirmed 2026-10-10, design "Cadence budget") A weekly cadence is
  adopted for the mirror-verified procedure only. With server-side digest proofs
  five weekly runs and the monthly reconciliation use about 0.50 GB of the 5 GB
  monthly transfer and about 4 of the 100 CU-hours; a full corpus read every week
  would use 2.47 GB. A plan that would read the full corpus more than once in a
  UTC month fails closed unless the owner approves it separately (R7.2).
- **R8.3** The COPY ceiling leaves headroom over the largest measured stage
  (89,758,647 B of 90,000,000 B for the October catch-up) or the plan is split
  by a reviewed rule.

## R9 — Evidence before production

- **R9.1** Each production-bound step is first rehearsed on local PostgreSQL and
  on a disposable Neon fork, with the receipts kept in the repository.
- **R9.2** Nothing in this specification writes to the serving branch, the
  production Worker, Hyperdrive or D1 without a separate, explicit approval.
