# Neon public-read adapter and bounded runtime investigation

The native PostgreSQL adapter passes local API-contract and SQLite differential checks. The single approved, privacy-filtered production tail completed with **zero eligible public GETs**. No actual cohort was available to replay. **Production safety is not certified.** No production routing, database rows, schedules or Worker secrets were changed.

This report extends the [full-corpus benchmark](../neon-benchmark-2026-10-04.md), [monthly reconciliation policy](../neon-monthly-refresh-policy.md) and [frozen publication proof](neon-portability-publication-2026-10-05.md). It does not repeat the million-row D1/Neon reconciliation or publish a new database version.

## Preserved state

- Branch: `feat/d1-free-incremental-refresh`.
- HEAD: `482be1eba9ff2091c1580f5757d7b33e20b26515`.
- Existing dirty work was preserved; nothing was staged or committed.
- All nine frozen publisher source hashes match. Code SHA: `e211c4cbf647f143c80a5eb1a69b0b070f293a95c3515d855cda1310e4758b91`; SQL SHA: `2076f556758d1f49090c16ab8e215e62454ec62924a424e037624704f4416f8e`.
- Production D1 remains the runtime backend. D1 refresh and the proposed Neon monthly schedule remain disabled. The existing private-shortlist cleanup schedule is unchanged.
- No new publication, production SQL, Worker deployment, Hyperdrive, schema/index change, role/grant change, push, PR or merge has occurred in this phase.

## Faithful native public reads

`runtime-read-adapter.mts` invokes the ten existing public GET handlers and the unchanged `withPublicDataCache`. `runtime-read-sql.ts` accepts only the exact finite SQL forms those handlers emit. Unknown, mutating and multi-statement SQL is rejected before transport. Private routes, non-GETs, Cookie and Authorization requests are rejected before querying.

The port preserves the actual response shapes, summary sort keys, normalized search predicates, result truncation, cohort readiness, 5,000-row dictionary keyset pages, dictionary ranking and manifest/version checks. JSONB documents are returned as text where the existing handlers parse JSON. It preserves SQLite integer-cast truncation for selected-type prices and ASCII-only NOCASE behavior.

Actual PostgreSQL execution exposed a text-collation difference that mocks did not catch. Dictionary cursor comparisons and search ordering now use `COLLATE "C"`, preserving SQLite byte ordering; trend text sort keys use the same explicit collation. No index or schema was altered. Summary rows with equal values for both existing sort keys have no defined cross-engine tie order; the differential test checks the defined order and compares tied rows without inventing a third production sort key.

The current production Worker wiring supplies `publicDataVersion` but does not supply the optional shared suggestion-dictionary cache. The adapter mirrors that wiring. Suggestions therefore retain the existing 60-second isolate memory cache, plus versioned response caching; this experiment does not assume a newly shared dictionary or a globally warm POP.

## Local validation

| Check                                                            | Result                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Focused adapter/privacy/cache tests                              | 35 passed in two files                                       |
| Actual localhost PostgreSQL 18 differential/native-handler cases | 35 passed                                                    |
| Differential fixture                                             | 78 blocks, 50 trends, two MRT rows; two explicit edge blocks |
| Full repository format/lint/typecheck/test steps                 | Passed; 2,025 tests in 198 files                             |
| Prescribed local build/boundary/bundle checks                    | Passed after sandbox escalation for tsx IPC                  |
| Frozen publisher identities                                      | All nine unchanged                                           |
| New remote database queries                                      | Zero                                                         |

The typed lint engine crashed once internally. Its successful rerun used `GOMAXPROCS=1`. The full gate then passed through tests but the sandbox blocked the build's local tsx IPC socket; `vp run build` subsequently passed with the required escalation. Existing stringification warnings remain in unchanged/frozen files. No production application was deployed.

The owned localhost container was deleted. Its temporary credential was removed. Public fixture setup was rolled back; unrelated local containers and the remote benchmark branch remain intact.

## Local response-size admission evidence

