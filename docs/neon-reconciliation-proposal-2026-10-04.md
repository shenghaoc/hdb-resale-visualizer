# Neon reconciliation decision — approved source scope, publication blocked

The user approved retaining all five absent stored occurrences as unresolved and accepting exactly 2,595 additions as a snapshot-pinned one-time manual catch-up. No correction or deletion is inferred, and the routine guard stays unchanged. **The retry stops: required transaction inserts plus existing-block price/count mutations alone forecast 25,659 index operations, above the unchanged 25,000 guard.** No database retry, publication or resource recreation occurred. The overall database assessment remains **NEON FREE IS MARGINAL**.

This stage resumed on `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`, preserving all existing dirty work and D1 evidence. The first policy analysis used retained local data only. The subsequent provenance investigation acquired six official public context files with **27 anonymous requests / 1,702,895 received response bytes**. The pinned active transaction file was not re-downloaded or replaced. Both stages made **zero Neon calls, zero D1 calls and zero OneMap search/routing calls**. No credential, role, resource, workflow, application deployment or production state was changed. Temporary Worker and Hyperdrive remain deleted; the isolated benchmark branch is preserved.

## Exact source evidence and its limits

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

## Five approved dispositions

Each exact tuple has old multiplicity one and new multiplicity zero. The official public fields provide neither a persistent registration ID nor a unit ID; the retained evidence contains no specific authoritative correction/removal notice. The September candidate below establishes a one-field resemblance, not real-world transaction identity. The user explicitly approved **retain-unresolved** for all five and forbade pairing the July→September candidate without stronger evidence. The [approval receipt](evidence/neon-reconciliation-approval-2026-10-04.json) records the exact scope and quote.

| Stored ID | Stored fact                                                                                                       | Strongest available evidence                                                                      | Proposed handling                                                                                           |
| --------: | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
|    550818 | May 2026; TOA PAYOH, 58 LOR 4 TOA PAYOH; 2 ROOM, 01 TO 03; 45 m², lease 1967; $258,000, STANDARD                  | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `40 years 01 month` presentation                                                     |
|    601171 | April 2026; KALLANG/WHAMPOA, 55 JLN BAHAGIA; 3 ROOM, 01 TO 03; 93.6 m², lease 1972; $1,028,000, TERRACE           | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `45 years 03 months` presentation                                                    |
|    934839 | July 2026; KALLANG/WHAMPOA, 8A UPP BOON KENG RD; 3 ROOM, 10 TO 12; 70 m², lease 2017; $780,000, PREMIUM APARTMENT | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `90 years 01 month` presentation                                                     |
|    955489 | July 2026; BUKIT BATOK, 445A BT BATOK WEST AVE 8; 4 ROOM, 01 TO 03; 92 m², lease 2019; $625,000, MODEL A          | One unmatched September fact differs only in month; saved CSV data-row 224,897; identity unproven | Retain July ID and `91 years 07 months`; insert September independently if the full publication is approved |
|    959788 | August 2026; WOODLANDS, 182A WOODLANDS ST 13; 2 ROOM, 13 TO 15; 47 m², lease 2019; $378,888, MODEL A              | Exact occurrence absent; no exact one-field candidate                                             | Retain ID and original `92 years 02 months` presentation                                                    |

Under the local exact multiset plan, the September candidate receives new integer ID **986006**. The ledger links that possible replacement without treating it as a correction. Keeping both may count a revised registration twice if that is what actually occurred; dropping or merging either would instead require unsupported identity inference. This uncertainty remains visible in the operator receipt and manifest. The current public UI has no per-row discrepancy badge; no production rollout is proposed.

## Durable accounting and publication behavior

The script-only `neonReconciliation` manifest state holds each approved exact tuple, integer ID, occurrence count one, original lease presentation, evidence/decision reference, first and last distinct missing-source observations, status, source hash and possible replacement IDs. A separate accepted-source checkpoint records normalized/source/stored counts, outstanding retained count, active scoped count/hash and raw CSV hashes/byte/row counts. The original proposed state was **6,715 bytes**; adding the recorded user decision reference makes the current planned ledger/checkpoint **7,410 bytes**. It is bounded to a one-MB manifest value; all existing body/write/statement limits include it.

