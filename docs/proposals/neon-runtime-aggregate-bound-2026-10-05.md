# Neon Free runtime aggregate bound — 2026-10-05

**NEON FREE IS A GOOD FIT for the measured corpus and conservative traffic envelope.** The faithful public GET adapter works remotely, every approved route has bounded SQL/result cardinality, and cold-cache runtime transfer plus one monthly reconciliation fits the Free planning allowance. Production remains on D1. The Neon monthly workflow remains disabled.

This report supersedes the request-cohort dependency in [the earlier runtime investigation](neon-runtime-read-replay-2026-10-05.md). It preserves the [full benchmark](../neon-benchmark-2026-10-04.md) and [frozen publication proof](neon-portability-publication-2026-10-05.md). No new production capture was performed.

## Scope and preserved identities

- Git branch: `feat/d1-free-incremental-refresh`; HEAD: `482be1eba9ff2091c1580f5757d7b33e20b26515`.
- Existing dirty work preserved. No staging, commits, push, PR, merge, live routing, production secrets, production SQL or schedule activation.
- Existing Neon project: `wispy-mouse-67963002`, Free v3, PostgreSQL 18, AWS Singapore.
- All new SQL used only `benchmark-d1-migration` / `br-wispy-boat-b34glczl`, endpoint `ep-steep-moon-b35xjj4d`.
- Existing role `hdb_benchmark_runtime`: runtime diagnostics confirmed no transaction-write or private-shortlist privileges. No grants, indexes, schema or publisher changed.
- All nine frozen source hashes still match. Code SHA `e211c4cbf647f143c80a5eb1a69b0b070f293a95c3515d855cda1310e4758b91`; SQL SHA `2076f556758d1f49090c16ab8e215e62454ec62924a424e037624704f4416f8e`.
- The original Neon CLI 8.0.4 setup/private uploads configuration is preserved; it was not rerun. No second project, new branch or new Neon publication was created.

## Verify 141 before using it

Saved Cloudflare analytics for **2026-09-05 00:00 UTC → 2026-10-05 00:00 UTC** reports a total of **141**. September 13 has `sum.requests=12` and `avg.sampleInterval=4`. A finer saved timestamp grouping still totals 141, with one group reporting 10 at interval 10. These are scaled estimates, not raw sampled counts.

Cloudflare documents that adaptive results are scaled to estimate the population. Multiplying 141 by the sampling interval again would double-scale it. Conversely, 141 cannot be called an authoritative hard upper bound. [Cloudflare sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/).

One fresh read-only, supported GraphQL confidence query returned:

| Metric                          |             Result |
| ------------------------------- | -----------------: |
| Reported estimate               |                141 |
| Sample size                     |                132 |
| Mean sample interval            | 1.0681818181818181 |
| 99% lower endpoint              | 116.56353761094071 |
| 99% upper endpoint              | 165.43646238905927 |
| Rounded planning upper endpoint |                166 |

A confidence endpoint is statistical, not deterministic. This report shows both the requested 141 calculation and a 166 sensitivity case. Neither guarantees a future month's volume. Aggregate invocations include scheduled/private/non-API events; treating all of them as eligible cold public GETs overestimates that population at any fixed total. [Confidence intervals](https://developers.cloudflare.com/analytics/graphql-api/features/confidence-intervals/).

## Isolated pilot and quota ledger

The previously approved pilot had consumed **zero GETs and zero database-result transfer** before this run. Its aggregate limits were 32 GETs, 100,000,000 received bytes, 0.25 CU-hours, maximum 1 CU, and one outstanding request/query. No limits were raised.

The exact finite handler adapter and unchanged versioned Cache API ran in an authenticated temporary Worker. Hyperdrive query caching was disabled. Cold runs used empty response/pointer cache reads and no cache storage; normal runs used the actual POP-local Cache API. No handler query was replaced with a common fallback. Instrumentation counted all connection/query stream data, all manifest reads, every dictionary page and readiness queries. HTTP bodies were streamed to a byte counter/hash; only small public diagnostic metadata was retained.

| Pilot item                                  |                Actual |
| ------------------------------------------- | --------------------: |
| GETs attempted/completed                    |               31 / 31 |
| Received PostgreSQL protocol bytes          |            24,096,537 |
| Admitted complete coverage envelope         |            62,947,370 |
| Application/diagnostic SQL calls            |                    74 |
| Largest eligible invocation                 |           9,102,437 B |
| Activation/setup through suspension request |        46.544 seconds |
| Maximum-CU active-window proxy              | 0.0129288889 CU-hours |
| POP                                         |                   SIN |
| Automatic retries                           |                     0 |
| Database mutations                          |                     0 |

