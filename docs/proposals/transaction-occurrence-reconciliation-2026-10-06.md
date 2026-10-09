# Transaction occurrence reconciliation — 2026-10-06

The **988,123-row Qt import and recorded 988,128-row Neon candidate differ by exactly five approved, unresolved retained occurrences**. Full tuple-multiset comparison confirmed their identities and multiplicities. There are zero Qt-only occurrences. The count difference does not establish import data loss, a sale correction or a deletion. No count was forced to match.

This is local analysis authorized by `Sentinel_01113e90399c8191a5f78062279d58d8`. It uses retained public CSVs, the baseline SQLite opened read-only, staged transaction insertions and existing publication receipts. It does not query current remote Neon or D1 state. Captured at 2026-10-06 09:17:55–09:20:22 UTC; final input checks followed.

## Counts and exact multiset result

| Cohort                                | Occurrences | Difference                                                                              |
| ------------------------------------- | ----------: | --------------------------------------------------------------------------------------- |
| Retained August baseline, all sources |     985,533 | 746,203 historical + 239,330 active 2017+                                               |
| Qt four historical prepared shards    |     746,203 | Zero normalized tuple differences from baseline historical rows                         |
| Qt 2017+ prepared shard               |     241,920 | 2,595 added occurrences and 5 missing older occurrences relative to the active baseline |
| Qt mixed-source import                |     988,123 | 746,203 + 241,920; all declared transaction rows accepted                               |
| Recorded Neon candidate               |     988,128 | 985,533 + 2,595 insertions; no transaction updates or deletions                         |
| Candidate-only occurrences            |           5 | One occurrence for each approved retention below                                        |
| Qt-only occurrences                   |           0 | No unmatched imported source occurrence                                                 |

The reviewed publication deliberately stored `988,123 source occurrences + 5 unresolved retentions`. The accepted-source checkpoint already records `sourceFactRows = 988123`, `storedFactRows = 988128` and `outstandingRetainedOccurrences = 5`. These are different counts for different responsibilities, not conflicting import claims.

| Existing integer ID | Month   | Block/address            | Candidate multiplicity | Qt source multiplicity | Approved disposition |
| ------------------- | ------- | ------------------------ | ---------------------: | ---------------------: | -------------------- |
| 550818              | 2026-05 | 58 LOR 4 TOA PAYOH       |                      1 |                      0 | Retain unresolved    |
| 601171              | 2026-04 | 55 JLN BAHAGIA           |                      1 |                      0 | Retain unresolved    |
| 934839              | 2026-07 | 8A UPP BOON KENG RD      |                      1 |                      0 | Retain unresolved    |
| 955489              | 2026-07 | 445A BT BATOK WEST AVE 8 |                      1 |                      0 | Retain unresolved    |
| 959788              | 2026-08 | 182A WOODLANDS ST 13     |                      1 |                      0 | Retain unresolved    |

Every retained tuple matches its baseline integer ID and the approved manifest ledger. The complete tuple includes month, town, block, street, address key, flat type, storey range, area, commencement year, price and flat model. The JSON evidence contains all fields and exact multiplicities. For ID 955489, the otherwise matching September tuple occurs once in both source captures and was inserted as ID 986006. That resemblance does **not** prove the July and September rows represent the same physical sale; neither a correction nor deletion is inferred.

## Source bytes, versions and order

| Dataset                                     | Coverage      | Records | Original SHA-256                                                   |
| ------------------------------------------- | ------------- | ------: | ------------------------------------------------------------------ |
| `d_ebc5ab87086db484f88045b47411ebc5`        | 1990–1999     | 287,196 | `2e064923f41cc96536db04c978901695aa0191022829895cf4ce177e42afad57` |
| `d_43f493c6c50d54243cc1eab0df142d6a`        | 2000–Feb 2012 | 369,651 | `5f6a72bd7b9120281863beb1fc4c89aa5f4923f00b0f6c52494c4347363f2c36` |
| `d_2d5ff9ea31397b66239f245f57751537`        | Mar 2012–2014 |  52,203 | `6a16e2dc78f70048ec1a522b59a9727581c36e45e02022641c53e755a7657c72` |
| `d_ea9ed51da2787afaf8e51f827c304208`        | 2015–2016     |  37,153 | `4ff7ce4a4f642fb384d2b75a42e75b0477e50005f4aaa9989591a7a92507d185` |
| Qt/M11 `d_8b84c4ee58e3cfc0ece0d773c8ca6abc` | 2017–Oct 2026 | 241,920 | `3c3d8bf9b12adb88919fa74869922fe05cdb144f5f69d93a0de4345d047cc7d4` |
| Web `d_8b84c4ee58e3cfc0ece0d773c8ca6abc`    | 2017–Oct 2026 | 241,920 | `9835dfe6cd92a46a1302fabf3a692bf893ee5b86ec95638d10dfce61dbfbdb9a` |

Each original and prepared shard was independently hashed against its descriptor/receipt. Prepared headers, counts, parsed source strings and order all match the original; only the preparation's declared `source_row` and CSV encoding are added. Source locators span original ending physical lines 2 through records + 1. Originals total **83,166,023 bytes**; prepared shards total **89,638,079 bytes**. Nothing was downloaded for this analysis.

The two active originals are both 23,928,760 bytes, have identical header bytes, LF endings and exact raw CSV-line multisets including multiplicity. **Only order differs, at 39 data positions**, spanning physical lines 222193–241372. Their parsed raw-field multisets, including remaining lease, are exactly equal. Both have the same normalized fact multiset. Different byte hashes must remain separate provenance identifiers: source-local row IDs are not interchangeable across these captures.

