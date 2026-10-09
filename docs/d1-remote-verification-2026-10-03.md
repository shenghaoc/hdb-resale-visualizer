# Authenticated bounded D1 verification — 2026-10-03 UTC

The subsequent [isolated remote verification](d1-isolated-verification-2026-10-03.md) resolves the temporary batch/cache protocol tests and records successful resource cleanup. This document preserves the earlier read-only stage and its then-current blockers.

**Verdict at this read-only stage: NOT SAFE.** The existing OAuth login works, but Free-plan identity and the required isolated mutation/cache proofs remain unverified. No production mutation, migration, deployment, push, PR, merge, refresh workflow restoration or schedule change occurred. No database/Worker was created, so there are no new remote resources requiring cleanup.

Started from clean `feat/d1-free-incremental-refresh` at `66da7621329de458324e5d433245eafa6158dcf5`. No application fix was needed. [Exact sanitized HTTP/analytics evidence](evidence/d1-remote-readonly-2026-10-03.json) contains metadata, schema and counts, without tokens, raw transaction rows, shortlist contents or private cache values.

## Authentication and account gate

Existing `wrangler whoami` succeeded. No new credentials/scopes were requested. Account/user subscription endpoints returned HTTP403 Authentication error with the existing OAuth. Workers account settings returned `default_usage_model: standard`; account entitlements returned an empty list. Neither proves Free-plan status. Therefore the explicitly authorized temporary database/Worker was **not created**. The next unblock is authoritative Free-plan confirmation through the existing dashboard/access, not a token pasted into chat or an automatic permission expansion.

Account D1 analytics queried calendar UTC dates, not a rolling 24-hour window. At 23:20:17 on October 3, reported account activity was 52,379 reads, zero writes, 65 read queries; only the production database had activity. September 27–October 2 reported daily reads 2, 2, 2, 2, 2, 3 respectively, all zero writes. No other database activity was returned in that window; this does not reserve quota against future/concurrent consumers.

The final 23:35:56 snapshot reports 2,292,365 reads, zero writes and 477 read queries for October 3, with `sampleInterval: 1`. It **lags** the completed per-request ledger. Successful verification requests measured 2,351,599 reads; adding the pre-inspection baseline gives 2,403,978 accounted reads and at most 2,596,022 nominal remaining against the assumed 5M Free ceiling. This is not guaranteed live headroom or proof of the account plan. Validation failures lack per-statement billing metadata and remain explicitly unknown. No verification crossed the UTC midnight reset.

Storage metadata lists three existing databases: production `hdb-resale-visualizer` (`df06858c-8fd3-4cf5-9080-dbd9a9f49250`) 460,922,880 bytes; `rowplay` 237,568 bytes; `ee4802-g20-tool-db` 53,248 bytes. Total observed storage is 461,213,696 bytes. The latter databases were not treated as authorized disposable baselines or queried for content. Production is D1 v3, APAC, read replication disabled. Capacity allowance/headroom remains conditional on unverified plan identity.

## Production inspection and plans

| Table                 | Exact COUNT result |
| --------------------- | -----------------: |
| transactions          |            985,533 |
| blocks                |              9,730 |
| block_details         |              9,730 |
| comparisons           |              9,730 |
| town_flat_type_trends |             44,826 |
| geocode_cache         |             10,333 |
| walking_time_cache    |                  0 |

The manifest remains schema 2.0.0, generated `2026-08-29T01:37:16.797Z`, updated `2026-08-29T01:37:24.151Z`, source timestamp `2026-08-29T02:10:36+08:00`, data window January 1990–August 2026. It has no `syncBuildState`. Eleven applied migrations match HEAD. Local compilation of HEAD migrations compared all 24 application table/index SQL definitions with production: zero mismatches or unexpected definitions. Integer transaction rowids and all seven transaction indexes remain intact; no schema/index changes were made.

Successful inspection statements billed 1,069,955 reads and zero writes. COUNT transactions alone billed exactly 985,533 reads, demonstrating that one returned count row is not one billed read. `PRAGMA page_count` was rejected (HTTP400, SQLITE_AUTH) with no statement metadata; it was not retried and page_size was not attempted. Storage uses supported database metadata instead.

Nine production EXPLAIN requests billed zero reads/writes. Snapshot uses integer-PK seek; bulk blocks scan `idx_blocks_sort`; trends scan their composite PK; town search seeks `idx_blocks_town` then sorts; unfiltered/type-budget searches scan the address-key index, with correlated `json_each` for selected type. Cohort readiness scans blocks. Suggest dictionary seeks address-key ranges. Comparable queries seek `idx_tx_block_flat_month`. No extra index is justified by these observations alone.

