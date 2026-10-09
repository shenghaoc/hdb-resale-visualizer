# Materialized Neon publication verification — 2026-10-04

**VERIFICATION BLOCKED.** The corrected protocol passes local PostgreSQL 18 tests. The new publisher's Neon peak-resource envelope and remote publication/cache receipts remain unproven. Missing live provider counters alone do not block this independently bounded pilot. No new remote SQL or Worker resources were used here.

This supplements the [original real Neon benchmark](../neon-benchmark-2026-10-04.md), whose viability verdict remains NEON FREE IS MARGINAL. Measured storage runway is promising; setup success does not certify compute/egress or the refresh cadence.

## Checkout, setup and protected scope

Branch: feat/d1-free-incremental-refresh. HEAD: 482be1eba9ff2091c1580f5757d7b33e20b26515. Existing dirty work was recorded and preserved. No commit, push, PR, merge, production database mutation, runtime migration, schedule restoration or application deployment occurred.

Existing Neon project: wispy-mouse-67963002, Singapore, Free v3, PostgreSQL 18. Initial setup used CLI 8.0.4 and the exact private uploads configuration. Neon config deployment succeeded with no changes required: the bucket already existed. Repository linkage remains production (br-broad-credit-b3bz9b61). All benchmark data belongs only on benchmark-d1-migration (br-wispy-boat-b34glczl), preserved after this investigation. No additional project/services or remote privileges were created.

New database verification used only the explicitly authorized Apple container hdb-neon-verify-pg, localhost 127.0.0.1:55432, database hdb_verify, official PostgreSQL 18.6 ARM64 image pinned by digest. Apple container was already installed/running; no Homebrew/Docker/Podman/runtime installation occurred. The test ingestion role is NOSUPERUSER and cannot SET temp_file_limit.

## Minimum local corrections

Complete final detail documents derive locally from captured old JSON and approved owned field patches. Old/final/patch identities, count/bytes/hashes are pinned. SQL checks the old full-row PostgreSQL JSONB-text SHA256, updates complete JSON and verifies final equality. JavaScript canonical hashes remain distinct. Each of 4,424 target documents passed captured-old equality on PostgreSQL before accepting its server digest.

The first full-scale detail statement hit the unchanged 120-second timeout. The receipt wrapper rejoined changed rows through JSON keys, producing quadratic joins and repeated detoasting. UPDATE now returns its unique staging ordinal and Boolean directly. The old block receipt rejected 19,434,872 join pairs and took 10.8s; corrected blocks take about 0.4s and details about 0.9s. No arbitrary timeout increase was used.

Independent review also found that a concurrent loser reported zero COPY bytes after staging. The outcome now reports completed COPY separately from durable publication. Socket/resource counters were already correct. The actual race test and regression verify uploaded bytes on locked no-op and zero bytes on initial-read replay.

No D1/runtime architecture or guard changed. No unsafe retry or privilege increase was introduced. The genuine candidate remains 20 commands, one COPY stream, one transaction, manifest last; alternate shapes must be explicitly pinned within the existing 100-command ceiling.

## Exact inputs and differential evidence

Baseline: 985,533 stored transactions. Incoming official facts: 988,123; retain five approved missing occurrences, yielding 988,128 stored rows. Exact delta: 2,595 inserts, zero corrections/deletes or inferred July/September pairing. Retained IDs 550818, 601171, 934839, 955489, 959788 preserve tuple/lease identities.

Mutations: 4,409 blocks; 4,424 details; 9,640 comparisons; 202 trend inserts and 62 updates. Genuine cache/MRT mutations are zero. Cache-only inputs retain 286 omitted addresses, 21 supermarket skips and the existing straight-line routing fallback. No new OneMap calls.

All 9,730 final derived documents match the frozen builder output: 4,424 intentionally change from the captured baseline and 5,306 remain unchanged. Final complete detail digest: 77a89a19f88ae7e3e787661ec175fd36c7beb4142aef5bc23b2f4eaaa0a0e519. Unknown roots/nested siblings, null versus absent, arrays and transaction presentation IDs survive. Seeded property tests use 300 cases, seed 20261004; every execution-pin field and materialization input has a drift rejection test.

