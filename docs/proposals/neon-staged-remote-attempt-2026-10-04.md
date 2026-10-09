# Neon staged verification — stopped at executor-spill permission gate

**Verdict remains NEON FREE IS MARGINAL.** The existing full-corpus storage/query/+134/cache evidence is preserved in [the benchmark report](../neon-benchmark-2026-10-04.md). This new genuine 2,595-occurrence staging sequence was **not published**. The existing benchmark owner role returned `false` for `has_parameter_privilege(current_user,'temp_file_limit','SET')`. No additional grant, role or privilege was created. The exact current protocol cannot yet meet its required executor-spill guard under those permissions.

The user authorized the temporary Worker/Hyperdrive and bounded publication sequence. It stopped before either resource was created, before any COPY or DML, and before any new cache/replay/fault test. The isolated branch and retained artifacts remain available. Production Neon, production D1, Worker secrets, both schedules, branch/HEAD, and all existing local work remain unchanged. No commit/push/PR/merge occurred.

## Actual remote admission

Target: `wispy-mouse-67963002`, Singapore, PostgreSQL 18, isolated `benchmark-d1-migration` / `br-wispy-boat-b34glczl`. Authoritative project API reports `subscription_type=free_v3`, logical limit **1,073,741,824 B**, period **2026-10-01 00:00–2026-11-01 00:00 UTC**. Benchmark endpoint maximum is **1 CU**; production remains the primary/default branch.

Actual SQL began **16:20:31 UTC** and the final permission check completed approximately **16:39:19 UTC**, October 4, 2026. The long interval includes local review/validation pauses; it is not measured active database time.

| Read-only command                                                                     | Returned rows | Client command wall ms | Received stream-byte proxy | Sent stream-byte proxy |
| ------------------------------------------------------------------------------------- | ------------: | ---------------------: | -------------------------: | ---------------------: |
| Schema/index/default/constraint/trigger/RLS catalog                                   |             1 |                317.783 |                     11,355 |                  1,571 |
| Exact local native-JSONB sizing, manifest, max-ID, physical size and writer inventory |             1 |             16,921.479 |                      2,700 |             83,693,691 |
| Existing role's executor-spill SET permission                                         |             1 |                 84.085 |                         67 |                     87 |

The sequence totaled **three successful read-only SQL commands**, **two direct connections**, **83,695,959 sent / 15,470 received stream bytes**, including connection/control framing. Sum of command wall times: **17,323.347 ms**. Server-only SQL execution duration and actual billed compute/transfer are **UNKNOWN**. The whole-sequence time/CU upper proxy is **0.47984 CUh**, including the 10-minute idle tail and review pauses; it is not actual CU usage. Neither reserved full reconciliation pass ran; **987,415,848 B** remains a planning reserve. D1 and OneMap calls were zero.

Observed manifest matched the frozen predecessor, maximum transaction ID was **985,533**, and relevant schema fingerprint was `642f4d71a58e7447c198ab0dc78d73639e6fb74477bb418dcc1657599af57a90`. The runtime role inventory remained SELECT-only, with no fact writes/private access/elevated membership. No new grants were issued.

## Storage and exact inputs

Current physical benchmark database size: **418,480,128 B**. Control-plane branch logical size: **442,523,648 B**; primary branch **31,686,656 B**. Physical database and provider logical-size metrics are distinct. The benchmark uses about **39.0%** of 1 GiB physically, with **655,261,696 B** remaining against that numerical limit before other branch/history/growth reservations. The original faithful import's per-object storage measurements remain in the benchmark report.

| Staging input                                                     |       Bytes |
| ----------------------------------------------------------------- | ----------: |
| Exact COPY text stream                                            |  83,809,574 |
| Canonical wire values                                             |  83,671,356 |
| Native uncompressed JSONB, actual PostgreSQL `pg_column_size` sum | 111,288,642 |
| Wire plus native JSONB                                            | 194,959,998 |
| Estimated relation overhead reserve                               |  67,108,864 |
| Rounded stage-relation estimate                                   | 262,144,000 |

