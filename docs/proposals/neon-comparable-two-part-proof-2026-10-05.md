# Owner diagnostic: native startup timeout is not effective

**The newly authorized October6 read-only diagnostic completed once and stopped.** The connection identified `neondb_owner` / `neondb`, but returned **`statement_timeout = '0'`**, source **`'default'`**, while the client's prepared native StartupMessage configuration contained **`statement_timeout = '60000'`**. The failing predicates are exactly `owner_timeout` (expected1min) and `owner_timeout_source` (expectedclient). Identity, row count, catalog bound and runtime default-catalog checks passed.

This is an observed **connection/startup-setting propagation mismatch**, not merely a formatting or source-expectation problem. The effective owner timeout is unbounded0 in this sampled session; the guard must not be weakened to accept it. **The mechanism/location remainsUNKNOWN**—this diagnostic does not prove whether the driver, Neon proxy or another connection layer caused it. The October5 lost returned fields remainUNKNOWN; today's observation is separate evidence and is not written into the prior receipt.

## Single authorized observation and exact result

User authorization `Sentinel_c469e42908a081918a96c535f6c5e2f5`, issued2026-10-06 00:59UTC, authorized a new one-query diagnostic after the retired pilot. It was not treated as a retry or as part of the0.50CUh pilot allowance. Scope: existing isolated project `wispy-mouse-67963002`, candidate branch `br-rough-frost-b3e2ks1b`, native endpoint `ep-steep-water-b300tebo`, Singapore, database `neondb`, existing `neondb_owner` credentials. Read-only endpoint metadata verified the exact idle, unpooled candidate at max1CU before connecting.

| Returned / prepared field                 | Exact value                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Prepared native startup statement_timeout | 60000                                                                         |
| Prepared application_name / options       | hdb-scoped-terminal-recovery /no options                                      |
| Connected role / database                 | neondb_owner /neondb                                                          |
| Effective owner statement_timeout         | 0                                                                             |
| Effective timeout source                  | default                                                                       |
| Defaults bounded                          | true                                                                          |
| Runtime role selector                     | setrole49152, setdatabase0 (role-global; no database-specific entry returned) |
| Stored runtime timeout / read-only        | statement_timeout=60s /default_transaction_read_only=on                       |
| Failed checks                             | owner_timeout, owner_timeout_source                                           |
| Original catalog check                    | PASS                                                                          |

The runtime role defaults are catalog observations, **not a fresh runtime login**; the only database connection was the owner. The exact unchanged metadata SQL had SHA256 `cad559bcdee3f847221cae3087789a80e665a970e62ce883c44332e120bb2c87`, zero parameters and one returned row. No extra SHOW, connectivity query, version query, application row read or private data query was issued.

## Retention, client fail-safe and separate verification overhead

Raw returned settings were fsynced in a private0600 file at **2026-10-06T01:10:16.745Z**, **before result shape/size or guard evaluation**. The raw document is529B; its SHA256 is `348f2a5aabd11ed91b57b530daa808e68ccc674d3258ea98dcad6c8599fa4d1f`. Its catalog contains only the two safe runtime settings shown above. Raw credentials/URIs/tokens are absent from receipts and Library. Local tests verified retention before rejection, connect/query timeout paths, prevention of a late query after connection timeout, oversized-result rejection after raw retention, and the original catalog-literal guard.

The native connection construction was unchanged: acquisition15s, query_timeout65s and prepared startup statement_timeout60000. A **separate20s client wall deadline** covered connection+query+retention, closing/destroying the existing socket on expiry; a38s outer process fail-safe covered metadata preflight and teardown. Neither timer fired. Closing the client does not by itself establish a server execution/compute ceiling. No extra cancellation connection or SQL was opened.

| Measurement                                                    |                                  Actual |
| -------------------------------------------------------------- | --------------------------------------: |
| UTC start/end                                                  | 2026-10-06T01:10:12.500Z →01:10:16.761Z |
| Read-only endpoint API / fresh owner connections / SQL         |                                 1 /1 /1 |
| Native connection wall                                         |                              1077.006ms |
| Native query wall                                              |                               135.594ms |
| Query path including intent persistence                        |                               142.659ms |
| Client wall including close                                    |                              1239.694ms |
| Entire process wall                                            |                              7463.087ms |
| Successful result-message bound / actual upper                 |                           65,536B /401B |
| Visible query received / sent bytes                            |                              401B /928B |
| Deadline / cancellation request                                |                         not fired /none |
| Client end / stream close                                      |                     completed /observed |
| Application data reads / POSTs / mutations / resources / retry |                           0 /0 /0 /0 /0 |
| Actual server SQL duration / billed CUh / billed transfer      |               UNKNOWN /UNKNOWN /UNKNOWN |

Query byte observations exclude startup/SSL/TCP and opaque provider activity; they are not an all-origin physical or billing measure. This is **separate verification overhead**: no budget/count/tail credit was taken from or assigned to the retired0.50CUh pilot, and its one-command ledger and receipts remain unchanged. No timeout cancellation fired, so a server-cancellation acknowledgement was not requested. The fast successful SELECT does not prove server enforcement of60s or a compute ceiling; observed effective0 demonstrates the current construction did not supply that bound.

After the one query the client closed and execution stopped. No role/database setting was fixed, no second owner/runtime connection or diagnostic was attempted, and no Worker/Hyperdrive, migration, publication, production mutation, schedule, commit/push/PR/merge followed. Existing benchmark/candidate branches remain preserved. The prior pilot's `safeRestoredState:false` still means no restoration was required because no ALTER ever ran; no pending mutation was created by this diagnostic.

## Evidence and next decision

Private one-shot intent/raw/result/process receipts, source, five local control tests and strict typecheck are under `.neon-benchmark/owner-diagnostic-20261006/`; `summary.json` lists exact fingerprints and overhead. Exclusive fsynced authorization consumption blocks another run. The prior pilot's four immutable execution receipts and all19 frozen product/pipeline sources plus6 original failed-pilot artifacts still match.

No repository runtime/publisher/guard expectation was changed in this diagnostic follow-up. The last prescribed full gate remains **2,174 tests /211 files PASS**; the ignored diagnostic's five local safety checks and strict typecheck pass. Only owned report/evidence changed; formatting is checked separately.

**Stop gate:** a supported native direct timeout construction needs a separate proposal/local proof and new remote admission before the bounded pilot can continue. This task did not select a proxy/options explanation, weaken the guard, fix the setting remotely or execute another experiment.

<details>
<summary>Retained report v6 — preceding pilot stop and read-only diagnostic proposal before the new authorization</summary>

# Comparable pilot: actual entrypoint wired; remote owner proof blocked

**REMOTE PILOT STOPPED BEFORE ANY ROLE CHANGE.** The actual existing isolated Worker/executor is wired and validated. Complete admission and read-only provider preflight passed, then the one-shot candidate attempt stopped after its first owner SELECT because the required native 60s/client-source/identity/bounded-catalog proof did not match. **The differing field is UNKNOWN:** the executed guard did not retain its returned values before rejecting. Do not infer that Neon dropped a startup parameter or that any particular field failed.

There were **1 successful SELECT, 0 ALTERs, 0 comparable POSTs, 0 data writes and 0 Worker/Hyperdrive creations**. The executed SELECT returned one row in **62ms wall time**. No SQL error occurred. No timeout lowering was attempted; restoration was **not required or attempted**, and a fresh runtime60s verification was **not run**. This is an observed remote blocker, not another unfinished integration checkpoint. The one-shot ledger and failed receipt are preserved; **no retry or reset occurred**.

## Target, validation and admission

Branch `feat/d1-free-incremental-refresh`, unchanged HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`. Initial 95 status lines; final 96 (one new entrypoint test file). Thirteen pre-existing modified tracked files remain untouched; no existing work was discarded. All **19 frozen product/pipeline sources and 6 original failed-pilot artifacts** match their recorded hashes.

Exact isolated target: existing project `wispy-mouse-67963002`, candidate `production-candidate-20261005` / `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, AWS Singapore. Runtime `hdb_benchmark_runtime`, database `neondb`. Retained public corpus/oracle: 988,128 transactions / 45,028 trends, publication `4794aa04f6c990fbe5fb6e4ba24b433ac84bebb294bf5b7ab7cbd91959244b0f`. No full corpus scan or import was repeated. Existing benchmark/candidate branches remain preserved.

`vp run check` passes **2,174 tests / 211 files**, including **10 actual-entrypoint integration cases** and all **112 focused pilot cases** in the final full gate. A preceding focused command passed111/10 before the final TLS test. Format, lint, strict types, tests, architectural boundaries and build/bundle all pass. Eighteen pre-existing warnings; no new pilot warnings. Private isolated Worker/executor strict TSC passes. Final isolated Worker dry run passes (**1,063.12KiB / 180.84KiB gzip**), using generated binding types; latest Cloudflare Workers types5.20261005.1 were retrieved without installing dependencies. Wrangler4.99.0. Initial formatting/type/fixture failures and the local IPC restriction are retained; reviewed local IPC permission allowed the final prescribed gate.