The local bulk COPY used the retained public snapshot: 985,533 transactions; 9,730 blocks/details/comparisons each; 44,826 trends; 10,333 geocodes; zero routes; manifest and two MRT artifacts. Only empty shortlist schema was created. No private user/shortlist data was imported.

## Finite envelope and resource limits

| Item                                 |             Bytes/count |
| ------------------------------------ | ----------------------: |
| Stage rows                           |                  21,332 |
| Canonical wire                       |              89,620,429 |
| Encoded COPY                         |              89,758,647 |
| COPY ceiling / remaining margin      |    90,000,000 / 241,353 |
| Largest stage item                   |                  38,424 |
| Largest old/final detail             |         38,090 / 38,205 |
| Total old/final detail               | 63,302,964 / 63,615,066 |
| Stage relation heap / indexes        |  31,457,280 / 2,383,872 |
| Stage relation physical total        |              69,623,808 |
| Uncompressed JSONB plus wire         |             208,633,855 |
| Stage relation admission cap         |             268,435,456 |
| Minimum remaining project reserve    |             268,435,456 |
| Statement / transaction milliseconds |       120,000 / 600,000 |

These are fixed-input bounds and observations, not a universal PostgreSQL memory proof. Worst captured mutated documents are included in the full-stage plan. UPDATE receipts retain ordinal/Boolean only. The old recursive design implied 50,405 document versions and 713,589,162 serialized intermediate bytes; this was not a physical spill measurement.

The 256MiB staging-relation cap is checked after COPY at admission and before COMMIT. It can reject and roll back an oversized loaded relation; it does not prevent the relation crossing that size during COPY or limit all executor workfiles/backend memory. At local work_mem 4MB, no mutation spilled. Largest validation cumulative workfile writes: 68,231,168B. Adding this conservative observed growth proxy to the stage gives 137,854,976B; an illustrative additional 96MiB reserve gives 238,518,272B. Cumulative writes are I/O, not peak disk, and this reserve is an estimate, not an enforced session bound.

An uncompressed-stage model is materially larger. Neon codec/settings/plan parity and simultaneous project peak remain UNKNOWN; a future admission must include workfiles, durable/index/TOAST growth, other branches and the full 256MiB remaining reserve. Do not equate measured compressed stage with a proved worst-case Neon footprint.

Two complete future COPY streams send 179,517,294 encoded ingress bytes before protocol/context/admission overhead. Preserve existing whole-sequence sent/received, command/connection/wall/compute ceilings and two-pass reconciliation reserve. These are not provider billing or current remaining quota.

The repeated local create/drop fault matrix declares a local-only 16MiB catalog-churn reserve up front. Absolute application limits remain unchanged. One earlier final test correctly refused storage admission at 95,935B above its old physical pin; no COMMIT occurred. A fresh measured local pin completed that test.

## Exact generated SQL on the real local engine

EXPLAIN ANALYZE, BUFFERS, WAL ran the exact SQL over the full public corpus inside rollback. Results below are local SQL times, not Neon latency.

| Statement                    |  SQL ms | Root cumulative temp-write bytes |
| ---------------------------- | ------: | -------------------------------: |
| stage-digest                 |  84.016 |                                0 |
| preconditions                | 863.568 |                       62,496,768 |
| transactions-insert          | 785.839 |                                0 |
| blocks-update                | 383.927 |                                0 |
| block_details-update         | 887.299 |                                0 |
| comparisons-update           | 247.636 |                                0 |
| town_flat_type_trends-insert |  11.633 |                                0 |
| town_flat_type_trends-update |   0.990 |                                0 |
| postconditions               | 845.310 |                       68,231,168 |
| manifest-last                |   0.318 |                                0 |

Full plans and buffers/WAL are in [structured evidence](../evidence/neon-pg18-formal-verification-2026-10-04.json). Complete logical state matched baseline after plan rollback and the original timeout.

## Actual fault, recovery and stale-state tests

Each fault explicitly records that the intended injection ran, then compares every row/column in all ten local tables. No sampling or source pairing is used.