The 250 MiB estimate fits the unchanged **256 MiB stage-relation cap**. It is **not an observed or proven whole-publication peak**. The recursive detail CTE can also materialize intermediate documents and spill to executor temporary files. Review estimated 50,405 intermediate rows and approximately 713 MB of repeated JSON text; that is an intermediate-size proxy, not measured disk or billing.

The bounded harness therefore required **16 MiB maximum executor spill**, with **48 MiB maximum durable growth** inside the existing combined **64 MiB reserve**, keeping at least **256 MiB** project headroom. PostgreSQL's [`temp_file_limit`](https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-TEMP-FILE-LIMIT) limits executor temporary files and requires superuser or parameter SET privilege; it does not limit explicit temporary tables. The role's measured missing permission blocked this mechanism. The cap was not increased or bypassed.

The local stage remains exactly **21,332 data rows**, one COPY and twenty publication commands: 2,595 transaction inserts, 4,409 block updates, 4,424 owned detail updates, 9,640 comparison updates, 202 trend inserts, 62 trend updates, and manifest last. Stage root remains `e4bebf1d29e3037e3b06585e21c77807898875f29026c7d0622d9a6ab4333b69`. All five unresolved historical occurrences remain retained. Cache-only omissions remain **286 addresses and 21 supermarkets**; no coordinates/routes were invented and no OneMap credentials were needed.

The final frozen but unexecuted publication ID is `2f713884183d595411d919a88d7515bf954deb0493e2e86b959b8a92df523cc9`. Code-byte pin is `0fe70b788b8867dab53d6a2313a8dc8a1ab99e30dca43dea835b5601a26b585c`; SQL pin remains `0819994326a635e85e7ab367a041fbda8a0ed9b83e60cec54f293b4d47f8b322`. The earlier draft ID was superseded only after correcting transport startup settings; neither ID was published.

## Usage evidence and remaining work

Parent browser hover capture at **15:56:59 UTC** reported benchmark **507.07 MB public transfer / 0.23 CUh / 440.95 MB storage / 661.62 MB history**, and organization **0.51 GB transfer / 0.30 CUh / 0.47 GB storage / 0.01 GB history**. These rounded values were unchanged from the earlier capture, and **usage-as-of remains UNKNOWN**. Monitoring graph hover is sufficient; premium export is unnecessary. No live remaining quota is inferred. The counters predate this three-query admission and are not final billing for it.

The initial full benchmark remains valid: approximately 494 MB received for an unchanged reconciliation, successful synthetic +134 publication/replay/rollback, and actual Worker Cache API cold 3 / warm 0 calls. Those measurements do **not** establish this new native staging protocol's syntax, spill footprint, atomic rollback, cache transition or successful genuine publication. Its new Worker/publication/replay/fault results are **NOT RUN**.

Next minimum work is to establish a supported bounded executor-materialization method, such as reducing the detail fold to per-target intermediates, and then review/measure its storage bound before another exact publication. That candidate is not implemented or claimed proven here. No schedule or production cutover is justified by this attempt.

## Local verification and file impact

Node **24.15.0**, repository-prescribed `vp run check`: **1,966 tests / 196 files passed**, including new read-only receipt-resume counter/deadline and mutation-resume rejection tests. Formatting, lint, typecheck, boundaries, build and bundle checks passed; only the two existing UI lint warnings remain. Independent local review found no remaining High/Medium issue in the corrected bounded harness. Full log SHA-256: `60fbad8075a3af74de9adc0b5b4b43a96d0a56ba5cc8c88ccb195a5e47994573`.

This continuation changed only benchmark transport/receipt handling, temporary resource setup/cleanup helpers, focused tests, and evidence/proposal files. No application D1 runtime or data model was replaced. The private execution harness, frozen input and raw receipts remain ignored under `.neon-benchmark/`; no connection string, password or token is included in the report. The existing dirty checkout was preserved. Detailed [sanitized remote receipt](../evidence/neon-staged-remote-admission-2026-10-04.json) accompanies this report.
