# Design: Serving Data Refresh

> Status: Proposed. Evidence gathered and the plan written; no code in this
> spec's PR and no write to any database, Worker, Hyperdrive configuration or
> D1. Every production-bound step below waits for the owner's approval.

## Problem

The serving Neon branch is a static snapshot. Its manifest was last written on
2026-10-04 at 15:30 UTC; the D1 rollback target is older still (2026-08-29).
`.github/workflows` on `main` holds no refresh workflow (`ci`, `claude`, `e2e`,
`typecheck-libs` only). Each week the published data falls further behind the
official source, and nothing in the repository can refresh it:

- the manual publisher (`scripts/sync-neon.ts`) was recovered but not merged, is
  pinned to the benchmark branch, and its D1-derived guards reject a routine
  delta;
- the staged publisher that produced the current state is a one-shot executor
  for one approved catch-up and cannot be pointed at any other plan;
- the PostGIS migration, once applied to the serving branch, makes the staged
  publisher's schema admission refuse that branch.

This design makes the refresh a repeatable, reviewed procedure.

## Verified findings

Sources: the owner's recovered notes (permalinks into the preserved snapshot
commit [`b804464`](https://github.com/shenghaoc/hdb-resale-visualizer/tree/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6)),
the code on the integration branch, and read-only checks made on 2026-10-10.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Serving state is 988,128 transactions, 45,028 trends, 9,730 blocks. Hyperdrive config `hdb-public-neon` points at the serving endpoint `ep-steep-water-b300tebo`, role `hdb_benchmark_runtime`, query cache disabled, origin limit 5. It is the only Hyperdrive config in the account.                                                                          | [cutover plan §1](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/docs/proposals/neon-production-cutover-plan-2026-10-05.md); Cloudflare API read on 2026-10-10                                 |
| F2  | Both publishers validate the connection against the benchmark endpoint `ep-steep-moon-b35xjj4d` (branch `br-wispy-boat-b34glczl`). Nothing can write the serving branch.                                                                                                                                                                                         | `validateNeonRefreshUrl` in `scripts/lib/sync/neon.ts`; `directBenchmarkTransport` in the staged publisher                                                                                                                                    |
| F3  | The staged executor accepts one plan only: `assertExecutionInput` throws unless the review allows exactly 2,595 inserts and five retentions.                                                                                                                                                                                                                      | `scripts/neon-benchmark/staged-execution.ts`                                                                                                                                                                                                  |
| F4  | The client-side planner's guards (25,000 conservative index operations, 100 statements) are D1 write-budget numbers. The October catch-up forecast 40,371 operations and 214 statements, so the planner stopped. The staged path needs 20 commands for the same change.                                                                                          | [manual publication notes](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/docs/neon-manual-publication-2026-10-04.md); [staged execution](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/docs/proposals/neon-staged-execution-2026-10-04.md) |
| F5  | After `sql/neon/001_postgis_nearby.sql`, the stage tables carry triggers: `blocks.block_location_sync` and `mrt_geojson.mrt_geojson_poi_sync` (checked on a fork of the serving branch). The staged executor's catalog admission requires an empty trigger list and a catalog hash equal to its pin, so it fails closed on such a branch.                         | catalog query on `br-broad-cake-b3wl94ei` (2026-10-10); `SCHEMA_CATALOG_SQL` and `assertExecutionInput`                                                                                                                                      |
| F6  | Monthly volume is about twice the recurring change guard. Over 36 full months (2023-07 to 2026-06) transactions per month were: minimum 1,338, median 2,134, mean 2,166, maximum 3,036. The guard is `min(1000, floor(0.005 × active baseline))`, which is 1,000.                                                                                                | read-only counts on the owner's local snapshot; [reconciliation proposal](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/docs/neon-reconciliation-proposal-2026-10-04.md)                     |
| F7  | The October stage used 89,758,647 B of the 90,000,000 B COPY ceiling (99.7%).                                                                                                                                                                                                                                                                                    | [portability publication](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/docs/proposals/neon-portability-publication-2026-10-05.md); `STAGE_MAX_COPY_BYTES`                                  |
| F8  | The October run omitted unlocated addresses under the cache-only policy: 286 unlocated at publication, 15 of them new. With no OneMap token that number only grows as new blocks appear.                                                                                                                                                                         | [staged execution](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/docs/proposals/neon-staged-execution-2026-10-04.md)                                                                        |
| F9  | A Hyperdrive configuration can be updated in place, including the origin host; no Worker redeploy is needed, the existing pool is not torn down, and the pool can be restarted to force new connections.                                                                                                                                                         | Cloudflare Hyperdrive "rotate credentials" documentation                                                                                                                                                                                      |
| F10 | The Worker's public-data cache keys every response by the manifest hash and follows the manifest through a 60 s pointer, so a new publication becomes visible without a deploy. The public manifest route projects the contract keys only.                                                                                                                       | `worker/public-data-cache.ts`; `functions/api/manifest.ts`                                                                                                                                                                                    |

## Goals

- A reviewed plan for any fresh source, with a hash the owner approves.
- Publication to the benchmark branch with the existing integrity machinery.
- Promotion to serving by copy-on-write child, with rollback in one step.
- The PostGIS schema and the publisher coexist by design, not by ordering luck.
- Budgets checked before every apply.

## Non-goals

- Activating a schedule, applying anything to the serving branch, flipping
  Hyperdrive, or deploying a Worker, in this PR.
- Raising a guard or ceiling here. This design proposes how to choose them from
  evidence; the owner decides.
- Any new runtime fetch, geocoding or OneMap call. All fetching stays build-time.

## Architecture

```
official sources (anonymous, paced)
   -> capture + normalise            existing fetchers / normalisation
   -> mirror (local, exact copy of the benchmark's public tables)
        proven equal to the target by server-side digests      (R4.4)
   -> plan: delta, artifacts, stage, guards, budgets   [read-only, deterministic]
   -> plan summary + plan hash                                  --> OWNER approves hash
   -> apply on the BENCHMARK branch                    (one transaction, manifest last)
   -> verify (digests, counts, replay = no-op)
   -> fork benchmark -> serving candidate (copy-on-write child)
   -> child: role defaults + migration 001 + differential verifier
   -> acceptance through a temporary Worker + Hyperdrive
   -> Hyperdrive origin -> child                                --> OWNER approves flip
   -> observe; keep previous child for rollback; retire later (owner)
```

### What exists and what is new

| Stage                                  | Exists (recovered)                                                      | New                                                          |
| -------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Capture, normalise, reconcile          | `fetchers`, `normalization`, `neon-reconciliation`, `source-version`    | none                                                         |
| Stage building and packing             | `stage-artifacts`, `staged-plan`, `cache-only-context`                  | plan hash and summary                                        |
| Executor (transaction, receipts, CAS)  | `staged-publisher`, `staged-validation`                                 | pins derived from the plan; routine envelope                 |
| Target pin                             | `validateNeonRefreshUrl` (one endpoint)                                 | target registry (benchmark, disposable forks)                |
| Schema admission                       | `SCHEMA_CATALOG_SQL` pinned per snapshot                                | golden catalogs per schema version (R5)                      |
| Mirror                                 | `source.sqlite` at the August baseline                                  | mirror reconstruction, digest proof, advance after publish   |
| Promotion                              | the owner's COW candidate procedure                                     | scripted, rehearsed runbook with approval points             |
| Budgets                                | `neon-usage`, `report-neon-refresh-budget`                              | check inside the apply gate                                  |

### Decisions

- **Publisher target is the benchmark branch, serving is a child.** The benchmark
  keeps the publisher schema (version 0, no triggers); the serving child gets the
  role defaults and the PostGIS migration after the fork. That removes F5 from
  the publisher path, keeps derived tables out of the publisher's reach (the
  PostGIS note already forbids granting it write access to them), and gives
  rollback as a Hyperdrive origin change (F9) rather than a point-in-time
  restore inside Neon's six-hour history window. Alternative considered: publish
  in place on the serving branch. That needs schema version 1 in the executor's
  admission and has no instant rollback; it remains possible once R5 exists.