Seven-day query analytics are sampled (`sampleInterval` 2–7.23 in the final public-query groups) and include verification queries. Reported town-route SELECT count 21/read total 8,875 and manifest SELECT count 21/read total 21 are **sampled analytics**, not exact traffic frequencies. Bulk/search/suggest endpoint request frequencies and cache hit rates cannot be inferred from absent sampled groups.

## Exact remote measurements and unfinished tests

| Scenario                                                                       | Exact rows read | Exact rows written | SQL duration ms | HTTP/body/atomicity evidence                                                         |
| ------------------------------------------------------------------------------ | --------------: | -----------------: | --------------: | ------------------------------------------------------------------------------------ |
| Tiny read-only `{batch}` envelope, two SELECT parameters                       |               0 |                  0 |          0.1298 | HTTP200; two complete metadata results; 415ms end-to-end; mutation atomicity unknown |
| Tiny isolated publication                                                      |         UNKNOWN |            UNKNOWN |         UNKNOWN | Not run: Free-plan gate unverified                                                   |
| +134 publication                                                               |         UNKNOWN |            UNKNOWN |         UNKNOWN | 8-statement / 355,617-byte local body; remote isolated trial not run                 |
| Month/window publication                                                       |         UNKNOWN |            UNKNOWN |         UNKNOWN | 31-statement / 17,428,380-byte local body; remote isolated trial not run             |
| Context publication                                                            |         UNKNOWN |            UNKNOWN |         UNKNOWN | Remote isolated trial not run                                                        |
| Combined context/window                                                        |         UNKNOWN |            UNKNOWN |         UNKNOWN | Remains blocked by 29,421 forecast against 25,000 guard                              |
| Real-corpus baseline no-change reconciliation, including verification recovery |       1,281,644 |                  0 |      11,651.398 | 506 successful single-statement requests; manifest stable; no publication            |
| Current upstream changed-source reconciliation                                 |         UNKNOWN |            UNKNOWN |         UNKNOWN | No source download or real changed-source publication performed                      |

The committed `{batch: [...]}` REST shape is now proven accepted for two read-only SELECTs. Top-level arrays are rejected HTTP400; a multi-SQL read-only string returns two results. These findings establish protocol shape only. No valid-write/middle-failure/rollback, ambiguous abort/retry or large-body proof was performed on production, and none was performed on an isolated target because the Free-plan gate remained unresolved. No missing metadata is represented as zero.

The baseline measurement uses the committed transaction snapshot, artifact hydration and changed-only planner. Its first 351 successful requests billed 1,133,570 reads/zero writes/9,824.6517ms SQL before an overly broad verification guard stopped the index-schema query locally, before HTTP. A corrected continuation fetched only public artifacts and indexes, avoiding another million-row transaction scan; its 155 requests added 148,074 reads/zero writes/1,826.7463ms SQL. Combined reads stayed below the original 1.3M guard. This measured no-change comparison of the real production baseline with itself, not current-source reconciliation. It proposed zero transaction/generated mutations; manifest-only forecast was one write. The original pass took approximately 188 seconds and the continuation 99,660ms; these are remote/network observations, separate from summed SQL duration.

Forecast calibration remains unavailable: local index-aware forecasts +134=1,434, month=19,722, context=9,701, combined=29,421 are not actual D1 write costs. The 25,000-write guard was not raised. Successful read metadata was complete, but index maintenance under INSERT/UPDATE/REPLACE still requires safely isolated writes.

No isolated Worker was deployed. CacheAPI MISS/HIT zero-D1, pointer expiry, version/query isolation, private/error/POST exclusions and version-race behavior retain local tests only. Datacenter-local cache proof, request statistics and cold-miss billing remain unknown.

## Next bounded milestone

Confirm the account is Free without changing plan or permissions. Then assess comfortable live/day quota with analytics lag and all known receipts before creating a named isolated database. Start with minimal exact-schema protocol fixtures; record every created resource ID. Do not seed one million indexed rows in a day. Verify mutation atomicity/abort recovery and representative small/large bodies before calibration; stop if aggregate budget lacks reserve. Current production access remains read-only. Remote apply guard and removed refresh workflow remain unchanged even if later evidence improves the verdict.