All stored occurrences consume real incoming multiplicity before any insert is assigned. A partial duplicate reappearance resolves only the corresponding occurrence; a full reappearance produces no duplicate logical row; only multiplicity beyond the retained baseline becomes an insert. Existing IDs remain stable even when otherwise identical source occurrences have different remaining-lease text. Retained presentation does not invent month-precision lease values.

Unknown disappearances fail with a structured discrepancy receipt. Independent limits are at most five newly reviewed retentions, five outstanding retentions, **zero corrections and zero removals**. Reappeared entries remain in the historical ledger; a later disappearance updates the existing entry rather than appending another ledger row.

Changed raw CSV bytes advance the accepted checkpoint even when canonical facts are equal. Exact same-source replay in the same UTC month preserves checkpoint/ledger bytes and skips a redundant manifest publication when there are no other mutations. A changed ledger, another semantic manifest change or a new UTC month prevents that shortcut. Changed artifacts and staged caches publish first, with the manifest/ledger last in the same PostgreSQL transaction and a locked expected-manifest equality guard. A late failure rolls back all changes. An ambiguous COMMIT response still requires authoritative manifest inspection and reconciliation; there is no blind automatic retry.

These are new **local** regression results. Earlier isolated PostgreSQL rollback/ambiguous-outcome evidence remains preserved in the [benchmark report](neon-benchmark-2026-10-04.md); this stage did not repeat it remotely.

## Growth guard and exact one-time exception

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

## Downstream effects of retention

The reconstructed 24-observed-month window starts November 2024. These are exact local block-summary effects, including the historical fallback when the source has no transaction in the recent window.

| Retained ID | Source-only recent occurrences | With retention |                                             Source-only recent median | With-retention median |
| ----------: | -----------------------------: | -------------: | --------------------------------------------------------------------: | --------------------: |
|      550818 |                              0 |              1 | No recent value; 50 historical facts give a $201,000 fallback summary |              $258,000 |
|      601171 |                              1 |              2 |                                                              $990,000 |            $1,009,000 |
|      934839 |                             19 |             20 |                                                            $1,100,000 |            $1,070,400 |
|      955489 |                             20 |             21 |                                                              $695,444 |              $690,000 |
|      959788 |                             18 |             19 |                                                              $454,000 |              $423,000 |

The exact delta affects **2,116 block keys and 119 town/flat-type cohorts** before window/context invalidation. Retention participates in summaries, recent transactions, trends and comparison dependencies rather than surviving only in the raw transaction table. Local tests compare full and incremental artifact builds and check unaffected cohort preservation.

## Earlier retained-context scenario, preserved for comparison

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

## Context provenance follow-up and decisive mandatory cost

The retained `.neon-benchmark/source.sqlite` contains all public stored facts, published artifacts, 10,333 geocodes (9,730 block keys, 179 school keys and 424 supermarket keys), and zero routing cache rows. It preserves the original MRT exits JSON. It contains **no original property CSV, school CSV, supermarket CSV, hawker GeoJSON or park GeoJSON**, no raw historical transaction CSVs, and no baseline `syncBuildState`/context digest. Published nearest-school observations and max-floor presentation cannot reconstruct the full original context inventories. The failed refresh did not persist its original context bodies. Exact original-byte identity for those inputs cannot be asserted.

The normal anonymous data.gov.sg download flow was used from **11:02:44.918 to 11:04:40.242 UTC**. Non-CSV datasets went directly to poll as permitted by the [official download guide](https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset). Download API calls were spaced at least 12 seconds, respecting the conservative anonymous pacing described in the [rate-limit documentation](https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits). All 27 HTTP responses succeeded; no credentials, retry-after-denial, transaction body downloads, database activity or OneMap calls occurred. The capture was bounded to 48 requests / 32 MB total / 16 MB per response / ten minutes. Before/after metadata was stable. Raw bodies and hashes remain in the private ignored capture directory; the [sanitized receipt](evidence/neon-official-context-capture-2026-10-04.json) records every hash, timestamp and response cost.