A separate localhost diagnostic loaded only public blocks, trends, MRT and manifest. It merged retained source rows with the frozen publication's final values, checking 29,351 block preimage fields and 159 trend preimage fields. It did not load transactions or private shortlist data. This reconstructs public result envelopes for admission; it is not a new remote after-state verification.

| Query                |   Rows | Local PostgreSQL received protocol bytes | Result JSON bytes |
| -------------------- | -----: | ---------------------------------------: | ----------------: |
| Full block summaries |  9,730 |                                9,080,927 |        13,532,375 |
| All trends           | 45,028 |                                3,080,685 |         6,142,378 |
| Dictionary page 1    |  5,000 |                                  445,860 |           680,684 |
| Dictionary page 2    |  4,730 |                                  404,227 |           626,361 |
| Manifest             |      1 |                                   10,679 |            11,411 |
| MRT stations         |      1 |                                   43,290 |            48,632 |
| MRT exits            |      1 |                                  164,675 |           184,253 |

These plaintext localhost protocol measurements are separate from finalized Neon public transfer, TLS/framing costs, Hyperdrive behavior, Worker memory and HTTP response encoding. Each cold request can also need manifest reads. A proposed 20 MB in-flight reserve is not permission to execute an arbitrary 32-request mix: 32 cold bulk-summary reads alone would exceed the 100 MB aggregate pilot allowance. A replay must admit its complete selected cohort against per-query bounds and include control/connection overhead before creating compute-active resources.

## Passive capture scope

The user approved one temporary tail on the existing production Worker, capped at 60 minutes, 500 eligible public GETs and 1 MiB sanitized output. Production behavior and logging configuration are unchanged. Raw WebSocket frames stay in memory; no raw headers, bodies, cookies, authorization, IP, user agent, referrer, client/session identifier or private route is retained. Public values are checked against the retained official dictionary; unknown/free-text identifying values are excluded. Only public path, canonical relevant parameters, coarse cadence/order, weights and POP are retained.

The first control request returned HTTP 401/code 10000 and created no subscription. The existing Wrangler OAuth session was then refreshed by `wrangler whoami`; the rejected receipt is preserved separately. The single successful subscription began at **2026-10-05T04:58:52.803Z**, with hard collection deadline **2026-10-05T05:58:52.803Z**. It is not restarted or extended.

Collection stopped at **05:57:36.147 UTC**, about **58 minutes 43 seconds** after its start, before the fixed maximum and OAuth expiry. The finalized receipt at **05:57:37.972 UTC** records **zero frames, zero eligible GETs, zero rejected events and 527 B of sanitized metadata**. The tail DELETE succeeded. No Worker, Hyperdrive or replay was created. The collection was not restarted or extended.

The non-PTY session did not accept the operator's stdin STOP, so the exact owned capture process received SIGINT. After its successful deletion/final receipt, a lingering Node handle kept that completed process alive; only that exact process was removed. A local exit/flush fix now ends future driver runs after the synchronous receipt and cleanup, with failure status for unsuccessful setup/collection. This fix was checked locally; no second remote subscription was opened to retest it.

Cloudflare real-time tails can be sampled. Zero eligible observations would mean no usable cohort was captured in this bounded window, not zero application traffic or a globally complete traffic census. [Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/).

## Existing runtime telemetry and monthly budget

Read-only Cloudflare analytics reported **141 invocations** across **12 POPs** during September 5–October 5 UTC, including **76** in the last seven complete UTC days. One daily group was sampled. These are invocation aggregates, including potentially scheduled/private traffic. Available fields do not identify method, path, query, eligibility or internal Cache API hits, so they cannot supply the missing public GET cohort.

The most recent production deployment predates the candidate Cache API implementation. Its aggregate analytics cannot establish that candidate's public hit rate. The earlier isolated cache tests proved real warm hits with zero SQL, but their common fallback query was not a faithful bulk-summary/trend/dictionary adapter. The new native adapter remedies that local prerequisite; remote faithful replay remains a separate gate.

The adopted local policy is one explicit reconciliation per UTC month plus explicit manual runs. Upstream hints and seven-day age do not trigger expensive reconciliation. The schedule remains disabled.