The received bytes are **Hyperdrive→Worker PostgreSQL stream measurements**, an application-egress proxy. They are not a finalized Neon billing reading and do not directly measure upstream TLS/retransmissions or pool maintenance. The 1 GB monthly reserve provides room for framing, management, refresh publication and other bounded overhead; it is not claimed as live unused quota.

The benchmark was idle beforehand. Its first diagnostic invocation took 6,679.309 ms end to end, including compute resumption and a deliberately comprehensive size/statistics query. This does not isolate the wake penalty. Subsequent cold-public-cache manifest and summaries took 1,041.819 and 2,921.179 ms. Later cold requests benefited from warm database buffers while their public response caches stayed empty.

## Exact per-invocation measurements

“Rows” includes manifest checks and other supporting SELECT rows. “SQL round trip” is driver latency summed across the invocation, including network/result transfer; it is not isolated server execution time.

| Scenario | Received B | SQL calls | Rows | SQL round trip ms | HTTP wall ms | Result |
| -------- | ---------: | --------: | ---: | ----------------: | -----------: | ------ |

| diagnostic-before | 1,037 | 1 | 1 | 6,420.000 | 6,679.309 | 200 |
| manifest | 32,189 | 3 | 3 | 964.000 | 1,041.819 | 200 MISS |
| all-summaries | 9,102,437 | 3 | 9,732 | 1,488.000 | 2,921.179 | 200 MISS |
| largest-town | 772,424 | 3 | 798 | 1,509.000 | 1,670.947 | 200 MISS |
| largest-detail | 63,114 | 3 | 3 | 1,150.000 | 1,246.066 | 200 MISS |
| largest-comparison | 22,623 | 3 | 3 | 498.000 | 636.183 | 200 MISS |
| all-trends | 3,102,195 | 3 | 45,030 | 1,125.000 | 1,567.983 | 200 MISS |
| mrt-stations | 64,800 | 3 | 3 | 77.000 | 151.232 | 200 MISS |
| mrt-exits | 186,185 | 3 | 3 | 74.000 | 157.917 | 200 MISS |
| search-unfiltered-cap | 1,900,680 | 3 | 2,003 | 112.000 | 377.710 | 200 MISS |
| suggest-text-dictionary | 936,255 | 7 | 9,735 | 110.000 | 242.479 | 200 MISS |
| search-town | 491,260 | 3 | 514 | 142.000 | 279.001 | 200 MISS |
| search-flat-type-budget | 1,967,386 | 3 | 2,003 | 171.000 | 378.163 | 200 MISS |
| search-selected-cohort | 1,927,707 | 4 | 2,004 | 125.000 | 328.208 | 200 MISS |
| search-block-refinements | 1,916,774 | 3 | 2,003 | 126.000 | 339.831 | 200 MISS |
| search-nonfinite-ignored | 22,362 | 3 | 2 | 94.000 | 157.916 | 200 MISS |
| suggest-numeric-dictionary | 936,255 | 7 | 9,735 | 107.000 | 194.895 | 200 MISS |
| unknown-town | 22,362 | 3 | 2 | 187.000 | 476.513 | 200 MISS |
| unknown-detail | 21,570 | 3 | 2 | 26.000 | 72.246 | 404 MISS |
| unknown-comparison | 21,570 | 3 | 2 | 131.000 | 230.198 | 404 MISS |
| invalid-search-mrt | 0 | 0 | 0 | 0.000 | 46.011 | 400 |
| invalid-search-negative-budget | 0 | 0 | 0 | 0.000 | 87.573 | 400 |
| invalid-search-month | 0 | 0 | 0 | 0.000 | 42.752 | 400 |
| invalid-search-oversize | 0 | 0 | 0 | 0.000 | 82.680 | 400 |
| invalid-suggest-short | 0 | 0 | 0 | 0.000 | 42.764 | 400 |
| invalid-suggest-oversize | 0 | 0 | 0 | 0.000 | 76.495 | 400 |
| cache-normal-miss | 369,712 | 3 | 366 | 47.000 | 227.405 | 200 MISS |
| cache-normal-hit | 0 | 0 | 0 | 0.000 | 78.635 | 200 HIT |
| cache-canonical-hit | 0 | 0 | 0 | 0.000 | 90.372 | 200 HIT |
| cache-semantic-miss | 214,609 | 3 | 202 | 38.000 | 149.200 | 200 MISS |
| diagnostic-after | 1,031 | 1 | 1 | 1,589.000 | 1,635.979 | 200 |

