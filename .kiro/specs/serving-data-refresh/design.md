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

## Constraints

The design starts from these ten facts. How each was confirmed is recorded in the description of PR #422.

- **C1. Serving state.** 988,128 transactions, 45,028 trends and 9,730 blocks. The Hyperdrive configuration
  `hdb-public-neon` points at the serving endpoint `ep-steep-water-b300tebo` with role
  `hdb_benchmark_runtime`, query cache disabled and an origin limit of 5. It is the only Hyperdrive
  configuration in the account.
- **C2. No publisher can write the serving branch.** Both validate the connection against the benchmark
  endpoint `ep-steep-moon-b35xjj4d` (branch `br-wispy-boat-b34glczl`).
- **C3. The staged executor accepts one plan.** `assertExecutionInput` throws unless the review allows exactly
  2,595 inserts and five retentions.
- **C4. The client-side planner's guards are D1 write budgets.** 25,000 conservative index operations and 100
  statements stopped the October catch-up, which forecast 40,371 operations and 214 statements. The staged path
  needs 20 commands for the same change.
- **C5. The PostGIS migration blocks the staged executor.** After `sql/neon/001_postgis_nearby.sql` the stage
  tables carry the triggers `blocks.block_location_sync` and `mrt_geojson.mrt_geojson_poi_sync`. The
  executor's catalog admission requires an empty trigger list and a catalog hash equal to its pin, so it fails
  closed on such a branch.
- **C6. Monthly volume is about twice the recurring change guard.** Transactions per month over the 36 full
  months 2023-07 to 2026-06 were at least 1,338, median 2,134, mean 2,166 and at most 3,036. The guard is
  `min(1000, floor(0.005 × active baseline))`, which is 1,000.
- **C7. The October stage used 99.7% of the COPY ceiling:** 89,758,647 B of 90,000,000 B.
- **C8. Cache-only coverage loses addresses.** The October run omitted unlocated addresses: 286 at publication,
  15 of them new. With no OneMap token that number only grows as new blocks appear.
- **C9. Hyperdrive can be repointed in place.** A configuration can be updated, including its origin host,
  without a Worker redeploy; the existing pool is not torn down and can be restarted to force new connections.
- **C10. A new publication needs no deploy.** The Worker's public-data cache keys every response by the manifest
  hash and follows the manifest through a 60 s pointer. The public manifest route projects the contract keys
  only.

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
   -> child: materialize top-five MRT exits into block_details JSON (prototyped in closed draft #432)
   -> child: verify derived JSON + manifest marker AFTER base digest proof
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
| Budgets                                | `neon-usage`, `refresh-policy`                                          | check inside the apply gate                                  |

The staged publisher, the stage builders and the schema pins in that table (`stage-artifacts`, `staged-plan`,
`cache-only-context`, `staged-publisher`, `staged-validation`, `SCHEMA_CATALOG_SQL`) are not in the repository. They
are parked with the rest of the benchmark and pilot harness at the tag `archive/neon-benchmark-harness`, under
[`scripts/neon-benchmark/`](https://github.com/shenghaoc/hdb-resale-visualizer/tree/27d99fbab8a6872042ea4f5eccbd0c7ba5f5e797/scripts/neon-benchmark).

### Decisions

- **Publisher target is the benchmark branch, serving is a child.** The benchmark
  keeps the publisher schema (version 0, no triggers); the serving child gets the
  role defaults and the PostGIS migration after the fork. That removes C5 from
  the publisher path, keeps derived tables out of the publisher's reach (the
  PostGIS note already forbids granting it write access to them), and gives
  rollback as a Hyperdrive origin change (C9) rather than a point-in-time
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
- **Guards come from evidence.** C6 and C7 show the recurring guard and the COPY
  ceiling were calibrated for the one-time catch-up. The task list replays the
  last 24 months against a mirror to measure stage sizes and change counts, then
  proposes numbers for the owner.
- **No Worker deploy for a routine refresh.** C10: the manifest hash moves the
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
8a. **child-only derived publication:** after the benchmark's nine-table digest equality proof, run the child-only publish-time MRT-exit step (prototyped in closed draft #432; its SQL is not in the repository) on the unserved child. It atomically stores each block's top-five MRT exits and updates a private manifest identity marker LAST; validate 9,730 differential answers, empty lists, total size growth and a replay no-op. The new manifest hash forces a new cache generation. Never include this JSON in the benchmark COPY stage.
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

## Cadence budget (confirmed 2026-10-10)

The owner decided on weekly refreshes under the existing change guard,
**provided** the monthly transfer cost fits. This is the arithmetic, from
measurements and the owner's own cutover model (`refresh-policy.ts`:
5,000,000,000 B transfer allowance, 1,000,000,000 B reserve):

