# Isolated remote D1 verification — October 3–4, 2026 UTC

> **Provenance.** Links to files that are not part of this branch point at commit [b80446400](https://github.com/shenghaoc/hdb-resale-visualizer/tree/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6) of the recovery snapshot (branch `feat/neon-refresh-publisher`), which preserves provenance; generated evidence that was never recovered (`docs/evidence/*`) appears as plain paths.

**Verdict: NOT SAFE to re-enable the refresh.** The bounded remote experiments establish REST batch atomicity, index accounting for the tested mutations and actual Workers Cache API behavior. Remaining limits concern current upstream source availability, sustainable storage runway, live read traffic and the demonstrated combined-refresh guard policy. The October 4 continuation completes the previously missing exact publisher SQL variants. The authorized compact exact-schema fixtures are the remote verification strategy; a production-scale remote database copy or mutation rehearsal is not required. No implementation defect requiring a behavioral change was found; the 25,000-write forecast guard and remote-apply guard remain intact. This verdict describes unresolved gates, not a demonstrated daily delta exceeding Cloudflare's quota.

This report follows the earlier [authenticated read-only inspection](d1-remote-verification-2026-10-03.md). That report's production schema, corpus, query plans and baseline reads are reused without repeating a production scan. Sanitized remote receipts (`docs/evidence/d1-isolated-remote-2026-10-03.json`) contain exact HTTP statement metadata and Worker binding counters. Source under test was `8e0a14542df43a4eb8898aaa9aaddeeeed6ad260` on `feat/d1-free-incremental-refresh`. Application code, migrations, indexes and production configuration were unchanged.

## Scope, resources and ledger

After explicit authorization to continue despite unknown plan identity, exactly one temporary APAC database was created: `hdb-d1-verify-20261003`, ID `5ca1b9d9-8029-413d-a37f-805a48c7b2bb`, created at 23:49:28 UTC. The temporary Worker `hdb-d1-cache-verify-20261003` bound only that database, with no assets, production routes, secrets or scheduled triggers. Its deployed version was `1978ebae-05e0-4746-b925-82b583d13ce7`. Existing OAuth was read into process memory; no credentials or scopes were added or logged.

Both resources were deleted successfully: Worker HTTP200 at 23:59:40 UTC; database HTTP200 at 23:59:42 UTC. The existing production database and the other two existing databases were preserved. There was no production deployment, D1 mutation, migration, index rebuild, VACUUM, push, PR, merge or workflow restoration.

All measured D1 operations occurred on **October 3 UTC**, before midnight. The test harness used independent 100,000-read/10,000-write budgets, stopping before subsequent calls once known usage exceeded 90,000 reads or 8,000 writes. It targeted only the new database. The bounded fixture/failure operations were prechecked to remain small; missing metadata was retained as unknown and never silently counted as zero. No million-row seed or production copy was made. No October 4 D1 activity was initiated by this first phase; the separately authorized continuation below has its own October 4 ledger.

| October 3 ledger                                        | Rows read | Rows written | Meaning                                                      |
| ------------------------------------------------------- | --------: | -----------: | ------------------------------------------------------------ |
| Successful isolated REST receipts, including migrations |     1,518 |        1,312 | Exact per-statement HTTP metadata                            |
| Temporary Worker binding calls                          |        75 |            1 | Exact returned binding metadata, 22 requests                 |
| Combined individually measured operations               |     1,593 |        1,313 | Excludes requests with unavailable metadata                  |
| Closing isolated database analytics                     |     1,866 |        1,383 | Reported day aggregate at 23:59:10, sample interval 1        |
| Closing production database analytics                   | 2,403,978 |            0 | Earlier authorized inspection/reconciliation; no repeat scan |
| Closing reported account totals                         | 2,405,844 |        1,383 | Only those two databases reported activity                   |

The isolated aggregate exceeds individually available receipts by 273 reads and 70 writes. Failed batches and the genuinely aborted response lacked complete statement receipts. These residual costs cannot be attributed statement by statement, nor treated as zero merely because the writes rolled back. Analytics can lag; this is a reported closing snapshot rather than a reservation of account headroom. Against the assumed Free daily ceilings of 5M reads/100k writes, nominal remaining capacity was 2,594,156 reads/98,617 writes. Plan identity remains UNKNOWN; the earlier billing endpoint HTTP403 was not bypassed. As directed, this is informational, not an acceptance blocker: the verification and headroom calculations use Free-tier ceilings conservatively.

## REST envelope, atomicity and recovery

The fixture applied the repository's exact 11 migrations and seven transaction indexes. It seeded four integer-rowid transactions, including two identical canonical source facts, four blocks/details/comparisons, one town/type trend, a manifest and tiny MRT/geocode/walking fixtures. It did not read any production private cache contents. Final authoritative transaction reconciliation saw 141 transactions after the delta and the two response-loss cases.

The first migration was initially submitted as one multi-statement SQL string. D1 executed it successfully and returned multiple result objects; `D1Client` rejected the result-count mismatch. The verification harness then submitted individual DDL statements for the remaining migrations. Those first 15 reads/27 writes are included in the ledger. Normal publication already uses one SQL statement per batch entry, so no application change was indicated.

| Experiment                                                     | Result                   | Exact successful reads/writes | Body bytes | HTTP elapsed |
| -------------------------------------------------------------- | ------------------------ | ----------------------------: | ---------: | -----------: |
| One transaction insertion, seven secondary indexes             | Accepted                 |                         2 / 8 |        647 |       233 ms |
| Non-indexed price update by rowid                              | Accepted                 |                         1 / 1 |         79 |       242 ms |
| Update affecting all seven index definitions                   | Accepted                 |                         1 / 8 |        162 |       239 ms |
| +134 transactions plus affected derived rows, eight statements | Accepted                 |                   286 / 1,078 |     16,511 |       268 ms |
| Eight statements with realistic JSON parameter shape           | Accepted                 |                        40 / 8 |    354,891 |       708 ms |
| 31 statements with large JSON parameters                       | Accepted                 |                      155 / 31 | 17,434,163 |     4,708 ms |
| Middle constraint failure                                      | Entire batch rolled back |                       Unknown |        245 | See receipts |
| Late constraint failure                                        | Entire batch rolled back |                       Unknown |        245 | See receipts |
| Full large-body late failure                                   | Entire batch rolled back |                       Unknown | 17,433,816 |     5,079 ms |

The +134 batch billed 1,072 transaction writes (134 × eight), two block writes, one each for detail, comparison, trend and final manifest. Its SQL duration summed to 1.9974 ms. It did not touch the other fixture entities. **This compact fixture updated one block, one detail, one comparison and one trend. It is not the original local workload of four blocks, four details, 341 comparisons and four trends**, whose 1,434-write forecast remains a local model rather than a remotely measured total.

| Tested mutation workload                                           | Index-aware formula forecast | Actual rows written | Actual rows read | SQL duration ms |
| ------------------------------------------------------------------ | ---------------------------: | ------------------: | ---------------: | --------------: |
| One transaction insert, seven indexes                              |                            8 |                   8 |                2 |          0.2331 |
| Direct price-only update by rowid                                  |                            1 |                   1 |                1 |          0.2188 |
| Direct update affecting all seven index definitions                |                           15 |                   8 |                1 |          0.2042 |
| +134 inserts alone                                                 |                        1,072 |               1,072 |              268 |          1.1756 |
| Compact +134 batch, including one of each derived row and manifest |                        1,079 |               1,078 |              286 |          1.9974 |

Forecasts apply the planner's formula to the **tested SQL columns and fixture cardinalities**; they were not obtained by invoking the full artifact planner against this fixture. The single-row forecasts omit the separate final-manifest reserve because those tests did not publish a manifest. The compact batch forecast includes that reserve and conservatively allows three block writes versus the measured two. The price-only test updates fewer columns than `transactionStatements`' actual correction SQL, which assigns all eleven source columns; it is not proof that an application correction will bill one write. The broad indexed update billed eight writes, below the conservative old/new-entry allowance. These observations support keeping the guard rather than reducing its factors.

The 31-statement success used maximum SQL length 150 bytes and one JSON parameter per statement. SQL duration summed to 13.5789 ms. Large JSON was bound as data rather than embedded into SQL. Only the intended small existing comparison row was updated; padding targeted an absent key, so it tested transport/parsing, not sustained insertion of 17 MB into storage or production-sized derived updates. The large late failure changed the existing comparison value before a final CHECK failure; its original value remained intact afterward. An earlier 16,871,859-byte failure also rolled back. Neither failure returned statement billing metadata.

Two separate ambiguous-response tests exercised the actual `D1Client`: deterministic response loss after HTTP completion, then a genuine `AbortController` abort after receiving response headers but before the client could consume the body. Both inserts committed remotely. The client correctly reported unknown usage and did not retry. An authoritative snapshot fed to the actual `planTransactionDelta` found both committed facts and planned zero inserts/updates. No blind retry or transaction deletion occurred. This validates the recovery primitive on the compact fixture, not the entire production sync lifecycle.

## October 4 continuation: exact compiled publisher

The remaining SQL variants were already within the authorized compact-fixture scope. The first database had been removed before those variants were exhausted, so one replacement APAC database was created, `hdb-d1-publisher-verify-20261004`, ID **`a158fbf5-1ed9-44da-abc8-b9aa37bbe140`**, at 00:14:40 UTC. Only one temporary DB was active at a time; no second Worker was created. The continuation used the same 11 migrations and existing indexes, with a separate **1,000-write / 10,000-read total budget**, including setup and teardown. Existing plan UNKNOWN did not prevent this authorized conservative test.

The first schema request returned HTTP403 with no statement metadata. Existing Wrangler metadata access refreshed the existing authentication session and confirmed the database was empty; a harmless schema SELECT returned one internal table, one billed read and zero writes. No new credentials/scopes were granted and no uncertain write was blindly repeated. The rejected receipt is preserved separately.

The harness imported and invoked the actual `planArtifactWrites`, `buildPublicationBatch` and `D1Client.publishStagedBatch`, with actual `batchInsert(..., upsert: true)` cache staging. It did not call the intentionally frozen `writeArtifactsToD1` entry point or remove its production guard. It composed that entry point's compiled planner/batch/staging publisher methods against an exact isolated database ID. Statement/body/forecast safety caps remained enforced. Three transaction facts, three blocks/details/comparisons, one town/type trend, tiny MRT data and two fake persistent-cache entries formed the compact fixture.

| Exact publisher test                                      | Compiler forecast writes | Exact returned writes | Exact returned reads | SQL duration ms | Result                                                             |
| --------------------------------------------------------- | -----------------------: | --------------------: | -------------------: | --------------: | ------------------------------------------------------------------ |
| Compiled bootstrap, including initial manifest UPSERT     |                       75 |                    71 |                   20 |          1.3549 | Accepted                                                           |
| Compiled all-variant publication                          |                       36 |                    22 |                   29 |          1.1013 | Accepted                                                           |
| Failure at final manifest NOT NULL boundary               |                       13 |               Unknown |              Unknown |         Unknown | All prior staged/derived changes rolled back                       |
| Exact stale-manifest guard failure                        |                       13 |               Unknown |              Unknown |         Unknown | Entire batch unchanged                                             |
| Real response-body abort after final-manifest publication |                       13 |               Unknown |              Unknown |         Unknown | Publication committed; authoritative retry plan has zero mutations |

The all-variant publication's actual per-statement costs were:

| Mutation                                                      | Compiler forecast writes | Exact writes | Exact reads | SQL duration ms |
| ------------------------------------------------------------- | -----------------------: | -----------: | ----------: | --------------: |
| Full eleven-column transaction correction, same integer rowid |                       15 |            8 |           1 |          0.1065 |
| Block group: median price, display name and postal code       |                        5 |            3 |           4 |          0.1735 |
| Block group: transaction count and flat-model JSON            |                        3 |            2 |           4 |          0.0928 |
| Detail patch: summary, monthly trend and recent transactions  |                        1 |            1 |           4 |          0.1064 |
| Separate summary-only detail group                            |                        1 |            1 |           4 |          0.0811 |
| Comparison JSON update                                        |                        1 |            1 |           4 |          0.0678 |
| Composite-key trend: median price and count update            |                        1 |            1 |           4 |          0.0881 |
| Staged existing geocode fixture INSERT OR REPLACE             |                        4 |            2 |           1 |          0.0981 |
| Staged existing walking fixture INSERT OR REPLACE             |                        4 |            2 |           1 |          0.0689 |
| Final manifest INSERT ON CONFLICT DO UPDATE                   |                        1 |            1 |           1 |          0.0868 |
| Exact baseline guard SELECT                                   |                        0 |            0 |           1 |          0.1313 |
| **Total**                                                     |                   **36** |       **22** |      **29** |      **1.1013** |

These forecasts came from the **actual artifact compiler**, rather than applying its formula externally. The full correction matched all source columns afterward, preserved rowid and exercised all seven transaction index definitions. Detail publication retained the forward-compatible stored field and assigned a stable presentation ID to the added recent transaction. The third block remained byte-for-byte unchanged. Cache replacements were staged until publication; successful publication emptied the staging queue.

The final-manifest failure used the exact final UPSERT with a deliberately invalid NULL JSON parameter. Snapshots confirmed rollback of the earlier cache, block and comparison writes together with an unchanged manifest. The stale guard failed before publication. For the genuine response-body abort, the authoritative snapshot confirmed the new manifest, block, comparison and cache values were all committed. A fresh compiler/reconciliation produced zero transaction inserts/updates, zero derived mutation statements and only the standard one-write manifest reserve. No automatic or blind replay occurred. The failed/aborted client correctly retained unknown usage and its staged queue; recovery used a new authoritative read and fresh client.

Individually returned continuation receipts measured **1,035 reads / 172 writes**, including migrations and the harmless authentication schema read. A conservative 400-write reserve covered a 250-write setup allowance and all five compiler forecasts (75 + 36 + 13 + 13 + 13), comfortably within the authorized ceiling; failed and aborted requests still lack individual billing metadata. A first day-analytics snapshot at 00:21:34 reported 965 reads / 179 writes with sample interval 1 and was visibly lagging completed successful receipts. A later snapshot at 00:24:44 remained at 965 reads / 179 writes (sample interval 1), still inconsistent with completed successful read receipts. Both snapshots are preserved in continuation evidence (`docs/evidence/d1-exact-publisher-2026-10-04.json`). The aggregate cannot supply a complete final billing total for this phase; it is not substituted for missing individual receipts or used to claim zero failed/aborted costs.

Cleanup succeeded with HTTP200 at **00:20:52 UTC**, deleting only the replacement database. No production D1 content query or mutation occurred on October 4. Database lifecycle API responses provide no statement usage metadata; no SQL DELETE of fixture rows was used for teardown. Source under test was `5b303a1ac15148dfcffc85b5b96d87383adfb3ae`; application code remained unchanged. The same 25,000-write forecast guard and remote-apply freeze remain in place. These tests complete the requested exact publisher variants without requiring a full-scale remote clone.

## Real Workers Cache API proof

The Worker imported the repository's unchanged `withPublicDataCache` implementation and actual suggestion handler. Bulk/search/private test responders used a tiny comparison SELECT, so this isolates caching and key behavior; it does not claim to measure production endpoint payload cost. D1 was served by APAC/KIX and every test request reached SIN. Cache API is per data center; this does not prove global hit ratios.

| Request                                        | D1 calls / reads / writes | Cache result                            |
| ---------------------------------------------- | ------------------------- | --------------------------------------- |
| Cold bulk request                              | 3 / 6 / 0                 | MISS; includes two manifest reads       |
| Immediate bulk repeat                          | 0 / 0 / 0                 | HIT, avoiding even version lookup       |
| Reordered equivalent search parameters         | 0 / 0 / 0                 | HIT                                     |
| Changed town search parameter                  | 3 / 6 / 0                 | MISS                                    |
| Cold suggestion query                          | 6 / 9 / 0                 | MISS; actual dictionary build           |
| Same suggestion query with different case      | 0 / 0 / 0                 | HIT                                     |
| New suggestion query with dictionary available | 2 / 2 / 0                 | MISS; only before/after manifest reads  |
| Request spanning manifest version change       | 5 / 8 / 1                 | MISS; not stored under stale version    |
| Repeat under new stable version                | 4 / 7 / 0                 | MISS, then next repeat HIT with zero D1 |
| Existing bulk route after version change       | 3 / 6 / 0                 | MISS, then zero-D1 HIT                  |
| Natural pointer expiration after 61 seconds    | 1 / 1 / 0                 | HIT-AFTER-VERSION-READ                  |
| Repeat after pointer renewal                   | 0 / 0 / 0                 | HIT                                     |

Private shortlist, POST comparable and Cookie-bearing requests bypassed the cache and executed their handler again. Repeated 500 responses were never cached. Town/street/block/MRT suggestion output was exercised using the actual dictionary implementation; postal, IME and complete ranking semantics remain covered by the existing tests. Production-scale query plans remain those recorded in the earlier read-only report; no speculative index was added.

## Guard, storage and read-headroom decision

**Keep the 25,000 forecast-write guard unchanged.** Seven-index inserts billed exactly the planner's eight-write factor. Indexed updates billed less than its conservative allowance. The compact exact-schema tests establish the tested SQL/index costs; the October 4 continuation exercises the requested exact generated SQL variants. It does not establish current live account traffic. Larger remote fixture cardinality is not imposed as an acceptance gate. The faithful local rehearsal still forecasts 19,722 writes for a monthly rollover, 9,701 for context-only refresh, and 29,421 for the combined case; the combined case remains deliberately rejected before publication. The combined case is a demonstrated local guard rejection, not evidence that D1 would exceed its 100,000-write daily ceiling. A change to support that case would require a specific guard/policy decision; this documentation correction does not change it.

The production database remains the previously measured 460,922,880 bytes. Free storage limits are **500 MB per database and 5 GB per account**, as recorded in the [official limits](https://developers.cloudflare.com/d1/platform/limits/). Using conservative decimal units, production headroom is **39,077,120 bytes** against 500,000,000 bytes. The other two existing databases separately used 237,568 and 53,248 bytes; they do not consume production's per-database allowance. The three existing databases totaled 461,213,696 bytes, leaving **4,538,786,304 bytes of account headroom** against 5,000,000,000 bytes. The temporary database's final metadata reported 184,320 bytes, bringing the observed aggregate during testing to 461,398,016 bytes; it was then deleted. These calculations assume MB/GB mean decimal bytes; using binary units would give larger headroom. Production's per-database cap is the relevant storage constraint here, not the account aggregate cap. `dbstat` was unsupported and was not retried. Production `page_count` was already known to be denied and was not repeated.

Within the fixture's +134 statement, `meta.size_after` rose from 155,648 to 167,936 bytes (12,288 bytes, about 91.7 bytes/added transaction). This reflects page allocation and available space in a tiny newly created database; it is **not a production marginal-growth estimate**. Unchanged padding was not persisted. Historical production byte/row averages also include generated JSON, indexes and free pages. No defensible storage runway follows from these two points alone.

For sensitivity only, **39,077,120 bytes of production per-database headroom** divided by hypothetical total marginal growth of 100/500/1,000 bytes per added transaction gives about **390,771/78,154/39,077 transactions**, or **2,916/583/292 days** at 134 additions/day. These are scenarios, not measured forecasts; generated monthly JSON growth, free-space reuse and changing upstream volume can materially alter them. Other databases affect the separate 5 GB account cap, not these production-only sensitivities. Sustainable storage remains an explicit blocker.

Local review of the prior production inspection/reconciliation receipts and historical report found exact corpus counts, whole-database `size_after` and schema, but no retained production JSON payload-size totals or database image. The native synthetic rehearsal database was removed by its cleanup. Thus there is no existing local production payload from which to compute table-level physical storage.

The source model confirms that `block_details.summary` repeats `BlockSummary` fields while adding IQR/per-square-foot fields, and `recentTransactions` repeats source facts with presentation/derived fields. `comparisons` stores town/type, amenity metrics, percentile ranks and a generation timestamp, not a second full transaction corpus. Potential JSON overlap is real, but its byte cost and removable physical space remain unmeasured; no API contract or representation was changed.

For a future separately budgeted read, the proposed aggregate is:

```sql
SELECT 'block_details' AS source,
       SUM(length(CAST(json AS BLOB))) AS payload_bytes,
       SUM(length(CAST(json_extract(json, '$.summary') AS BLOB))) AS canonical_summary_bytes
FROM block_details
UNION ALL
SELECT 'comparisons', SUM(length(CAST(json AS BLOB))), NULL
FROM comparisons;
```

At the recorded table counts it would visit about 19,460 rows, returning two rows; actual billable reads still require response metadata. That forecast exceeds the continuation's 10,000-read budget, so **it was not executed**. Canonical extracted summary bytes would describe overlap, not exact on-disk savings or free-page reuse. Denied `dbstat`/`page_count` were not retried. This is a proposed measurement, not a demand for new access or a storage reduction proposal.

The reused baseline reconciliation measured 1,281,644 reads including its documented instrumentation interruption/continuation. Against a hypothetical empty 5M-read day, one such run leaves 3,718,356 reads; three leave 1,155,068; four exceed the ceiling by 126,576 before any runtime traffic. A bulk blocks-plus-trends bootstrap returns 54,556 rows at the actual corpus size, but no new remote bulk scan was made and rows returned are not necessarily rows billed. Real cache HITs avoid D1; cold/version discovery, misses in different colos, distinct filtered queries and dictionary rebuilds still cost reads. Sampled production history does not provide exact request frequencies or global hit ratios. Daily upstream metadata checks and expensive reconciliation only on publication change remain the proposed cadence, without activating it.

## Remaining acceptance gates and validation

The bounded tests resolve the REST `{batch:[...]}` contract, small and large late-failure atomicity, compact response-abort reconciliation, tested index factors and real local-colo cache behavior.

The October 4 continuation resolves the requested exact publisher SQL variants, final-manifest failure boundary and body-abort reconciliation within the existing authorization. No production-scale clone or additional future permission is required for those completed checks. Remaining limits are:

- The 17.43 MB padding trials prove HTTP transport, JSON parameter parsing and large-body rollback. Most padded rows had absent keys, so they do not measure actual multi-row derived persistence, JSON rewrite cost or row-count-dependent execution. Monthly/context correctness and the combined guard rejection remain covered by the local rehearsal, with local metadata explicitly distinguished from real remote receipts.
- Current official upstream source retrieval and source-version availability. No data.gov/ACRA request, denial bypass, header spoofing or authentication change was made in this phase.
- Measured production storage growth/runway and account-wide concurrent read/write demand.

Plan identity UNKNOWN is recorded for transparency and is not a blocker under the user's conservative Free-tier test authorization. No additional remote action is requested by this correction.

Remote apply stays disabled and no refresh workflow was restored. Restoring a schedule requires review of the demonstrated combined-refresh guard policy and remaining sustainability limits, a concrete implementation/evidence review and explicit follow-up authorization. A production-scale remote copy or mutation test is not a mandatory gate. There is no claim of full D1 Free sustainability from these experiments.

Application code was unchanged from the previously validated implementation: 186 unit-test files / 1,827 tests and 77 E2E tests passed; typecheck, build and boundaries passed, with two pre-existing lint warnings. This evidence-only update reran all 186 unit-test files / 1,827 tests successfully (17.44 seconds). Repository format check, typecheck and production build passed again, including import boundaries and bundle limits (108,460 bytes gzip). No new E2E run was needed for this evidence-only update.

Read-only CI plan: use the current `vp install` / `vp run check` gates, with `vp run check:pr` when a PR is later authorized. The existing `vp run rehearse:d1-free` provides a faithful local SQLite rehearsal and must retain its explicit local-metadata provenance. No Cloudflare apply command, remote migration, schedule, data refresh or app deployment is added to CI. Authenticated current-source preflight remains a separately reviewed manual operation; these tests do not grant production write authorization.