All expected successful routes returned 200; invalid inputs returned 400 and unknown detail/comparison addresses returned 404. The complete machine receipt records individual query rows, bytes and timings.

Server-side `pg_stat_statements` snapshots for this role show **6,432.432939 ms** execution-time delta and **108** statement-call delta. This interval includes the first diagnostic and pool/driver bookkeeping, and excludes the currently executing final diagnostic. It is not a per-route server-time table. Application instrumentation counted 74 SELECT calls; the additional server-visible calls show why SQL transport latency and pool work must be distinguished.

## Bound every approved public shape

The diagnostic measured the current corpus directly: **9,730 blocks**, **45,028 trends**, two MRT objects, largest detail **41,533 B**, largest comparison **1,042 B**, manifest **10,618 B**.

| Read path                                     | Cardinality/dependency bound                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Manifest, detail, comparison, each MRT object | One main row plus up to two outer manifest reads                                                   |
| All summaries                                 | Each of 9,730 blocks once plus two manifest reads                                                  |
| Town summaries                                | A subset of all blocks; largest measured town TAMPINES, 796 blocks                                 |
| All trends                                    | Each of 45,028 trends once plus two manifest reads                                                 |
| Search                                        | At most 2,001 main rows; response capped at 2,000; optional single readiness count                 |
| Suggestions                                   | Two 5,000-row keyset pages for 9,730 blocks, one MRT object, four manifest checks; seven SQL calls |

Search bounds cover unfiltered, town, selected flat type/budget, selected-cohort model/area/month, whole-block model/area/month/MRT/lease, unknown types and nonfinite numeric inputs. Predicates change which rows match, but cannot raise the fixed 2,001-row SQL cap. Caller `limit`/`offset` parameters are ignored. Finite ranges are ordered; invalid negative budgets, invalid month, excessive MRT bounds and over-256-character text are rejected before SQL. Nonfinite numeric values become absent refinements; they do not remove the result cap.

Suggestions use the same dictionary reads for text, alias and numeric queries; query length/ranking does not multiply SQL. Result cap is 10. One-character and over-256-character queries were rejected without SQL. The dictionary has a 20,000-block guard; for growth, its page-overrun/error path must also be counted, rather than equating the guard with zero transfer.

Other query parameters on fixed routes do not change their SQL. Unknown keys cannot enumerate additional rows. URLs longer than the cache's 2,048-character admission bypass shared caching, but handler row/parameter bounds still apply. Invalid slug/unknown-address paths return empty/error results rather than a corpus dump. Version changes do not cause an automatic request replay. No public handler retries arbitrary queries.

These are provable SQL/cardinality bounds for this implementation, not exhaustive enumeration of every parameter combination. Current data-dependent size bounds must be recalculated when a new manifest/corpus is published.

### Current-corpus byte envelope

The diagnostic computed **13,522,644 B** for the sum of PostgreSQL `row_to_json` representations of the selected full-summary rows. Those representations contain the selected scalar values and escaped JSON text plus field names, and exceed the actual main-query protocol payload. The largest possible 2,001 search rows total **3,097,002 B** using the same representation, regardless of their matching predicates; largest town totals **1,114,438 B**. This avoids assuming that the unfiltered first search page is the largest possible page.

The admitted upper envelopes add fixed protocol/metadata and four manifest allowances:

| Envelope                                   |          B |
| ------------------------------------------ | ---------: |
| Full-summary/general eligible GET envelope | 13,667,516 |
| Any capped search                          |  3,498,002 |
| Any town                                   |  1,259,310 |
| Any detail                                 |    153,637 |
| Any comparison                             |    113,146 |
| Dictionary invocation admission            |  2,000,000 |
| Fixed all-trends invocation admission      |  7,000,000 |

**9,102,437 B is the empirical maximum; 13,667,516 B is the conservative current-corpus engineering envelope used for planning.** SQL row cardinality and full-result containment support the envelope, and every test was below its admitted bound. The 64 KiB connection and 32 KiB metadata allowances are engineering reserves, not a proof of a finite maximum for all conceivable transport failures/retransmissions. Actual provider transfer counters remain unknown.

