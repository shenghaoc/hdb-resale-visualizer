# Proposed Neon staged publication — no retry authorized

**Policy correction:** the initial complete-geocoding requirement below was superseded. The supported cache-only pipeline tolerates pinned unresolved addresses/amenity skips and existing route fallback. See [corrected execution checkpoint](neon-staged-execution-2026-10-04.md) and [actual cache-only stage](../evidence/neon-cache-only-stage-2026-10-04.json). Existing D1 guards remain unchanged.

Replace the Neon benchmark publisher's translated/chunked DML with a small PostgreSQL staging adapter. Keep the D1 compiler, D1 runtime, migrations and 25,000 index-operation guard unchanged. The new path measures **logical mutations per table, input bytes, storage, transfer and active compute**, rather than treating D1-style index operations as Neon billing. This is a proposal with an offline prototype; no database calls or resource creation occurred in this design stage.

## Exact catch-up facts and unresolved envelope

The approved source decision remains [the existing review](../evidence/neon-reconciliation-review-2026-10-04.json): exactly **2,595 incoming occurrences**, all five missing IDs **550818, 601171, 934839, 955489, 959788** retained with their original tuples/remaining leases. The July and September facts stay independent. No transaction correction or deletion is supported. Reuse the exact multiset reconciler and stable-ID allocator; never deduplicate legitimate equal tuples or allocate IDs by database defaults during publication.

Raw active CSV SHA256 is `9835dfe6cd92a46a1302fabf3a692bf893ee5b86ec95638d10dfce61dbfbdb9a`; canonical active multiset SHA256 is `88b6c6252b2329edcb9856491cec5d05f5ca92f1340640ed90291fe2c7466356`. Positive-occurrence SHA256 is `675832229ab451be4d5aed5e4b611ef310a0f2f3072969dd664bb7dc7a599dee`. Baseline manifest SHA256 is `fe8332dc7e95f89d401c036065bec451f44bc4284f6cb8bb4f8c59bf818f2a2b`. Preserve full eleven-field multiplicities, occurrence IDs and retained-count/tuple pins, not just these scalar counts. The baseline manifest **exists**; its missing `syncBuildState` makes this an explicit **bootstrap plus catch-up**, not an ordinary monthly sample.

| Mutation group         | Approved catch-up facts                                | Existing-cache candidate, insert/update | Final exact envelope                                       | Routine automatic limit now                                    |
| ---------------------- | ------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| transactions           | 2,595 inserts; 0 updates/deletes                       | 2,595 / 0                               | Source approval exact; bind assigned IDs and full tuples   | 0 publication; existing source hint guard still 1,000 and 0.5% |
| blocks                 | At least 4,228 own-source price/count updates required | 0 / 4,409                               | UNKNOWN until context/cache outcomes resolved              | 0; manual review                                               |
| block_details          | Preserve owned paths and stable recent IDs             | 0 / 4,424                               | UNKNOWN                                                    | 0; manual review                                               |
| comparisons            | Preserve actual dependency/invalidation result         | 0 / 9,640                               | UNKNOWN                                                    | 0; manual review                                               |
| trends                 | Exact town/type/month keys                             | 202 / 62                                | UNKNOWN                                                    | 0; manual review                                               |
| MRT                    | Captured MRT logically equals baseline                 | 0 / 0                                   | UNKNOWN; verify final normalized identity                  | 0; manual review                                               |
| geocode/routing caches | Publish staged successful outcomes atomically          | 0 / 0 offline only                      | UNKNOWN, not approved zero                                 | 0; manual review                                               |
| manifest               | One final update, unchanged ledger semantics           | 0 / 1                                   | Freeze final bytes, checkpoint, version and publication ID | 0 without an admitted publication                              |
| shortlist              | Never ingestion-owned                                  | 0 / 0                                   | Always excluded                                            | Always excluded                                                |