| Injection                                            | Result | Full baseline unchanged |
| ---------------------------------------------------- | ------ | ----------------------- |
| after-stage                                          | PASS   | yes                     |
| during-copy                                          | PASS   | yes                     |
| after-transactions                                   | PASS   | yes                     |
| after-blocks                                         | PASS   | yes                     |
| after-details                                        | PASS   | yes                     |
| after-comparisons                                    | PASS   | yes                     |
| after-trends                                         | PASS   | yes                     |
| before-manifest                                      | PASS   | yes                     |
| manifest-failure                                     | PASS   | yes                     |
| after-manifest                                       | PASS   | yes                     |
| commit-not-accepted                                  | PASS   | yes                     |
| compact cache update + route insert + server failure | PASS   | yes                     |

The genuine candidate has zero cache changes. A separate compact fixture exercises the actual generated cache DML and proves complete rollback.

Accepted COMMIT followed by client response loss reaches all 20 commands. Fresh authoritative recovery identifies the exact published manifest; transactions total 988,128. Replay: one read, zero logical mutations, zero COPY. No blind retry occurs.

| Live drift                    | Result                  |
| ----------------------------- | ----------------------- |
| unknown-detail-root           | PASS before durable DML |
| nested-unowned-detail-sibling | PASS before durable DML |
| block-before-field            | PASS before durable DML |
| cache-input                   | PASS before durable DML |
| stale-manifest                | PASS before durable DML |

Each probe proves its witness changed and reaches the intended validator. Unknown detail root/sibling drift is rejected by full old-row hash; cache timestamps are pinned. A stale manifest stops at the initial read.

Two publisher connections share a deterministic predecessor-read barrier. The concurrency fixture keeps all 2,595 inserts/five retentions with one representative row per derived mutation mode, over the full corpus: 2,600 stage rows / 990,570 COPY bytes. It is not the full 21,332-row request. One publisher commits (20 commands/2,601 logical mutations), one rolls back staging after finding the winner (nine commands/zero durable mutations). Both report 990,570 completed COPY bytes. Replay is one read/zero writes/zero COPY. Full state remains equal, then the original public baseline is restored locally.

The full protocol matrix was pinned before the final accounting-only fix. SQL identity is unchanged; current-code real concurrency and genuine final recovery test that correction. Per-phase source/SQL identities are preserved rather than presented as one fabricated receipt.

## Neon Free decision gates

Free v3 safety limits: 1GiB shared project logical storage, 100 CU-hours/month and conservative 5,000,000,000B public transfer/month. Branches do not each receive a fresh allowance.

Last parent console hover capture: 2026-10-04 15:56:59 UTC. Benchmark: 507.07MB / 0.23CU-hrs; organization: 0.51GB / 0.30CU-hrs. Period October 1–November 1 UTC. Meter update/as-of and live remaining allowance are UNKNOWN; totals lagged receipts. Project and organization scopes differ. Premium export is unnecessary.

Already-valid actual Neon evidence is preserved: imported database 370,032,640B (34.462% of 1GiB), later physical database 418,480,128B; baseline reconciliation 219 queries / 14,905.483ms wall / 493,707,924 received stream-proxy bytes; old +134 publication/replay/rollback passed. No million-row remote reconciliation was repeated.

Daily hint-triggered reconciliation can approach 15.3GB/month; realistic POP cold misses and compute activity remain unmeasured. Storage headroom alone does not establish Free suitability. Existing remote Worker cache evidence (warm/canonical zero DB calls and version/private/error/POST controls) remains historical evidence. No new Worker/Hyperdrive was created; fresh version/cache tests wait for successful authorized remote publication.

| Gate                                                           | Status                                     |
| -------------------------------------------------------------- | ------------------------------------------ |
| Full captured differential/source multiplicity/five retentions | PASS locally                               |
| PG old-document equality/digest compatibility                  | PASS locally                               |
| Generated SQL and finite local plan measurements               | PASS locally                               |
| Complete rollback/ambiguous recovery/replay                    | PASS locally                               |
| Live stale state/concurrency/honest COPY metrics               | PASS locally                               |
| Repository gate                                                | PASS; 1,997 tests / 197 files              |
| Independent final evidence/resource review                     | PASS; no remaining High/Medium issue       |
| Exact Neon peak/codec/plan parity                              | UNKNOWN                                    |
| Fresh monthly provider headroom                                | UNKNOWN; not independently a pilot blocker |
| New native remote publication and fresh Worker tests           | UNKNOWN                                    |