Concurrent cold misses are not coalesced. Each invocation can independently pay its cold cost; multiplying by total invocations already counts that amplification. The pilot stayed sequential as approved. It did not manufacture concurrent traffic or claim a warm Singapore POP is globally warm. Cache outages can bypass caching; the closed handler/query/cardinality bounds remain.

## Monthly aggregate arithmetic

Retained receipts contain these exact old bootstrap bytes: summaries **9,080,520**, trends **3,066,881**, dictionary **849,900**, total **12,997,301**. The previously measured reconciliation proxy is **493,707,924 B**; it was not rerun.

For each case below: `invocations × per-invocation bytes + 493,707,924 + 1,000,000,000`.

| Traffic planning case                | Per invocation B |   Monthly total B | Remaining below 5,000,000,000 B |
| ------------------------------------ | ---------------: | ----------------: | ------------------------------: |
| 141 × measured single-route maximum  |        9,102,437 |     2,777,151,541 |                   2,222,848,459 |
| 141 × conservative eligible envelope |       13,667,516 |     3,420,827,680 |                   1,579,172,320 |
| 141 × old combined bootstrap         |       12,997,301 | **3,326,327,365** |                   1,673,672,635 |
| 166 × measured single-route maximum  |        9,102,437 |     3,004,712,466 |                   1,995,287,534 |
| 166 × conservative eligible envelope |       13,667,516 | **3,762,515,580** |               **1,237,484,420** |
| 166 × old combined bootstrap         |       12,997,301 |     3,651,259,890 |                   1,348,740,110 |

The deliberately oversized combined-bootstrap cross-check matches the user's arithmetic exactly. The conservative current-corpus model crosses the allowance at **257 all-cold worst-envelope invocations** in a month (256 fit), after reconciliation/reserve. That is a growth sensitivity threshold, not an implemented traffic cap.

This proof uses a conservative aggregate planning envelope rather than a traffic-distribution/cache-hit model. A request cohort is unnecessary for this calculation. However, because 141 is a sampled estimate and future traffic can change, the calculation is not a deterministic historical census or a guarantee of future consumption.

Separately modeled scheduled/non-API Neon runtime work: **0**. The prototype exposes only approved public GETs. Existing shortlist cleanup/SEO/private/non-API code has not been routed to Neon; a migration must not silently add it to this model. One future monthly explicit reconciliation is included above, but its workflow remains off.

## Compute and Hyperdrive allowances

Neon Free's planning allowance is **100 CU-hours/month**. The benchmark's verified autoscaling range was 0.25–1 CU; API `suspend_timeout_seconds=0` selects the default. Current Neon documentation fixes Free automatic suspension at five inactive minutes. [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero).

