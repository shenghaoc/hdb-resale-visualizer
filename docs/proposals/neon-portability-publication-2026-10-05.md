# Neon portability and isolated publication — 2026-10-05

**The fixed isolated workload passed portability admission, complete rollback, publication, zero-mutation replay and new-version Worker cache verification.** The publisher and all resource guards remain frozen. Production D1/Neon data and the production Worker were untouched. Overall long-term verdict remains **NEON FREE IS MARGINAL**; this result does not authorize a production cutover or scheduled refresh.

[Complete structured evidence](../evidence/neon-portability-proof-2026-10-05.json) includes every command receipt, affected-row witness, native detail digest, schema catalog, WAL/size snapshot, cache request and cleanup result. The [portability derivation](neon-portability-proof-2026-10-05.md) explains the fixed-workload estimate and its packing assumptions. It supersedes the earlier pending storage-portability gate while preserving those historical measurements.

## Target and unchanged implementation

Project wispy-mouse-67963002, AWS Singapore, Free v3, PostgreSQL 18.6 ARM64. Only benchmark-d1-migration / br-wispy-boat-b34glczl was mutated. The production branch remains br-broad-credit-b3bz9b61. Branch allowance is 1,073,741,824 B, history retention six hours, endpoint maximum 1 CU.

Checkout remains feat/d1-free-incremental-refresh at 482be1eba9ff2091c1580f5757d7b33e20b26515. All nine frozen source hashes match. Code identity e211c4cbf647f143c80a5eb1a69b0b070f293a95c3515d855cda1310e4758b91; SQL identity 2076f556758d1f49090c16ab8e215e62454ec62924a424e037624704f4416f8e. Existing dirty work was preserved; nothing was staged, committed or pushed.

The exact cache-only catch-up retained all five unresolved source occurrences and inserted 2,595 transactions. Other receipts: 4,409 block updates, 4,424 complete detail replacements derived from owned field patches, 9,640 comparison updates, 202 trend inserts and 62 trend updates. No correction/deletion, cache mutation, MRT mutation, external geocoding or private user-data import occurred.

## Portability and persistent storage

Neon matches local PostgreSQL 18.6, 8 KiB pages, native types, pglz, replica WAL and index definitions. WAL compression is off. Neon full-page writes and hint logging are off; its hint-image condition excludes the vanilla checksum trigger. Ordinary checkpoint images therefore do not amplify the five-minute checkpoint interval. A separate 24 MiB allowance covers the fixed TOAST-index forced-image model without assuming new OIDs exceed existing OIDs.

The accepted local observation was 226,501,152 B. A larger local reserve plus Neon forced-image allowance gives **322,095,808 B**, below **330,276,864 B**, leaving **8,181,056 B**. This is a fixed-workload engineering reserve with disclosed packing assumptions, not a universal bound for every future PostgreSQL workload. No Neon compression discount was applied to WAL. Compute-local TEMP remains separate: accepted 7.62 GiB capacity model versus documented 20 GiB capacity. The frozen 256 MiB loaded-stage guard remains unchanged.

| Snapshot                              | Persistent database B | Growth from initial B | Interval raw WAL B | Transaction count |
| ------------------------------------- | --------------------: | --------------------: | -----------------: | ----------------: |
| Before                                |           418,480,128 |                     0 |                  — |           985,533 |
| After failed publication / rollback   |           427,491,328 |             9,011,200 |         41,421,800 |           985,533 |
| After successful publication / replay |           428,113,920 |             9,633,792 |         42,584,016 |           988,128 |

Whole interval raw WAL: **84,005,816 B**. Persistent growth plus raw WAL: **93,639,608 B**. LSN differences include intervening read/maintenance activity and are not claimed as exclusively application WAL or billed Neon history. Raw WAL remains a conservative history proxy.

Actual loaded stage was **69,615,616 B** in both attempts; each COPY was **89,758,647 B**, 21,332 rows. Fresh admission before failure reserved 1,055,916,032 B under the frozen formula. After rollback, fresh pins reserved 1,064,304,640 B, still below 1 GiB. Neither the 256 MiB stage reserve nor the 64 MiB per-attempt durable-growth guard was lowered. Only measured snapshot ceilings, shared-sequence hash and resulting publication identity were rebound.

At 03:16:53 UTC the control plane reported logical storage **452,173,824 B**: **42.112%** of 1 GiB, leaving **621,568,000 B**. PostgreSQL physical bytes and Neon logical bytes are different measures. Practical future storage and long-term transfer runway remain governed by the broader benchmark report; this narrow catch-up does not establish a new annual growth rate.

## Publication correctness and timing

The failure was intentionally raised client-side after all DML/postconditions and before manifest publication, followed by PostgreSQL ROLLBACK. It was not a server division-by-zero test. After rollback, every affected-row hash, the complete manifest, transaction count and maximum ID matched baseline. Fresh schema/native-detail/baseline checks then passed before success.

| Scenario                | Protocol commands |     COPY B | Durable outcome                   | Wall ms including connection |
| ----------------------- | ----------------: | ---------: | --------------------------------- | ---------------------------: |
| Failure before manifest |                19 | 89,758,647 | Complete rollback verified        |                   34,396.527 |
| Success after rollback  |                20 | 89,758,647 | 21,332 planned rows + manifest    |                   27,265.672 |
| Replay                  |                 1 |          0 | Already published; zero mutations |                   11,017.718 |

