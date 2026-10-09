# Separated Neon storage investigation — measurements 2026-10-04, report 2026-10-05

**STORAGE ADMISSION NOT CERTIFIED.** The exact local failure-then-success workload passed state verification, and the previous model incorrectly charged compute-local TEMP storage to persistent branch capacity. Correcting that classification removes that particular objection. The resulting measurements and planning models do not yet prove permanent-growth/WAL upper bounds for the existing Neon layout. No new remote SQL, publication or Worker deployment occurred. The publisher, its guards and production databases remain unchanged. Overall migration verdict remains **NEON FREE IS MARGINAL**.

The complete saved measurements, plans, receipts, witnesses, numerical review and fresh read-only metadata are in [structured evidence](../evidence/neon-storage-proof-2026-10-04.json). This report supersedes the TEMP-versus-persistent accounting in the [previous verification report](neon-materialized-verification-2026-10-04.md); its protocol evidence remains valid.

## Scope and fixed workload

Checkout: feat/d1-free-incremental-refresh, HEAD 482be1eba9ff2091c1580f5757d7b33e20b26515. Existing dirty work was preserved. All nine frozen publisher/verification source digests still match. Code identity: e211c4cbf647f143c80a5eb1a69b0b070f293a95c3515d855cda1310e4758b91. SQL identity: 2076f556758d1f49090c16ab8e215e62454ec62924a424e037624704f4416f8e.

The exact approved candidate retains the five unresolved source occurrences and inserts 2,595 transactions, taking 985,533 to 988,128. It updates 4,409 blocks, 4,424 complete detail documents and 9,640 comparisons; trends have 202 inserts and 62 updates. There are no cache/MRT mutations. Stage: 21,332 rows, 89,620,429 wire bytes, 89,758,647 encoded COPY bytes. No source facts, patches, guards or semantic choices changed.

The isolated official PostgreSQL 18.6 ARM64 container used the retained full public corpus; no private shortlist records were imported. One CHECKPOINT preceded both attempts. Autovacuum was off; checkpoint_timeout was 30 minutes, wal_compression off, full_page_writes on, data checksums on and work_mem 4 MB. Native TOAST used pglz. No CHECKPOINT, VACUUM, index rebuild or other maintenance occurred between failure and success.

The measurement driver executed frozen SQL and parameters locally, including existing settings. It intentionally drove the SQL directly to measure resources; it does not claim that the publisher's complete admission checks passed. Failure was an actual division-by-zero after all data DML/postconditions and before manifest publication. Complete ten-table witnesses matched baseline after rollback. The immediately following transaction published the expected final state with manifest last. Each phase had 20 protocol/control commands plus two disclosed read-only EXPLAIN ANALYZE executions. The workload was not repeated after reconnection.

## Applicable storage classes and plan

Fresh control-plane metadata confirms subscription free_v3, PostgreSQL 18, Singapore, branch logical-size limit 1,073,741,824 B and history_retention_seconds 21,600. Benchmark branch remains benchmark-d1-migration / br-wispy-boat-b34glczl; endpoint maximum is 1 CU and was idle at capture. These are metadata observations, not live remaining usage counters.

- Regular branch data: permanent heap, indexes, TOAST and allocated dead space. Existing retained logical storage 442,523,648 B, other-branch upper reserve 32,505,856 B and required remaining reserve 268,435,456 B leave **330,276,864 B** under the retained 1 GiB planning ceiling. Physical pg_database_size is not identical to Neon logical usage.
- History: Neon retains WAL/history separately from regular branch data. Free default/maximum retention is six hours, with a documented 1 GB history cap. Raw generated local WAL is retained as a conservative proxy without a Neon compression discount; it is not measured Neon billed history.
- TEMP stage and executor workfiles: compute-local, with capacity at least **20 GiB** (or 15 GiB times maximum CU, whichever is greater). They are not charged to the regular persistent branch-data bound without contrary evidence.