The unresolved peak-resource gate blocks publication. A reliable Console meter timestamp is not a prerequisite when retained receipts and explicit reserves bound the pilot. Next: resolve the specific storage bound below before the already-scoped one bounded remote fault-before-success/publication/replay sequence. Production migration and scheduling remain disabled.

## Conservative pilot accounting and the specific resource gap

The authorized whole pilot retains 80 SQL commands, eight direct connections, 300,000,000 sent and 20,000,000 received stream-byte caps, 25 minutes wall, maximum 1 CU and a 10-minute idle tail. The genuine publication is 20 commands; a full fault attempt plus success needs two COPY streams totaling 179,517,294 B. Initial replay stays one read with no COPY. No budget resets or automatic retries.

Conservative transfer planning: 560,000,000 B rounded organization upper + 1,000,000,000 B pending/runtime reserve + 987,415,848 B two-pass reconciliation reserve + 20,000,000 B pilot responses + 300,000,000 B pilot ingress counted for extra caution = 2,867,415,848 B. Separately charging the prior admission's 83,711,429 stream bytes gives **2,951,127,277 B**, leaving **2,048,872,723 B** against 5,000,000,000 B. This deliberately over-counts ingress and may double-count prior work in the pending reserve; it is not measured billing.

Compute planning: 0.32 CUh rounded upper + 2 CUh pending reserve + 0.6 CUh pilot + 0.47983876244194446 CUh prior-admission upper proxy = **3.399838762441944 CUh**, below 100 CUh. Missing meter-as-of remains UNKNOWN but is **not independently a pilot blocker**. The ledger assumes pending/runtime activity stays within the declared reserve and the endpoint remains at most 1 CU; it does not certify future monthly cadence.

The concrete unresolved quantity is maximum incremental storage across **one full failed publication followed by success**, with no remote maintenance. The current SQL has no recursive document fold. Its local validation Hash inputs are linear, 9,730 rows each: blocks, details and comparisons. The details Hash used eight batches and wrote 29,450,240 B at postconditions; the complete statement wrote 68,231,168 B cumulatively. These are I/O and observed plans, not simultaneous scratch-disk limits.

Using retained benchmark logical 442,523,648 B, other-branch upper 32,505,856 B and the unchanged 268,435,456 B remaining reserve leaves 330,276,864 B for stage, workfiles and durable growth. The compressed observed stage plus observed I/O plus illustrative 96 MiB reserve gives 238,518,272 B and appears to fit. But a compression-independent model starts with 208,633,855 B raw wire/JSONB: adding 68,231,168 B observed validation writes and even a 64 MiB combined growth reserve gives 343,973,887 B, **13,697,023 B beyond** that conservative allowance before relation metadata. This is a failed conservative admission model, **not an observed unsafe Neon peak**.

Local fault cases used local-only VACUUM FULL between cases. They prove rollback correctness; they do not establish physical dead-space accumulation through a remote fault then success. The minimum evidence is current read-only Neon storage/compression/settings metadata and a reviewed fixed-input bound for staging heap/TOAST/indexes, validation workfiles and aborted durable growth. A bounded nonmutating plan comparison or independently admitted rollback-only resource probe may close that gap. No extra privileges, larger caps, full-corpus reread or reliable Console timestamp is required merely to collect this evidence. No genuine remote publication occurs until the combined resource admission passes.

## Files and cleanup

Retain only repository configuration, necessary dependencies/lockfile, benchmark SQL/helpers/tests and sanitized evidence. Local env/account/skills/MCP/connection/snapshot state stays ignored. Earlier D1/Neon work is preserved. No secrets are tracked or printed.

Validation uses Node24 and the prescribed full vp run check: format, lint, typecheck, 1,997 tests in 197 files, boundaries, build and bundle checks pass. Independent final evidence review passed with no remaining High/Medium issue; both minor wording corrections are applied. The final complete-gate rerun passed after the reviewed code and documentation changes; lint reports warnings with zero errors.