The exact command-count receipts are authoritative. The failure row above excludes the separate inspection commands; its complete command sequence is saved. Success published manifest last, then committed. Final manifest equality and 988,128 stored transactions/max ID were verified. Five retained tuples and every planned final value passed publisher postconditions.

Query receipt durations are client round-trip measurements, including transport; they are not separately measured server execution durations. All non-COPY command durations including inspection sum to 48,245.859 ms. No million-row reconciliation or broad local fault suite was repeated. No automatic mutation/COMMIT retry was added. Existing formal recovery/ambiguity evidence remains preserved.

## New-version Cache API evidence

The temporary Worker reused the actual unchanged Cache API implementation and the existing SELECT-only hdb_benchmark_runtime role. Hyperdrive query caching was disabled. No grants or manifest edits were used in these tests. All instrumented requests ran in SIN.

| Request                                   | SQL calls | Cache                  |      HTTP wall ms |
| ----------------------------------------- | --------: | ---------------------- | ----------------: |
| New manifest cold                         |         3 | MISS                   |           322.786 |
| Immediate identical manifest              |         0 | HIT                    |            61.044 |
| Public search cold                        |         3 | MISS                   |           197.308 |
| Canonically equivalent reordered query    |         0 | HIT                    |            59.463 |
| Different semantic query                  |         3 | MISS                   |           161.281 |
| Error, first / repeated                   |     3 / 3 | MISS / MISS            | 154.152 / 146.398 |
| Private shortlist-style, first / repeated |     1 / 1 | Bypass / bypass        |   66.046 / 67.001 |
| Comparable POST, first / repeated         |     1 / 1 | Bypass / bypass        |   63.750 / 61.757 |
| Actual 60-second pointer expiry           |         1 | HIT-AFTER-VERSION-READ |           286.642 |

The new manifest payload exactly matched the committed publication. Warm and reordered responses had identical body hashes in the same POP and zero query/connect time. Different flat-type queries had distinct bodies and cache keys. Errors were never shared-cached; synthetic private responses read no private records. Pointer expiry used an actual 65-second wait after the last pointer refresh.

Thirteen HTTP requests include one zero-SQL pointer deletion: twelve route requests, **20 instrumented SELECTs**, 87,969 HTTP response bytes, 66,572.344 ms including TTL wait. These are application instrumentation and HTTP bytes, not billed Neon network transfer. This proves same-POP hits; it does not establish a global 100% cache-hit rate or a fresh compute cold-start measurement. Earlier compute-suspension and version-race evidence remains preserved without replaying manifest mutations here.

## Quota accounting and cleanup

Nine read-only portability commands plus 46 publisher/inspection commands plus 20 instrumented Worker SELECTs total **75**, below 80. The direct PostgreSQL client phases used eight connections including the proof reads. Their combined socket proxies were 188,999,916 B sent and 1,715,991 B received. Worker HTTP response/request proxies are separately reported; Hyperdrive-managed origin connections and control-plane internal validation are not claimed as direct-client socket instrumentation.

Earlier proof compute proxies, including two conservative ten-minute idle tails, total 0.3338911325925 CUh. The publisher's five-minute / 0.25 CUh phase retained one shared budget across admission, failure, success and replay. Setup/cleanup wall time is not hidden in that client receipt: control-plane metadata shows the benchmark endpoint started at **03:04:03 UTC** and was suspended at **03:19:52 UTC**. Charging the entire 949-second active interval at the maximum 1 CU—including deployment, authentication checks, cache wait and cleanup—adds **0.2636111111 CUh**. Together the conservative bound is **0.5975022437 CUh**, below 0.6 CUh. Actual billed compute remains unavailable. No final idle tail is needed after observed suspension.

The allowance period is **2026-10-01 00:00 UTC → 2026-11-01 00:00 UTC**. The API still returned zero transfer/compute counters despite measured workloads, so they are not treated as live totals. Dashboard hover totals were not accessible from this Mac execution session; premium export is unnecessary. Existing monthly quota reservations and broader runtime uncertainty remain in force.

Temporary Worker hdb-neon-benchmark-20261004 and Hyperdrive f5626c9c20764c9996ea7672a4125b85 both returned successful DELETE receipts at **03:16:03.955 UTC**. The benchmark endpoint was explicitly suspended to end test compute; a **03:20:16 UTC** control-plane read confirms idle. The benchmark branch/data, scripts and evidence are preserved. No test Worker/Hyperdrive remains. Earlier owned local test containers had already been deleted.

## Validation and decision

Independent review found no remaining High/Medium issue in the scoped proof/driver after correcting terminal-receipt and cumulative-budget accounting. All nine frozen source identities match. `vp run format:check` passes. The previous prescribed `vp run check` passed 1,997 tests in 197 files; this phase changed only evidence/proposal files and ignored diagnostic drivers, so the user-requested frozen scope did not repeat that broad suite.

New repository deliverables are this report, the portability derivation and one structured evidence file. Existing Neon setup, PostgreSQL prototype and D1 implementation/evidence remain preserved. Private connection/config/local account state remain ignored. Nothing is staged.

**NEON FREE IS MARGINAL.** The exact bounded manual refresh and new-version Worker cache are now empirically demonstrated. Real runtime/account transfer and long-term compute headroom remain insufficiently established for a production migration or schedule. The initial repository provisioning result and this successful isolated experiment do not constitute production cutover approval.
