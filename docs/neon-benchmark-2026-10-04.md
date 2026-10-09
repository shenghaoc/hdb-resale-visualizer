# Neon setup, full-corpus benchmark and transfer investigation

> **Provenance.** Links to files that are not part of this branch point at commit [b80446400](https://github.com/shenghaoc/hdb-resale-visualizer/tree/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6) of the recovery snapshot (branch `feat/neon-refresh-publisher`), which preserves provenance; generated evidence that was never recovered (`docs/evidence/*`) appears as plain paths.

**Verdict: NEON FREE IS MARGINAL.** Storage and PostgreSQL behavior are promising. The unchanged refresh policy is not certified for Neon Free: a realistic daily source-hint trigger could consume about 15.3 GB/month, against the hard 5 GB public-transfer allowance. Weekly-only reconciliation can fit with moderate traffic, but requires a measured runtime budget. No application cutover or reconciliation redesign has been implemented.

All timestamps below are UTC on October 4, 2026. Sanitized receipts and configuration (`docs/evidence/neon-benchmark-2026-10-04.json`) preserve the measurements. Existing [D1 evidence](d1-isolated-verification-2026-10-03.md) and implementation remain intact.

## Checkout and scope

Before work: branch `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`, clean status. HEAD and branch remain unchanged. No commit, push, PR, merge, production application deployment, D1 production write, production migration, Worker secret change, runtime backend replacement or schedule restoration occurred. Only the explicitly approved Neon configuration operation and isolated benchmark resources were used.

## Requested setup

Executed `npm i -g neon@latest`, authenticated `neon login`, `neon skills -y`, `neon mcp -y`, explicit project/production link, `neon config init`, and `neon deploy`. CLI: **8.0.4**. Generated changes were inspected before editing.

- Project: `wispy-mouse-67963002`, `hdb-resale-visualizer`, AWS Singapore, PostgreSQL 18. Authenticated project API identifies **Free v3**.
- Repository linkage remains **production**, branch `br-broad-credit-b3bz9b61`. Benchmark commands use a separate explicitly checked endpoint.
- `neon.ts` contains the requested `defineConfig` / `preview.buckets.uploads.access = "private"` configuration. Deployment succeeded with **no changes required**: the private `uploads` bucket already existed. Singapore storage availability was verified; no region change or additional project was created. The older skill's region restriction was stale.
- No Auth, Data API, Functions or AI Gateway was enabled. This was configuration provisioning, not application deployment.
- `.neon` and `.env.local` are ignored. Pulled environment names were `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, and four AWS storage variables. Their values are absent from tracked files and receipts.
- Agent skills and `skills-lock.json` are local and ignored. The requested MCP command changed **12 personal/global agent configurations**, including the user's Codex configuration; it did not modify `.kiro/settings/mcp.json`. It created account-wide MCP key ID `3392749`, name `neon-cli-mcp-20261004T010005Z-f057`. No key value is recorded here. This persistent personal setup remains installed.

## Isolation and cleanup

Benchmark branch **`benchmark-d1-migration`**, ID **`br-wispy-boat-b34glczl`**, parent `br-broad-credit-b3bz9b61`, created 01:05:20. It is neither primary nor default. Endpoint `ep-steep-moon-b35xjj4d` is direct/unpooled, Singapore, 0.25–1 CU, with Free scale-to-zero defaults. Explicit suspend-interval customization was rejected by Free; the retry used supported defaults.

The branch, imported corpus and SQL-created role **`hdb_benchmark_runtime`** are preserved. This role has no superuser, database-creation, role-creation or `neon_superuser` membership. Its final grants are **SELECT only** on transactions, blocks, details, comparisons, trends, manifest and MRT. All shortlist privileges were revoked following the user's cleanup instruction. The schema's shortlist table remains empty; no private production shortlist records were exported or imported. Migration/ingestion benchmark connections used the separate existing owner role directly, never Hyperdrive.

Temporary Worker `hdb-neon-benchmark-20261004` and Hyperdrive ID `5ba4c0ada7474a5d81a3f057dad16b77` were both deleted with HTTP 200 at **01:49:55**, after saving sanitized configuration and measurements. The connector deletion failed with a resource-access error; the approved cleanup succeeded using existing Wrangler OAuth. No new OAuth scopes were added. Ignored local connection/authentication scratch files remain private for branch investigation.

## Corpus and schema fidelity

No retained complete production snapshot existed, and the available official CSV covered only the active dataset. A bounded **read-only public-corpus D1 export** was therefore performed, not a repeat reconciliation. It used 259 requests during 01:05:53–01:08:32: **1,069,948 rows read, zero rows written, 9,236.8855 ms SQL**, 479,224,044 HTTP response bytes. The manifest matched before/after. No more production scans were performed.

| Table                 |  Imported rows |
| --------------------- | -------------: |
| transactions          |        985,533 |
| blocks                |          9,730 |
| block_details         |          9,730 |
| comparisons           |          9,730 |
| town_flat_type_trends |         44,826 |
| geocode_cache         |         10,333 |
| walking_time_cache    |              0 |
| mrt_geojson           |              2 |
| manifest              |              1 |
| shortlists            | 0; schema only |

Plain SQL and `pg-copy-streams` loaded **310,293,777 CSV input bytes** through COPY. Transaction COPY took 14.817 s, details 5.129 s; ANALYZE took 1.300 s. No million individual INSERT requests were issued.

The initial integer price prototype failed COPY on `793888.88` and rolled back that COPY. Inspection established **160 legitimate fractional prices** in SQLite's INTEGER-affinity column. The final schema uses double precision and preserves existing JavaScript Number semantics instead of rounding. All 160 remain present.

The PostgreSQL design retains integer identity, multiplicity, JSON semantics, manifest-last transactions, staged cache UPSERT forms and field-level detail patches. Source facts are deliberately **not unique**. JSON documents use JSONB; timestamp metadata uses timestamptz; trends have a composite primary key. No ORM was introduced. Three transaction compound indexes match the actual block/street/town comparable paths. Identity keyset reads use the primary key. Blocks retain town and summary-sort indexes. Speculative standalone SQLite indexes and unused suggestion-prefix indexes were omitted.

After publication, ordered hashes of **every logical column** across all nine public tables matched the authoritative local planner snapshot. JSONB formatting was canonicalized; separately changed `updated_at` metadata was excluded. These are empirical digest checks, not a collision-proof replacement for exact reconciliation. The current benchmark has synthetic preparation/publication artifacts; the storage baseline below was measured **before** those preparations on the faithful import. Both original `source.sqlite` and final local planner snapshot are retained privately.

## Storage

At 01:10:41, `pg_database_size(current_database())` was **370,032,640 bytes**, versus D1's **460,922,880 bytes**. The difference includes PostgreSQL JSONB/TOAST behavior and a deliberately smaller justified index set; database bytes do not map one-to-one between engines.

| Object                          | Heap incl. auxiliary forks | Main indexes | TOAST incl. its indexes |     Total bytes |
| ------------------------------- | -------------------------: | -----------: | ----------------------: | --------------: |
| transactions                    |                158,990,336 |  129,368,064 |                   8,192 |     288,366,592 |
| block_details                   |                  1,368,064 |      655,360 |              36,446,208 |      38,469,632 |
| comparisons                     |                 13,361,152 |      655,360 |                   8,192 |      14,024,704 |
| blocks                          |                 11,558,912 |    1,089,536 |                   8,192 |      12,656,640 |
| trends                          |                  3,809,280 |    2,138,112 |                   8,192 |       5,955,584 |
| geocode cache                   |                  1,548,288 |      712,704 |                   8,192 |       2,269,184 |
| MRT                             |                      8,192 |       16,384 |                  90,112 |         114,688 |
| manifest                        |                      8,192 |       16,384 |                   8,192 |          32,768 |
| shortlist schema                |                          0 |       16,384 |                   8,192 |          24,576 |
| routing schema                  |                          0 |        8,192 |                   8,192 |          16,384 |
| Application relations total     |                            |              |                         |     361,930,752 |
| Catalog/other database overhead |                            |              |                         |       8,101,888 |
| **DATABASE TOTAL**              |                            |              |                         | **370,032,640** |

Largest indexes: block/flat/month **63,717,376 B**; street/flat/month **31,678,464 B**; transaction PK **22,159,360 B**; town/flat/month **11,812,864 B**; trend PK **2,138,112 B**. Receipts list every index.

The project API exposes an exact **1,073,741,824-byte** limit. The imported database consumed **34.462%**, leaving 703,709,184 B against that limit. After preparatory rebuilds/rollback churn, database size was 416,866,304 B; project API synthetic storage was 440,885,248 B, about **41.06%**, leaving roughly **633 MB** at project level. Branches share project storage through copy-on-write; each branch is not a fresh 1 GiB allowance. These different measurements are not interchangeable billing meters.

Observed corpus footprint is 292.60 B/transaction for the transaction relation plus indexes, or 375.46 B/transaction for the whole database. Roughly 633 MB is about **1.69 million whole-corpus row equivalents** at the latter ratio. It is not a measured future marginal-growth rate. Preparatory churn allocated another 409,600 B during the failed/successful delta tests; that includes MVCC/dead tuples and artifact rewrites and must not be extrapolated as steady growth.

The retained corpus contains **24,457 registrations in September 2025–August 2026**, about 67/day. For sensitivity, 500/1,000/3,000 total new bytes per additional transaction would give roughly 1.27 million/633,000/211,000 transactions of runway, or 52/26/9 years at that historical annual rate. Maintenance, artifact growth, corrections and changing volume remain uncertain. Storage has comfortable practical headroom; no storage contortion or production VACUUM/index rebuild is proposed.

## Query baseline

EXPLAIN (ANALYZE, BUFFERS) ran three times per query after ANALYZE. These are first measured executions versus warm repeats, **not cold-buffer claims**. No speculative index was added after measurement.

| Path                       |   Rows | First SQL ms | Third SQL ms | Third shared hit/read blocks | Access                 |
| -------------------------- | -----: | -----------: | -----------: | ---------------------------- | ---------------------- |
| Full summaries             |  9,730 |        4.163 |        3.878 | 1,537 / 0                    | summary-sort index     |
| Town blocks                |    294 |        0.636 |        0.585 | 233 / 0                      | town bitmap + sort     |
| All trends                 | 44,826 |       14.492 |       11.268 | 710 / 0                      | composite PK           |
| Town search                |    294 |        0.653 |        0.640 | 233 / 0                      | town bitmap + sort     |
| Flat type + budget         |  2,001 |       22.666 |       16.597 | 1,408 / 0                    | sequential scan + sort |
| Suggestion dictionary page |  5,000 |        9.237 |        8.775 | 1,408 / 0                    | sequential scan + sort |
| Same block/type            |      2 |        0.048 |        0.056 | 4 / 0                        | compound index         |
| Same street/type           |      2 |        0.062 |        0.051 | 4 / 0                        | compound index         |
| Same town/type             |    150 |        0.603 |        0.168 | 136 / 0                      | compound index         |
| Town/type count            |      1 |        0.418 |        0.305 | 38 / 0                       | bitmap scan            |
| Detail                     |      1 |        0.051 |        0.051 | 3 / 0                        | PK                     |
| Comparison                 |      1 |        0.036 |        0.104 | 3 / 0                        | PK                     |
| Manifest                   |      1 |        0.032 |        0.037 | 1 / 0                        | tiny sequential scan   |
| Reconciliation page        |  5,000 |        3.100 |        1.715 | 120 / 0                      | identity PK            |

Receipts preserve actual SQL, parameters, full plans and buffer activity. The budget-search prototype used an integer JSON-price cast; a future runtime port must use the preserved numeric semantics at budget boundaries. This query is a latency baseline, not final API-parity certification.

## Reconciliation and publication

Stored baseline versus itself: **219 data queries**, **14,905.483 ms wall**, **7,355.927 ms summed SQL** from isolated database/role pg_stat_statements deltas, and **2,146.774 ms local exact-tuple planning**. The planner found zero inserts/updates. Control/statistics queries are additional. `stream.bytesRead` increased **493,707,924 bytes**; materialized result JSON totaled **608,742,991 bytes**. Neither number is a finalized Neon billing reading. No subsequent million-row remote reconciliation was performed.

The +134 test withheld 134 original facts across four populated blocks, prepared a coherent baseline with fixed tiny amenity context, then published 134 synthetic facts through the existing reconciliation/artifact compiler and a narrow PostgreSQL adapter. It preserved the full historical cardinality: **985,399 → 985,533**. Real geocodes/MRT remained. This is a representative full-scale publication, not the earlier four-trend/341-comparison fixture verbatim.

| Publication measure                | Result                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Inserts                            | 134 transactions                                                        |
| Updates                            | 4 blocks, 4 detail patches, 176 comparisons, 1 trend, 1 final manifest  |
| SQL publication statements         | 7 incl. manifest lock/guard and final manifest; BEGIN/COMMIT additional |
| Instrumented round trips           | 11 incl. transaction and statistics controls                            |
| SQL ms                             | 13.5193                                                                 |
| Wall ms                            | 123.0853                                                                |
| Outgoing client stream bytes       | 243,977                                                                 |
| Controlled failure before manifest | Complete rollback; 985,399 transactions and prior manifest retained     |
| Reconciled retry                   | 0 transaction inserts, 0 updates, 0 derived statements                  |
| Staged cache changes in this delta | 0; cache UPSERT translation has focused coverage                        |

The manifest was locked and verified before mutation and updated last inside one transaction. D1's index-write forecast for this particular planner output was 1,266, not a PostgreSQL billing unit. Original D1 1,434/19,722/29,421 forecasts and the 25,000 guard remain unchanged.

## Worker, Hyperdrive and actual cache

The temporary token-gated Worker ran in **SIN**, with `nodejs_compat`, `pg` **8.23.1** (above documented 8.16.3 minimum), a direct/unpooled Neon origin and SQL-created runtime role. Hyperdrive **caching.disabled=true** was verified through the API. The actual unchanged `worker/public-data-cache.ts` was imported. Frontend and production Worker code/configuration were untouched.

The preferred future shape is Worker → versioned Cache API → miss only → Hyperdrive + pg → Neon, following [Neon's guide](https://neon.com/docs/guides/cloudflare-workers) and [Cloudflare's integration guide](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/). The HTTP serverless driver remains a measured fallback. Bulk COPY, reconciliation and publication stay on direct ingestion connections.

| Measurement                                                  |   HTTP driver |                Hyperdrive + pg |
| ------------------------------------------------------------ | ------------: | -----------------------------: |
| First manifest after API-confirmed idle compute: client wall |      961.5 ms |                       912.4 ms |
| Same first request: Worker database-await time               |        637 ms | 637 ms incl. 3 ms edge connect |
| Five warm manifest requests: median client wall              |       89.7 ms |                        83.9 ms |
| Five warm manifest requests: median database-await           |         30 ms |            13 ms incl. connect |
| Five comparable reads: median client wall                    |       63.6 ms |                        93.8 ms |
| Five comparable reads: median database-await                 |         18 ms |            45 ms incl. connect |
| Three-query cold response: client wall / DB await            | 125.7 / 60 ms |                  103.8 / 23 ms |

Hyperdrive edge connection setup measured 2–3 ms. These small sequential samples show practical connectivity and mixed latency results, not a blanket speedup. Worker startup was 19 ms. The database-await measure includes network/driver time and is distinct from server SQL execution. At 01:42:21 the endpoint was naturally idle, over six minutes after the last request, while Hyperdrive remained configured: idle origin pooling did not keep this compute awake in the observed interval. The remote Worker used representative 150-row/manifest payloads; full bulk-endpoint Worker CPU/memory and complete API-port parity remain unmeasured.

| Cache scenario                             |              Database calls | Result                                                       |
| ------------------------------------------ | --------------------------: | ------------------------------------------------------------ |
| Cold public GET                            |                           3 | manifest before + payload + manifest after; MISS             |
| Identical warm GET                         |                           0 | HIT; no Hyperdrive connection/query                          |
| Reordered equivalent query                 |                           0 | same HIT/body hash                                           |
| Different semantic query                   |                           3 | separate MISS                                                |
| Actual pointer expiry                      |                           1 | HIT-AFTER-VERSION-READ; response retained                    |
| Version change                             |                    3 then 0 | new MISS then HIT                                            |
| Change during response                     | 4 incl. deliberate pg_sleep | raced response not shared-cached; next request MISS then HIT |
| Repeated error                             |                      3 each | 503 never shared-cached                                      |
| Synthetic private shortlist-style response |                      1 each | bypass; no private records accessed                          |
| Comparable POST                            |                      1 each | bypass                                                       |

The harness emitted 55 SQL calls across both drivers; 41 used Hyperdrive. This is instrumentation, not a statement-level billing guarantee. Conservatively count all emitted SQL, including controls, against the **100,000/day** Free Hyperdrive allowance, reset **00:00 UTC**, including Hyperdrive query-cache hits. Account-wide aggregation is a safety assumption where scope is unspecified. Only the temporary configuration appeared in the account inventory. Cache API contents remain per-POP; one warm SIN cache is not a global hit-rate claim. Local `wrangler dev`'s ignored `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` bypasses real Hyperdrive and supplies no pooling evidence.

## Transfer investigation: why 494 MB

This analysis uses the retained original snapshot and existing receipts. It does not change reconciliation or perform another remote corpus scan. A local model of PostgreSQL text DataRow framing and canonical JSONB output reproduces **493,626,291 B**, leaving only **81,633 B (0.0165%)** for per-query/control/other framing against the measured stream total. Per-table wire numbers below are reconstructed estimates; JSON sizes and query counts are directly instrumented.

| Result group  | Queries / passes | Measured materialized JSON B | Modeled DataRow B |
| ------------- | ---------------- | ---------------------------: | ----------------: |
| Transactions  | 198 / 1          |                  280,986,965 |       155,824,076 |
| Block details | 4 / 2            |                  268,858,150 |       290,931,600 |
| Blocks        | 4 / 2            |                   24,538,692 |        18,159,338 |
| Comparisons   | 4 / 2            |                   19,391,274 |        20,461,570 |
| Trends        | 2 / 2            |                   12,229,682 |         6,133,344 |
| Geocode cache | 3 / 1            |                    2,350,422 |         1,698,700 |
| MRT           | 2 / 2            |                      386,122 |           415,892 |
| Manifest      | 1 / 1            |                        1,682 |             1,771 |
| Routing       | 1 / 1            |                            2 |                 0 |

Transactions account for **31.6%**; twice-read details **58.9%**. The detail source documents contain 12,209,104 B of summaries, **66,819,939 B of monthly trends (745,018 entries)** and **54,376,769 B of recent transactions (191,298 entries)** before JSONB wire expansion.

`readTransactionSnapshot` downloads all source columns because `planTransactionDelta` performs exact multiset comparison in Node, retains every integer identity and rejects unexplained disappearances. `readPublishedArtifacts` downloads full prior documents for reuse and presentation checks. `planArtifactWrites` independently downloads them again to determine dirty fields, preserve forward fields and reject lost entities. **For blocks, details, comparisons and trends, the second pass mirrors the existing planner's intended normal build/publication path; it is not a post-publication verification scan or recovery-only requirement.** It is an avoidable duplicate in that implementation, rather than a database protocol requirement. The currently frozen remote D1 entry point rejects before publication planning, and no scheduled production refresh is running.

The benchmark did include one extra initial MRT read: the real sync obtains MRT upstream, while only the diff planner reads its stored MRT artifact. That experimental overhead is about **208 KB / one query**. Removing it gives approximately **493.5 MB / 218 data queries**, before manifest/control differences, for the same unoptimized PostgreSQL read pattern. The conservative monthly tables retain the recorded 493.7 MB envelope. The reported 59% detail share therefore comes from the two intended artifact stages, not an extra experimental detail verification. PostgreSQL storage compression does not compress these returned JSONB documents for the PostgreSQL client protocol.

The 2017-onward production partition is **239,330 rows / 37,873,642 modeled transaction bytes**. Four older source partitions contain **746,203 rows / 117,950,434 B**. Their official metadata is old, but this is not proof of immutable content. The full corpus has **983,519 distinct canonical tuples**, **2,014 extra legitimate duplicate occurrences** across 1,986 duplicate groups.

## Hard Free budget and realistic cadence

Authoritative project plan is Free v3. Current [Neon plan documentation](https://neon.com/docs/introduction/plans) specifies 100 CU-hours/project/month, 2 CU maximum, five-minute idle suspension and 5 GB public transfer/project/month. Use **5,000,000,000 B conservatively** for transfer planning. [Public transfer covers outgoing direct and pooled connections](https://neon.com/docs/introduction/network-transfer); COPY ingress is not public egress. Exceeding the allowance can suspend compute.

The account/project usage API still reported zero compute/transfer despite these successful reads; it did reflect storage changes. Thus **actual billed consumption/remaining quota is UNKNOWN**, not zero. Stream counters are planning proxies. This investigation already received roughly **507 MB**, plus smaller queries, and that cannot be treated as unused quota. Monthly models below are steady-state scenarios, not a live October balance.

Current policy is **source hint change OR seven-day expiry**. Daily metadata checks do not necessarily reconcile daily, but the [active official source](https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view) explicitly publishes daily; the [collection](https://data.gov.sg/collections/189/view) shows four historical files last updated about two years ago. At inspection the active file had been updated seven hours earlier. Actual daily row-change frequency is unknown. A daily timestamp refresh can trigger the existing policy even with unchanged rows. Frequent source changes reset the expiry clock; do not add a second weekly full scan on top of every daily reconciliation.

|              Full reconciliations/month | Transfer proxy | Remaining from 5 GB before runtime |
| --------------------------------------: | -------------: | ---------------------------------: |
|                4: seven-day expiry only |       1.975 GB |                           3.025 GB |
|                5: seven-day expiry only |       2.469 GB |                           2.531 GB |
|   8: roughly twice-weekly changed hints |       3.950 GB |                           1.050 GB |
|                                      10 |       4.937 GB |                           0.063 GB |
| 31: realistic daily-hint upper scenario |      15.305 GB |               exceeds by 10.305 GB |

A bounded runtime measurement fetched public blocks **9,080,520 B**, all trends **3,066,881 B**, and dictionary **849,900 B**: **12,997,301 B** for all three bulk result sets **together**, not for each API request or visitor. Each endpoint/version/canonical cache key is independently cached within a POP; dictionary loading may occur only when needed. These are measured client-stream increments on the coherent benchmark, not finalized billable bytes. A cold bootstrap equivalent assumes all three are fetched once. The one-hour response TTL, versions, different POPs, search/detail/private traffic and pointer reads can each add consumption.

With five weekly reconciliations, 50/100/150/200 cold bootstrap equivalents per month give total proxies **3.118 / 3.768 / 4.418 / 5.068 GB**, before other traffic. Reserving **20% of the allowance (1 GB)** leaves room for at most about **117 cold bootstrap equivalents/month**, with fewer once other traffic is counted. This is roughly four cold POP-hours/day, not four visitors/day. A globally busy deployment can exceed this even with excellent warm hits. Runtime request volume and global POP hit ratios are not established.

Compute is a separate constraint: 100 CU-hours supports at most 400 active hours/month at 0.25 CU. Continuous activity for 30 days costs at least **180 CU-hours**. Cached responses make zero DB calls, but the 60-second manifest pointer can keep compute active under steady traffic. Each isolated daily metadata check can also extend activity by the five-minute idle tail. Natural suspension was demonstrated; sustained traffic has not been shown to fit the monthly allowance.

## Candidate reductions — report only

No candidate below is implemented or used for publication acceptance.

1. **Reuse the first artifact snapshot for diffing.** This avoids an independently repeated read and can save about 169 MB/run, but still leaves roughly 325 MB/run. Daily runs would remain about 10 GB/month. The publication lock/version check must still reject concurrent generation changes; a reused snapshot cannot be accepted across a different manifest.
2. **Exact PostgreSQL staging and multiset comparison, plus changed-only artifacts.** COPY canonical upstream facts inward, group by all eleven persisted fields with multiplicities, and compare on the server. Return deltas/affected keys and the minimum stable-ID mapping required by the build. Null-safe comparisons, numeric canonicalization and approved corrections must match the current exact tuple behavior. Preserve every unchanged rowid, deterministic identical-duplicate pairing, refusal of unknown disappearances, old and new correction dependencies, the 1,000-change anomaly guard, forward JSON fields and final-manifest transaction boundary. Bulk traffic becomes ingress. Staging/sort/index/temporary storage and compute must be measured before accepting this design; do not assume temporary storage is quota-free. A full indexed duplicate staging relation could add roughly 288 MB today. Returning deltas alone is insufficient if client artifact generation still requires identity/presentation metadata for all inputs.
3. **Fingerprints as accelerators.** A raw SHA-256 plus 64-bit count for 983,519 distinct tuples is about 39.34 MB before framing; two binary PostgreSQL fields would be about 54.09 MB of DataRows. Text/JSON hex can cost materially more. Digest-only equality introduces collision probability and does not preserve the current exact guarantee. Use hashes to narrow exact server comparison, or require an explicitly accepted probabilistic policy; never use XOR that cancels equal duplicates.
4. **Partition summaries.** Complete month/source key universes, tuple counts, duplicate multiplicity, canonicalization version and generation must be represented. Compare both missing/new partitions and both sides of corrections; moving a fact between months cannot disappear from checks. Historical metadata can guide work but is not an immutable-content guarantee. Exact server-side audit remains required for silently changed metadata. Partitioning only transaction reads saves at most the old 118 MB here; it leaves roughly 376 MB/run because detail transfer dominates.

The detail path also needs a distinct plan: preserve the global key inventory cheaply, fetch old documents/fields only where needed, and compare candidate JSONB/patch fields server-side. `detailLeasePresentationMatches` checks persisted recent-transaction presentation against incoming facts even for otherwise untouched blocks, so affected transaction keys alone are insufficient. Context/window/excluded-source invalidation must still cover all required rows. Global block/trend dependencies and forward-field preservation cannot be dropped to hit a byte target.

For a daily-hint workload, a sensible experimental target is **at most 50 MB outbound per complete exact reconciliation including artifacts**: 31 runs would be about 1.55 GB, leaving 3.45 GB before traffic and reserve. This is a proposed acceptance target, not a measured result. The smallest next experiment is isolated server-side exact staging/comparison plus a bounded identity/artifact result, validated against the existing Node planner on unchanged, insertion, duplicate, approved correction, disappearance and month/context cases. Measure total proxy/billed egress, compute/idle tail and peak logical/staging size. **Report and obtain direction before implementing this architectural change.**

## D1 versus Neon

| Dimension                | D1 Free                                                                         | Neon Free                                                                             |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Storage allowance        | 500 MB/database                                                                 | API limit 1 GiB; project/branch copy-on-write allowance                               |
| Actual faithful database | 460,922,880 B                                                                   | 370,032,640 B                                                                         |
| Storage headroom         | 39,077,120 B against decimal 500 MB                                             | 703,709,184 B database baseline; about 633 MB project after tests                     |
| Baseline reconciliation  | 1,281,644 billed rows read; existing evidence reused                            | 14.905 s wall, 7.356 s SQL, ~494 MB stream receipt                                    |
| +134 publication         | 1,434 original local forecast; remote compact fixture 1,078 writes/1.997 ms SQL | Full-scale representative 123.1 ms wall/13.52 ms SQL; different derived cardinalities |
| Query behavior           | Existing inspected plans/receipts; no new paired latency benchmark              | Warm server SQL about 0.04–16.6 ms on tested paths                                    |
| Cold compute             | Different D1 architecture                                                       | ~0.9–1.0 s client first request after confirmed suspension                            |
| Shared response cache    | Actual Cache API implemented/proven                                             | Same cache proven; warm hit zero SQL                                                  |
| Incremental publication  | Implemented, guarded, frozen                                                    | Prototype atomic/idempotent; runtime not ported                                       |
| Operational complexity   | Native D1 binding                                                               | External PG, roles, Hyperdrive allowance, compute and egress                          |
| Portability              | SQLite/D1-specific                                                              | Plain PostgreSQL/COPY/transactions                                                    |
| Schedule viability       | Remains disabled                                                                | Not certified with unchanged transfer policy                                          |

These are different fixtures/engines and billing units. Neither the higher storage limit nor PostgreSQL alone establishes superiority.

## Repository impact and validation

Retain as repository configuration: `neon.ts`; `.gitignore`; package/lockfile additions for Neon configuration and benchmark-only pg/COPY/serverless tooling; `scripts/neon-benchmark/` isolated schema, import, measurement, publisher, diagnostics and cleanup scripts; `tests/neon-benchmark.test.ts`; this report and sanitized JSON receipts. Prototype scripts reject the production Neon endpoint and are not wired into refresh or CI application deployment.

Keep local/ignored: `.neon`, `.env.local`, `.neon-benchmark/` connection/secret files and SQLite snapshots, `.claude/skills/`, `skills-lock.json`, and all personal/global MCP configurations. No connection strings, passwords, tokens, private shortlist contents or machine-specific MCP config belong in the repository. No npm/yarn/bun lockfile was introduced.

The repository-prescribed **`node_modules/.bin/vp run check` passed**: format, lint, TypeScript, **1,832 tests in 187 files**, build, architecture boundaries and bundle budget. Five focused publication-adapter tests passed. Two existing type-aware stringification warnings remain in unchanged UI files; no prototype lint errors remain. Final Markdown/evidence formatting is checked before handoff. No UI changes require an E2E deployment.

File classification:

| Files                                                                                          | Classification                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `neon.ts`, `.gitignore`                                                                        | Repository configuration; exact bucket declaration and local-state exclusions                                            |
| `package.json`, `pnpm-lock.yaml`                                                               | Configuration packages `@neon/config`, `@neon/env`; dev-only `pg`, COPY, serverless fallback and their type packages     |
| `schema.sql`, `import.mjs`, `export-d1.mjs` under `scripts/neon-benchmark/`                    | Isolated schema/COPY and the one-shot bounded public source acquisition                                                  |
| `common.mjs`, `translate.ts`, `publication.mts`                                                | Explicit endpoint guard, finite compiler adaptation and manifest-last publication experiment                             |
| `measure.mjs`, `reconcile.mts`, `verify.mjs`, `payload.mjs`, `reconciliation-analysis.mjs`     | Measurement/validation; latter transfer reconstruction is local only                                                     |
| `runtime-role.mjs`, `worker-setup.mjs`, `worker.mts`, `worker-probe.mjs`, `worker-cleanup.mjs` | Isolated access/resource harness; no production configuration wiring; remote setup remains an explicitly approved action |
| `tests/neon-benchmark.test.ts`                                                                 | Five focused compiler-adapter tests                                                                                      |
| This report and `docs/evidence/neon-benchmark-2026-10-04.json`                                 | Sanitized, reproducible evidence                                                                                         |

The global MCP files were `~/.gemini/config/mcp_config.json`, `~/.cline/data/settings/cline_mcp_settings.json`, `~/.claude.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`, `~/.gemini/settings.json`, `~/.copilot/mcp-config.json`, `~/.grok/config.toml`, `~/.config/opencode/opencode.json`, `~/Library/Application Support/Code/User/mcp.json`, `~/.codeium/windsurf/mcp_config.json`, and `~/Library/Application Support/Zed/settings.json`. All are personal machine state outside this repository. Generated skill/account state and scratch files are likewise excluded.

Final `git status --short`:

```text
 M .gitignore
 M package.json
 M pnpm-lock.yaml
?? docs/evidence/neon-benchmark-2026-10-04.json
?? docs/neon-benchmark-2026-10-04.md
?? neon.ts
?? scripts/neon-benchmark/
?? tests/neon-benchmark.test.ts
```

A scan of the 21 candidate configuration/prototype/evidence files found no credential URL, Neon API-key value or AWS access-key value. Git ignores were verified for private state; a diff restricted to `functions`, `worker`, `src`, `migrations`, `.github` and `.kiro` is empty. Branch and HEAD stay as above. The benchmark branch/data/read-only role remain for the transfer investigation; temporary Cloudflare resources are gone. **Neon production, D1 production and all schedules remain untouched beyond the approved Neon bucket configuration operation.**