The exact authorized reservation remains **56 commands / 3 POSTs / 12 connections**, 46 work +10 cleanup. SQL344s + acquisition180s + resource cleanup45s + separate Hyperdrive600s and Neon300s tails = **1,469s / 0.408055556CUh at1CU**. Planned ceiling **.45CUh**, separate setup/opaque contingency **.05CUh /180s**, hard total **.50CUh**; planned margin151s. No overlap/fast-query credit, refund or hidden command pool. Three selected cases remain block-time-adjusted, street-raw and town-raw. Comparable producer envelopes reserve86,111B perPOST; the25,000,000B scope is application-visible comparable data, not a physical opaque-origin guarantee.

At2026-10-05T17:52:44.468803+00:00 the existing expired Cloudflare OAuth token was refreshed non-interactively using its existing refresh token. Same account and scopes, no new login/grants. Provider preflight confirmed exact candidate idle, max1CU, native non-pooled endpoint and both temporary names absent. It ran zero SQL. The first local preflight had rejected the existing stricter `verify-full` runtime URI; that guard was corrected and tested without changing credentials or weakening TLS. That stop preceded all provider calls.

## Actual wiring and local integration evidence

The existing ignored `worker.ts`, `execute.mts` and `admission-model.json` were updated in place, with their prior bytes retained under `scoped-wiring-before/`. There is no parallel proof-only executor. The CLI and tests call the same exported `executeScopedPilot`; importing it calls no provider and reads no credentials.

The actual Worker imports the exact direct-setup ledger rather than resetting it, checks producer certificates in each unchanged comparable snapshot, charges setup intervals, verifies runtime2s/SELECT/read-only safeguards, gates sequential/concurrent diagnostics, and fences/exports the same ledger for recovery. The controller uses the native direct owner60s construction with zero SQL SETs; runtime has no startup timeout override. After resource absence and full unknown-permit quiescence, its reserved terminal lane permits only one scoped restore and one fresh runtime verification.

Ten actual-entrypoint tests cover exact admission/unproved refusal, complete2s→60s flow, every producer certificate, sequential/concurrent shared dispatch, refused command91 after retirement without driver send (the strict global90 cap also has separate accounting tests), retained phase counts/start/custody, producer failure, setup failure, owner-proof mismatch before lowering, one-shot import/drift rejection, unresolved resource absence, lost accepted retirement response reconciled by reading its existing certificate without repeat mutation, fsynced file custody across executor objects/reset refusal, and preservation of verify-full TLS. These are local/mocked integration tests; the separate local PostgreSQL18 proof below remains a real semantic fixture, not remote performance evidence.

## Exact remote outcome and remaining state

| Measurement                          | Actual candidate result                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| UTC start/end                        | 2026-10-05T17:55:16.859Z →17:55:23.395Z                                                    |
| Admitted/executed SQL                | 1 owner catalog/settings SELECT, succeeded                                                 |
| SELECT wall / metadata               | 62ms /1 row; SQLSTATE null                                                                 |
| Required owner proof                 | Failed; exact mismatching field UNKNOWN                                                    |
| Original scoped defaults             | Not retained; rejection preceded catalog recording                                         |
| Role changes / POSTs / data writes   | 0 /0 /0                                                                                    |
| Worker / Hyperdrive / DO creation    | None                                                                                       |
| Cleanup                              | Worker, Hyperdrive and counter namespace absence verified                                  |
| Shared ledger                        | 1 command /1 connection; direct-recovery owner, generation1; original start/count retained |
| Setup/cleanup contingency            | 4,692ms charged, no refund                                                                 |
| Active wall                          | 6,536ms                                                                                    |
| Conservative elapsed+bothtails proxy | 0.251815556CUh; provider CUh UNKNOWN                                                       |
| Restore / fresh60s verification      | Not required/attempted; verification NOT RUN                                               |
| Direct protocol / billed transfer    | NOT MEASURED /UNKNOWN                                                                      |
| Blind retry / reset                  | 0 /0                                                                                       |

Absence was verified at2026-10-05T17:55:23.352Z. No temporary resource remains to remove, and no2s override was ever sent. `safeRestoredState:false` in the terminal helper means no restoration was performed because none was required; it does not indicate a pending role mutation. Production D1 and Neon remain untouched, existing public routing/secrets are unchanged, all scheduled refreshes remain disabled, and nothing was staged/committed/pushed/merged or submitted as a PR.

The three semantic POSTs, Hyperdrive effective timeout/slowread, deployed shared-counter diagnostic and deployed producer bound **did not run**. Do not certify them from local passes. The executed source/validation/config copies and all remote lifecycle/HTTP/direct/recovery receipts remain private and immutable in `.neon-benchmark/shared-counter-candidate-pilot-20261005/`. Root report/evidence/patch are updated owned artifacts. The old six failed-pilot artifacts remain unchanged.

## Read-only diagnostic proposal — review only, not executed

Propose **exactly one new owner metadata SELECT on the same isolated candidate**, using the unchanged native direct owner construction, to identify the failed field. This would require separate explicit direction; the retired pilot's approval, counter or reservation would not be reused, reset or refunded. No diagnostic has run.

| Proposed bound / action          | Exact scope                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Target                           | wispy-mouse-67963002 /br-rough-frost-b3e2ks1b /ep-steep-water-b300tebo /neondb /existing neondb_owner                                                        |
| Read-only preflight              | Endpoint metadata: exact candidate, idle, native unpooled, max1CU                                                                                            |
| SQL attempts / fresh connections | At most1 /1; no retry                                                                                                                                        |
| SQL                              | Unchanged `SCOPED_OWNER_RECORD_SQL`, SHA256 cad559bcdee3f847221cae3087789a80e665a970e62ce883c44332e120bb2c87; no bound parameters                            |
| Successful output                | Exactly1 metadata row; catalog JSON≤64,000B or NULL with boundedfalse; successful result reservation65,536B                                                  |
| Socket reservations              | Receive131,072B /send32,768B; physical/startup/error/opaque hard limit not claimed                                                                           |
| Client construction              | Native statement_timeout60,000; acquisition15,000ms; client query_timeout65,000ms; same application_name and existing TLS credentials; no options or SQL SET |
| Retain before rejecting          | Row count, role, database, timeout, source, bounded-catalog flag, exact failed predicate names; relevant bounded catalog private mode0600                    |
| End condition                    | Close after the one result/error/timeout; persist outcome and report; never proceed to any ALTER or serving/publication test                                 |
| Excluded actions                 | SQL SET, role/grant/password changes, slowread, runtime login, corpus/private data, Worker/Hyperdrive, migration, publication, production or schedule        |

The SELECT only inspects metadata functions/pg_settings and exact role/database catalog selectors. Retain safe observations before any comparison; raw catalog setting values remain private, with report values limited to timeout/read-only settings and exact selectors. Record UTC/monotonic times, SQLSTATE, driver outcome and reliable visible-byte observations. Never label reservations as transferred bytes.

**Important admission limit:** the native60s startup setting is not remotely proved, and the failed run did not retain its value. Therefore acquisition/client65s limits **do not establish a server execution/cessation bound**. `(15+65+5+300)/3600×1CU =0.106944444CUh` is only a conditional planning estimate with a5s close target and the Neon300s tail; no Hyperdrive would exist. It is **not a hard .11CUh or recycled .50CUh guarantee**. An absent/unknown native timeout or ambiguous result leaves server duration and billed computeUNKNOWN.

This proposal is **NOT ADMITTED** under a requirement that the first remote SELECT already have a demonstrated server deadline. The review decision is whether to allow exactly this new one-SELECT read-only metadata observation while acknowledging that narrow unknown, or retain the proof requirement and stop. A returned value would guide the minimum fix; no proxy/options/startup explanation is selected before seeing it. Any later pilot requires its own complete admission and authorization. Exact SQL/config/proposal metadata is retained in `owner-readonly-diagnostic-proposal.json`; execution counters there are allzero.

## Diagnostic fix and next decision

After stopping, the local owner guard was corrected to retain only safe role/database/effective-timeout/source/bounded-catalog fields and the failed-check names before rejection. Its fixture proves recording a0 timeout/client source and refusing lowering. The full2,174-test gate and private strict TSC pass again. This change adds **no SQL, parameter, timeout assumption or retry**. The failed remote run was not repeated; its unretained field remains UNKNOWN.

A separately bounded, explicitly directed read-only owner-setting diagnostic is needed to establish the differing field and whether a native direct owner construction can prove the required60s bound on Neon. Any resulting construction requires appropriate local proof and renewed complete admission; it cannot restart/refund this retired one-shot cohort. No production cutover, schedule or Neon Free viability certification follows from setup/local success. Current-period usage totals, allowance dates/update lag and provider billing remainUNKNOWN; monitoring axes are not totals, and this environment has no Chrome-control tool to hover the supplied page.