The **40,371 / 214-statement legacy candidate is rejected by the unchanged D1-style guard**. Its cache-only output is supported: 21 missing supermarket cache keys and 286 transaction addresses without geocodes are pinned skips/omissions, not required new requests. Six current raw context captures are verified; historical transaction bodies are retained. The new native envelope remains proposed pending exact artifact/stage review and remote schema/resource admission. Additional geocoding or routing would be a different snapshot, not a prerequisite.

Each envelope binds project/branch, algorithm/schema/index/trigger ownership fingerprint, baseline manifest and source-state hash, baseline maximum ID, raw/canonical/positive source hashes and counts, every unresolved ID/tuple/count, raw and normalized context/cache-result hashes, rolling-window bounds, per-table insert/update counts, target-key digests, before/after or owned-path digests, payload/COPY bytes, and final manifest bytes. All removals are zero. Equal counts with different keys or values fail. The publication ID hashes the frozen envelope identity **excluding its final-manifest hash**; embed that ID in the manifest, then pin the final manifest hash separately to avoid a circular hash.

## One temporary table, one direct session

Use the already-present `pg` and `pg-copy-streams` on one dedicated **direct** connection for the complete transaction. No new persistent table, ORM, function or service is needed. Keep a bounded canonical COPY text file locally before connecting; stream it rather than accumulating production-scale data in memory.

```sql
CREATE TEMP TABLE neon_publication_stage (
  ordinal integer PRIMARY KEY CHECK (ordinal > 0),
  wire text NOT NULL CHECK (octet_length(wire) <= 1000000),
  item jsonb GENERATED ALWAYS AS (wire::jsonb) STORED,
  CHECK (jsonb_typeof(item) = 'object')
) ON COMMIT DROP;
CREATE UNIQUE INDEX ON neon_publication_stage
  ((item->>'table'), (item->'key'));
COPY pg_temp.neon_publication_stage(ordinal, wire)
  FROM STDIN WITH (FORMAT text, ENCODING 'UTF8');
```

