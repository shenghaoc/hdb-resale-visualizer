# OneMap Search authentication and canonical source recovery

Search now uses the existing routing token resolver. The five resale CSV headers are explicitly verified. This change does not run ingestion, query either database, publish a snapshot or alter a publisher/runtime cache.

The starting branch is `feat/d1-free-incremental-refresh` at `482be1eba9ff2091c1580f5757d7b33e20b26515`. Thirteen existing tracked modifications and the previous untracked Neon/D1 evidence were present and preserved.

## Authentication

[Official OneMap Search documentation](https://www.onemap.gov.sg/apidocs/search/) requires token authentication. Its current examples send the raw access token in `Authorization`; authentication failures can be HTTP 200 with an `error` and empty results. The official documentation asset was retained privately and hashed in the [evidence receipt](../evidence/onemap-search-auth-sources-2026-10-06.json).

`geocodeAddress` reuses `resolveOneMapToken`: a configured `ONEMAP_TOKEN` takes precedence; otherwise the existing email/password resolver can obtain a token. Search sends credentials only to the official HTTPS Search endpoint, with no credential-bearing URL, endpoint query/fragment or automatic redirect. Credential POSTs are similarly restricted to the official token endpoint. The real `.env.local` token is configured and remains ignored; it was never printed or copied into a fixture, report or argument.

Search exceptions and token-resolution warnings omit provider bodies, transport details and parse errors because those can echo credentials. An HTTP-200 error is a failed lookup rather than evidence of an absent address. A genuinely empty successful search still returns `null`; no token also leaves the address unresolved without a request. Existing first-result mapping, skip-geocoding, cached records and cache-staging behavior remain intact. The walking-route implementation is unchanged.

The tests use synthetic credentials and mocked requests. There were **zero OneMap Search, routing or authentication API requests** in this task; only its public documentation was retrieved. The configured-token path does not perform an authentication POST for each address. Email/password fallback retains the existing resolver's behavior; no persistent token cache or renewal policy was added.

## Five explicit resale headers

The first three files have the same ordered ten-column header:

```text
month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,resale_price
```

The last two have the same ordered eleven-column header:

```text
month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,remaining_lease,resale_price
```

| Partition                                 | Dataset ID                           | Raw rows | `remaining_lease` header |    Blank cells |
| ----------------------------------------- | ------------------------------------ | -------: | ------------------------ | -------------: |
| 1990–1999                                 | `d_ebc5ab87086db484f88045b47411ebc5` |  287,196 | Absent                   | Not applicable |
| 2000–February 2012                        | `d_43f493c6c50d54243cc1eab0df142d6a` |  369,651 | Absent                   | Not applicable |
| March 2012–December 2014                  | `d_2d5ff9ea31397b66239f245f57751537` |   52,203 | Absent                   | Not applicable |
| 2015–2016                                 | `d_ea9ed51da2787afaf8e51f827c304208` |   37,153 | Present                  |              0 |
| January 2017 onward, retained Web capture | `d_8b84c4ee58e3cfc0ece0d773c8ca6abc` |  241,920 | Present                  |              0 |

All **37,153** `remaining_lease` values in the 2015–2016 file match the raw-text pattern `[0-9]+`; none is blank or another form. Preserve these bare integers verbatim. The parent/Qt task reports that its unchanged years/months grammar treats them as invalid, so its derived lease remains null. Do not append `years`, coerce them into a different assertion or inject the Web year-based fallback to change the importer oracle.

The four historical files were missing from retained Web raw inputs. They were acquired through the supported official GET initiate/poll/delivery path, using anonymous access because no data.gov.sg key is configured. The OneMap token was unused. The bounded capture completed with **20 requests and 59,284,679 received bytes**, no retries or failed requests. Metadata before/after each file was stable and matched the October 4 metadata version. HTTP status, timestamps, safe delivery headers, exact bytes and SHA-256 pins are retained; signed delivery URLs were not persisted.

These are **new October 6 captures of historical partitions**, not proof of the frozen August production inputs or M11 byte identity. Stable metadata and 2024 `Last-Modified` timestamps do not establish that missing identity.

All four files are in `.neon-benchmark/onemap-search-auth-20261006/`, named by dataset ID. The retained active Web file is in `.neon-benchmark/official-resale-2026-10-04T06-02-33-354Z/`.

| Partition                | Exact raw SHA-256                                                  |
| ------------------------ | ------------------------------------------------------------------ |
| 1990–1999                | `2e064923f41cc96536db04c978901695aa0191022829895cf4ce177e42afad57` |
| 2000–February 2012       | `5f6a72bd7b9120281863beb1fc4c89aa5f4923f00b0f6c52494c4347363f2c36` |
| March 2012–December 2014 | `6a16e2dc78f70048ec1a522b59a9727581c36e45e02022641c53e755a7657c72` |
| 2015–2016                | `4ff7ce4a4f642fb384d2b75a42e75b0477e50005f4aaa9989591a7a92507d185` |
| Retained Web 2017 onward | `9835dfe6cd92a46a1302fabf3a692bf893ee5b86ec95638d10dfce61dbfbdb9a` |

Together these files contain **988,123 raw rows**. No normalization, reconciliation or publication was run against that combined corpus. It does not automatically replace either the frozen 985,533-row D1 corpus or the Qt oracle's approved inputs.

## Other verified retained inputs

The retained Web property, MRT, school, hawker, supermarket and park bodies all match their prior receipt hashes and raw row/feature counts. CSV ordered headers were recovered offline. Their original delivery response headers were not retained and remain unknown; no new download was performed for these six files. The receipt includes their exact paths, hashes, metadata and headers.

The parent-provided Qt recovery was independently checked offline:

| Input                                                     |                                Raw count | SHA-256                                                            |
| --------------------------------------------------------- | ---------------------------------------: | ------------------------------------------------------------------ |
| `/tmp/hdb-resales-official.csv`                           | 241,920 records; lease present, 0 blanks | `3c3d8bf9b12adb88919fa74869922fe05cdb144f5f69d93a0de4345d047cc7d4` |
| `/tmp/hdb-property-official.csv`                          |                           13,357 records | `a6e3105d02c4b59929371d1f7e4f8c0ed7939cdc081701d7e9197790bb78f4b1` |
| `/tmp/hdb-m3-acra-c.csv` (pinned **B**, despite filename) |                           94,785 records | `a790f1a5082afcd6b5bad133f3949e3977e59cc8e33552897206b1e5f90cdab7` |
| Qt `docs/coverage/onemap/historical/benchmark.json`       |                378 entries, 66,356 bytes | `7d8af54d5cae591455e5161535218b66c9f85b9718d9a00d730602f72086ccd5` |

The Qt and Web active resale raw hashes differ; they remain separate pins. Matching row counts do not establish byte identity. Property's exact raw hash matches across both recoveries. Raw property/ACRA counts are not the legacy projected counts. Parent/Qt owns the other 26 ACRA partitions, expanded postal projection reconstruction and the exact expanded M11 roundtrip; this task did not duplicate those downloads or manufacture footprint/postal assertions from geocoding.

The parent reports an official `poll-download` **HTTP 403** for ACRA A (`d_8575e84912df3c28995b8e6e0e05205a`) at `2026-10-06T05:59:52Z`. Its receipt is `/Users/shenghaochen/Documents/Codex/2026-10-06/task-3/qt-source-recovery/acra-public-access-check.json`. That recovery stopped without a CSV download or alternate route. The remaining 26 pinned partitions and expanded M11 roundtrip are blocked; this task did not retry those sources. The separate four historical resale downloads all succeeded.

## Snapshot contract consequences

Preserve the ordered header and raw per-occurrence string dictionary **before normalization**. Column absence means no field key; a present blank cell means a field key with `""`. Do not fill absent columns with empty strings, trim supplied values in the canonical source pack, deduplicate legitimate occurrences or label `parseRemainingLease` fallback as a source assertion.

The existing fetcher and raw Zod validation already preserve these distinctions; focused tests now lock them in. Persisted transaction facts still omit `remaining_lease`, so a database export remains insufficient as the sole canonical input. The [provider-neutral input audit](provider-neutral-publication-input-audit-2026-10-06.md) is updated with these source findings. No snapshot materializer/downloader was implemented.

## Validation and preservation

The focused suite passes **79 tests across 8 files**, including 30 new authentication/source-presence tests. The prescribed **`vp run check` passes**: format, lint, typecheck, **2,236 tests across 216 files**, boundaries and production build/bundle checks. The first attempt stopped at the sandbox's local `tsx` IPC restriction after passing all tests; the reviewed rerun completed with exit code 0. The 18 existing lint warnings remain outside this change.

All **13 pre-existing tracked modifications are byte-for-byte unchanged** by this task. Of 97 frozen files, 95 are unchanged; the only authorized changes are the Search leaf and this audit's linked source-recovery supplement. The token resolver change is confined to credential scope/diagnostics; its routing/cache functions are unchanged. The final evidence records the preservation hash check. No D1/Neon operation, sync, migration, publication, deployment, commit, push, PR or merge occurred.