| File                                            | Classification                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Existing ignored isolated Worker/executor/model | Pilot wiring and exact reservation; machine-specific state remains ignored |
| `tests/unit/neon-pilot-entrypoint.test.ts`      | New repository integration tests against actual entrypoints                |
| Owned report/evidence/patch                     | Concrete reviewable outcome, preserved failed run and hashes               |
| Ignored snapshots/receipts/validation logs      | Local evidence; contains no exposed connection strings or credentials      |

**Verdict: bounded candidate pilot blocked before any role or resource mutation; required remote owner startup proof remains unestablished.**

<details>
<summary>Retained preceding local proof and historical checkpoints</summary>

# Comparable pilot: current scoped local proof

**LOCAL PROOFS PASS; REMOTE PILOT NOT ADMITTED.** Current authorization is a **0.50 CU-hour ceiling: 0.45 planned / reserved + 0.05 separate setup / opaque contingency**, at 1 CU. The complete 56-command / 3 POST / 12-connection shape reserves **0.408055556 CUh**. The previous 0.35 cap and 53-command refusal below are historical; they are not the current gate.

Local PostgreSQL 18 demonstrated the precise native direct owner 60 s construction, producer-bounded successful comparable results in one read-only snapshot, and owned terminal recovery. `vp run check` passed **2,164 tests / 210 files**, including all 102 focused pilot cases and the latest direct-client tests. No Neon / Cloudflare API, candidate query, role / default change, remote Worker / Hyperdrive creation, production change, deployment, schedule, commit / staging / push / PR / merge occurred in this follow-up. The only database was an ephemeral **127.0.0.1:55432** synthetic fixture; it was stopped / deleted and absence verified at **2026-10-05T16:54:50.179228+00:00**.

## Scope and exact reservation

Unchanged branch `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`. Initial status 93 lines,13 already-modified tracked files; no changes discarded. Frozen 19 product / pipeline sources and 6 original failed-pilot artifacts remain byte-identical.

Would-be candidate: existing project `wispy-mouse-67963002`, branch `production-candidate-20261005` / `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, Singapore. Existing runtime role `hdb_benchmark_runtime`, database `neondb`. Retained publication `4794aa04f6c990fbe5fb6e4ba24b433ac84bebb294bf5b7ab7cbd91959244b0f`, public oracle 988,128 transactions / 45,028 trends; no re-import / reconciliation / source scan. Production D1 remains untouched.

| Phase                                       | Commands | Connections | Server bound per command (s) | SQL reserve (s) |
| ------------------------------------------- | -------: | ----------: | ---------------------------: | --------------: |
| owner-record-and-lower                      |        2 |           1 |                           60 |             120 |
| fresh-direct-runtime-before-pool            |        2 |           1 |                            2 |               4 |
| safeguards                                  |        8 |           1 |                            2 |              16 |
| candidate-sequential-diagnostic-20261005    |        3 |           2 |                            2 |               6 |
| candidate-concurrent-diagnostic-20261005    |        1 |           1 |                            2 |               2 |
| comparables                                 |       30 |           3 |                            2 |              60 |
| cleanup-observations-before-resource-delete |        8 |           1 |                            2 |              16 |
| owner-scoped-restore-after-resource-delete  |        1 |           1 |                           60 |              60 |
| fresh-direct-runtime-restored-sixty         |        1 |           1 |                           60 |              60 |
| TOTAL                                       |       56 |          12 |                        mixed |             344 |

`4 ×60s +52 ×2s =344s SQL;12 ×15s =180s acquisition;45s resource cleanup;600s Hyperdrive tail +300s Neon tail. (344+180+45+900)/3600 ×1CU =0.408055555556 CUh.`

Planned margin **0.041944444444 CUh / 151 s**. Separate contingency **0.05 CUh / 180 s** cannot be consumed by a plan over 0.45 or reclaimed from successful / failed / ambiguous work. No tail overlap, fast-query credit, blind retry, ledger reset or owner timeout assumption supplies budget. Setup acceptance / lifetime has no invented 15 s hard bound: setup intervals are separately persisted / charged, an ambiguous / failed setup stops ordinary work, exhaustion persists as stopped. The proxy is conservative reservation accounting, **not measured provider CU-hours or a claim that network-aborted provider work has stopped**.

The prior 53-command sequence gains **exactly 3 bounded producer-certificate SELECTs**, one per comparable POST, inside its existing repeatable-read read-only snapshot. No additional SQL SET. The 90 attempt maximum and 10 cleanup slots share one monotonic pool; three plannedPOSTs remain below the user's ten-POST maximum. Factory(false,false) refuses unproved settings before credentials / resources; factory(true,true) demonstrates conditional arithmetic fit only.

## Exact native direct owner proposal and actual local server proof

Proposed pilot-only construction:

```ts
new pg.Client({
  connectionString: existingDirectURI,
  connectionTimeoutMillis: 15_000,
  query_timeout: 65_000,
  application_name: "hdb-scoped-terminal-recovery",
  ...(purpose === "owner" ? { statement_timeout: 60_000 } : {}),
});
```

The native DIRECT owner setting is serialized into the PG StartupMessage. It adds **zero SQL SETs**, alters no owner persistent default, and replaces no product transport. Runtime construction deliberately omits statement_timeout / options to expose the actual candidate role / database default. Older 120 s helper is excluded. This is a **different exact direct construction now proposed and locally tested**, not a claim that an earlier unproved variant was authorized / proved remotely. All 3 owner operations must use it; initial reserved owner-record SELECT must confirm 1 min / client / database / role / bounded original scope before lowering. Fresh 2 s / 60 s runtime sessions must never override the inherited setting.

The supported distinction between statement_timeout and a client query_timeout is documented in [node-postgres Client](https://node-postgres.com/apis/client). PostgreSQL applies runtime startup parameters before ReadyForQuery in the [PostgreSQL 18 protocol](https://www.postgresql.org/docs/18/protocol-flow.html). Installed **pg 8.23.1** serialization was inspected. On cached official **PostgreSQL 18.6**, effective owner timeout was **1 min**, source **client**, and `SELECT pg_sleep(61)` failed with **SQLSTATE 57014** after **60008.008 ms**, before client 65 s expiry. A fresh plain owner session afterward returned timeout**0** and no owner defaults, demonstrating no persistent change. Local runtime effective 2 s slowread cancelled at **2004.798 ms**. These are localhost results, **not an observed Neon proxy or Hyperdrive setting**.

The exact original catalog query bounds the exported JSON at 64,000 B, captures global / database / role combinations using exact OIDs, and rejects overflow without truncation. Local original runtime 60 s was role-global with no DB-specific override. Approved explicit scoped SET 60 restoration leaves a **new DB-specific 60 s override**; the actual final shape is recorded. No RESET / global / ALL / other-role / database / password / grant operation is proposed remotely. Local fixture setup roles / grants only are clearly separate.

## Producer-bound returned data

Before row / count / history retrieval, one small certificate SELECT runs inside the same snapshot, checks the pinned manifest, winning-scope count, exact selected 150 rows' octet lengths, at most one town / flat pair, and full history≤442 rows / field bounds. The handler / compiler / SQL and full trend history remain unchanged; no SQL LIMIT / truncation / approximation was added to trends. Source SQL and parameters are exact / pinned; repeated counts / projection / trend / statements are refused.

Successful typed result-message reservation **86,111 B perPOST**, **258,333 B for 3**, and **464,832 B for the complete phase-envelope model**, including separately bounded owner / control replies. The old 174,978 B belongs to the earlier 51-command typed envelope and is not relabelled. Before client construction the result lease must cover this entire result envelope. A failed producer certificate prevents all subsequent count / row / history queries. Postparse row checks detect a contract violation; they are not the physical limiter.

Actual localPG negative tests: oversized selected field refused,443 historyrows refused,manifest mismatch refused, empty scope accepted; legitimate duplicate IDs 1 / 2 andNULL lease rows were preserved in both populated cases. Local fixture 32 transactions / 1 trend is a **semantic fixture**, not a production-scale performance / storage measurement. Synthetic pg_stat_statements view serves diagnostic shape; its zeros are not provider SQL / compute metrics.

| Local comparable case | HTTP | Counted application SQL | Visible received socket B | Visible sent socket B | Results |
| --------------------- | ---: | ----------------------: | ------------------------: | --------------------: | ------: |
| raw-duplicate         |  200 |                       8 |                     5,621 |                 4,313 |      30 |
| time-adjusted         |  200 |                       9 |                     5,860 |                 4,592 |      30 |
| empty-time-adjusted   |  200 |                       7 |                     1,185 |                 3,964 |       0 |

**Byte scope:** producer proof upper-bounds the declared successful comparable result data. Visible socket bytes are observed after chunks and can overshoot a tripwire. Startup, errors, notices, HTTPresponse size and opaque Hyperdrive-origin traffic are separate; no all-origin physical 25 MB guarantee is asserted. No candidate producer guard or provider usage metric has run in this follow-up.

## Monotonic ownership and terminal recovery

Local fault tests and live fixture verify source retirement before export, exact snapshot / start / counter carryover, one-shot target import, and terminal ownership after Worker / Hyperdrive / counter absence plus every unknown permit's full possible accepted window (grant expiry +15 s acquisition + immutable server timeout). Integrity SHA is not network authentication: real handoff requires the trusted authenticated controller. Unresolved creation / absence, lost / tampered / replayed handoff or wrong owner fails closed.

Ordinary work stops after ambiguity. Terminal lane permits only the reserved exact scoped restore SQL then one fresh runtime settings SELECT, both retaining 60 s and global 90 / counters; no hidden recovery pool. Unknown restore is not retried; after full quiescence the alreadyreserved fresh SELECT may reconcile, but an ambiguous restoration still makes pilotPassedfalse. Missing / failed / private / wrong 60 s verification is **PILOT FAIL**, and remaining state must be reported. No ALTER is sent if lowering never reached its durable driver grant.

Successful livefixture ledger counted **33 commands,3 POSTs,7 connections**, same start across two ownership transfers, no reset / refund. It exercised owner / setup,safeguards,3 POSTs andterminalrestore / verify; it did not execute all 56 remote diagnostic / resource phases. Administrativefixture creation and separate engine / source proof queries are local fixture observations, outside the remote pilot. Restoration sent exactly **2 terminal commands**, acknowledged restore and fresh 60 s / read-only / SELECT-only / no-private proof. No remote resources ever existed, so local absence certificate explicitly says so; actual network DO / Cloudflare deletion transfer remains unproved.

18 scoped faulttests cover failure immediately after lowering, setup failure / uncertainty, stale / tampered / replayed custody, unresolved create / absence, ambiguouslower full wait, ordinary deadline exhaustion, ambiguousrestore reconciliation without retry, failed restore / still 2 s, missing / wrong / private verification, exact terminal SQL, no ALTER without a lower grant, contingency exhaustion andduplicate / overlapping charge refusal.7 producer tests and 10 Worker / direct construction tests preserve frozen semantics.

## Validation and preserved evidence

`vp run check`: **2164 / 210 PASS**, format / lint / typecheck / tests / build / boundary / bundle allpass;18 pre-existing lintwarnings,none in changed pilot sources. Full tests started **2026-10-05T16:53:38+00:00**, raw 00:53:38 on Oct 6 Singapore. Private isolated wrapper / executor strict TSC passed. Prior 102 tests / 9 files focused receipt is retained; latest native construction is covered by the final full gate. No repeated full gate after document-only updates.

The first local formal run passed both timeouts,all 3 POSTs,restoration but failed a fixture assertion comparing string OID"0" to numeric 0. Failed receipt / log retained; corrected only the fixture assertion and reran successfully. No quota / provider work. Container image cached official PG 18 (index SHA 5 a 5 a 84 b 19854 a 9 ffaa 54082 c 166 ff 4 ec 27473 a 361 e 496 e 5 ea 167 f 298 f 2 da 9722); no Homebrew / Docker / Podman installation. Its localhost-only endpoint was removed and absence verified; cached image and other containers untouched.

| Follow-up file                                         | Classification / purpose                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/neon-benchmark/pilot/accounting.ts`           | Scoped .45 planned + .05 contingency envelope; legacy cap retained. Immutable statement bounds; one-second scoped dispatch grant expiry and full accepted server reservations.                        |
| `scripts/neon-benchmark/pilot/cohort-store.ts`         | One monotonically charged cohort, scoped setup intervals, fenced ownership, reserved exact terminal lane and unknown-window quiescence; no reset / refund.                                            |
| `scripts/neon-benchmark/pilot/dispatch.ts`             | Retains transport-ambiguous permits as unknown; no blind retries or complete / refund on missing SQLSTATE.                                                                                            |
| `scripts/neon-benchmark/pilot/pg-instrumentation.ts`   | Optional pilot-only producer-bound gate runs through the same statement dispatcher and counter.                                                                                                       |
| `scripts/neon-benchmark/pilot/plan.ts`                 | Separates .45 planned from .05 setup / opaque contingency; exact one-command terminal restoration and fresh-verification fingerprints.                                                                |
| `scripts/neon-benchmark/pilot/worker.ts`               | Comparable gate integration only in the comparable meter; frozen handler / compiler / transport and diagnostic SQL templates unchanged.                                                               |
| `scripts/neon-benchmark/pilot/returned-data.ts`        | Per-snapshot bounded producer certificate; immutable query shapes / parameters and full history; successful result-message bound 86111 B per POST. Physical socket and opaque limits remain unproved. |
| `scripts/neon-benchmark/pilot/scoped-plan.ts`          | Complete 56-command / 3 POST / 12-connection candidate plan; adds 3 bounded producer certificates to the prior 53-command shape.                                                                      |
| `scripts/neon-benchmark/pilot/scoped-sql.ts`           | Exact candidate-role / database lower / restore and fresh-settings SQL; bounded 64 k original catalog capture with all four exact selector combinations.                                              |
| `scripts/neon-benchmark/pilot/ledger-transfer.ts`      | Transactional source tombstone / export and one-shot owned import; authenticated-controller integrity certificate, resource absence + full unknown-window gate.                                       |
| `scripts/neon-benchmark/pilot/terminal-recovery.ts`    | Only reserved one restore and one fresh verification after stop / quiescence. Ambiguous restore not retried; unverified state is pilot failure.                                                       |
| `scripts/neon-benchmark/pilot/direct-recovery.ts`      | Identity-pinned existing candidate credentials, fresh client per terminal command, proof gate before credential callbacks.                                                                            |
| `scripts/neon-benchmark/pilot/direct-configuration.ts` | Proposed DIRECT owner native PG StartupMessage statement_timeout 60000; runtime has no timeout override; acquisition 15 s / client 65 s; zero SQL SETs.                                               |
| `tests/unit/neon-pilot-scoped.test.ts`                 | 18 fault / accounting / recovery / custody / contingency tests.                                                                                                                                       |
| `tests/unit/neon-pilot-returned-data.test.ts`          | 7 result-lease, producer-certificate, immutable-query / replay and full-history tests.                                                                                                                |
| `tests/unit/neon-pilot-worker.test.ts`                 | 10 tests including actual instrumentation / gate dispatch and direct client proof-before-credentials / fresh-owner / runtime construction.                                                            |

