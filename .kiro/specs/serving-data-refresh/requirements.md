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

- **R6.1** The serving branch is always a copy-on-write child of a verified
  benchmark publication. Promotion applies the role defaults and the PostGIS
  migration to the child, verifies it, and only then changes the Hyperdrive
  origin.
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

- **R8.1** The adopted policy stays: one explicit reconciliation per UTC month
  plus explicit manual runs; upstream hints are observational.
- **R8.2** The change-count guard is derived from the measured monthly volume
  (36 full months, 2023-07 to 2026-06: minimum 1,338, median 2,134, mean 2,166,
  maximum 3,036) or the cadence is changed so that the existing guard holds. The
  choice is the owner's and is recorded here.
- **R8.3** The COPY ceiling leaves headroom over the largest measured stage
  (89,758,647 B of 90,000,000 B for the October catch-up) or the plan is split
  by a reviewed rule.

## R9 — Evidence before production

- **R9.1** Each production-bound step is first rehearsed on local PostgreSQL and
  on a disposable Neon fork, with the receipts kept in the repository.
- **R9.2** Nothing in this specification writes to the serving branch, the
  production Worker, Hyperdrive or D1 without a separate, explicit approval.