| Monthly planning item                        |         Bytes |
| -------------------------------------------- | ------------: |
| Conservative Free public-transfer allowance  | 5,000,000,000 |
| Safety reserve                               | 1,000,000,000 |
| One previously measured reconciliation proxy |   493,707,924 |
| Remaining for runtime and other activity     | 3,506,292,076 |

Each extra reconciliation shares that allowance and costs another recorded 493,707,924-byte proxy. The earlier 12,997,301-byte bootstrap figure combines three bulk result sets; it is not a cost per request or visitor. POP locality, independent canonical keys, response/pointer expiry, isolate dictionary misses, failures, retries and other traffic must be counted. No actual endpoint mix or hit rate is invented from aggregate invocation totals.

Neon Free provides 100 CU-hours/month under the documented plan. At 0.25 CU, 400 active hours consume that allowance; continuous 30-day activity is about 180 CU-hours before larger autoscaling. Every uncached query can extend an idle tail. The approved pilot uses at most 1 CU and 0.25 CU-hours, including setup, pooled-connection idle time and cleanup, with an explicit suspension before the 15-minute ceiling. These are conservative engineering bounds, not live provider billing readings.

## Fresh control-plane evidence

At **2026-10-05T05:08:11.628Z**, the project API confirmed `free_v3`, AWS Singapore, PostgreSQL 18 and a 1,073,741,824-byte logical limit. Reported logical/project storage remains **452,173,824 B**, or **42.112%**, with **621,568,000 B** headroom. The benchmark endpoint was idle, maximum 1 CU, suspended since 03:19:52 UTC. A final **06:01:06.610 UTC** read confirms the same idle/suspension state and last database activity at 03:15:18 UTC. Control reads did not wake it.

Allowance period: **2026-10-01 00:00 UTC → 2026-11-01 00:00 UTC**. Compute/transfer counters still return zero despite earlier successful measured workloads; actual remaining quota remains **UNKNOWN**. The last rounded Console totals are historical, not a fresh meter. Export is unnecessary, but this execution environment has no callable browser-control tool to hover the currently open graphs. No native browser automation or browser permission change was attempted in this phase.

## Replay and verdict

The approved isolated pilot must use only `benchmark-d1-migration` / `br-wispy-boat-b34glczl`, the existing SELECT-only role, Hyperdrive query caching disabled, and the actual versioned Cache API. Aggregate limits are **32 GETs total across cold and normal modes**, **100 MB received transfer**, and **0.25 CU-hours total**. No production routing or secrets may change; test Worker/Hyperdrive must be deleted afterward.

Replay status: **not performed; zero eligible real GETs captured**. No synthetic visitors or invented workload was substituted. The 32-GET/100-MB/0.25-CUh pilot has no new database query/result consumption or compute activation. Small management API reads are separate from database-result transfer and do not establish a live billing balance. No new Neon publication or million-row reconciliation was performed.

**Current overall verdict: NEON FREE IS MARGINAL. Runtime production-safety evidence remains insufficient.** Comfortable measured storage, atomic publication and practical Singapore connectivity are established by prior receipts. This phase establishes faithful local public-read semantics. It does not yet establish actual runtime transfer, active-time or globally representative cache behavior. Nothing here authorizes a cutover or a schedule.

## Repository impact

New files in this phase are the native SQL compiler and handler adapter, pure privacy collector, explicit tail driver, localhost verification driver, focused unit tests and this report/structured receipt. They are isolated investigation tooling, not runtime/backend replacement. The nine publisher files are unchanged. `.neon-benchmark/runtime-canary/` holds ignored, private local diagnostics; sanitized public evidence may be copied into `docs/evidence/`. Existing Neon configuration, dependencies, candidate policy/prototype files and D1 evidence remain preserved.

The final working tree has **112 candidate files**, including the preserved 104 files and this investigation's six tooling/test files plus report and structured receipt. A scan against retained real credential values found no matches in those candidate files. Local Neon/env/capture state is ignored. Nothing is staged, committed, pushed or merged. The exact final status is saved with the ignored diagnostics; branch and HEAD are unchanged.