All of these are pilot-only harness / tests. Existing modified application / D1 / setup files remain untouched. Report / evidence / patch are updated owned artifacts; `.neon-benchmark/scoped-pilot-proof-20261005/` contains ignored proof scripts, failed / success receipts, snapshots / logs / cleanup / manifest. Private prior wrapper / executor remains retained and typechecked, **not rewritten / deployed / run**. No new connectionstrings / passwords / tokens are logged or tracked.

## Remaining checkpoint

The old ignored wrapper / executor still references legacy 51-command plan, diagnostic 60 s expectations and no new custody / recovery / orchestration hooks. It must be wired to this exact 56-command scoped sequence and validated before any candidate action: native direct owner construction; bounded original catalog plus timeoutsource check; scopedlower; fresh 2 s role proof before Hyperdrive; same ledgerowner→Worker;2 s / slowread;diagnostics / 3 boundedPOSTs; setup interval receipts; stop / delete / verify absence; same ledger→directrecovery; one restore / fresh 60 s verification. Current live flags remain false and no remote admission occurs.

Native direct owner contract is locally proved, but initial remote setting / proxy forwarding / runtime pool / resource absence / custody is still unobserved. Current-period usage totals / allowance boundaries / update lag remainUNKNOWN; branch monitoring axes / hover values are not project allowance totals. No Chrome-control tool is callable in this execution environment; `@Chrome` does not create one. No export / upgrade was requested.

**Checkpoint: local proofs complete, remote orchestration still pending;0 candidate SQL / role changes / resources.** This report updates the concrete local proof and direct construction for review. It does not certify production cutover, restore a schedule or start the remote pilot.

<details>
<summary>Retained historical report — previous0.35cap/51–53command refusals, superseded by the current checkpoint above</summary>

# Comparable pilot: integrated local admission proof

**STOP BEFORE ROLE CHANGE OR RESOURCES. The newly approved candidate-scoped 2s→60s sequence fails complete admission: at least 0.406389 CUh before unknown extra setup.** The two local harness gaps are repaired: one monotonic durable cohort ledger covers every application command/resource reservation across phases, and full-server admission runs before driver dispatch after receipt persistence. Whole-operation admission now refuses the current plan **before credentials, provider API reads or provisioning**. Remote application SQL/POSTs/database bytes/resources in this phase: **zero**.

**The former promise of a physical 25 MB cap across application plus opaque Hyperdrive traffic remains explicitly withdrawn.** The unchanged 25,000,000 B application socket reservation/tripwire is observed after received chunks and can overshoot. Expected typed result messages, visible socket bytes, HTTP response bytes, opaque origin activity and provider usage are different measurements.