The exact owned local container hdb-neon-verify-pg was deleted at 2026-10-04 18:53:19 UTC. The original three unrelated containers retain their running state and original start time. The official image remains cached. Neon benchmark branch/public snapshots remain preserved; no new remote resources need cleanup. Final git status is included in the combined report; nothing is staged or committed.

## Current repository inventory

All earlier work is preserved. The exact 98 candidate files are classified in the structured evidence. This phase adds or updates only the isolated materialization/publisher verification helpers, tests and sanitized report. No frontend, Worker/runtime or D1 migration file differs from HEAD. The local manual Neon workflow remains workflow_dispatch only; it has not been pushed or activated. Generated credentials, connection/account state, skill bundles, machine-specific MCP files and public snapshots remain ignored.

Current git status --short:

```text
 M .gitignore
 M README.md
 M docs/d1-free-sustainability.md
 M package.json
 M pnpm-lock.yaml
 M scripts/lib/sync/fetchers.ts
 M scripts/lib/sync/source-version.ts
 M scripts/sync-data.ts
 M tests/unit/fetchers.test.ts
 M tests/unit/source-version.test.ts
?? .github/workflows/refresh-neon.yml
?? docs/evidence/neon-benchmark-2026-10-04.json
?? docs/evidence/neon-cache-only-stage-2026-10-04.json
?? docs/evidence/neon-console-usage-2026-10-04.json
?? docs/evidence/neon-context-provenance-forecast-2026-10-04.json
?? docs/evidence/neon-genuine-after-state-2026-10-04.json
?? docs/evidence/neon-genuine-refresh-2026-10-04.json
?? docs/evidence/neon-manual-cache-before-2026-10-04.json
?? docs/evidence/neon-manual-recovery-2026-10-04.json
?? docs/evidence/neon-manual-refresh-observability-2026-10-04.json
?? docs/evidence/neon-manual-run-summary-2026-10-04.json
?? docs/evidence/neon-materialized-detail-local-2026-10-04.json
?? docs/evidence/neon-monthly-refresh-budget-2026-10-04.json
?? docs/evidence/neon-monthly-refresh-policy-2026-10-04.patch
?? docs/evidence/neon-official-context-capture-2026-10-04.json
?? docs/evidence/neon-pg18-formal-verification-2026-10-04.json
?? docs/evidence/neon-reconciliation-approval-2026-10-04.json
?? docs/evidence/neon-reconciliation-policy-analysis-2026-10-04.json
?? docs/evidence/neon-reconciliation-review-2026-10-04.json
?? docs/evidence/neon-source-discrepancy-2026-10-04.json
?? docs/evidence/neon-source-offline-capture-2026-10-04.json
?? docs/evidence/neon-staged-execution-2026-10-04.json
?? docs/evidence/neon-staged-publication-proposal-2026-10-04.json
?? docs/evidence/neon-staged-remote-admission-2026-10-04.json
?? docs/neon-benchmark-2026-10-04.md
?? docs/neon-manual-publication-2026-10-04.md
?? docs/neon-monthly-refresh-policy.md
?? docs/neon-reconciliation-proposal-2026-10-04.md
?? docs/proposals/
?? neon.ts
?? scripts/lib/sync/neon-reconciliation.ts
?? scripts/lib/sync/neon-usage.ts
?? scripts/lib/sync/neon.ts
?? scripts/lib/sync/refresh-policy.ts
?? scripts/neon-benchmark/
?? scripts/report-neon-refresh-budget.ts
?? scripts/restore-neon-benchmark.ts
?? scripts/sync-neon.ts
?? tests/neon-benchmark.test.ts
?? tests/unit/neon-cache-only-context.test.ts
?? tests/unit/neon-context-forecast.test.ts
?? tests/unit/neon-materialized-details.test.ts
?? tests/unit/neon-reconciliation.test.ts
?? tests/unit/neon-refresh.test.ts
?? tests/unit/neon-stage-artifacts.test.ts
?? tests/unit/neon-staged-plan.test.ts
?? tests/unit/neon-staged-publisher.test.ts
?? tests/unit/refresh-policy.test.ts
?? tests/unit/source-diagnostic.test.ts
```
