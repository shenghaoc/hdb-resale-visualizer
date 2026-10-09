# Isolated Neon staged publisher — local execution checkpoint

**Later remote checkpoint:** [the bounded admission attempt](neon-staged-remote-attempt-2026-10-04.md) measured exact native JSONB sizes and then stopped at the existing role's missing executor-spill SET permission. No new Worker, Hyperdrive or publication was created. The local checkpoint below records the preceding prepared-input state; it does not assert successful remote publication.

The direct PostgreSQL publisher and native artifact adapter are implemented locally. The previous zero-unresolved/token gate was withdrawn: the existing `--skip-geocoding` / `SKIP_GEOCODING=1` path is supported and is the exact snapshot policy. Remote verification awaits the corrected prepared envelope and resource/schema admission, not additional OneMap results. No Neon/D1 database, Cloudflare resource or OneMap data API calls were made during this implementation/checkpoint. Production, schedules and the D1 guard remain untouched.

This continues the [accepted staging proposal](neon-staged-publication-2026-10-04.md). It does not replace the existing [benchmark evidence](../neon-benchmark-2026-10-04.md) or [genuine-source investigation](../neon-manual-publication-2026-10-04.md).

## Implementation and local evidence

- `scripts/neon-benchmark/staged-publisher.ts`: dedicated direct benchmark connection, streamed `pg-copy-streams` COPY, exactly twenty commands for the six-mode candidate, manifest row first/table locks second, set-based DML, verified affected-key receipts, final manifest compare-and-set, COMMIT and explicit one-read recovery. No automatic retry or CLI invocation is wired.
- `staged-validation.ts`: typed before/after validation, inserts absent, owned JSON paths and parents unchanged, five retained transaction tuples intact, maximum-ID boundary, complete public cache inputs, schema catalog fingerprint and physical storage receipts. It does not scan the transaction corpus; maximum-ID uses the existing identity index.
- `staged-execution.ts`: an approved snapshot envelope additionally hashes all execution pins. Actual code/SQL identity, frozen source byte-count/hash, exact approved 2,595 incoming occurrences, all five reviewed retained tuples/remaining leases, durable ledger/checkpoint, schema/cache/context values, limits and final publication identity must agree before connecting. Missing inputs have no defaults.
- `stage-artifacts.ts`: plain PostgreSQL row diff over the existing artifact builder's results, stable integer insert IDs, native JSONB values and owned detail leaf patches. It preserves unknown stored detail roots/siblings. Explicitly owned null/absent summary nodes can be initialized; existing structured nodes remain leaf-patched and unknown siblings survive. Unsupported dictionary removals stop locally. Unchanged caches and MRT JSON do not churn timestamps.
- `staged-code-identity.ts`: hashes actual ingestion/shared/benchmark code and dependency-lock bytes. It never reads `public/data/` or environment values.
- `cache-only-context.ts`: pins the exact persistent coordinate cache, located/omitted HDB sets, skipped amenity keys and cached-route/fallback inventory. No credentials or network calls. The unnecessary token helper was removed.
- `prepare-cache-only.ts`: feeds the actual current artifact builder output through the native adapter and writes exact component/stage hashes to ignored local material plus a public evidence receipt.

The accepted shape stays twenty commands and one COPY stream. If the completed genuine plan has different nonempty table/mutation modes, execution stops before opening a connection and reports that difference for review; it does not hide commands, split an atomic publication or increase a guard.