Hyperdrive keeps origin connections after Worker completion and documents a ten-minute idle connection timeout, five minimum connections, and a soft origin connection ceiling. The pilot explicitly used origin limit five and deleted the configuration before suspension. Persistent driver pools, open transactions, background probes and periodic health queries that prevent inactivity must not be introduced. [Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/), [limits](https://developers.cloudflare.com/hyperdrive/platform/limits/), [pool configuration](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/).

A conservative configuration-based forecast assigns each of 166 invocations one CU, up to seven 60-second SQL statements, 15-second connection acquisition, then ten minutes of retained origin pool plus five minutes of Neon inactivity: **22 minutes 15 seconds**, or **61.558333 CU-hours/month**. Add a bounded 0.25-CUh monthly job: **61.808333**, leaving **38.191667 CU-hours** before other project compute. A simpler one-minute execution plus 15-minute tail sensitivity is **44.266667 CU-hours**. Overlapping activity windows reduce, rather than add to, these sums.

These are conservative modeled active-window bounds under documented idle behavior, **not observed natural Hyperdrive idle-tail measurements**. The pilot's shutdown was explicit: API operation was requested at 06:27:08 UTC and a later read confirmed idle/suspended at 06:27:09 UTC. It establishes controllable cleanup, not a continuously provisioned Hyperdrive pool's natural cold tail. Long-lived traffic/background work or a larger CU ceiling would invalidate this forecast and require a new model.

Hyperdrive Free allows **100,000 database statements/day**, shared by the account and resetting at 00:00 UTC. All 166 planning invocations in one day at seven application calls cost at most **1,162 application statements**. The pilot exposed pool bookkeeping (108 server-visible interval calls versus 74 instrumented calls), so 1,162 is not asserted as a finalized billing total. Even a tenfold bookkeeping sensitivity is 11,620, well below the allowance; it is a sensitivity calculation, not an experimentally proven provider billing multiplier. [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/).

Live Neon remaining compute/transfer is **UNKNOWN**: earlier API counters returned zero despite measured successful work. The current-period boundaries remain **2026-10-01 00:00 UTC → 2026-11-01 00:00 UTC**. The forecasts allocate the allowance; they do not certify a live account balance.

## Storage and existing publication evidence

No storage import, full reconciliation, schema/index change or publication was repeated. Prior measured project/branch logical storage is **452,173,824 B** of **1,073,741,824 B**, **42.112%**, with **621,568,000 B** headroom. D1 production remains **460,922,880 B**. Prior full-corpus row counts, per-index sizes, incremental publication/retry/rollback and portability proof remain in the preserved reports. This pilot only rechecked the public block/trend cardinalities needed for its bounds.

The storage advantage is practical measured headroom, not a claim that PostgreSQL and D1 bytes are interchangeable.

## Earlier capture: exact observational coverage

The earlier successful tail session began **04:58:52.803 UTC**, with original hard deadline **05:58:52.803 UTC**. It received SIGINT at **05:57:36.147 UTC**, after **58m43.344s**, to leave time for authenticated deletion before the existing OAuth token expired. Finalization including cleanup ended **05:57:37.972 UTC**. It was neither restarted nor extended; no quota/output limit was reached. The exact OAuth-expiry observation came from the earlier operator/tool check, not the sanitized capture receipt.

The receipt's `connected=true` is a latched “WebSocket open was observed” flag. It is not continuous ready-state evidence. Subscription creation and opening succeeded, and no error/close callback terminated collection before the operator stop. There is no timestamped liveness/ping history, independent delivery calibration or server-side delivery audit. **Continuous live delivery is not proven.**

No messages arrived: zero frames, zero info/sampling-warning frames, zero evaluated eligible/rejected events. No detected drop/connection warning is not proof of no loss or sampling. The initial 401/code10000 failed setup occurred before the successful session; the existing OAuth session was refreshed, then one subscription opened. Tail deletion succeeded. The subsequent removal of a lingering already-finalized Node process was cleanup, not a detected tail failure.

Coverage was one future-GET subscription on the existing Worker during that bounded window, without an exact persisted socket-open timestamp. It does not cover historical traffic, other Workers, non-GETs, page views/CDN/client-cache activity, or all POPs. Zero delivered frames do not establish zero eligible traffic. No further capture is needed or proposed for the current aggregate method.

The current callable tools have no tab listing, DOM, hover/click or screenshot control of the user's existing authenticated browser. Local image viewing and generic web fetches cannot hover Console graphs. Native browser automation was not used. Premium export is unnecessary; an owner hover reading can supply a fresh meter if desired.

## Cleanup, validation and repository impact

Temporary Worker **hdb-neon-benchmark-20261004** and temporary Hyperdrive were both deleted with successful HTTP 200 receipts at **06:27:07 UTC**. Benchmark branch and existing SELECT-only role remain for preserved evidence. Compute is confirmed idle. No production resource was deleted or changed.

New repository files: the temporary runtime benchmark Worker, bounded pilot driver, this report and its sanitized JSON evidence. These are investigation tooling, not a runtime migration. Private tokens, connection strings, control logs and helper identities remain ignored. No secret or machine-local state is intended for commit.

Validation: prescribed format, lint, typecheck and **2,025 tests in 198 files** passed. The combined gate's build hit the sandbox's local tsx IPC restriction; the prescribed local build then passed with escalation, including boundary and bundle checks. Explicit strict TypeScript checking covered the new Worker. The nine publisher hashes remain unchanged.

## Decision and smallest migration plan

**NEON FREE IS A GOOD FIT** at the measured current corpus and conservative aggregate traffic envelope. The runtime cohort requirement is resolved by bounded reads and aggregate modeling; its absence is no longer a migration blocker. Storage, frozen publication correctness and remote public read/cache behavior support proceeding to a separately authorized application migration.

The smallest next implementation would connect the existing public handler adapter through a SELECT-only Neon binding/Hyperdrive, retain the exact Cache API layer, cap compute at the modeled one CU, and retain the frozen incremental publisher/monthly admission policy. Explicitly account for any private/non-API Neon additions. Keep the schedule disabled until the separate migration/deployment decision is approved. No cutover, new schedule or application deployment was performed by this task.

The sampled traffic estimate, protocol-versus-billing distinction and modeled idle tails are practical limits of this evidence. They are not grounds to require another production traffic capture when the deliberately conservative aggregate calculation already fits.