## Exact target and frozen evidence

Would-be target: project `wispy-mouse-67963002`, isolated `production-candidate-20261005` / `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, Singapore. Existing `hdb_benchmark_runtime` is expected to be SELECT-only/read-only with a 60-second role timeout. No role/default/grant/credential was changed. A later narrow approval permits a temporary existing-runtime-role timeout **only IN DATABASE neondb on this candidate**, conditioned on complete admission and mandatory restore60s; no part of that approval was executed. No production/benchmark database operation ran in this phase.

Retained public oracle: **988,128 transactions / 45,028 trends**. Candidate publication `4794aa04f6c990fbe5fb6e4ba24b433ac84bebb294bf5b7ab7cbd91959244b0f`. Baseline SHA-256 `2ad14ad466e803dd7e5a52b51cf04af13d6be0e9af99e446e2684c5709ffa3eb`; successful stage SHA-256 `93c54c3d63f04e22b350468e5fea42f092dc51c2d95edb771a698d170145e6db`. Retained candidate equality receipts cover every public row/column and schema. No corpus re-import, scan or private shortlist data retrieval was repeated.

The **442-row** full comparable trend bound depends on the pinned corpus: each current street/flat scope maps to one town, and the query fixes one flat type; block/town scopes also fix one town. Recompute it after any future publication/source/schema change. It is not a permanent SQL LIMIT and no history/scoring approximation was added. The generic top 30 histories **ranked by row count total 13,260 rows**. The older 13,233 counts histories ranked by bytes; row and byte rankings remain distinct.

## Latest approved scoped-role sequence: refused before lowering

The user clarified **25,000,000 B hard application-visible database data through comparable execution**, with opaque Hyperdrive setup/connection/internal traffic observational only. The user maximum is ten POSTs; the plan retains **three** and its tighter three-POST harness cap. The other ceilings remain **90 application SQL attempts, 0.35 CUh, 1 CU**, SELECT/read-only runtime and Hyperdrive caching off. No all-origin physical byte promise is restored.

The newly approved sequence is candidate-only: record old scoped defaults/safeguards; lower the existing role using `ALTER ROLE hdb_benchmark_runtime IN DATABASE neondb SET statement_timeout = '2s'`; verify **a fresh direct runtime session** before creating Hyperdrive; then verify the fresh Hyperdrive/Worker effective timeout and a bounded slow SELECT, run admitted POSTs, stop/delete resources and verify absence, restore with the same database-specific selector and value `'60s'`, and verify **another fresh direct runtime session**. No global/ALL, other roles/databases, grants/passwords or application SQL timeout override is allowed. The old scope must be recorded even if no database-specific timeout override existed. An explicit SET60 restoration would leave the candidate/database-specific60s default; no mutation occurred here.

PostgreSQL applies changed role defaults only at **new login**, and database-specific defaults take precedence. Existing pooled sessions cannot be assumed changed; a temporary pool must be created only after the fresh direct2s proof and destroyed before restoration. The settings catalog is cluster-shared, so exact role and current-database identifiers matter. [ALTER ROLE](https://www.postgresql.org/docs/18/sql-alterrole.html), [Role/database settings catalog](https://www.postgresql.org/docs/18/catalog-pg-db-role-setting.html).

Complete reservation reuses the original two initial-observation slots for the required direct2s proof, redistributes the original ten SQL cleanup slots into eight observations plus restoration plus fresh60s verification, and adds two owner setup commands. It preserves safeguards8 and the two tiny diagnostic envelopes. Thus **51→53 commands**, not a new90-command pool. Each command retains its own full server reservation; role2s does not shorten owner commands or the final restored-role check.

| Phase                                       | Commands | Connections | Timeout per command (s) | SQL reserve (s) | Acquisition (s) |
| ------------------------------------------- | -------: | ----------: | ----------------------: | --------------: | --------------: |
| owner-record-and-lower                      |        2 |           1 |                      60 |             120 |              15 |
| fresh-direct-runtime-before-pool            |        2 |           1 |                       2 |               4 |              15 |
| safeguards                                  |        8 |           1 |                       2 |              16 |              15 |
| candidate-sequential-diagnostic-20261005    |        3 |           2 |                       2 |               6 |              30 |
| candidate-concurrent-diagnostic-20261005    |        1 |           1 |                       2 |               2 |              15 |
| comparables                                 |       27 |           3 |                       2 |              54 |              45 |
| cleanup-observations-before-resource-delete |        8 |           1 |                       2 |              16 |              15 |
| owner-scoped-restore-after-resource-delete  |        1 |           1 |                      60 |              60 |              15 |
| fresh-direct-runtime-restored-sixty         |        1 |           1 |                      60 |              60 |              15 |
| TOTAL                                       |       53 |          12 |                   mixed |             338 |             180 |

Three owner commands (old-scope read, scoped lower, scoped restore) and the final fresh restored-role SELECT each reserve **60s**; the other49 slots reserve2s: `4 × 60 + 49 × 2 = 338s`. **Owner60s is optimistic arithmetic for refusal, not a demonstrated server setting.** Its actual direct-session bound remains UNKNOWN. The old benchmark helper sets120s and performs another SET; it was not reused or run. A client deadline cannot supply an owner server bound, and no owner/application timeout override was added.

`SQL338 + 12 × 15 acquisition + 45 additional resource cleanup = 563s active before extra setup`

`(563 + 600 Hyperdrive tail + 300 Neon tail) / 3600 × 1 CU = 0.406388889 CUh > 0.35 CUh`

This already exceeds the compute cap independently of the retained300s local model. Unknown provisioning/control-plane/non-SQL activity is excluded only to establish refusal, never treated as a proved zero/15s upper. A request deadline or finally block bounds client behavior, not late accepted Hyperdrive creation or provider activity. No enforceable additional15s premise was found or asserted.

Even a **not-authorized/not-proved hypothetical owner2s** assumption yields `164 SQL + 180 acquisition + 45 cleanup + 900 tails = 1289s = 0.358055556 CUh`, above the cap before setup. Dropping the tiny diagnostics at owner60s would still reserve **0.391666667 CUh**; that change was not adopted. Fast observed queries, client aborts, overlapping tails or truncated restoration are not used to make a fit.

The existing **174,978 B typed result envelope** remains the retained51-command source envelope, including eight safeguard slots (43→51). It is not silently relabelled as an exact total for new owner/catalog/control replies; those remain separately UNKNOWN. Socket after-chunk telemetry can overshoot its tripwire and remains distinct from a proven hard received-data boundary. Byte clarification alone therefore does not activate a cap or grant admission.

### Immutable bounds and restoration design

Local accounting now binds each initialized phase to its immutable plan timeout. Every request, committed statement permit and one-shot durable driver grant carries that same timeout; state validation and the dispatcher refuse rewriting/mismatches. Full-server admission before the receipt hook and again after it uses that bound, with the absolute60s ceiling unchanged. Safeguards check the corresponding effective setting and SELECT sleep, without issuing SET/ALTER or pg server options. Legacy standalone authorities default60s. **This is tested accounting integration, not remote proof that a phase has server2s.**

Mandatory restoration must have a narrowly reserved escape from an ordinary ambiguous-outcome halt. A future admitted implementation would persist exact candidate/role/database/restore-and-verify fingerprints, command slots, connection and full-time allowances **before lowering**. After ambiguity, all ordinary SQL stops; no lower/publication retry or allowance refund occurs. Recovery must wait for the full possible accepted window of every outstanding permit/grant, then allow only one terminal scoped restore and its fresh verification. An ambiguous restore is not blindly retried; failure to prove restored60s/read-only means **PILOT FAIL**, with exact remaining state reported.

The single monotonic ledger must also survive deleting the Worker/DO: retire it and export its exact counters/intents/start time before deletion, verify absence, and one-shot transfer ownership to the direct cleanup controller without reset/refund or two active authorities. The current generic cleanup path deliberately refuses a fresh connection with unresolved permits; it is **not** being claimed as this recovery lane. The transfer/recovery integration is a remaining prerequisite for any future admitted mutation. No lane is activated for the current failed plan, and no role change is attempted while restoration is unproved.

Local tests now explicitly cover phase→request→permit→grant2s propagation after receipt delay; bound rewriting/mismatched-grant refusal; a restored-role phase retaining60s; invalid/over60s values; and synthetic2s settings/SQLSTATE/sleep3 safeguards with no timeout options or write statement. SELECT/read-only controls show settings/privileges, **not an observed write-rejection result**. The complete role-sequence evaluator asserts refusal **before the provisioning callback**, even under the optimistic owner bound.

**Final admission checkpoint: 0 SQL / 0 POST / 0 connections / 0 DB bytes / 0 role changes / 0 resources.** This is the user-required STOP before lowering, not a partially completed remote pilot. Mandatory restoration is not needed now because the2s change never ran.

## Retained 51-command reference budget

User ceilings remain **3 comparable POSTs, 90 application command attempts total and 0.35 CUh**, with **60s absolute server ceiling** unchanged. The retained model reserves the last 10 command slots for SQL cleanup, 45s additional resource cleanup and 1 CU maximum. **300s active is a conservative model-derived/local-harness boundary, not a newly specified user constraint**. With additive 600s Hyperdrive + 300s Neon tails, the 0.35 CUh ceiling itself permits at most `0.35 × 3600 − 900 = 360s` active at 1 CU; the retained 300s model leaves a further 60s margin. This analysis does not change either runtime defaults or the existing local harness boundary. Hyperdrive query caching would be off; no temporary configuration exists or was created in this phase. No lower pilot timeout is activated or claimed.

Every serving-role safeguard, BEGIN/COMMIT/ROLLBACK, diagnostic, comparable query, result/consistency observation and cleanup SQL belongs to the same counter. Eight failure-inclusive product transport commands plus final stats = nine per POST. All explicitly admitted work/cleanup has finite phase reservations. The earlier 43-command proposal omitted the now-required serving-role safeguard envelope; the complete proposal is:

`8 safeguards + 3 sequential diagnostic + 1 concurrent diagnostic + 2 initial observations + 3 × 9 comparables + 10 cleanup = 51 commands`

The table shows **proposed reservations, not accepted remote work**. Negative remaining CUh demonstrates refusal. Expected result B bounds successful typed result/control messages only; error/startup/TLS/notices/provider messages are separate UNKNOWN quantities. Safeguards reserve eight command/result slots conservatively, not eight claims of observed execution.

| Phase                                                                   | Reserved commands | Expected result-message B | Maximum server seconds | CU reservation at 1 CU | Commands remaining from 90 | CUh remaining from .35 |
| ----------------------------------------------------------------------- | ----------------: | ------------------------: | ---------------------: | ---------------------: | -------------------------: | ---------------------: |
| Global acquisition + resource cleanup + idle tails; setup extra UNKNOWN |                 0 |                         0 |                      0 |              ≥0.300000 |                         90 |              ≤0.050000 |
| safeguards                                                              |                 8 |                     3,576 |                    480 |               0.133333 |                         82 |              -0.083333 |
| candidate-sequential-diagnostic-20261005                                |                 3 |                       684 |                    180 |               0.050000 |                         79 |              -0.133333 |
| candidate-concurrent-diagnostic-20261005                                |                 1 |                       300 |                     60 |               0.016667 |                         78 |              -0.150000 |
| initial-observations                                                    |                 2 |                       861 |                    120 |               0.033333 |                         76 |              -0.183333 |
| comparables                                                             |                27 |                   165,087 |                  1,620 |               0.450000 |                         49 |              -0.633333 |
| cleanup                                                                 |                10 |                     4,470 |                    600 |               0.166667 |                         39 |              -0.800000 |
| TOTAL                                                                   |                51 |                   174,978 |                  3,060 |              ≥1.150000 |                         39 |             ≤-0.800000 |

Independent calculation: nine request-scoped connections reserve `9 × 15 = 135s` acquisition. Resource deletion/receipt cleanup reserves 45s **in addition to** ten SQL cleanup command slots. Previously modeled Hyperdrive idle retention 600s and Neon suspension tail 300s are added without overlap credit. Application requests are sequential with at most one outstanding; the concurrency diagnostic's other request is refused before driver send. No fast-query or parallel-execution assumption reduces reservations.

`active reservation ≥ 51 × 60 + 135 + 45 = 3,240s > 300s`

`compute reservation ≥ (3,240 + 600 + 300) / 3,600 × 1 CU = 1.15 CUh > 0.35 CUh`

Worker/Hyperdrive startup/provisioning that may keep Neon active has no enforced upper; treating it as zero is only a **lower bound for proving infeasibility**, never an accepted plan. Even the older 43 commands consume `(43 × 60 + 600 + 300) / 3600 = 0.966667 CUh` before acquisition/setup/resource cleanup. The old `(300 + 900)/3600 = .333333` next-window proxy did not reserve the entire operation set and is withdrawn as a whole-pilot fit proof.

The arithmetic leaves only `300 − 135 − 45 = 120s` for all 51 SQL attempts, before unknown setup: an equal per-command bound would need to be at most `120/51 = 2.352941s`, genuinely server-enforced for every command including setup/timeout-setting/cleanup and accepted ambiguous work. This is a sensitivity calculation, **not an activated timeout, recommended setting, cancellation proof or authorization**. A SET command still runs under the prior timeout until it executes. A client abort/deadline does not prove server cancellation. No role/default or frozen runtime setting was altered to force a fit.

**Exact remote-admitted budget: 0 commands / 0 POSTs / 0 connections / 0 database bytes. No whole-plan ledger was activated remotely.**

## Earlier startup-only sensitivity: retained reference

This earlier analysis predates the complete mandatory candidate-role restoration sequence. The user permits smaller individual **pilot** server timeouts; 60s remains the absolute ceiling. A two-second proposal is mathematically sufficient without increasing 90 commands, three POSTs or 0.35 CUh. It is not yet an enforceable Hyperdrive configuration.

`pg` documents `statement_timeout` as server configuration, separately from client `query_timeout`. The installed **pg 8.23.1** source constructs a StartupMessage containing `statement_timeout: "2000"`; alternatively `options: "-c statement_timeout=2000"` is serialized. An offline inspection with connect/query forbidden verifies both forms and confirms that the client query deadline is not transmitted as a server timeout. These require **zero SQL timeout-setting commands**, no `ALTER ROLE`/`ALTER DATABASE`, and would leave frozen product SQL/transaction semantics and the existing runtime client deadline untouched. [pg.Client](https://node-postgres.com/apis/client), [PostgreSQL startup options](https://www.postgresql.org/docs/18/libpq-connect.html).

**Exact unproved boundary:** Hyperdrive terminates client startup and uses pooled origin connections. Its documentation supports `SET` within a query/transaction and resets that state when the origin connection returns to the pool. Its supported-feature page excludes other undocumented per-session state changes. Reviewed limits, API configuration, pg example, FAQ and release notes do not establish that StartupMessage `statement_timeout`/`options` is forwarded/restored **before the first statement, on every origin checkout, after COMMIT/ROLLBACK/error, and for late accepted work**. This is a missing guarantee, not an experimentally observed rejection. Direct PostgreSQL startup support cannot supply that guarantee for Hyperdrive. [Transaction pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/), [Supported features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/), [Hyperdrive configuration schema](https://developers.cloudflare.com/api/resources/hyperdrive/subresources/configs/methods/list/).

The documented alternative, `BEGIN` then `SET LOCAL statement_timeout = '2s'`, preserves a limit within one transaction but does not bound its own bootstrap under two seconds. Each of the three frozen comparable snapshots needs both initial commands under the existing 60s ceiling: `6 × 60 + 3 × 15 acquisition + 45 cleanup + 900 tails = 1350s = 0.375 CUh`, **before reads, diagnostics, remaining SQL cleanup or provisioning**. It therefore fails the unchanged 0.35 CUh cap. `SET LOCAL` also ends with the transaction, so final stats/extra rollback/standalone diagnostics cannot be assumed covered. A standalone SET resets before the next pooled query. Combining commands in one wire message does not remove their command reservations or the first SET's prior timeout; the frozen dispatcher cannot hide several SQL commands as one. [SET scope](https://www.postgresql.org/docs/18/sql-set.html), [Statement and transaction limits](https://www.postgresql.org/docs/18/runtime-config-client.html).

`transaction_timeout` terminates an overlong transaction/session; an idle-transaction timeout covers idle gaps. They can supplement an established timeout but do not prove its establishment or bound all bootstrap/outside-transaction statements. Client `query_timeout`, HTTP abort or closing the socket is also insufficient: installed pg's ordinary read-timeout path rejects the client call without a guaranteed backend CancelRequest. PostgreSQL cancellation is a separate connection with no direct success acknowledgement and may arrive too late. All accepted/ambiguous attempts remain charged; loss stops further database dispatch, preserves the intent and permits only non-SQL resource cleanup. No retry/refund/cancellation credit is proposed. [Cancellation protocol](https://www.postgresql.org/docs/18/protocol-flow.html).

**Conditional exact allowances** if startup enforcement and every additional active interval could be proved: all 51 commands, including settings/stats, BEGIN/COMMIT/ROLLBACK, timeout safeguard, failed/ambiguous queries and SQL cleanup, have a **2000ms server bound**. Nine connections retain **15000ms acquisition** each. A hypothetical **15000ms total additional active bound** covers provisioning/startup/control-plane work and any active non-SQL gaps not already reserved; it is **unproved** and cannot be obtained merely by aborting the provisioning client. No new SQL-setting operations are concealed in this proposal. The timeout safeguard would need a pilot-only expectation of `2s` and a three-second sleep, retaining the same command envelope and requiring server SQLSTATE 57014, not a client timeout. The later local integration now reads the immutable phase bound at request/permit/grant dispatch and in safeguards. No server timeout is set by application SQL or pg options; existing standalone/runtime defaults remain60s. This paragraph describes the earlier arithmetic, not an admitted scoped-role sequence.

| Phase                                    | Commands | POSTs | Connections | SQL reserve at 2s (s) | Acquisition (s) |
| ---------------------------------------- | -------: | ----: | ----------: | --------------------: | --------------: |
| safeguards                               |        8 |     0 |           1 |                    16 |              15 |
| candidate-sequential-diagnostic-20261005 |        3 |     0 |           2 |                     6 |              30 |
| candidate-concurrent-diagnostic-20261005 |        1 |     0 |           1 |                     2 |              15 |
| initial-observations                     |        2 |     0 |           1 |                     4 |              15 |
| comparables                              |       27 |     3 |           3 |                    54 |              45 |
| cleanup                                  |       10 |     0 |           1 |                    20 |              15 |
| TOTAL                                    |       51 |     3 |           9 |                   102 |             135 |

| Separate whole-plan allowance                       | Seconds | Enforcement/evidence                                        |
| --------------------------------------------------- | ------: | ----------------------------------------------------------- |
| Additional active provisioning/startup/non-SQL gaps |      15 | Hypothetical; unproved                                      |
| Resource cleanup, beyond ten SQL cleanup slots      |      45 | Retained reserve                                            |
| Hyperdrive idle tail                                |     600 | Retained additive model; managed activity remains qualified |
| Neon suspension tail                                |     300 | Retained additive model                                     |

`SQL 102 + acquisition 135 + resource cleanup 45 + additional active 15 = 297s`

`(297 + 600 + 300) / 3600 × 1 CU = 0.3325 CUh`, leaving **0.0175 CUh modeled margin** below 0.35. The two-second proposal allows at most **18s** additional active under the retained 300s local model, or **78s** under the compute cap alone. A three-second/no-additional-activity fixture gives `333s` / **0.3425 CUh**: it fits compute arithmetic but exceeds the existing 300s local implementation boundary. It is not rejected as an additional user-imposed limit. Both variants still lack Hyperdrive/setup enforcement evidence.

Local executable assertions cover startup serialization, unchanged absolute limits, the 51-phase sum, both mathematical sensitivities, the SET bootstrap lower bound, and refusal when server/setup evidence flags remain false. A deliberately marked arithmetic fixture with both evidence flags assumed true returns a fit; this is **not provider evidence or an admitted plan**. The actual two-second proposal retains false flags and refuses before any credential/API/provisioning operation. Immutable pilot-only phase bounds are now threaded through request records, committed permits, durable grants and pre-send checks. A mismatched bound fails closed; merely entering a plan number still cannot demonstrate the corresponding server setting or authorize the refused full sequence.

Further local tests to require before such a future pilot: startup-only injection in the isolated instrumentation with unchanged product hashes; every control/cleanup command receiving the same evidence-backed bound; settings consistency across COMMIT/ROLLBACK/errors/recheckout; SQLSTATE timeout proof without unsafe cancellation retries; receipt delay/loss retaining a full server window; no fresh SQL cleanup after ambiguity; and the existing 90/91, three-POST and whole-plan pre-provisioning refusal tests. Hyperdrive origin forwarding and provisioning acceptance tails require supported provider evidence or a separately authorized bounded experiment; local mocks cannot prove them. That earlier stage did not authorize persistent settings. The latest narrow approval covers only temporary candidate/database-specific timeout2s on the existing runtime role with mandatory60s restoration; other role/database/global settings and new roles remain outside scope. None was attempted. Switching to direct Neon would test a different transport and was not substituted.

**Historical disposition:** the startup-only proposal was conditional and unproved. The latest database-scoped role approval offers a different enforcement mechanism but its complete restoration sequence now fails the budget gate below. No generally impossible-lower-timeout claim is made. No settings, product semantics, resources, remote ledger or database state changed.

## Shared ledger and actual pre-send integration

`cohort-store.ts` uses one transactional durable key, `pilot-cohort`, for the immutable full-plan reservation, all phase states, global application command sequence, POST/connection/socket-reservation totals and stopped state. A cohort cannot reset or gain another pool from a new phase/run ID. Phase IDs and deterministic request-local `A:s1` IDs are preserved; the global record adds a phase-qualified ID and sequence 1…90. Tiny sequential three-command and concurrent one-command ceilings are nested in the same global ledger.

Phase entry reserves the phase's entire fixed worst case from the already reserved whole operation set. Request admission charges full command/connection/byte allowances before client construction. No success/failure/ambiguous outcome refunds them; this is stricter than releasing a proven undispatched operation. Unknown outcomes remain stopped and charged. An unresolved statement also refuses a new database connection, including cleanup, while resource deletion remains available. An ended phase cannot dispatch late cleanup alongside another active phase. The last ten slots cannot become ordinary work; cleanup shares the same 90 cap and cannot create a new phase or reset IDs to send command 91. Provider successful SQL observations cannot increment/refund/authorize application commands.

Before an individual command, the authority reserves full acquisition, its immutable phase server bound, resource cleanup and idle tails. The unchanged60s default example is:

`elapsed + 15,000 acquisition + 60,000 server + 45,000 resource cleanup ≤ 300,000ms`

Latest individual connected-or-new send is **180,000ms** conservatively. The whole-set reservation can impose an earlier deadline. The permit is durably charged before the optional receipt/intent hook. A second **one-shot durable driver grant** rechecks timing after that asynchronous hook. The dispatcher charges the entire monotonic grant RPC round trip against its remaining validity, then invokes the driver without another await. Lost/delayed grants retain the charged unknown permit and cannot be replayed. This is an integrated enforcement path, not merely offline arithmetic.

The private deployable wrapper is updated locally to use this single authority, not independent 3 + 1 + 90 phase pools or a second root resource counter. It retains phase and global receipt counts separately, bounded traces and finally-safe evidence/stop attempts. The local executor checks the complete plan before credential/API/provisioning code. Its old terminal receipt remains unchanged; it was not run, reset or retried. No Worker deployment/dry-run network action occurred.

The revised serving-role safeguard helper reads the immutable admitted timeout and issues SELECT plus read-only transaction controls; it no longer attempts UPDATE even with WHERE false. Privilege/default observations prove grants, not an attempted-write rejection. The SQL text of both stats/settings observations remains byte-identical. Product handler/compiler/transport/publisher/query semantics remain frozen.

## Contract-derived application result/body bounds

DataRow framing: `7 + 4 × columns + Σmaximum UTF-8 value bytes`; RowDescription: `7 + Σ(name bytes + 19)`. Include ParseComplete/BindComplete, CommandComplete and ReadyForQuery. NULL retains its length prefix. [PostgreSQL message formats](https://www.postgresql.org/docs/current/protocol-message-formats.html).

Transaction field maxima from the retained full corpus:

| Field                 | Maximum text B |
| --------------------- | -------------: |
| `id`                  |              6 |
| `month`               |              7 |
| `town`                |             15 |
| `block`               |              4 |
| `street_name`         |             22 |
| `address_key`         |             38 |
| `flat_type`           |             16 |
| `storey_range`        |              8 |
| `floor_area_sqm`      |             32 |
| `lease_commence_year` |              4 |
| `resale_price`        |             32 |
| `flat_model`          |             22 |

Each finite DOUBLE PRECISION reserves 32 characters, exceeding 17 significant digits plus sign/decimal/exponent in this corpus. [Numeric representation](https://www.postgresql.org/docs/current/datatype-numeric.html). Transaction row frame 261 B; trend row 100 B. COUNT result 76 B; transaction projection capped at 150 rows = 39,531 B; full 442-row trend history = 44,389 B. Generic 13,260-history-row messages = 1,326,191 B. Stats/settings observations = 447/414 B. A one-row COUNT result can still scan many index/MVCC records; no one-billed-read equivalence is claimed.

Current-scope adjusted request plus final stats ≤84,655 B. Generic 30-history fallback plus stats ≤1,366,457 B. The fixed selected three cases plus diagnostics/cleanup and conservative safeguards total **174,978 B expected application result messages**. This excludes unbounded errors/notices/auth/managed-origin messages.

**Caps remain proposals only:** 2,000,000 B expected query-result messages per POST (6,000,000 B across max three) and 131,072 B project-generated JSON per POST (393,216 B across three). No new numerical cap was activated. The old 2 MB request socket lease is separate legacy reservation/tripwire accounting, not proof of a complete transport bound. JSON geometry remains 30 comparables × 4,096 B plus 8,192 B metadata; seven stored strings total ≤78 UTF-8 bytes before sixfold escaping, fixed keys/reasons, bounded scalars and null/month labels. No arbitrary candidate text is echoed. HTTP framing and platform error pages are separate.

| Retained scenario         | Transaction rows | Trend rows | Expected result-message upper B including stats | Expected outgoing SQL-message B | Exact local JS response B |
| ------------------------- | ---------------: | ---------: | ----------------------------------------------: | ------------------------------: | ------------------------: |
| block-raw                 |              150 |          0 |                                          40,266 |                           1,551 |                    10,590 |
| street-raw                |              150 |          0 |                                          40,266 |                           1,538 |                    10,965 |
| town-raw                  |              150 |          0 |                                          40,266 |                           1,535 |                    10,460 |
| block-time-adjusted       |              150 |        441 |                                          84,555 |                           1,835 |                    16,908 |
| no-match-time-adjusted    |                0 |          0 |                                             735 |                           1,197 |                       244 |
| duplicate-null-lease-edge |              150 |          0 |                                          40,266 |                           1,557 |                    11,861 |

Selected adjusted block / raw street / raw town total 165,087 result B and **4,908 outgoing SQL-message B** from actual local pg-protocol serialization of pinned native SQL/params/transaction controls/stats. Startup/authentication/cancel/TLS and other diagnostics/cleanup are separate, so complete sent/received socket upper bounds remain UNKNOWN. No new scenario execution or corpus scan occurred.

Diagnostic SELECTs warm compute. A later first comparable cannot be labelled compute-cold; any wake observation would belong to the initial scalar diagnostic, with prior setup activity reported separately. No cold/warm remote latency was measured in this phase.

## Managed transport and quota qualifications

Origin target five is approximate across Hyperdrive's distributed pools, not an absolute physical connection cap. Hyperdrive documents 15s acquisition, 60s query duration and 600s idle retention. [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/), [Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/). Complete origin byte and provider-internal SQL upper bounds remain UNKNOWN; no invented amplification factor is used. Server-role successful observations can omit failures or be cumulative, and never govern the application ledger. CU reservations are admission arithmetic, not provider billing receipts or an enforced physical all-provider limit.

Retained monthly sensitivity remains:

`5,000,000,000 − (166 × 13,667,516 + 493,707,924 reconciliation + 1,000,000,000 reserve) = 1,237,484,420 B`

The 174,978-B expected result payload is **0.014139814%** of that modeled remainder; remaining after useful results = **1,237,309,442 B** before sent/socket/startup/error/provider/other traffic. This is not current live quota. Cumulative current-period provider compute/transfer and update/reset boundaries remain UNKNOWN. User-provided Monitoring graphs/configuration are not cumulative allowance totals; exports being premium does not authorize a paid feature, hidden session endpoint or invented quota number. No live Chrome-control tool is available here, and no browser/session was scraped.

Earlier authenticated observational Cloudflare GET receipts at **12:58:26–12:58:35 UTC** are retained unchanged: Hyperdrive list 200/0, Worker list 200/7, Durable Object list 200/0. This local phase did not repeat preflight, refresh credentials or assume those historical receipts are live quota/authentication. The original failed-pilot artifacts and terminal 401 record are preserved.

## Changes, validation and deliverables

| File                                                                  | Change/classification in this local phase                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/neon-benchmark/pilot/accounting.ts`                          | Three-POST cap and durable grant retained; immutable phase server bound now flows through request/statement/grant and full-window checks, with legacy default60s and absolute60s ceiling unchanged.                                                                                |
| `scripts/neon-benchmark/pilot/dispatch.ts`                            | After durable receipt persistence, grant timeout must match committed permit before the driver is invoked. Existing monotonic latency/deadline checks and no-retry/no-refund behavior retained.                                                                                    |
| `scripts/neon-benchmark/pilot/cohort-store.ts`                        | Initial phase gets the immutable plan bound; every subsequent transaction validates phase/request/statement consistency and rejects bound rewriting. Existing global counter/ambiguity refusal retained.                                                                           |
| `scripts/neon-benchmark/pilot/plan.ts`                                | New complete operation-set evaluator/refusal before provisioning. Current 51-command role-60s proposal is rejected, including unknown setup time.                                                                                                                                  |
| `scripts/neon-benchmark/pilot/proof-model.ts`                         | Retains row/message bounds; shares integrated server-window math and replaces the incomplete per-active-window compute claim with whole-command reservations.                                                                                                                      |
| `scripts/neon-benchmark/pilot/worker.ts`                              | Safeguards check effective timeout against admitted immutable bound and use an over-bound SELECT sleep. No application SQL/server-option timeout override; SELECT/read-only controls prove settings/privileges, not attempted write rejection. Diagnostic SQL templates unchanged. |
| `tests/unit/neon-pilot-accounting.test.ts`                            | Updates existing POST/time boundary tests to three POSTs and full server reservations; original 90/91, persistence/replay/provider cases remain.                                                                                                                                   |
| `tests/unit/neon-pilot-controller.test.ts`                            | Updates deadline test to run within the new full-server admissible window; existing receipt/failure/cleanup tests remain.                                                                                                                                                          |
| `tests/unit/neon-pilot-proof-model.test.ts`                           | Checks three-post ceiling, integrated latest-send time, and whole-plan compute refusal.                                                                                                                                                                                            |
| `tests/unit/neon-pilot-cohort.test.ts`                                | Nineteen tests: prior fourteen plus operation-bound propagation after receipt delay, rewrite refusal, mismatched grant refusal, restored-role60s reservation and invalid absolute ceilings.                                                                                        |
| `.neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts`   | Ignored isolated wrapper uses one cohort ledger rather than 3+1+90 pools and a second resource counter; global and phase receipt counts remain distinct; finally attempts all evidence/stop actions.                                                                               |
| `.neon-benchmark/shared-counter-candidate-pilot-20261005/execute.mts` | Ignored one-shot executor checks the complete plan before credentials/API reads/provisioning and observes the authoritative cohort total; never executed or reset in this phase.                                                                                                   |
| `tests/unit/neon-pilot-worker.test.ts`                                | Six tests: adds synthetic2s safeguard/SQLSTATE/sleep3 flow, every statement bound2s, SELECT/read-only-only controls and no pg server-timeout/options override. Before bytes verified against earlier repair SHA.                                                                   |