An item contains its table, operation, exact typed key, before-values and changed after-values, or ordered owned detail paths. Inserts contain complete rows. The unique join key prevents ambiguous `UPDATE FROM`. Text keys must be actual strings; transaction IDs are safe integers. Typed `jsonb_populate_record(NULL::public.table, ...)` casts both writes and expected receipt values, including timestamps. SHA256 leaf hashes over raw canonical `wire`, aggregated in ordinal order, authenticate the loaded stage without concatenating megabytes of JSON. PostgreSQL provides these [binary hash functions](https://www.postgresql.org/docs/18/functions-binarystring.html).

Temporary tables are session-scoped and `ON COMMIT DROP` removes them on success; rollback of their creation or disconnection removes them on failure. Never load in autocommit or return the connection to a pool between COPY and publication. COPY is [client-streamed input](https://www.postgresql.org/docs/18/sql-copy.html), not a server file import. Temporary data and indexes still consume compute/disk; this is not a free staging-storage assumption. See [temporary table semantics](https://www.postgresql.org/docs/18/sql-createtable.html).

## Atomic protocol and complete statement count

The sequential protocol is:

1. Read manifest for an exact already-applied receipt: return **zero mutations** if it matches. Do not churn timestamps. A different baseline fails before staging.
2. `BEGIN`; one settings statement; CREATE; unique index; COPY; ANALYZE.
3. Lock the existing manifest row `FOR UPDATE` **before** locking other publication tables. Recheck full baseline or exact already-published receipt. Then one `LOCK TABLE` covering the eight ingestion tables in a fixed order, `SHARE ROW EXCLUSIVE`. SELECT readers continue; shortlist is excluded. Every ingestion writer must take this manifest-row guard before writing and advance the epoch last. Table locks prevent overlapping target writes; they do not retroactively detect rogue writers that bypassed the version protocol. Verify grants/writer inventory before enabling this path. No advisory-lock cooperation assumption is needed.
4. One stage digest/storage validation statement; one bounded target precondition validation statement. Require exact stage root/rows/bytes, valid typed keys/values, unique joins, insert-key absence, unchanged before-values/owned-path presence, baseline max-ID/retained tuples, and zero unsupported operations. Source parsing/reconciliation happens locally before the transaction; do not rebuild a stale plan inside the publisher or reread a million rows to manufacture a forecast.
5. Run one `INSERT ... SELECT` and/or one `UPDATE ... FROM` per nonempty table/mode. No `ON CONFLICT DO NOTHING`: a collision is a failure, not hidden replay. Sparse CASE assignments retain unspecified column values and skip unchanged rows. This changes the SQL SET target list; require the reviewed no-trigger/schema fingerprint, and measure HOT/index/WAL behavior rather than promising that unchanged indexed values cost nothing.
6. Each DML uses `RETURNING` inside a CTE, verifies actual keys/values against staging and returns only count, ordinal-key digest and result-match status. A mismatch rolls back. Then one final aggregate read validates all planned final target results and five untouched retained occurrences.
7. One final manifest UPDATE with frozen version, ledger/checkpoint and publication receipt; `COMMIT`.

| Commands                                                                                         |                                                       Count |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------: |
| Initial manifest read                                                                            |                                                           1 |
| BEGIN, settings, CREATE, unique index, COPY, ANALYZE                                             |                                                           6 |
| Locked manifest, target table locks                                                              |                                                           2 |
| Stage digest/storage, target preconditions                                                       |                                                           2 |
| Candidate table/mode DML: transactions, blocks, details, comparisons, trend insert, trend update |                                                           6 |
| Final result aggregate, manifest, COMMIT                                                         |                                                           3 |
| **Candidate shape total**                                                                        | **20 statements / 20 awaited round trips, one COPY stream** |

All fifteen possible nonempty insert/update modes would use **29** total commands. Empty groups are skipped. This is an expected design count, not measured latency. COPY has many protocol frames; auth/TLS, reconciliation queries, failure ROLLBACK and recovery reads are additional. Any extra diagnostic query must be counted. The 214 legacy count excludes BEGIN/COMMIT, so compare accounting boundaries explicitly.

## Detail ownership and recovery

Keep unknown stored roots and nested siblings. Structured summary objects become reviewed **leaf path** patches; never replace an entire coordinates/summary object and discard a future key. Arrays owned by this builder (`monthlyTrend`, `recentTransactions`, and explicitly schema-owned array fields) remain atomic values; use the existing stable occurrence-ID builder. Missing/null parents, overlapping paths, unsupported whole-object changes or an unowned path fail before DML. New leaf fields distinguish absence from JSON null. Current adapter admits explicitly owned null/absent-to-object initialization with exact before-state pins; existing objects stay leaf-patched. Unsupported dictionary removals fail closed. A compact recursive CTE applies each row's ordered `jsonb_set` patches, preserving siblings.

Before-COMMIT failures—including interrupted COPY, constraint errors, affected-count mismatch, stale version or injected pre-manifest failure—roll back the entire transaction. Discard a broken connection; never commit a partly failed transaction. On a lost COMMIT response, close that session and read the authoritative manifest using a fresh connection. Exact publication ID **and complete manifest** match means committed and no-op. Exact old baseline means only retry-eligible: reacquire the manifest lock and recheck after any in-flight commit completes. Any other version or unavailable read remains unknown/manual reconciliation. Never blindly retry COMMIT or allocate another set of occurrence IDs.

## Resource and routine policy

Proposed physical ceilings, distinct from monthly mutation calibration: retain the **1 MB item / 90,000,000-byte aggregate** restraint; pin the actual smaller COPY bytes and exact rows in the reviewed envelope. Proposed server limits are **120 s per statement, 10 min transaction, 5 s lock wait, 30 s idle-in-transaction**, with a matching client wall deadline and COPY cancellation. PostgreSQL documents [these timeout controls](https://www.postgresql.org/docs/18/runtime-config-client.html). Fail if its required permission/setting cannot be enforced. Temporary relation ceiling proposed **256 MiB**, and require **256 MiB remaining project storage** after a measured/reserved durable-growth envelope. These are protective design choices, not demonstrated sizing; temp accounting and durable/TOAST/index/dead-tuple growth must be measured on the isolated branch before acceptance. Stop on an insufficient reserve rather than enlarge it to fit.

Retain the existing complete **two-pass received-byte planning reserve of 987,415,848 B**, plus publication receipts/cache/runtime and pending-meter reserves. Staging does not solve reconciliation egress. Current provider consumption/as-of and actual billed CU-hours remain unknown; stream counters and active-time ceilings are proxies. Keep the earlier 25-minute/1-CU total pilot ceiling and account/project storage limits; do not count temporary tables as an exemption from Free resource gates.

There are **zero independent genuine monthly snapshot intervals**. The +134 scenario, window-rollover cases, initial bootstrap and this catch-up do not establish routine monthly percentiles or safe per-table caps. Accordingly routine **automatic publication limits are zero for every mutable group** until calibrated and approved. The existing 1,000/0.5% source preflight remains a protective tripwire, not evidence of legitimate monthly volume. Record independent source intervals, window-only changes, context-only changes, per-table counts/bytes, storage/WAL, transfer/CU and runtime baseline; review caps separately. Until then every nonzero publication requires its own exact manual envelope. No monthly schedule is proposed.

## Prototype evidence and remaining work

[staged-plan.ts](../../scripts/neon-benchmark/staged-plan.ts) is inert: canonical packing, strict envelope comparison, proposed SQL generation and small receipt checks. [Tests](../../tests/unit/neon-staged-plan.test.ts) cover key/payload drift with equal counts, source multiplicity, duplicate joins, retained IDs, stale/replay decisions, nested sibling preservation, staging bounds and unchanged D1 refusal. In-memory rollback/interruption/concurrency/lost-ack witnesses test the contract only. They **do not prove PostgreSQL COPY, locks, SQL syntax, transaction rollback or performance**. No local PostgreSQL executable was available; no server was installed or contacted.

Independent review identified typed-key collisions, timestamp receipt casting, object-path replacement, circular publication IDs and mixed insert/update receipt digests; these were corrected. Final reread found no remaining High/Medium issue within this inert proposal/prototype scope. Mode receipts retain the original global staging ordinals, so trend inserts and updates are checked separately.

Node **24.15.0**, `vp run check`: **1,917 tests / 193 files passed**, formatting, lint, typecheck, local build, boundary and bundle checks passed. Only the two existing UI stringification warnings remain. The initial build hit the sandbox's tsx IPC restriction; the final gate passed through the supported local permission path. Focused staged-plan tests: **24 passed**.

Historical prototype checkpoint: the streaming adapter and validators were unwired at the original proposal time. The [current execution checkpoint](neon-staged-execution-2026-10-04.md) implements those pieces locally; remote PostgreSQL/resource verification remains pending. Reuse the existing reconciliation/dependency builders and retained baseline snapshot to emit structured before/after mutation material; do not introduce another source reconciler or another remote full read. Do not reuse timestamp churn or permissive SQL casts as changes. COPY's byte/row/time bounds are enforceable in the client; the temporary-relation size check is an admission check before durable DML, not proof of a peak-disk bound during COPY. A safe pre-load footprint bound and Neon temporary-storage accounting still need verification before admission.

The prior complete-geocoding prerequisite is withdrawn. Exact cache-only prepared material is now the relevant envelope; its review and remote schema/resource evidence remain prerequisites. Next implementation should be this small adapter and focused isolated SQL tests after approval, not a D1 refactor, higher generic write cap or production cutover. **No retry is authorized by this proposal.**