The Web active CSV was saved at 2026-10-04T06:03:06.149Z, with stable metadata updated at 2026-10-03T18:10:17.000Z. Original HTTP headers/status were not retained. The Qt recovery receipt verifies its historical M11 byte pin; it does not provide an authoritative acquisition time or prove it was acquired with the Web capture. The four historical CSVs were captured on October 6, with stable 2024-08-28 metadata versions. Their normalized facts match the retained August baseline exactly; the original August raw CSV bytes are unavailable, so byte identity with August remains unproven.

This is a mixed-date source reconstruction. The pre-March-2012 datasets use approval dates; later datasets use registration dates. No uniform event meaning, complete same-date snapshot, physical-sale identifier or equivalence of location/presentation evidence is inferred.

## Fact digests and publication provenance

Digests use the application's exact `transactionTuple` column order and sorted multiset with byte-length framing. Repeated occurrences contribute repeatedly; no hash-based deduplication is performed.

| Fact multiset                             | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Historical 746,203, both Qt and baseline  | `7926d291be1f7551aa29d8cbbea0a0ab635385af9e64b82117df380203213b63` |
| Active August baseline 239,330            | `c4235c0796c4bccfb4147d11b7b2da1cde26903a90e9aae04b8967a41b501f8c` |
| Active current 241,920, both raw captures | `88b6c6252b2329edcb9856491cec5d05f5ca92f1340640ed90291fe2c7466356` |
| Full source 988,123                       | `90b8d365c031da247c5a41966afd1b0f6be5dcf5c95fb8598b37bf095165d9d3` |
| Actual staged 2,595 positive occurrences  | `675832229ab451be4d5aed5e4b611ef310a0f2f3072969dd664bb7dc7a599dee` |
| Reconstructed stored candidate 988,128    | `21b2fb88e3f6c025a54fd09996450a0327ed1281f250659082896f4eb8457787` |
| Exactly five retained occurrences         | `44c13d42f9277d1b4e9a86f2b36e69b79b50bf287b2ad0953e9f2f5592878276` |

The full source, scoped source and positive digests match the existing approval and accepted-source checkpoint. The actual transaction staging group also matches the recorded remote publication's key, payload, before/after and byte-count hashes. Its IDs are exactly 985534–988128, with 2,595 inserts, zero updates and zero deletions. The materialized detail stage had a different overall root; its transaction group was unchanged, which was verified here rather than assuming the full stage roots were equal.

The existing publication receipt verified 988,128 stored transactions and publication `4794aa04f6c990fbe5fb6e4ba24b433ac84bebb294bf5b7ab7cbd91959244b0f`. The copy-on-write candidate `production-candidate-20261005` (`br-rough-frost-b3e2ks1b`) recorded full public equality with parent benchmark `br-wispy-boat-b34glczl`, including those 988,128 rows and the same publication ID. Its PostgreSQL JSONB witness includes integer IDs and all stored columns, using a different digest algorithm; it is not equated to this report's fact digest. These are retained October 5 receipts, not a fresh verification of remote state.

## Duplicate grain is also reconciled

The common D1 fact tuple reports **2,014 extra duplicate occurrences** among 988,123 source rows; Qt's full `TransactionFacts` equality reports **1,929**, matching both prior measured imports. Independent grouping shows **exactly 85 groups**, each with two raw remaining-lease variants, that share the same D1 tuple. Every other raw field in those groups agrees. Omitting raw remaining lease from D1 fact identity accounts for all 85 additional duplicate-looking occurrences; there is no unexplained collapse or lost source row.

The distinction matters because raw lease is retained by Qt but not a D1 transaction column. This comparison does not change either application's identity policy, imply complete object equality, or treat equal normalized facts as a unique physical sale.

## Safety and reproducibility

- Zero external requests, Neon/D1 calls, database writes, deployments, refreshes or publications.
- SQLite opened read-only; its full file hash remained unchanged.
- All ten CSV inputs (five original/prepared pairs), the separate Web active original, receipts, descriptor and analysis source-code fingerprints were checked again after processing.
- 979 pre-existing tracked/untracked repository files were hashed and unchanged. Git branch, HEAD and status matched exactly before report generation: `feat/d1-free-incremental-refresh`, `482be1eba9ff2091c1580f5757d7b33e20b26515`.
- No application source/configuration changes. Final repository additions are this report and its sanitized JSON evidence; one-off reproduction scripts/logs stay ignored under `.neon-benchmark/occurrence-reconciliation-20261006/`.

The main one-off script sets `fetch` to throw and imports only the existing normalization, tuple/digest and staging helpers. Run with Node 24.15.0 using `node --max-old-space-size=4096 --import tsx .neon-benchmark/occurrence-reconciliation-20261006/analyze.mts`. The companion `duplicate-projection.mts` independently groups Qt's raw fact fields with exact decimal price equality. The report-only scope requires formatting/integrity checks, not a repeat of the application test suite or a million-row remote read.

Machine-readable evidence: [transaction-occurrence-reconciliation-2026-10-06.json](../evidence/transaction-occurrence-reconciliation-2026-10-06.json). Relevant prior records: [approval](../evidence/neon-reconciliation-approval-2026-10-04.json), [remote publication](../evidence/neon-portability-proof-2026-10-05.json), [candidate equality](../evidence/neon-cow-candidate-2026-10-05.json). Qt's current import measurements are in its `docs/source-import-verification.md` and retained task-3 `snapshot-evidence/` reports.
