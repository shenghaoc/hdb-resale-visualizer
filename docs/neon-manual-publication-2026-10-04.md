# Neon manual publication — genuine pilot and failed decision gate

> **Provenance.** Links to files that are not part of this branch point at commit [b80446400](https://github.com/shenghaoc/hdb-resale-visualizer/tree/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6) of the recovery snapshot (branch `feat/neon-refresh-publisher`), which preserves provenance; generated evidence that was never recovered (`docs/evidence/*`) appears as plain paths.

**The one genuine fresh-upstream attempt was rejected before publication because five stored canonical-tuple occurrences were unmatched in the newly normalized official source.** Its read transaction rolled back successfully; the complete faithful manifest is unchanged. The local manual publisher and workflow are reviewable, and a fresh remote warm cache hit made zero SQL calls. These results do not certify a monthly schedule or production migration. The overall assessment remains **NEON FREE IS MARGINAL** pending source reconciliation and realistic measured runtime/compute/transfer headroom.

Branch `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`, unchanged. This stage began with the earlier setup/benchmark/policy work already dirty; every existing change and D1 implementation/evidence is preserved. No commit, push, PR, merge, GitHub dispatch, D1 call, production database mutation, production Worker secret change or schedule activation occurred. Only explicitly authorized isolated benchmark recovery and temporary Worker/Hyperdrive deployment were performed.

The latest decision is **STOP without another database retry**. The user approved all five unresolved retentions and the exact 2,595 snapshot-pinned catch-up. Read-only local/source provenance work then established that required transaction inserts and existing-block median/count mutations alone forecast **25,659**, above the unchanged **25,000** guard. The complete actual cache-enabled cost remains unknown; the current captured-context candidate also exceeds the statement guard. No guard increase, publication or resource recreation occurred. The verified decision, exact missing inputs/cache keys and full cost decomposition are included below.

## Repository implementation

| File                                                                          | Purpose                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/sync-neon.ts`                                                        | Real official-source fetching, exact reconciliation, incremental artifacts and staged caches, with one manifest-last PostgreSQL publication.                     |
| `scripts/lib/sync/neon.ts`                                                    | Thin PostgreSQL planning adapter, JSONB canonicalization, finite SQL translation, explicit transaction/manifest guard, sanitized errors and SQL instrumentation. |
| `scripts/lib/sync/neon-usage.ts`                                              | Captured Console receipt, explicit UNKNOWN as-of support, bounded known activity, conservative pending reserves; legacy zero meters rejected.                    |
| `scripts/restore-neon-benchmark.ts`                                           | Guarded, changed-only faithful recovery from retained public data; no D1 export or full Neon reimport. Separate timing/byte/query receipt.                       |
| `.github/workflows/refresh-neon.yml`                                          | Manual-only `workflow_dispatch`, isolated fixed target and dedicated environment/secret references. No cron, migration, deployment or automatic retry.           |
| `scripts/neon-benchmark/worker-cache-check.mjs`                               | Four bounded, token-gated read-only cache/role observations.                                                                                                     |
| `scripts/neon-benchmark/worker-setup.mjs`, `worker-cleanup.mjs`, `worker.mts` | Exact temporary resource identities, existing SELECT-only role, disabled Hyperdrive query caching, guarded cleanup and instrumentation.                          |
| `scripts/neon-benchmark/capture-source.ts`, `source-diagnostic.ts`            | Bounded authorized official-source capture and offline exact multiset diagnosis; no database connection or publication.                                          |
| `tests/unit/source-diagnostic.test.ts`                                        | Five tests for duplicate multiplicity, exact candidates, absence and null/zero semantics.                                                                        |
| `tests/unit/neon-refresh.test.ts`                                             | 19 local tests covering target/usage gates, JSONB identity, atomic publication/recovery and failure behavior.                                                    |
| `package.json`, `README.md`                                                   | `sync-data:neon` entry point and manual workflow documentation.                                                                                                  |

No ORM or runtime backend port was added. Stable integer transaction IDs and legitimate duplicate multiplicity remain exact. Existing dependency tracking, field patches and the 25,000 conservative publication guard are reused. JSONB object order is canonicalized without changing arrays, nulls or number values. Cache mutations are staged until publication. The publisher locks/verifies the original full manifest, verifies expected affected-row counts, writes the manifest last and commits once. An ambiguous COMMIT is classified as unknown and must be reconciled; it is never blindly replayed.

The direct connection is validated against isolated endpoint `ep-steep-moon-b35xjj4d`, database `neondb`, branch `br-wispy-boat-b34glczl`; verified TLS is required. The runtime role is different from the ingestion connection. Publication retains the 25,000 index-operation, 100-statement and 90 MB internal limits; the existing transaction anomaly guards are unchanged. A 20-minute database deadline, 120-second statement timeout and advisory ingestion lock bound execution.

The job references environment `neon-benchmark-refresh` and secret **`NEON_BENCHMARK_REFRESH_DATABASE_URL`**. They have not been created or configured. Existing `DATA_GOV_API_KEY` and OneMap credential names are references only. The actual pilot used a local process with an existing isolated connection, not GitHub Actions. No credentials are in tracked files or this report.

## Setup and prior evidence preserved

The [original benchmark report](neon-benchmark-2026-10-04.md) contains all 13 original phases, query plans, index sizes, storage figures and D1 comparisons. CLI **8.0.4** completed the requested setup using existing project `wispy-mouse-67963002`, Singapore, Free v3, PostgreSQL 18. Repository linkage remains Neon `production`; benchmark connections are explicit and separate. `neon deploy` succeeded with no changes required: private `uploads` already existed. Singapore storage was verified, superseding the older skill's region caveat. No unrelated Neon services were enabled.

Initial faithful import: 985,533 transactions; 9,730 each blocks/details/comparisons; 44,826 trends; 10,333 geocode cache entries; zero routing-cache entries; two MRT rows; one manifest. Shortlist schema only, zero private rows. All logical columns matched the retained public snapshot. Existing schema and three justified comparable indexes remain intact.

Initial PostgreSQL database size was **370,032,640 B**, 34.462% of the 1,073,741,824 B project limit, versus D1 **460,922,880 B**. Current PostgreSQL size after recovery is **418,480,128 B** (38.974% of that nominal limit; 655,261,696 B difference). Database size is not a complete project billing meter: production/benchmark branches share copy-on-write project storage and have no separate 1 GiB allowances. Recent Console project storage remains comfortably below the ceiling but is rounded/lagged. Storage is not the measured blocker. Historical corpus growth and per-index measurements remain in the original report; no production VACUUM or storage redesign was performed.

Prior baseline-versus-itself reconciliation: **219 data queries, 14.905 s wall, 7.356 s SQL, 493,707,924 client received bytes**. The 59% detail share came from the intended two artifact passes. These are retained planning measurements, not a new scan or final billed transfer. Prior synthetic +134 publication: **123 ms wall, 13.52 ms SQL**, rollback and idempotent rerun passed. No second synthetic publication was substituted for the genuine pilot.

## Fresh cache-first test

At 05:10–05:13 UTC, the approved temporary Worker `hdb-neon-benchmark-20261004` used Hyperdrive `e96e469f9ed04133b2524fa3aee30e8d`, only the isolated Singapore branch and the **existing** `hdb_benchmark_runtime` role. Query caching was disabled, connection limit five. No role/password/grant was created or changed. Only this temporary Worker's two secrets were installed; production secrets remained untouched.

| Request                  | SQL calls | Returned rows | DB-await ms | Connect ms | Client wall ms | Result                                               |
| ------------------------ | --------: | ------------: | ----------: | ---------: | -------------: | ---------------------------------------------------- |
| Cold public GET          |         3 |           152 |         131 |          4 |        260.425 | MISS, SIN                                            |
| Immediate identical GET  |     **0** |         **0** |       **0** |      **0** |        101.639 | HIT, same SIN and body hash                          |
| Existing role inspection |         1 |             1 |          63 |          3 |        151.261 | Public SELECT, no writes/private/elevated privileges |

The pointer removal uses Cache API only; it has no SQL instrumentation header and its code makes zero database calls. Total instrumented SQL calls for this bounded check: four. Hyperdrive setup had already awakened Neon, so the cold row is a **cold Worker-cache request**, not a Neon resume claim. SQL-call/row counters are not Neon billing units. Cache API is POP-local; a warm SIN observation does not establish a global hit rate.

Both temporary resources were deleted successfully with HTTP 200 by **05:13:51.532 UTC**. The benchmark branch and existing role remain. Older canonical-key, pointer expiry, version/race, errors/private/POST cache evidence is preserved in the original report; those experiments were not repeated here. No new generation was published by the genuine attempt, so post-publication invalidation has no new generation to exercise. No further temporary Worker recreation is needed for the unchanged generation after this pre-publication failure. Exact inventory checks returned HTTP 404 for both deleted resources at 05:40:41.513 UTC.

## Faithful recovery — measured separately

The current branch initially held the previous synthetic +134 publication. A full-manifest guard and nine small ordered digest results first attested that exact known state. Recovery then copied only changed rows into temporary tables inside one transaction, removed only known synthetic extras and wrote the faithful manifest last. No million-row upload or production/D1 access occurred.

| Table                   | Faithful upserts | Synthetic deletions |
| ----------------------- | ---------------: | ------------------: |
| transactions            |              134 |                 134 |
| blocks                  |                4 |                   0 |
| block_details           |            9,730 |                   0 |
| comparisons             |            9,730 |                   0 |
| trends                  |               66 |                   0 |
| manifest                |                1 |                   0 |
| MRT / geocode / routing |                0 |                   0 |

Recovery committed **05:26:03.738 UTC**: **86,069.513 ms wall**, **70,413.768 ms SQL**, **170 operations including five COPY streams**, **6,709 B received / 160,093,847 B sent** at the client stream. SQL time is a current-role/database cumulative `pg_stat_statements` delta, including instrumentation or concurrent same-role work and COPY wait; it is not pure CPU time. COPY input is ingress, not Neon public egress. Provider compute/transfer cost remains unknown until settled meter coverage. This was substantial recovery, not negligible setup.

## One genuine fresh-upstream attempt

Exactly one invocation ran **05:29:45.223–05:33:43.597 UTC**, exited 1 and did not retry. It fetched the five official resale CSVs and property/MRT inputs, normalized them and opened the isolated read snapshot. Input completeness/schema checks passed far enough to enter exact transaction reconciliation. The source arrays/download bodies and new input row count were not persisted before the guard threw; no exact post hoc count is invented.

The existing planner rejected:

> Reconciliation required: 5 existing facts absent; disappearance is not deletion or an inferred correction

This is a source discrepancy requiring investigation, not evidence that Neon failed a publication transaction. Five absent occurrences are not automatically corrections or deletions. Their identities were not retained in this attempt's receipt. Neither disappearance semantics nor thresholds were changed to force a successful benchmark.

| Measurement                                           | Actual                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| Whole source/normalization/read/planning attempt wall | **238,374 ms**                                                      |
| Summed client query-await                             | **41,210.117 ms**                                                   |
| Connection wall                                       | 514.516 ms                                                          |
| Total database operations                             | **207**, all successful                                             |
| Transaction data queries                              | **198**                                                             |
| Transactions returned                                 | **985,533**                                                         |
| Data queries including manifest                       | 199; 985,534 returned records                                       |
| Received client-stream proxy                          | **155,908,075 B**                                                   |
| Sent client-stream proxy                              | **50,881 B**                                                        |
| Server SQL execution time                             | **Unknown**; early guard threw before ending SQL-statistics capture |
| Publication / logical mutations                       | **None / zero**                                                     |
| Publication SQL/wall duration                         | **Not applicable**; publication never started                       |
| Post-publication cache measurement                    | **Not applicable**; no new generation was published                 |
| Read snapshot ROLLBACK / advisory unlock              | Both successful                                                     |

The full transaction preflight completed, but artifact reconciliation/build/publication did not. This smaller 155.9 MB failed-path receipt must not replace the prior roughly 493.7 MB complete-success planning envelope. No amenity/geocode/routing work or staged-cache writes occurred in this attempt. Authenticated routing was unavailable; a successful future path would use the existing straight-line fallback until credentials are supplied through the normal approved mechanism. This attempt proves neither fallback output nor authenticated routing parity.

Afterward, a bounded equality query at **05:40:27.549 UTC** confirmed the **entire manifest equals the retained faithful JSONB document**, generated `2026-08-29T01:37:16.797Z`, with no benchmark version. Database size remained 418,480,128 B. The receipts contain no publication INSERT/UPDATE/DELETE/COPY; zero publication mutations is established by executed-query instrumentation and the fail-before-publication code path, not by re-exporting the corpus.

## Source-only follow-up: exact public tuple evidence

The original failed attempt did not persist the fresh CSVs or missing IDs. A **separately authorized new offline capture** then fetched only the necessary [active Jan-2017-onward file](https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view), through the normal official initiate/poll/download API. No Neon/D1 call, second refresh, publication, credential change or browser action occurred. It compared this partition against the retained faithful `source.sqlite`; historical bodies were not re-downloaded because this active file alone accounts for five unmatched occurrences.

- Before metadata: **06:02:41.964 UTC**; after: **06:06:39.955 UTC**. Collection inventory and all five dataset version hints were stable and equal the retained pre-run observation. This is metadata continuity, **not proof that the new bytes exactly replay the original in-memory input**.
- Raw CSV saved **06:03:06.149 UTC**, **23,928,760 B**. A local bulk-array argument-limit error interrupted the diagnostic after saving it; that was fixed and analysis resumed using retained bytes with **no second body download**. Hashes were first persisted **06:06:29.595 UTC**; original response headers/request completion times were not recovered or invented. The initial local-failure receipt remains preserved.
- CSV body SHA-256: `9835dfe6cd92a46a1302fabf3a692bf893ee5b86ec95638d10dfce61dbfbdb9a`.
- Exact normalized multiset SHA-256: `88b6c6252b2329edcb9856491cec5d05f5ca92f1340640ed90291fe2c7466356`.
- **241,920 raw rows → 241,920 normalized facts**, January 2017–October 2026, zero parser errors, skipped normalization rows or excluded fact rows. Old active baseline: **239,330 rows**; **239,325 matched, five absent, 2,595 unmatched incoming occurrences**, net +2,590. The current full historical corpus was not revalidated; no current whole-database transaction count is inferred.
- A bounded official delivery GET at **06:15:43.491 UTC** returned HTTP 200 and **Content-Length 23,928,760**, no content encoding; its body was cancelled after headers. This matches saved body length without a second full transfer. API `datasetSize` is 23,929,893, a distinct value whose basis is not invented. The multipart ETag is not represented as a simple MD5 checksum. Before/after metadata and captured-byte hashes are retained.

All five belong to dataset `d_8b84c4ee58e3cfc0ece0d773c8ca6abc`, whose official title and coverage identify the active registration-date partition. Each exact old 11-field tuple has **baseline multiplicity 1 / current normalized multiplicity 0**. The current export therefore omits those canonical facts; this is not collapse of previously identical duplicate occurrences. It does not establish whether underlying registrations were removed, corrected in multiple fields or otherwise revised.

| Stored ID | Month   | Town            | Block / street             | Flat type | Storeys  | Area m² | Lease year |     Price | Model             |
| --------: | ------- | --------------- | -------------------------- | --------- | -------- | ------: | ---------: | --------: | ----------------- |
|    550818 | 2026-05 | TOA PAYOH       | 58 / LOR 4 TOA PAYOH       | 2 ROOM    | 01 TO 03 |      45 |       1967 |   258,000 | STANDARD          |
|    601171 | 2026-04 | KALLANG/WHAMPOA | 55 / JLN BAHAGIA           | 3 ROOM    | 01 TO 03 |    93.6 |       1972 | 1,028,000 | TERRACE           |
|    934839 | 2026-07 | KALLANG/WHAMPOA | 8A / UPP BOON KENG RD      | 3 ROOM    | 10 TO 12 |      70 |       2017 |   780,000 | PREMIUM APARTMENT |
|    955489 | 2026-07 | BUKIT BATOK     | 445A / BT BATOK WEST AVE 8 | 4 ROOM    | 01 TO 03 |      92 |       2019 |   625,000 | MODEL A           |
|    959788 | 2026-08 | WOODLANDS       | 182A / WOODLANDS ST 13     | 2 ROOM    | 13 TO 15 |      47 |       2019 |   378,888 | MODEL A           |

Full tuples, including `address_key`, multiplicities and provenance are in the offline capture receipt (`docs/evidence/neon-source-offline-capture-2026-10-04.json`). Only **ID 955489** has an unmatched incoming fact identical on every other field: **month `2026-07` → `2026-09`**, current multiplicity one, CSV data-row index **224,897** (one-based; not a physical-line assertion). The September tuple was absent from the old baseline. This is an exact one-field **candidate**, not proof of the same real-world transaction: the public data has no persistent upstream transaction identifier or unit identifier. No candidate was selected or approved. The other four have **no exact one-field candidate** among unmatched current facts; no fuzzy search or winner selection was used.

Offline baseline checks also found zero current whitespace/case/flat-type normalization differences, zero regenerated address-key mismatches, zero invalid storey ranges and zero zero-year leases. All 160 legitimate fractional prices remain preserved. Strict parse/normalization checks succeeded for the captured source. These observations support a real discrepancy in normalized source facts rather than an obvious importer, canonicalization or duplicate-count bug; they do not rule out a more complex source revision or undocumented export issue.

The minimum remaining decision is an **explicit, reviewed source-disappearance/correction policy**, supported by the recorded old/new tuples. Disappearance alone never authorizes deletion, and the month candidate is not automatically applied. Even if that candidate were approved, remaining source changes would also encounter the unchanged **1,000-change guard**: there are 2,595 unmatched incoming occurrences before consuming any approved correction. This measured stale-baseline delta has not been used to raise either the transaction guard or the 25,000 publication guard. No publication forecast is fabricated from a source-only comparison.

The new `capture-source.ts` and `source-diagnostic.ts` are benchmark-only tools. They retain private ignored raw inputs/metadata, compare exact tuple multisets and list all exact one-field candidates; they cannot mutate a network database. Access denial remains terminal. Network calls have per-request deadlines plus a ten-minute overall signal (existing bounded retry/backoff may add less than a minute when aborting). Five focused tests cover duplicate preservation, missing occurrence identity, ambiguous candidate lists, two-field non-candidates and null-versus-zero semantics. At that source-only stage, reconciliation implementation and guards were unchanged. The later local Neon policy proposal is documented below; D1 reconciliation remains unchanged.

## Plan, provider readings and uncertainty

Neon Free v3 and the exact 1 GiB logical-size limit were previously verified authoritatively. Current documented Free planning limits remain **100 CU-hours and 5 GB public transfer/project/month**. We use 5,000,000,000 B conservatively. See [plans](https://neon.com/docs/introduction/plans), [network transfer](https://neon.com/docs/introduction/network-transfer) and [usage monitoring](https://neon.com/docs/introduction/monitor-usage).

Allowance period: **October 1 00:00 UTC through November 1 00:00 UTC**. These are monthly/project allowances, not D1's midnight-reset read/write allowances.

| Console capture UTC | Scope                                  | Displayed network | Displayed compute | Displayed storage |
| ------------------- | -------------------------------------- | ----------------- | ----------------- | ----------------- |
| 04:35:21.983        | production branch                      | 0.09 kB           | 0.04 CU-hrs       | Prior baseline    |
| 04:40:24.173        | benchmark branch                       | 507.05 MB         | 0.16 CU-hrs       | Prior baseline    |
| 05:16:22.457        | benchmark branch, after cache          | 507.05 MB         | 0.16 CU-hrs       | 440.92 MB         |
| 05:25:38.026        | production branch                      | 0.09 kB           | 0.04 CU-hrs       | 31.69 MB          |
| 05:27:17.139        | benchmark branch, after recovery       | 507.05 MB         | 0.16 CU-hrs       | 440.92 MB         |
| **05:34:30**        | **benchmark, parent Chrome extension** | **507.05 MB**     | **0.16 CU-hrs**   | **440.92 MB**     |
| **05:34:30**        | **organization Projects, one project** | **0.51 GB**       | **0.21 CU-hrs**   | **0.47 GB**       |

A later extension reading at **05:48:02 UTC** showed benchmark **507.07 MB transfer, 0.23 CU-hours, 440.95 MB storage, 661.62 MB history**, endpoint displayed inactive, since October 1. At **05:47:36 UTC**, organization Projects showed one project: **0.51 GB transfer, 0.30 CU-hours, 0.47 GB storage and 0.01 GB history**. Usage-as-of and settled coverage remain unknown. The displayed benchmark differences of **+0.07 CU-hours / +0.02 MB** span cache, recovery, refresh, verification and idle activity; they are not attributed solely to the run. The transfer difference plainly does **not** cover the known 155,908,075 B read. The history/storage snapshots disagree in scope/freshness and are recorded literally; **661.62 MB history is not interpreted as logical database growth**. At **06:18:37 UTC**, the parent's extension-only reading remained **507.07 MB / 0.23 CU-hours** for the inactive benchmark and **0.51 GB / 0.30 CU-hours** at organization scope. This still does not visibly cover the 155.9 MB read; it is not settled evidence or zero egress. The final extension-only observation, completed by **06:44:41 UTC**, again showed the benchmark at **0.23 CU-hours, 507.07 MB transfer, 440.95 MB storage and 661.62 MB history**, endpoint inactive. Organization Projects showed **0.3 CU-hours, 0.51 GB transfer, 0.47 GB storage and 0.01 GB history**, one project. Both showed usage since October 1. There was no displayed change from the 05:48/06:18 readings; **usage-as-of remains UNKNOWN and no attributable provider transfer, CU-hours or active-time cost for the failed run is established**. This documentation update made no database call or SQL wake-up. No further meter observation is planned in this task.

The extension also read project-row storage 442.52 MB and history 0 kB. Raw displayed units/precision are preserved. **Usage-as-of remains UNKNOWN**, and the UI warns of roughly one-hour lag and inactive-project update behavior. Branch metadata update times are not meter times. The 05:34 reading is after the attempt chronologically but is **not settled post-run coverage**. Apparent unchanged transfer is not zero actual cost; the .01 CU-hour aggregate display difference is not attributed to this run. Legacy API zero consumption remains rejected as uncalibrated. No exact provider transfer/CU-hour/active-time delta is claimed.

The pilot gate accepts a credible rounded Console baseline with unknown as-of plus known lifecycle for the two explicitly bounded endpoints. Earlier client transfer was 493,707,924 B, calibrated against the roughly 507 MB display. Conservatively allowing binary interpretation and one display unit per branch gave **531,691,049 B / 0.22 CU-hours** before the pilot. Known cache/recovery work was additionally reserved as **1,500,000 B / 0.566667 CU-hours**; these are conservative planning allowances, not billing measurements.

The unknown-as-of gate further reserved **1 GB for pending traffic, 10 CU-hours for pending compute**, the existing **1 GB future runtime allowance**, the prior **493,707,924 B successful-reconciliation proxy**, and at most **25 minutes at 1 CU** for the bounded database pilot including idle tail. It retained **1,973,101,027 B** transfer headroom and a compute upper planning total of **11.203333 CU-hours**, comfortably below documented limits for this one experiment. Reserves are not guaranteed lag bounds or permission for an unobserved recurring workload. Source fetching occurs before database connection and the receipt is checked again before compute is used; an expired baseline fails closed.

Native browser interactions were stopped immediately on the user's instruction. No more AppleScript/window/capture/GUI automation will be used. The child has no extension tools; subsequent provider readings come only through the parent's supported ChatGPT Chrome extension task. No browser security/accessibility permissions were changed.

## Decision after the original failure — later approval and guard evidence below

The manual job stays local and manual-only. No monthly promotion or D1 schedule restoration is warranted. **Monthly scheduling remains blocked on explicit resolution of five absent stored facts and 2,595 unmatched incoming occurrences exceeding the unchanged 1,000-change guard.** The new source-only capture identifies the five public tuple omissions and one exact month-change candidate; explicit correction/disappearance handling is still required before another database refresh. Do not repeat a database scan merely to reproduce this failure. The original run's exact input identities and server SQL duration remain unretained; the new capture is a distinct observation.

After that source discrepancy is resolved, a separately authorized successful genuine refresh still needs publication SQL/wall/changed-row/transfer measurements and fresh-generation cache behavior. Provider meter coverage or a defensible ongoing quota-observation policy is also required. Complete runtime API parity, authenticated routing availability, full bulk endpoint Worker CPU/memory, real POP traffic and monthly compute/egress headroom remain unproven. The earlier +134 prototype and cache success are useful evidence, not substitutes for these gates.

At the full-success proxy, one monthly reconciliation uses about 0.494 GB before runtime, while daily hint-triggered reconciliation can exceed 15 GB/month. Sustained uncached traffic can also keep 0.25 CU active beyond 100 CU-hours/month. Comfortable storage and a zero-query warm hit therefore do not alone make Neon Free a production migration recommendation. See the preserved [monthly-policy analysis](neon-monthly-refresh-policy.md).

No PostgreSQL runtime migration or reconciliation optimization is implemented. The later local-only Neon retention/checkpoint proposal below remains unapproved. The minimum next decision is reviewed source-disappearance/correction handling and settled usage evidence; there is no justification for raising 25,000 or deleting facts automatically. The combined 29,421 case remains rejected under the unchanged internal guard and would require explicit manual assessment.

## Validation, files and retained resources

Before the retention/context follow-up, `node_modules/.bin/vp run check` passed: formatting, lint, typecheck, **1,870 tests in 190 files**, build, import boundaries and bundle budgets. The gate made no remote database calls. Two pre-existing UI stringification warnings remain; no new lint warning remains. Final documentation-only formatting verification passed; no further million-row measurement was performed.

Tracked candidates consist of repository Neon config/dependencies, plain benchmark SQL/scripts, the manual publisher/workflow/tests and sanitized docs/evidence. Earlier ignored agent-skills/account/environment/MCP state remains local; personal/global MCP configurations are not added to the repository. `.neon`, `.env.local`, `.neon-benchmark`, connection/password/token files and source databases remain ignored. No package-lock or private shortlist corpus was introduced. The benchmark branch, faithful public corpus, existing SELECT-only role and earlier user-authorized personal Neon CLI/MCP setup remain. Temporary Worker/Hyperdrive resources are deleted.

Evidence: run summary (`docs/evidence/neon-manual-run-summary-2026-10-04.json`), complete genuine failure receipt (`docs/evidence/neon-genuine-refresh-2026-10-04.json`), manifest equality (`docs/evidence/neon-genuine-after-state-2026-10-04.json`), fresh cache receipt (`docs/evidence/neon-manual-cache-before-2026-10-04.json`), recovery receipt (`docs/evidence/neon-manual-recovery-2026-10-04.json`), prior Console receipt (`docs/evidence/neon-console-usage-2026-10-04.json`). Private browser snapshots are not shared.

Branch and HEAD are unchanged. Current `git status --short`:

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
?? docs/evidence/neon-console-usage-2026-10-04.json
?? docs/evidence/neon-context-provenance-forecast-2026-10-04.json
?? docs/evidence/neon-genuine-after-state-2026-10-04.json
?? docs/evidence/neon-genuine-refresh-2026-10-04.json
?? docs/evidence/neon-manual-cache-before-2026-10-04.json
?? docs/evidence/neon-manual-recovery-2026-10-04.json
?? docs/evidence/neon-manual-refresh-observability-2026-10-04.json
?? docs/evidence/neon-manual-run-summary-2026-10-04.json
?? docs/evidence/neon-monthly-refresh-budget-2026-10-04.json
?? docs/evidence/neon-monthly-refresh-policy-2026-10-04.patch
?? docs/evidence/neon-official-context-capture-2026-10-04.json
?? docs/evidence/neon-reconciliation-approval-2026-10-04.json
?? docs/evidence/neon-reconciliation-policy-analysis-2026-10-04.json
?? docs/evidence/neon-reconciliation-review-2026-10-04.json
?? docs/evidence/neon-source-discrepancy-2026-10-04.json
?? docs/evidence/neon-source-offline-capture-2026-10-04.json
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
?? tests/unit/neon-context-forecast.test.ts
?? tests/unit/neon-reconciliation.test.ts
?? tests/unit/neon-refresh.test.ts
?? tests/unit/refresh-policy.test.ts
?? tests/unit/source-diagnostic.test.ts
```

## Local reconciliation decision update — verified, no remote retry

The user approved retaining all five absent stored occurrences as unresolved and accepting exactly 2,595 additions as a snapshot-pinned one-time manual catch-up. No correction or deletion is inferred, and the routine guard stays unchanged. **The retry stops: required transaction inserts plus existing-block price/count mutations alone forecast 25,659 index operations, above the unchanged 25,000 guard.** No database retry, publication or resource recreation occurred. The overall database assessment remains **NEON FREE IS MARGINAL**.

This stage resumed on `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`, preserving all existing dirty work and D1 evidence. The first policy analysis used retained local data only. The subsequent provenance investigation acquired six official public context files with **27 anonymous requests / 1,702,895 received response bytes**. The pinned active transaction file was not re-downloaded or replaced. Both stages made **zero Neon calls, zero D1 calls and zero OneMap search/routing calls**. No credential, role, resource, workflow, application deployment or production state was changed. Temporary Worker and Hyperdrive remain deleted; the isolated benchmark branch is preserved.

### Exact source evidence and its limits

The active dataset is `d_8b84c4ee58e3cfc0ece0d773c8ca6abc`, registrations from January 2017 onward. The successful stored checkpoint was generated at **2026-08-29 01:37:16.797 UTC**; its original raw CSV and capture time were not retained. The new active CSV was saved at **2026-10-04 06:03:06.149 UTC**, **36.184599 days** later. The generated-at timestamp is a checkpoint proxy, not an invented original download time.

| Active-source comparison       | Occurrences |
| ------------------------------ | ----------: |
| Stored active baseline         |     239,330 |
| Current normalized active file |     241,920 |
| Exact matches                  |     239,325 |
| Absent stored occurrences      |           5 |
| Unmatched incoming occurrences |       2,595 |
| Net active growth              |       2,590 |

The CSV contains 241,920 raw rows, with zero parser errors, normalization skips or excluded facts. Raw-body SHA-256 is `9835dfe6cd92a46a1302fabf3a692bf893ee5b86ec95638d10dfce61dbfbdb9a`; normalized exact multiset SHA-256 is `88b6c6252b2329edcb9856491cec5d05f5ca92f1340640ed90291fe2c7466356`. Duplicate occurrences contribute repeatedly to the hash. Before/after source inventory hints were stable during the earlier authorized capture; this is a distinct capture and does not recover the failed run's original in-memory input.

There is **one dated comparison interval and zero independent earlier growth intervals**. The registration-month distribution of the additions—137 August, 2,246 September, 212 October—is not snapshot growth history. The 746,203 historical retained facts were reused locally; current historical CSV bodies were not recaptured. Consequently **988,123 source facts / 988,128 effective stored facts are conditional reconstruction counts**, not a newly verified complete upstream corpus.

The earlier candidate-derived 3,893 envelope is withdrawn. Multiplying this candidate's observed rate back by its own elapsed interval admits itself by construction. Using all 985,533 retained rows as the denominator would also dilute a change measured only in the active partition.

### Five approved dispositions

Each exact tuple has old multiplicity one and new multiplicity zero. The official public fields provide neither a persistent registration ID nor a unit ID; the retained evidence contains no specific authoritative correction/removal notice. The September candidate below establishes a one-field resemblance, not real-world transaction identity. The user explicitly approved **retain-unresolved** for all five and forbade pairing the July→September candidate without stronger evidence. The approval receipt (`docs/evidence/neon-reconciliation-approval-2026-10-04.json`) records the exact scope and quote.

| Stored ID | Stored fact                                                                                                       | Strongest available evidence                                                                      | Proposed handling                                                                                           |
| --------: | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
|    550818 | May 2026; TOA PAYOH, 58 LOR 4 TOA PAYOH; 2 ROOM, 01 TO 03; 45 m², lease 1967; $258,000, STANDARD                  | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `40 years 01 month` presentation                                                     |
|    601171 | April 2026; KALLANG/WHAMPOA, 55 JLN BAHAGIA; 3 ROOM, 01 TO 03; 93.6 m², lease 1972; $1,028,000, TERRACE           | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `45 years 03 months` presentation                                                    |
|    934839 | July 2026; KALLANG/WHAMPOA, 8A UPP BOON KENG RD; 3 ROOM, 10 TO 12; 70 m², lease 2017; $780,000, PREMIUM APARTMENT | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `90 years 01 month` presentation                                                     |
|    955489 | July 2026; BUKIT BATOK, 445A BT BATOK WEST AVE 8; 4 ROOM, 01 TO 03; 92 m², lease 2019; $625,000, MODEL A          | One unmatched September fact differs only in month; saved CSV data-row 224,897; identity unproven | Retain July ID and `91 years 07 months`; insert September independently if the full publication is approved |
|    959788 | August 2026; WOODLANDS, 182A WOODLANDS ST 13; 2 ROOM, 13 TO 15; 47 m², lease 2019; $378,888, MODEL A              | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `92 years 02 months` presentation                                                    |

Under the local exact multiset plan, the September candidate receives new integer ID **986006**. The ledger links that possible replacement without treating it as a correction. Keeping both may count a revised registration twice if that is what actually occurred; dropping or merging either would instead require unsupported identity inference. This uncertainty remains visible in the operator receipt and manifest. The current public UI has no per-row discrepancy badge; no production rollout is proposed.

### Durable accounting and publication behavior

The script-only `neonReconciliation` manifest state holds each approved exact tuple, integer ID, occurrence count one, original lease presentation, evidence/decision reference, first and last distinct missing-source observations, status, source hash and possible replacement IDs. A separate accepted-source checkpoint records normalized/source/stored counts, outstanding retained count, active scoped count/hash and raw CSV hashes/byte/row counts. The original proposed state was **6,715 bytes**; adding the recorded user decision reference makes the current planned ledger/checkpoint **7,410 bytes**. It is bounded to a one-MB manifest value; all existing body/write/statement limits include it.

All stored occurrences consume real incoming multiplicity before any insert is assigned. A partial duplicate reappearance resolves only the corresponding occurrence; a full reappearance produces no duplicate logical row; only multiplicity beyond the retained baseline becomes an insert. Existing IDs remain stable even when otherwise identical source occurrences have different remaining-lease text. Retained presentation does not invent month-precision lease values.

Unknown disappearances fail with a structured discrepancy receipt. Independent limits are at most five newly reviewed retentions, five outstanding retentions, **zero corrections and zero removals**. Reappeared entries remain in the historical ledger; a later disappearance updates the existing entry rather than appending another ledger row.

Changed raw CSV bytes advance the accepted checkpoint even when canonical facts are equal. Exact same-source replay in the same UTC month preserves checkpoint/ledger bytes and skips a redundant manifest publication when there are no other mutations. A changed ledger, another semantic manifest change or a new UTC month prevents that shortcut. Changed artifacts and staged caches publish first, with the manifest/ledger last in the same PostgreSQL transaction and a locked expected-manifest equality guard. A late failure rolls back all changes. An ambiguous COMMIT response still requires authoritative manifest inspection and reconciliation; there is no blind automatic retry.

These are new **local** regression results. Earlier isolated PostgreSQL rollback/ambiguous-outcome evidence remains preserved in the [benchmark report](neon-benchmark-2026-10-04.md); this stage did not repeat it remotely.

### Growth guard and exact one-time exception

The recurring proposal uses **`min(1000, floor(active baseline × 0.005))`**, with an accepted checkpoint gap of at most **35 days** for either explicit monthly or manual intent. At the actual active baseline, the relative ceiling is 1,196, so the operative ceiling is **1,000**. Retained unresolved occurrences and untouched historical partitions do not enlarge that denominator. Historical positive additions require separate scoped review.

The 1,000 limit preserves the existing conservative transaction guard; the 0.5% and 35-day conditions are explicit conservative risk ceilings, **not an empirically calibrated recurring growth model**. No independent historical evidence supports claiming that ordinary monthly growth will fit. A refused scheduled run would require operator review; there is no automatic conversion to manual intent or elapsed-time scaling.

This candidate is **2,595 / 239,330 = 1.084277%**, and its checkpoint gap also exceeds 35 days. The approved exception is a separate **manual-only one-time allowance**, pinned to:

- the exact isolated project and branch;
- the initial full conditional source and stored manifest hashes;
- the old/new active multiset hashes and raw CSV body hash;
- the exact 2,595-occurrence positive-diff hash;
- active counts 239,330 and 241,920;
- exactly the five absent IDs above;
- a maximum checkpoint gap of 62 days, without admitting any other snapshot;
- an explicit decision reference and durable marker consuming the exception once.

The exception is not reusable by a later source or monthly run. Its schema ceiling of 5,000 does not grant that many inserts; exact pins require **2,595**. The persisted [review file](evidence/neon-reconciliation-review-2026-10-04.json) now records **`reviewStatus: approved`** and the explicit user decision. It preserves every original fact/diff/hash pin and all routine/publication guard values. The CLI still rejects proposed reviews before network activity; that regression test uses a dedicated local proposed fixture. The original pre-approval analysis remains a dated historical receipt. Approval does not bypass resource or full-publication guards.

The source-policy decision is complete. The user authorized a bounded benchmark retry only if the authoritative plan fits the existing guards. That condition is not met: the mandatory source/price subset already exceeds the write guard, so no retry is performed. New temporary Worker/Hyperdrive access would also require action-time approval; none was requested or created.

### Downstream effects of retention

The reconstructed 24-observed-month window starts November 2024. These are exact local block-summary effects, including the historical fallback when the source has no transaction in the recent window.

| Retained ID | Source-only recent occurrences | With retention |                                             Source-only recent median | With-retention median |
| ----------: | -----------------------------: | -------------: | --------------------------------------------------------------------: | --------------------: |
|      550818 |                              0 |              1 | No recent value; 50 historical facts give a $201,000 fallback summary |              $258,000 |
|      601171 |                              1 |              2 |                                                              $990,000 |            $1,009,000 |
|      934839 |                             19 |             20 |                                                            $1,100,000 |            $1,070,400 |
|      955489 |                             20 |             21 |                                                              $695,444 |              $690,000 |
|      959788 |                             18 |             19 |                                                              $454,000 |              $423,000 |

The exact delta affects **2,116 block keys and 119 town/flat-type cohorts** before window/context invalidation. Retention participates in summaries, recent transactions, trends and comparison dependencies rather than surviving only in the raw transaction table. Local tests compare full and incremental artifact builds and check unaffected cohort preservation.

### Earlier retained-context scenario, preserved for comparison

The full retained-context compiler scenario uses the actual active CSV plus conditional historical facts, preserved geocodes/MRT, reconstructed retained property presentation and 178 observed primary schools. Static recorded comparison amenities are explicitly reused. PostgreSQL JSONB canonicalization and the actual declared index inventory are applied; primary and secondary index maintenance remain included. A preliminary noncanonical estimate was corrected before this final evidence because object key order is not a PostgreSQL JSONB change.

| Publication component                                 | Changed records |
| ----------------------------------------------------- | --------------: |
| Transaction inserts                                   |           2,595 |
| Transaction updates/deletes                           |           0 / 0 |
| Blocks                                                |           4,409 |
| Field-patched details                                 |           4,424 |
| Comparisons                                           |           9,637 |
| Trend rows                                            |             264 |
| MRT records                                           |               0 |
| Staged geocode/routing cache records in this scenario |           0 / 0 |
| Manifest, including ledger/checkpoint                 |               1 |
| Total logical changed records                         |      **21,330** |

| Independent guard                                     |         Scenario | Existing limit | Result |
| ----------------------------------------------------- | ---------------: | -------------: | ------ |
| Conservative index-operation forecast                 |       **40,368** |         25,000 | Reject |
| Publication statements including manifest guard/write |          **214** |            100 | Reject |
| Encoded statements + manifest                         | **50,828,679 B** |   90,000,000 B | Fits   |

Local scenario planning took **15,702.455 ms**. That is neither remote SQL duration nor Neon billing compute. The transaction-only 12,975 index-operation lower bound is not the full publication cost. No guard was increased or made conditional on the source exception.

This scenario is **not an authoritative fresh-context forecast or a proven lower bound**. Original property/amenity inputs were unavailable, reconstructed inputs change the context digest, and the window advanced. The provenance follow-up established that the retained manifest has **no `syncBuildState` at all**. That absence unconditionally requires first-publication bootstrap rebuilding, even with identical context. A digest cannot be matched to a baseline that never stored one. `contextChanged: true` therefore does not establish that upstream context changed; reconstruction differences were not the sole invalidation cause. Of the effective source addresses, 286 have no retained geocode, including **41 addresses appearing among new facts**; these are not asserted to be 41 newly created blocks. The scenario attempts no geocoding and stages no new caches. Reacquiring current historical sources/context could change artifacts and cache costs in either direction.

Accordingly **actual fresh-context complete forecast = UNKNOWN**. Both an unknown full forecast and a known forecast above any existing guard remain blocked. Even accepting all five retentions and the exact 2,595 allowance cannot clear this independent publication gate. Packaging or invalidation changes would need a separately justified local design, not a larger guard or independently commit-able partial batches.

The bounded public-context investigation below has now been completed within the existing read-only scope. It does not recover missing original raw bodies or invent geocode outputs. It is sufficient to identify a mandatory write-guard failure independent of those unknowns; no additional source/database/geocoding work is needed to decide that this retry must stop.

### Context provenance follow-up and decisive mandatory cost

The retained `.neon-benchmark/source.sqlite` contains all public stored facts, published artifacts, 10,333 geocodes (9,730 block keys, 179 school keys and 424 supermarket keys), and zero routing cache rows. It preserves the original MRT exits JSON. It contains **no original property CSV, school CSV, supermarket CSV, hawker GeoJSON or park GeoJSON**, no raw historical transaction CSVs, and no baseline `syncBuildState`/context digest. Published nearest-school observations and max-floor presentation cannot reconstruct the full original context inventories. The failed refresh did not persist its original context bodies. Exact original-byte identity for those inputs cannot be asserted.

The normal anonymous data.gov.sg download flow was used from **11:02:44.918 to 11:04:40.242 UTC**. Non-CSV datasets went directly to poll as permitted by the [official download guide](https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset). Download API calls were spaced at least 12 seconds, respecting the conservative anonymous pacing described in the [rate-limit documentation](https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits). All 27 HTTP responses succeeded; no credentials, retry-after-denial, transaction body downloads, database activity or OneMap calls occurred. The capture was bounded to 48 requests / 32 MB total / 16 MB per response / ten minutes. Before/after metadata was stable. Raw bodies and hashes remain in the private ignored capture directory; the sanitized receipt (`docs/evidence/neon-official-context-capture-2026-10-04.json`) records every hash, timestamp and response cost.

| Current official input   | Delivered bytes | Raw records/features |     Normalized usable records |
| ------------------------ | --------------: | -------------------: | ----------------------------: |
| HDB property information |         945,969 |               13,357 |                        13,357 |
| MRT exits                |         213,057 |                  613 |                           613 |
| Schools                  |         135,634 |                  337 |           179 primary schools |
| Hawkers                  |         140,561 |                  129 |                           129 |
| Supermarkets             |          42,172 |                  478 | 457 with existing coordinates |
| Parks                    |         168,423 |                  462 |                           462 |

These are **newly captured current inputs**, not silently substituted original bytes. The current MRT document is logically equal to the original retained MRT JSON. All primary-school coordinates resolve using existing data/cache; no new school geocode is needed for this captured file. Exactly **21 supermarket keys lack cached coordinates**, listed individually in the forecast receipt (`docs/evidence/neon-context-provenance-forecast-2026-10-04.json`). The effective source also has **286 block-address keys without geocodes**, including 41 appearing in incoming facts. Normalization used a strict offline network prohibition: unresolved keys were recorded, not looked up or assigned fabricated coordinates. The zero staged cache writes describe only this available-data candidate; they are **not** an authoritative assertion that a genuine refresh needs zero cache writes. Up to 307 distinct unresolved cache keys remain, with actual successful geocode/derived costs unknown. Authenticated routing outcomes are likewise not fabricated; the empty retained routing cache uses the existing straight-line fallback for the offline candidate.

The active transaction bytes, exact facts and positive diff retain the approved hashes. The oldest four source partitions are still retained facts rather than newly captured bodies. Thus the complete geocoding-enabled forecast remains unknown. However, the accepted fact pins determine existing-block prices/counts independently of missing amenity or additional-address coordinates. The latest month advances **August → October 2026**, moving the 24-observed-month threshold **September → November 2024**. Required window/delta effects change median or transaction count in **4,228 already geocoded existing blocks**.

| Required mutation subset            |  Rows |                          Existing conservative index-operation forecast |
| ----------------------------------- | ----: | ----------------------------------------------------------------------: |
| Exact approved transaction inserts  | 2,595 |                        12,975: record + primary/three secondary indexes |
| Existing-block median/count changes | 4,228 | 12,684: record + old/new entries in the existing price/count sort index |
| Mandatory subtotal                  |       |                                                              **25,659** |
| Unchanged write guard               |       |                                                              **25,000** |

This is an exact lower bound on the **project's conservative forecast for the pinned source facts**, not a measured or lower-bound PostgreSQL billing metric. It excludes every detail, comparison, trend, cache and manifest write. Additional supermarket/address resolution cannot eliminate an existing block's own-source median/count change or the pinned transaction inserts. The subtotal already fails, so the conditional retry is stopped without acquiring credentials, running geocoding or consuming a database scan.

For transparency, the reproducible **current-captured-context / existing-cache candidate** has the following complete compiler decomposition. It is not mislabeled the complete genuine geocoding-enabled publication.

| Mutation group        |   Inserts |    Updates | Statements | Conservative forecast |
| --------------------- | --------: | ---------: | ---------: | --------------------: |
| Transactions          |     2,595 |          0 |          6 |                12,975 |
| Blocks                |         0 |      4,409 |        144 |                12,865 |
| Detail field patches  |         0 |      4,424 |         37 |                 4,424 |
| Comparisons           |         0 |      9,640 |         20 |                 9,640 |
| Trends                |       202 |         62 |          5 |                   466 |
| Manifest guard/update |         0 |          1 |          2 |                     1 |
| Total                 | **2,797** | **18,536** |    **214** |            **40,371** |

The emitted group costs sum exactly to the unchanged shared compiler forecast; diagnostics reject any discrepancy. The candidate body is **50,833,870 B**, below 90,000,000 B, but **40,371 > 25,000 writes** and **214 > 100 statements**. Blocks alone emit 144 statements because field-level patches are grouped by changed-column sets and bounded row/byte chunks. This is an internal publication guard, not a claimed PostgreSQL server statement limit. Unknown future cache/routing outcomes could change those shapes; the independent mandatory write subtotal is the decisive stop condition. No estimator, chunk size, guard, publication architecture or runtime behavior was changed to make it pass.

The result is **STOP / no bounded retry**. A later proposal would need to address the measured catch-up plus window mutation cost while preserving atomic correctness and substantial quota headroom. No such redesign or guard increase is implemented here, and no further data acquisition is necessary merely to establish this rejection.

### Resource plan for a possible later bounded retry

No new provider reading was taken. The last supported extension observation completed by **06:44:41 UTC** remains benchmark **507.07 MB / 0.23 CU-hours**, organization **0.51 GB / 0.30 CU-hours**, since October 1; meter as-of is **UNKNOWN**. It does not visibly cover the known failed-path **155,908,075 B** received-client proxy and is stale for the current 20-minute pilot gate. No zero-usage or settled-run-cost claim is made.

A later publication plus reconciliation replay must reserve **two complete-success models of 493,707,924 B each**, even though the failed preflight transferred less. Client-stream bytes are a planning proxy, not billed public transfer. With a deliberately conservative interpretation of the old organization display, an illustrative transfer envelope is:

| Planning term                                                                     |             Bytes |
| --------------------------------------------------------------------------------- | ----------------: |
| Old 0.51 GB display plus one 0.01 display unit, interpreted as GiB and rounded up |       558,345,749 |
| Known failed run, added even if later meters might overlap it                     |       155,908,075 |
| Two full-success reconciliation models                                            |       987,415,848 |
| Temporary cache/resource test allowance                                           |         1,500,000 |
| Unknown pending transfer reserve                                                  |     1,000,000,000 |
| Future runtime transfer reserve                                                   |     1,000,000,000 |
| Total conservative planning allocation                                            | **3,703,169,672** |
| Remaining against conservative 5,000,000,000 B allowance                          | **1,296,830,328** |

An illustrative compute envelope reserves the old aggregate reading/resolution (0.31 CU-hours), a separate 25-minute-at-1-CU allowance for the known failed attempt, two future 25-minute-at-1-CU runs, five minutes for a bounded test at 1 CU, and ten CU-hours for unknown pending activity: **11.643334 CU-hours**, rounded upward. These are planning allowances, not attributed provider measurements or a guaranteed bound on lag/unobserved traffic. Ongoing runtime compute still has no certified traffic model. The actual future gate must use a fresh supported receipt, bounded lifecycle evidence and explicit reservations for both runs; the old receipt is not reusable permission.

There is no authorized new Worker or Hyperdrive setup in this stage. Any later test requires approval for its exact temporary identities and settings: isolated benchmark binding, existing SELECT-only runtime role, disabled Hyperdrive query caching, bounded connections, token-gated endpoints, Singapore observation and verified cleanup. No grant changes, primary branch queries, production secrets or production application deployment are implied.

### Validation and stop point

The prescribed `node_modules/.bin/vp run check` passed under **Node 24.15.0**, with normal sandbox escalation for the `tsx` local IPC socket: formatting, lint, typecheck, **1,893 tests in 192 files**, production build, import boundaries and bundle budgets. The build is a local artifact, not an application deployment. The preceding sandboxed attempt passed formatting/lint/typecheck/all tests but could not create the local IPC socket; the supported escalation resolved that environment restriction. Two pre-existing UI stringification warnings remain, with no new lint warning. No external database access or new source acquisition occurred.

The 18-test new reconciliation suite covers partial duplicate reappearance, different lease presentations with retained IDs, repeated observations without duplicate ledger entries, raw-only checkpoint changes, a month boundary, strict active scope, insertion/gap boundaries, invalid timestamps, manual-only pinned exceptions, and ledger/manifest failure recovery. A native in-memory SQLite test executes real transaction inserts plus the manifest ledger, verifies complete rollback, commits, and verifies a zero-insert replay. It is local engine evidence, not a substitute for the previously completed PostgreSQL atomicity experiment. The two new CSV tests verify exact delivered BOM bytes and prevent a checkpoint after parse failure; pacing is mocked because it has separate rate-limit tests. Three additional attribution tests validate the required mutation subtotal, reject disagreement with the shared compiler, and prove that an admissible partial subtotal never admits a full publication over the guard.

New local-stage files include the Neon reconciliation policy, bounded anonymous context capture, offline provenance/forecast scripts, its 18-test reconciliation suite and three-test attribution suite, approved review/approval/analysis receipts, and this report. Existing Neon planner/publisher files add review/capture integration and manifest-inclusive plan guards. `scripts/lib/sync/fetchers.ts` adds optional raw-byte capture; `tests/unit/fetchers.test.ts` verifies it. README links the decision gate. All earlier dirty configuration, workflow, evidence and D1 policy changes remain preserved; nothing is committed or discarded.

The D1 planner defaults, schema/migrations, runtime handlers, cache implementation and production data remain intact. New script behavior is isolated to the Neon prototype; the optional raw-CSV capture preserves the default D1 fetch path. No private shortlist corpus is imported. Secrets and retained corpus files remain ignored.

**Stop here:** source-policy approval is recorded, but the mandatory 25,659 forecast already exceeds 25,000. No retry, resource recreation, publication or monthly scheduling occurs. The complete actual cache-enabled cost remains unknown; missing inputs are enumerated rather than manufactured. All write/statement/body guards remain unchanged. The complete machine-readable local analysis (`docs/evidence/neon-reconciliation-policy-analysis-2026-10-04.json`) and [earlier manual-run report](neon-manual-publication-2026-10-04.md) preserve the evidence and limitations.

## Cache-only policy correction

The later migration gate incorrectly required all missing geocodes and a new routing choice. That requirement is withdrawn. The existing `--skip-geocoding` / `SKIP_GEOCODING=1` path already preserves source facts/trends while omitting unlocated block artifacts and skipping unresolved supermarkets; missing retained routes use the existing geometric fallback. Historical successful refreshes included approximately 271 unresolved HDB addresses and 21/478 supermarket skips. New geocoding outcomes are irrelevant to the now-pinned cache-only snapshot. Earlier hypothetical full-geocoding costs remain unknown, but do not block that snapshot. See actual local stage evidence (`docs/evidence/neon-cache-only-stage-2026-10-04.json`); no remote verification or credentials were used for the correction.