Authoritative references: [Neon compatibility](https://neon.com/docs/reference/compatibility), [compute capacity](https://neon.com/docs/manage/computes), [history window](https://neon.com/docs/postgres/backup-restore/history-window), [pricing](https://neon.com/pricing). Captured document identities are preserved in the evidence handoff. No Paid-plan capacity is assumed.

## Permanent growth and raw WAL

| Observation             | Database bytes | Growth from initial | Raw WAL in phase |
| ----------------------- | -------------: | ------------------: | ---------------: |
| Before both attempts    |    370,767,551 |                   0 |                — |
| After failure/rollback  |    407,459,519 |          36,691,968 |      111,544,024 |
| After immediate success |    444,241,599 |          73,474,048 |       41,115,192 |

Whole measurement raw WAL: **153,027,104 B**, including 367,888 B outside the two phase intervals. pg_wal_lsn_diff was measured from saved insert LSNs. Failed phase: 0/252E3D58 to 0/2BD44430. Success: 0/2BD474A8 to 0/2E47D2E0. Raw LSN measurements remain valid. An optional read-only pg_waldump attempt after reconnection found that the original local segments were no longer available; no workload was repeated to recreate them.

Permanent relation deltas below are from the initial database after **both** attempts. Failed-only deltas are also preserved in structured evidence.

| Table                           | Heap growth | Index growth | TOAST growth | Total growth |
| ------------------------------- | ----------: | -----------: | -----------: | -----------: |
| block_details                   |     442,368 |      114,688 |   34,594,816 |   35,151,872 |
| blocks                          |   9,945,088 |      548,864 |            0 |   10,493,952 |
| comparisons                     |  26,304,512 |      262,144 |            0 |   26,574,848 |
| transactions                    |     647,168 |      516,096 |            0 |    1,163,264 |
| manifest                        |           0 |            0 |       16,384 |       16,384 |
| trends, caches, MRT, shortlists |           0 |            0 |            0 |            0 |

The database-growth total additionally includes catalog/other physical overhead. Zero physical trend growth does not imply zero trend mutations; existing pages accommodated the mutations. Rollback removes visible changes but does not necessarily release allocated permanent pages.

## Immediate versus delayed retry

The deliberately stricter combined observation is 73,474,048 B permanent growth + 153,027,104 B raw WAL = **226,501,152 B**. This is below 330,276,864 B, without charging TEMP to persistent storage or discounting raw WAL.

Reserving two copies of the largest measured WAL phase plus outside-phase WAL gives 223,455,936 B; adding permanent growth yields **296,929,984 B**, margin **33,346,880 B**. Independent numerical review confirms the arithmetic but rejects presenting this as a demonstrated upper bound. Different page layouts, index splits, TOAST allocation and checkpoints during execution may increase growth or WAL. Disabling WAL compression does not disable native TOAST compression; no uncompressed permanent-growth guarantee follows from this measurement.

With confirmed expiry of failed-attempt history, an analogous empirical delayed-retry model retains both attempts' permanent growth and one largest WAL phase plus overhead: **185,385,960 B**, margin **144,890,904 B**. This is materially more comfortable but remains conditional. Merely waiting six hours does not prove history reclamation or restored headroom. Delay does not shrink allocated permanent table/index pages, and fresh baseline/admission pins must still satisfy the frozen publisher predicates.

Neither policy is currently certified. Minimum remaining evidence is a justified permanent-growth/WAL bound for the exact target settings/layout; delayed retry additionally needs verified history clearance and restored headroom. No automatic retries, guard increases, optimization or publisher changes were introduced. These results do not establish that both retry policies fail, so they do not justify beginning a publisher optimization.

## Compute-local TEMP accounting

Observed stage relation: 69,623,808 B. Sampled executor peaks were 35,902,590 B (failure) and 29,736,960 B (success); sampling can miss peaks and these are lower observations, not enforced limits.

Phase pg_stat_database deltas were 80 files / 261,107,400 B and 116 files / 339,092,672 B. Whole before-to-final cumulative temporary bytes were **1,066,890,120 B**, including complete witnesses, extra EXPLAIN executions and delayed statistics flushes. These are cumulative I/O, not simultaneous occupancy. The largest validation EXPLAIN wrote 74,448,896 B cumulatively. All complete plans/buffer counters are retained.

A loose compression-independent **conditional capacity model** uses wire plus native JSONB input sizes, at most two toasted values per stage row, 8 KiB pages, and at least 1,000 B TOAST chunk capacity. Rounding each value independently gives at most 251,298 chunks. Charge each chunk a heap page, index leaf page and internal page; charge each stage row one heap page plus leaf/internal pages in both stage indexes.

| Planning component                        |                         Bytes |
| ----------------------------------------- | ----------------------------: |
| TOAST chunk heap/index pages, 24 KiB each |                 6,175,899,648 |
| Stage heap and two indexes, 40 KiB/row    |                   873,758,720 |
| Ancillary FSM/VM/catalog planning cushion |                    67,108,864 |
| Entire measured cumulative workfiles      |                 1,066,890,120 |
| **Conditional total**                     | **8,183,657,352 (~7.62 GiB)** |

This leaves about 12.38 GiB against 20 GiB compute-local capacity. Page charges deliberately overpack neither chunks nor stage rows and assume no compression benefit. The 64 MiB ancillary cushion is a declared planning assumption, not an enforced resource limit. The workfile component covers the completed local run; target data, memory, parallelism and executor behavior must match or have their own justified bound. This model is not a universal Neon TEMP peak proof and does not certify the separate durable/history gate. The existing 256 MiB stage-relation guard remains unchanged and checks the loaded relation; it does not cap all workfiles.

## Quota, validation and cleanup

No D1 production reads/writes, Neon database SQL or new Worker activity occurred in this phase. Three read-only Neon control-plane metadata calls succeeded after reconnection. Prior transfer/compute ledgers and two-pass reconciliation reserve remain preserved; no million-row reconciliation was repeated. Stale Console timestamps alone remain explicitly insufficient to block an independently bounded pilot.

Node 24.15.0 prescribed `vp run check` passed formatting, lint, typecheck, 1,997 tests in 197 files, boundary checks and build. The complete measurement helper was independently reviewed with no High/Medium issue. Numerical review distinguishes empirical durable estimates from a demonstrated upper bound and TEMP I/O from peak occupancy.

The owned hdb-neon-storage-pg container was deleted at 2026-10-05 01:12:37 UTC. The three unrelated Swift containers retain their original running state and start time; the official image remains cached. Companion evidence records cleanup and the final 101-file checkout inventory, with no staged changes. The complete Library handoff retains all historical evidence. No commits, push, PR, merge, production mutation, schedule restoration or application deployment occurred.