| Current official input   | Delivered bytes | Raw records/features |     Normalized usable records |
| ------------------------ | --------------: | -------------------: | ----------------------------: |
| HDB property information |         945,969 |               13,357 |                        13,357 |
| MRT exits                |         213,057 |                  613 |                           613 |
| Schools                  |         135,634 |                  337 |           179 primary schools |
| Hawkers                  |         140,561 |                  129 |                           129 |
| Supermarkets             |          42,172 |                  478 | 457 with existing coordinates |
| Parks                    |         168,423 |                  462 |                           462 |

These are **newly captured current inputs**, not silently substituted original bytes. The current MRT document is logically equal to the original retained MRT JSON. All primary-school coordinates resolve using existing data/cache; no new school geocode is needed for this captured file. Exactly **21 supermarket keys lack cached coordinates**, listed individually in the [forecast receipt](evidence/neon-context-provenance-forecast-2026-10-04.json). The effective source also has **286 block-address keys without geocodes**, including 41 appearing in incoming facts. Normalization used a strict offline network prohibition: unresolved keys were recorded, not looked up or assigned fabricated coordinates. The zero staged cache writes describe only this available-data candidate; they are **not** an authoritative assertion that a genuine refresh needs zero cache writes. Up to 307 distinct unresolved cache keys remain, with actual successful geocode/derived costs unknown. Authenticated routing outcomes are likewise not fabricated; the empty retained routing cache uses the existing straight-line fallback for the offline candidate.

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

## Resource plan for a possible later bounded retry

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

## Validation and stop point

The prescribed `node_modules/.bin/vp run check` passed under **Node 24.15.0**, with normal sandbox escalation for the `tsx` local IPC socket: formatting, lint, typecheck, **1,893 tests in 192 files**, production build, import boundaries and bundle budgets. The build is a local artifact, not an application deployment. The preceding sandboxed attempt passed formatting/lint/typecheck/all tests but could not create the local IPC socket; the supported escalation resolved that environment restriction. Two pre-existing UI stringification warnings remain, with no new lint warning. No external database access or new source acquisition occurred.

The 18-test new reconciliation suite covers partial duplicate reappearance, different lease presentations with retained IDs, repeated observations without duplicate ledger entries, raw-only checkpoint changes, a month boundary, strict active scope, insertion/gap boundaries, invalid timestamps, manual-only pinned exceptions, and ledger/manifest failure recovery. A native in-memory SQLite test executes real transaction inserts plus the manifest ledger, verifies complete rollback, commits, and verifies a zero-insert replay. It is local engine evidence, not a substitute for the previously completed PostgreSQL atomicity experiment. The two new CSV tests verify exact delivered BOM bytes and prevent a checkpoint after parse failure; pacing is mocked because it has separate rate-limit tests. Three additional attribution tests validate the required mutation subtotal, reject disagreement with the shared compiler, and prove that an admissible partial subtotal never admits a full publication over the guard.

New local-stage files include the Neon reconciliation policy, bounded anonymous context capture, offline provenance/forecast scripts, its 18-test reconciliation suite and three-test attribution suite, approved review/approval/analysis receipts, and this report. Existing Neon planner/publisher files add review/capture integration and manifest-inclusive plan guards. `scripts/lib/sync/fetchers.ts` adds optional raw-byte capture; `tests/unit/fetchers.test.ts` verifies it. README links the decision gate. All earlier dirty configuration, workflow, evidence and D1 policy changes remain preserved; nothing is committed or discarded.

The D1 planner defaults, schema/migrations, runtime handlers, cache implementation and production data remain intact. New script behavior is isolated to the Neon prototype; the optional raw-CSV capture preserves the default D1 fetch path. No private shortlist corpus is imported. Secrets and retained corpus files remain ignored.

**Stop here:** source-policy approval is recorded, but the mandatory 25,659 forecast already exceeds 25,000. No retry, resource recreation, publication or monthly scheduling occurs. The complete actual cache-enabled cost remains unknown; missing inputs are enumerated rather than manufactured. All write/statement/body guards remain unchanged. The complete [machine-readable local analysis](evidence/neon-reconciliation-policy-analysis-2026-10-04.json) and [earlier manual-run report](neon-manual-publication-2026-10-04.md) preserve the evidence and limitations.