All stale/failure/success/replay/recovery steps share one command/connection/time/transport-proxy budget and one-use step claims. These claims are currently in-process; no persistent runner or automatic resume is provided. Before an actual remote sequence, its exact envelope and receipt persistence must be frozen. Both client deadline and PostgreSQL 18 `transaction_timeout` are set. The server also enforces statement, lock and idle-transaction timeouts within the existing settings command. PostgreSQL documents these [transaction/session timeout settings](https://www.postgresql.org/docs/18/runtime-config-client.html).

Protective ceilings are COPY 90,000,000 bytes, stage item 1,000,000 bytes, temporary relation 256 MiB, and remaining project storage at least 256 MiB. Exact smaller limits and durable-growth/other-branch reserves are mandatory. Loaded and final pre-COMMIT database/temporary storage receipts are checked. Temporary size remains an admission check after COPY, not a proven peak-disk limit during COPY; estimating that upper bound is an unresolved executable-envelope gate. Failed/rolled-back work still consumes transfer/compute and may leave physical dead space.

Socket counters are **stream-byte proxies**, never Neon billing. The compute upper proxy requires a pinned endpoint maximum CU, the sequence wall cap and idle tail; provider consumption remains UNKNOWN. Existing two-full-reconciliation-pass transfer reserve **987,415,848 bytes** is retained. Neither pass was repeated to manufacture a forecast.

Corrected-source validation: Node **24.15.0** `node_modules/.bin/vp run check` passed, with **1,964 tests in 196 files**, including **71 staged/cache-only/native-adapter tests**. Format, lint, typecheck, boundary/build/bundle checks passed; only the two pre-existing UI lint warnings remain. Receipt/log hash are recorded in `docs/evidence/neon-staged-execution-2026-10-04.json`. Tests use transport/model receipts and tracked public fixtures; they do not establish actual PostgreSQL syntax, locking, rollback, COPY resource behavior or performance. Independent full rereview found no remaining High/Medium issue after fixing new-detail ID parity, disappearing generated keys and dotted-key ownership aliasing. Prepared code-byte pin matches the final local source. The earlier 1,957/64 gate is retained as historical evidence only.

## Pinned retained inputs

Local public snapshot remains read-only at `.neon-benchmark/source.sqlite`. Target remains project `wispy-mouse-67963002`, isolated branch `benchmark-d1-migration` / `br-wispy-boat-b34glczl`; no connection or new resource was created.

| Input                                              | Current evidence                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Git branch / HEAD                                  | `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`    |
| Predecessor manifest SHA-256                       | `fe8332dc7e95f89d401c036065bec451f44bc4284f6cb8bb4f8c59bf818f2a2b`                 |
| Baseline maximum transaction ID                    | 985,533, read from retained local snapshot                                         |
| Approved incoming occurrences                      | Exactly 2,595; original one-time source review unchanged                           |
| Retained unresolved IDs                            | 550818, 601171, 934839, 955489, 959788; original tuples/remaining leases unchanged |
| Active raw CSV bytes / SHA-256                     | 23,928,760 / `9835dfe6cd92a46a1302fabf3a692bf893ee5b86ec95638d10dfce61dbfbdb9a`    |
| Active canonical multiset SHA-256                  | `88b6c6252b2329edcb9856491cec5d05f5ca92f1340640ed90291fe2c7466356`                 |
| Positive multiset SHA-256                          | `675832229ab451be4d5aed5e4b611ef310a0f2f3072969dd664bb7dc7a599dee`                 |
| Retained geocode / route rows                      | 10,333 / 0; captured locally, including stored timestamps                          |
| Six raw context bodies                             | Retained 2026-10-04 capture; all body hashes verified locally                      |
| Final normalized context / stage / target manifest | Context and stage pinned locally; final execution publication identity pending     |

Prepared public input files and raw-hash receipt live under ignored `.neon-benchmark/staged-inputs/`. No shortlist content was read or copied. No additional million-row Neon/D1 scan was performed.

## Corrected cache-only policy

The prior requirement to configure a token and resolve all 307 missing geocodes was an incorrect migration gate. It is superseded, including the earlier routing-choice request. Historical successful refreshes tolerated approximately 271 unresolved HDB addresses and 21/478 supermarket skips. No zero-unresolved invariant exists in the current pipeline.

Persistent `geocode_cache` is authoritative for this snapshot. Transactions and town/type trends retain facts with unresolved coordinates; the builder omits those addresses from blocks, details and comparisons. Unresolved schools/supermarkets are skipped by the existing normalizers. Retained routes are reused; missing pairs use the current `round(straight-line meters / 1.25)` fallback. No coordinates or route observations are invented, and no OneMap credentials or calls are needed.

The corrected local receipt pins all six captured official input hashes, complete retained cache values/timestamps, exact source/located/unresolved address sets, skipped amenity keys, existing nearest-station route/fallback pairs and the actual builder component hashes. See [cache-only stage receipt](../evidence/neon-cache-only-stage-2026-10-04.json). Historical raw context/skipped-key bytes were not retained, so matching historical supermarket **counts** does not prove exact skipped-key identity. Original historical transaction bodies remain explicitly retained, not recaptured.

## Actual prepared cache-only envelope

The exact local source retains the five reviewed unresolved occurrence IDs, inserts **2,595** facts and produces **988,128** stored transactions. It has **10,016** source addresses: **9,730 located**, **286 unlocated**. All **271** baseline unlocated addresses remain; exactly **15** source addresses newly lack coordinates. Incoming facts contain **83** transactions across **41** unlocated addresses, including **33** facts at the fifteen new addresses. Those facts remain in transactions/trends; their block/detail/comparison artifacts are omitted under the current pipeline policy.

The captured supermarket file resolves **457/478** rows and skips the exact twenty-one keys in the receipt; **179** primary schools resolve with zero skips. Historical supermarket skip count matches, while historical exact skipped-key identity remains UNKNOWN because the original raw file/key list was not retained. The unchanged **10,333 geocode / zero route** cache is pinned by canonical hash `244bf64cc6f32ddc236ebebe217ea48949c3818c17fc66f41a1fa0867d39246c`. The **29,190** address/station pairs (**29,187** distinct keys) all use the established fallback, with zero route requests.

| Group                       | Inserts | Updates | Deletes |
| --------------------------- | ------: | ------: | ------: |
| Transactions                |   2,595 |       0 |       0 |
| Blocks                      |       0 |   4,409 |       0 |
| Details                     |       0 |   4,424 |       0 |
| Comparisons                 |       0 |   9,640 |       0 |
| Trends                      |     202 |      62 |       0 |
| MRT / geocode / route cache |       0 |       0 |       0 |
| Manifest, last              |       0 |       1 |       0 |

The stage has **21,332 rows**, **83,671,356 canonical payload bytes** and **83,809,574 encoded COPY text bytes**, root `e4bebf1d29e3037e3b06585e21c77807898875f29026c7d0622d9a6ab4333b69`. The initial equivalent CSV encoding measured **93,281,942 bytes**, exceeding the existing cap. PostgreSQL's documented [text COPY format](https://www.postgresql.org/docs/18/sql-copy.html) avoids JSON quote doubling; backslashes are escaped for COPY, canonical JSON already escapes controls. This minimum packaging change preserves one stream, twenty commands, the same wire-root hash and the unchanged **90,000,000-byte ceiling**. Local control/Unicode/delimiter tests pass; actual PostgreSQL decoding is still a remote test gate.

The native adapter now mirrors current presentation-ID retention (including legitimate equal occurrences and new details), preserves unknown nested siblings and rejects disappearing generated keys. Null/absent schema-owned objects may be initialized with exact before-state pins; existing objects remain leaf-patched. Path ownership uses arrays, so dotted dictionary keys cannot alias nested paths. Prepared artifact hashes reflect actual builder/publisher output, with the raw builder detail hash separately recorded before presentation-ID retention. No hypothetical all-geocoded artifacts are substituted.

Detailed per-table key/before/after/payload/ordinal hashes, all six raw context hashes, normalized context hash, resolution-set hash, exact artifact hashes and draft manifest hash are in the [receipt](../evidence/neon-cache-only-stage-2026-10-04.json). Large public material and the COPY text file stay ignored under `.neon-benchmark/staged-inputs/cache-only/`; no private shortlist content is included. Draft manifest identity is intentionally distinct from the final publication ID, which must bind admitted execution pins.

## Remaining remote gates

1. Freeze and review the prepared cache-only snapshot's exact derived counts/keys/before-after hashes, artifact hashes and target manifest. Pin the omissions and fallback inventory; do not request credentials or new geocode results.
2. Confirm that the native mutation modes retain the accepted twenty-command shape. The final publication identity remains pending until actual execution pins are admitted; local preparation alone does not authorize a remote write.
3. Acquire a bounded schema/writer/endpoint/project-storage observation, freeze exact temporary/durable growth and shared whole-sequence resource bounds, and persist the one-time execution receipt. Do not wake compute just to repeat lagging usage counters.
4. Finish the exact approved stale-rejection, injected failure/complete rollback, success/manifest-last and no-op replay sequence. PostgreSQL syntax and resource behavior remain untested remotely for this new publisher.
5. Request action-time approval for the exact temporary Worker/Hyperdrive/access settings before recreating them. Use the existing isolated SELECT-only runtime role; preserve production secrets. The parent's browser agent can inspect Console tooltips; this Mac execution toolset has no browser tool.
6. Verify new-version cold/warm Worker behavior, record unknown or lagging provider totals honestly, then delete temporary resources. The benchmark branch/evidence remain retained.

No new Neon viability verdict or schedule/cutover certification follows from this local checkpoint. The genuine conditional verification remains pending remote schema/resource admission and approval of the corrected exact envelope. Cache-only omissions are not a blocker.