- **Mirror-verified reconciliation instead of a full corpus read.** The October
  equality proof showed that digests over every row and column of nine tables
  cost a few connections and about a minute of compute. A full client-side
  reconciliation reads about 494 MB (493,707,924 B) of the 5 GB monthly transfer
  allowance. The digest proof is exact too, provided the mirror is advanced only
  by the same delta that was published.
- **Approval is a hash.** The owner reads the plan summary and passes its hash to
  the apply command. The apply command recomputes the plan and refuses on any
  difference, which also covers a source that changed in between.
- **Guards come from evidence.** F6 and F7 show the recurring guard and the COPY
  ceiling were calibrated for the one-time catch-up. The task list replays the
  last 24 months against a mirror to measure stage sizes and change counts, then
  proposes numbers for the owner.
- **No Worker deploy for a routine refresh.** F10: the manifest hash moves the
  cache; the cache epoch changes only when a response contract changes.

## Operating procedure (draft runbook)

Steps marked **approval** change external state and wait for the owner. All
others are read-only or local.

1. Observe: `--check-upstream` (no database call); record hints.
2. Capture and normalise the sources; write them to a private directory.
3. Prove the mirror equals the benchmark with server-side digests.
4. Plan; print the summary and the plan hash; stop.
5. **approval:** owner reviews and passes the hash.
6. Rehearse the same plan on a disposable fork of the benchmark; keep receipts.
7. **approval:** apply to the benchmark; verify; replay must be a no-op.
8. **approval:** fork the benchmark into the next serving child; apply role
   defaults and migration 001; run the differential verifier.