Follow-up source changes are confined to accounting/cohort/dispatcher/safeguards and their unit tests, including the new synthetic safeguard case in `tests/unit/neon-pilot-worker.test.ts`; no frozen runtime/publisher file changed. Full classification and source hashes are in JSON. The shared wrapper/executor and investigation scripts/logs under `.neon-benchmark/` are ignored local state, not proposed tracked account/MCP/secret configuration. Repository candidates are only the harness/tests plus this same report/evidence/patch. Existing D1/Neon work and the 13 already modified tracked files remain preserved.

`vp run test neon-pilot`: **73 tests / 7 files passed** in the latest rerun; the preceding67-test result is retained. Fourteen new integration cases cover whole-set refusal before any provisioning callback/store creation, tiny nested IDs, independent transactional authorities, command 91/cleanup/new-ID refusal, shared concurrency/resource/POST reservations, no refund on ambiguity, provider isolation, full-server post-receipt checks, stale/lost grants and whole-plan earlier deadlines. Existing HTTP receipt-before-parse/status/sanitized error/malformed/abort/finally/cleanup coverage remains passing.

`vp run check`: **2135 tests / 208 files passed** in the latest rerun, format/lint/typecheck/boundaries/build/bundle all passed. Eighteen pre-existing lint warnings remain, none in changed harness/tests. First sandbox run passed tests but build's tsx IPC socket was blocked; the authorized local escalation reran the prescribed full gate successfully. No automatic-review rejection. Latest full Vitest start **2026-10-05T15:24:01+00:00**, raw Singapore local 23:24:01. Private isolated Worker/executor strict tsc and offline plan evaluation also passed. The earlier document-only startup analysis reused validation. The latest role-scoped preparation changed harness/tests, so focused and full checks were rerun; private Worker/executor strict tsc also passed. Original offline startup assertions and the new complete role-sequence evaluator used no database/network/provisioning driver. Full checks are not repeated after subsequent document formatting.

All **19 frozen publisher/runtime/test hashes** and **six original failed-pilot artifact hashes** match. Stats/settings SQL strings are also byte-identical. Before/after source hashes, exact status, command logs and complete phase table are in [JSON evidence](../evidence/neon-comparable-two-part-proof-2026-10-05.json); [exact local integration patch](../evidence/neon-comparable-two-part-proof-2026-10-05.patch). Previous report/patch bytes are retained in the ignored before snapshot; this updates the same report rather than creating a competing document.

Git remains `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`. Exact final `git status --short` is in the JSON/private status receipt. No commit/staging/push/PR/merge/schedule/application deployment/production routing or database write. No new provider resource to clean up.

## Decision

**STOP BEFORE ROLE CHANGE OR RESOURCES.** The complete candidate-scoped2s→60s sequence requires at least **0.406389 CUh**, above the unchanged0.35 cap before unknown extra setup. Immutable operation bounds are integrated and locally tested; that does not certify server settings, setup activity, a hard received-data limiter or the necessary restoration/ledger-transfer lane. No role/database/resource action or remote pilot is admitted. D1/Neon production, routing, schedules, credentials/grants and frozen product semantics remain untouched.

</details>

</details>

</details>