| Item | Value | Source |
| --- | --- | --- |
| Transfer allowance, Free (`free_v3`) | 5 GB a month, planning figure 5,000,000,000 B | Neon plans documentation; `NEON_MONTHLY_TRANSFER_LIMIT_BYTES` |
| Reserve kept | 1,000,000,000 B | `PROPOSED_TRANSFER_RESERVE_BYTES` |
| One full corpus reconciliation read | 493,707,924 B (219 queries, 14.9 s) | measured baseline, cutover plan |
| One server-side digest proof (nine tables) | one row per table, well under 1 MB; about a minute of compute | October equality proof; the size is an estimate |
| Fork, differential verifier, acceptance run | under 1 MB of results; about 0.5 CU-hours of startup reserve | runbook steps 8 and 9 |
| October so far (2026-10-10, live API reading) | 1,048,962,365 B transferred; 12,224 compute seconds; 452,190,208 B stored (all branches) | Neon project API, period 2026-10-01 to 2026-11-01 |

Five weekly runs is the worst case (a month with five Mondays).

| Scenario (per month) | Full reads | Publisher transfer | Left after the 1 GB reserve for runtime traffic |
| --- | ---: | ---: | ---: |
| Monthly cadence, one reconciliation | 1 | 0.494 GB | 3.506 GB |
| **Weekly, digest proofs, plus the monthly reconciliation (adopted)** | 1 | about 0.50 GB (0.494 + at most 5 x 1 MB) | about 3.50 GB |
| Weekly, a full corpus read every week (no mirror) | 5 | 2.469 GB | 1.531 GB |
| Daily full reads (the earlier "daily hint" scenario) | 31 | 15.3 GB | exceeds the allowance |

**Transfer fits** for the adopted procedure with a wide margin. The unmirrored
weekly variant also fits on paper but leaves 1.5 GB for all runtime traffic, whose
steady state has never been measured, so it is not adopted (R8.4). Compute also
fits: a run adds the digest proof (at most 0.03 CU-hours, a minute at the 2 CU
maximum), the apply (capped at 0.25) and the fork and acceptance (about 0.5), so
about 0.78 CU-hours, and five runs add about 3.9 to the cutover model's
reservation of 64.575 of 100, giving about 68.5.
Branches: with two serving children kept, the benchmark, production and one
acceptance fork the count stays at five of ten, so long as disposable forks are
deleted (decision 5 sets the child count). Hyperdrive: the publisher does not use
it, and the acceptance Worker sends well under a hundred statements.

What the weekly cadence does **not** settle: the change guard holds on average
(about 491 a week against 1,000) but the weekly distribution is unmeasured (R8.2);
the first run after a month boundary shifts the 24-month window and rewrites
thousands of block summaries, which is what pushes the stage towards the COPY
ceiling (C7, decision 3); and cache-only coverage keeps losing new addresses
(C8, decision 4).

## Decisions

Recorded 2026-10-10:

1. **Blue/green**: decided. The publisher writes only the benchmark branch; serving
   is a copy-on-write child promoted by a Hyperdrive origin change (R6.1).
2. **Cadence**: decided, weekly under the existing 1,000 guard, conditional on the
   transfer fit above, which holds for the mirror-verified procedure (R8.1, R8.2,
   R8.4).

Still needed from the owner:

3. COPY ceiling or a reviewed split rule (C7).
4. Cache-only coverage, or a way to resolve new addresses.
5. How many serving children to keep for rollback.

## Child-only PostGIS MRT exit materialization (prototyped in closed draft #432)

The existing UI only needs five exits per **known HDB block** and therefore must not depend on the disabled public arbitrary-coordinate endpoint. Draft #432, now closed, prototyped this step as a SQL file that is not in the repository. After migration 001 the step computes nearest-exit-per-source-STATION_NA over all candidates within 1,500 metres, using the API's snapped 0.0001-degree centres, spheroidal PostGIS distance and deterministic tie-breaking. It adds `nearbyMrtExits` to the **already published `block_details.json`** and writes `nearbyMrtExitsMaterialization` in the private manifest as the last statement of a single transaction.

**Stage ordering is mandatory:** the benchmark publisher continues to own its original schema and guarded 89.76 MB COPY stage; child-only materialization runs **after** base digest equality has been proved on the fork but **before** promotion and temporary Worker acceptance. Since the manifest JSON changes in that child, do not demand equality to the benchmark's manifest after child-only derivation; instead independently verify the derived-field hash, manifest marker, block coverage, and that the remaining public source facts still match the benchmark. Any failure rejects the child and leaves the old serving branch unchanged. Replaying on an unchanged child must update zero rows and preserve the manifest identity. The change-count guard for upstream transactions is **not** bypassed or loosened; this is a separately bounded, derived-only child stage.

Read-only measurement on a disposable serving fork, for 9,730 details with the snapped API semantics: stored top-five arrays add **4,032,907 bytes** of JSON text overall; mean **414.48 bytes/document**, median **414**, p95 **674**, maximum **685**, minimum **22**. Mean full detail rises from 14,941.2 to 15,355.7 bytes. The physical storage, WAL impact and full-promotion timing remain unmeasured; #422's plan gate must report these and stop if branch storage or operation budgets are insufficient. No runtime D1/Neon counter, new Hyperdrive configuration or write-capable runtime role is involved.