9. **approval:** temporary Worker and Hyperdrive; run the acceptance set; delete
   both.
10. **approval:** change the Hyperdrive origin to the child; restart the pool;
    confirm the public manifest shows the new publication; watch error rates.
11. Rollback if needed: change the origin back (previous child is still there).
12. **approval:** retire the oldest child.

## Budgets

Monthly allowances on the free plan: 100 CU-hours, 5 GB transfer, 1 GiB per
branch, 10 branches. The owner's cutover model reserves 64.575 of 100 CU-hours (a
166-invocation runtime sensitivity plus one monthly job) and keeps 1 GB of
transfer as a reserve. A run adds: digest proof (a few
connections, about a minute), the apply (the October sequence capped at 0.25
CU-hours), a fork and its acceptance (about 0.5 CU-hours of startup reserve), and
COPY ingress that Neon does not meter as transfer. The plan step compares these
with a fresh Console reading and fails closed when it is unknown.

## Testing and rehearsal

- Unit: plan determinism (same inputs, same hash), hash mismatch refusal,
  registry refusal of the serving endpoint and of unknown hosts, golden catalog
  equality for versions 0 and 1 and refusal of anything else, guard arithmetic.
- Local PostgreSQL (PG 18 and PostGIS, already installed for the geospatial
  work): apply the version 0 schema and migration 001, compare catalogs with the
  goldens, run the executor against a mirror-restored database including its
  failure-injection modes and the ambiguous-commit recovery path.
- Disposable Neon fork of the benchmark (owner-approved): one full rehearsal with
  measured wall time, WAL and storage growth.
- Replay of 24 historical months to size stages and change counts.

## Risks

- **Mirror drift.** Mitigation: the digest proof is a precondition; a mismatch
  stops the run.
- **Source revisions.** Disappearing facts consume the five-slot retention limit;
  more than five outstanding retentions stops the run for review.
- **Window shift.** Each month moves the 24-month window and rewrites thousands of
  block summaries (4,228 existing blocks in October), which drives stage size.
- **Coverage drift.** Cache-only means new addresses stay unlocated until the
  owner supplies a token or approves another source; the plan reports the count.
- **Branch and storage limits.** Ten branches and 1 GiB per branch; each child
  adds history. Mitigation: retire the oldest child, check headroom in the plan.
- **Hyperdrive flip.** Existing pooled connections finish on the old origin.
  Mitigation: restart the pool, then verify the public manifest.

## Decisions needed from the owner

1. Blue/green (recommended) or in-place publication on the serving branch.
2. Cadence and guard: monthly with a guard derived from F6 (for example above the
   observed maximum of 3,036), or weekly under the existing 1,000 guard.
3. COPY ceiling or a reviewed split rule (F7).
4. Cache-only coverage, or a way to resolve new addresses.
5. How many serving children to keep for rollback.
