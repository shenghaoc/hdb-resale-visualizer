# Reversible Neon public-data cutover plan — 2026-10-05

**Isolated COW candidate created and verified; production still uses D1.** The authorized child `production-candidate-20261005` / `br-rough-frost-b3e2ks1b` starts from the exact verified **988,128-transaction / 45,028-trend current benchmark state**. Full public-row/column hashes, manifest, schema and identity sequence match. Project synthetic storage remains 452,173,824 B before/after fork. The locally implemented selector covers all database-backed public reads, including comparable POSTs; private shortlist persistence stays on D1. This phase created only the isolated child and a max-1-CU Singapore endpoint, then issued 11 read-only verification commands plus one explicitly requested catalog SELECT to verify persistent defaults. No SQL data/grant/password/role-default change, Hyperdrive/Worker provisioning, production setting, application deployment, cutover or schedule activation occurred.

The earlier D1-aligned bootstrap proposal is superseded. There is no independent import into the empty Neon branch named `production`, benchmark removal, older-snapshot substitution, promotion, rename, reset or branch-identity swap. This document replaces the existing Library plan identity. The [configuration patch](../evidence/neon-production-cutover-config-2026-10-05.patch) remains unapplied.

## 1. Preserved implementation and exact targets

Git branch `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`. Existing uncommitted D1/Neon work is retained. The [companion receipt](../evidence/neon-production-cutover-plan-2026-10-05.json) records admission and final status; [local comparable evidence](../evidence/neon-comparable-local-2026-10-05.json) contains SQL, plans, timings, byte measurements and witnesses.

| Identity                        | Value                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Project                         | `wispy-mouse-67963002`, AWS Singapore, PostgreSQL 18, Free v3                   |
| Existing primary/default branch | `production` / `br-broad-credit-b3bz9b61`; preserved                            |
| Verified parent                 | `benchmark-d1-migration` / `br-wispy-boat-b34glczl`; preserved                  |
| Existing benchmark endpoint     | `ep-steep-moon-b35xjj4d`; read-only current-head admission completed            |
| Verified isolated serving child | `production-candidate-20261005` / `br-rough-frost-b3e2ks1b`                     |
| Candidate endpoint              | `ep-steep-water-b300tebo`; Singapore, 0.25–1 CU, default five-minute suspension |
| Retained production D1          | `DB`, `df06858c-8fd3-4cf5-9080-dbd9a9f49250`                                    |
| Existing Neon setup             | CLI 8.0.4; private uploads declaration already provisioned                      |

Keep the nine frozen publisher files and original GET adapter/compiler/cache unchanged. Publisher code SHA-256 `e211c4cbf647f143c80a5eb1a69b0b070f293a95c3515d855cda1310e4758b91`; SQL SHA-256 `2076f556758d1f49090c16ab8e215e62454ec62924a424e037624704f4416f8e`. The new runtime GET compiler is a byte-identical copy of the frozen pure compiler, SHA-256 `bd9eb6651a19e6d6d45426a0f58e14113138d99363b580eeceb269d7305c154e` (the companion receipt is authoritative for exact file digests). Runtime extensions are separate modules. No D1 migration/schema or ingestion semantics changed.

| Public object         |       Candidate starting rows |                D1 rollback rows |
| --------------------- | ----------------------------: | ------------------------------: |
| transactions          |                       988,128 |                         985,533 |
| blocks                |                         9,730 |                           9,730 |
| block_details         |                         9,730 |                           9,730 |
| comparisons           |                         9,730 |                           9,730 |
| town_flat_type_trends |                        45,028 |                          44,826 |
| geocode_cache         |                        10,333 |                          10,333 |
| walking_time_cache    |                             0 |                               0 |
| mrt_geojson           |                             2 |                               2 |
| manifest              | 1, verified newer publication | 1, unchanged Aug-29 publication |

Starting publication ID: `4794aa04f6c990fbe5fb6e4ba24b433ac84bebb294bf5b7ab7cbd91959244b0f`. The retained source plus exact successful stage reconstructs current head locally; local affected-row witnesses and all 4,424 updated detail native digests match the successful remote receipt. Fresh remote parent/child snapshots now independently verify **all public rows/columns**, manifest and schema against the current published head. The [COW receipt](../evidence/neon-cow-candidate-2026-10-05.json) records the actual point-in-time fork, counts, hashes, role privileges and storage. No older snapshot or independent import was used.

No production private shortlist contents were exported, read or imported. The prototype shortlist tables on the benchmark are empty; the child inherits that empty schema. Runtime private user persistence continues solely on D1. Preserve stable integer transaction identities and legitimate duplicate multiplicity; public source facts remain non-unique.

## 2. Completed isolated copy-on-write operation and equality proof

Use Neon's branch-first API, **not a full data COPY/import**. Current official [create-branch reference](https://api-docs.neon.tech/reference/createprojectbranch) and [OpenAPI](https://neon.com/api_spec/release/v2.json) expose this operation:

```http
POST https://console.neon.tech/api/v2/projects/wispy-mouse-67963002/branches
```

```json
{
  "branch": {
    "name": "production-candidate-20261005",
    "parent_id": "br-wispy-boat-b34glczl",
    "parent_lsn": "0/31BC8180",
    "init_source": "parent-data"
  }
}
```

The exact request above was recorded before dispatch and returned **HTTP 201**, child `br-rough-frost-b3e2ks1b`, matching parent and LSN. No endpoints were included in the fork request. Explicit `parent_id` avoided the nearly empty default branch. A fresh read-only repeatable-read parent snapshot verified all public counts/hashes, manifest, schema, sequence and no other active client before recording `pg_current_wal_lsn()` at **0/31BC8180**. Parent branch metadata's older `parent_lsn` is not its current head. No automatic mutation retry was used.

One bounded branch read-back confirmed ready/non-primary/non-default and the exact parent/LSN. The original `production` remains primary/default; benchmark identity and contents remain preserved. No operation polling or POST retry was necessary. Any future ambiguous create outcome must be reconciled by unique name plus parent/LSN before a retry; do not repeat the completed creation.

The authorized verification endpoint was then created with **HTTP 201**, returned ID `ep-steep-water-b300tebo`, using this candidate-only body:

```http
POST https://console.neon.tech/api/v2/projects/wispy-mouse-67963002/endpoints
```

```json
{
  "endpoint": {
    "branch_id": "br-rough-frost-b3e2ks1b",
    "region_id": "aws-ap-southeast-1",
    "type": "read_write",
    "autoscaling_limit_min_cu": 0.25,
    "autoscaling_limit_max_cu": 1,
    "suspend_timeout_seconds": 0,
    "name": "hdb-production-candidate",
    "pooler_enabled": false
  }
}
```

Endpoint read-back confirms the exact child, Singapore region, 0.25–**1 CU**, direct connection and suspend_timeout_seconds=0 (Free default five-minute idle policy). The project default is actually 2 CU, so the explicit 1-CU cap matters. Existing benchmark owner/runtime passwords were reused in memory on the child endpoint; no credential API, new password, credential file, role or grant was required. No Auth, Data API, Functions, AI Gateway, uploads changes, Paid protection, replica, promotion or rename occurred.

Parent and child passed pinned read-only snapshot equality for all nine public tables: counts and hashes of **every row/column**, maximum stable transaction ID 988,128, complete schema/index definitions, manifest/publication ID and identity-sequence state. SHA-256 leaf hashes use PostgreSQL 18 native JSONB serialization and explicit C-collation ordering, preserving duplicate multiplicity. SQL returned only small server-side aggregate receipts; no corpus download or reconciliation was repeated. Three connections, **11 commands**, **56,088 received / 17,524 sent PG proxy bytes**, 57,617.264 ms summed active connection wall time. At max 1 CU plus two five-minute endpoint tails, the upper compute proxy is **0.182672 CU-hour**, inside the 0.5 startup reserve. It is not a provider billing measurement. Frozen publisher/GET/cache/runtime/test hashes remain unchanged.

Identity sequence was inherited exactly: last_value=985533, is_called=true, although explicit transaction IDs reach 988128. The frozen publisher supplies stable IDs explicitly. Do not admit future generated-ID inserts at this stale sequence; a future writer must retain the explicit allocator or separately review a sequence reconciliation. No sequence mutation was made.

## 3. Unique storage admission

Fresh CLI/API project reads before fork, immediately after fork, and after equality verification all report **452,173,824 B of 1,073,741,824 B**, or **42.112%**, headroom **621,568,000 B**. The post-verification capture at 2026-10-05 09:05:01 UTC has provider project updated_at 09:04:01 UTC. Reported unique storage delta is **0 B**. Both parent and candidate separately expose 452,173,824 B logical size; each pg_database_size is 428,130,304 B. Those distinct metrics are not interchangeable and two visible logical copies must not be summed as unique consumption. The empty default branch retains 31,686,656 B visible logical size. D1 production remains 460,922,880 B. All before/after identities and API receipts are retained.

A COW child of the filled benchmark initially shares its existing pages. Its visible logical/database size can resemble the parent without consuming another independent 452-MB corpus. Neon counts root logical size and child storage using its branch-delta rules; **do not sum two logical database sizes as billed unique storage**. Branch history and later divergences still count. [Branching](https://neon.com/docs/introduction/branching), [storage accounting](https://neon.com/docs/introduction/plans#storage).

Observed API-reported project synthetic storage stays unchanged across the COW fork and read-only verification. This confirms the reported storage admission, not exact zero catalog/WAL/history writes or permanently zero growth. No role settings/grants were changed. Written-data/compute/transfer API counters still return zero and remain unsuitable as live consumption evidence. The pre-dispatch **16-MiB** unique setup reserve leaves **604,790,784 B** above the retained **256-MiB** minimum; the observed reported delta is inside that reserve. Re-admit after any later catalog or data changes and allow for meter lag.

Preserve both the filled benchmark and original `production` branch. No deletion is needed to force two independent copies to fit. Future candidate publications can diverge from preserved parent pages and retain history; admit that actual unique delta plus stage/dirty-page/WAL/growth effects. The frozen stage, durable-growth and 256-MiB headroom guards remain. A future production-target admission must account for this parent chain explicitly and can reject a publication. Current COW fit does not authorize continued growth or scheduling without re-admission.

## 4. Local public-read integration

Implemented locally in `worker/neon-read-db.ts`, `worker/neon-transport.ts`, `worker/public-read-backend.ts`, plus router/OG/Env integration. Existing frontend hosting, handler bodies/scoring and public API contracts remain. `PUBLIC_DATA_BACKEND` defaults to D1 and is captured once at request entry. Invalid selector/epoch/missing Neon binding fails public configuration. There is no per-request failover or mixed D1/Neon query path.

| Work                                      | When Neon selected                                               | Rollback selector D1               |
| ----------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Ten public GET endpoints                  | Frozen finite SQL compiler + lazy selected connection            | Original D1 handler queries        |
| HEAD, Cookie/Authorization GET            | Same selected Neon DB; shared-cache bypass                       | Same original D1 semantics         |
| Comparable POST, optional time adjustment | Native finite SELECTs; one read-only repeatable-read transaction | Entire original D1 comparable path |
| SEO, OG, sitemap public reads             | Same captured Neon DB, namespaced public caches                  | Entire D1 public path              |
| Shortlist GET/POST and TTL cleanup        | D1, original limiter/privacy/write policy                        | D1                                 |
| Static assets/SPA/invalid methods         | Existing paths; no unsolicited database read                     | Existing paths                     |

Comparable SQL preserves the existing handler's three scope counts, selection thresholds (block/street >=8; town >0), selected **150-row** cap, unchanged scoring and **30-comparable** output cap, and full time-adjustment history for up to 30 unique pairs. Stable integer IDs are returned as strings. Equal-month rows explicitly order by ID to reproduce the current SQLite index/rowid visitation; duplicates retain separate IDs. Trend-query failure retains raw-price fallback and caveat. No snapshot substitution, approximate count, summary-only comparables or new deletion/correction semantics.

A valid nonempty POST uses 4 SELECTs, or 5 with trends, plus BEGIN/COMMIT: **6 or 7 successful-request commands**. Empty results use 3 SELECTs plus controls (five commands); invalid input opens no connection and executes zero SQL. **Failure-inclusive maximum is eight command attempts:** a failed COMMIT or ROLLBACK acknowledgement can invoke one additional ROLLBACK in the existing cleanup path. This is read-only cleanup, not a publication retry. The budget below reserves all eight, whether or not a lost command reached the provider. The request-scoped `pg.Client` opens lazily, uses a 15-second connection limit/60-second query limit, serializes parallel handler counts on one client, pins all comparable queries to `REPEATABLE READ READ ONLY`, and commits/rolls back before close. A caught trend error rolls back the aborted read transaction while preserving the handler's raw-price response. No database write, blind retry, permanent Node pool or health loop is introduced. Server-side role timeout is a provisioning prerequisite, because a client timeout alone does not prove server cancellation.

## 5. Local measurement and request budgets

The retained real public corpus was reconstructed only in a dedicated **local PostgreSQL 18.6** container from the 985,533-row SQLite snapshot plus the exact saved 2,595-insert current-head stage/manifest. No new Neon/D1 quota was consumed. SQL result socket bytes include PG protocol/control receipts; these are transfer proxies, not Neon provider billing. EXPLAIN SQL execution times were measured separately after each response, on warm local buffers. The first local handler invocation includes initialization effects; none is a Singapore Worker/Neon wake measurement.

| Local scope | Adjust | SELECTs | PG received B | Handler + BEGIN/COMMIT ms | Summed EXPLAIN SQL ms |
| ----------- | ------ | ------: | ------------: | ------------------------: | --------------------: |
| Block       | no     |       4 |        23,588 |                    28.366 |                 1.862 |
| Block       | time   |       5 |        50,138 |                     4.691 |                 2.031 |
| Street      | no     |       4 |        23,355 |                     2.428 |                 0.405 |
| Street      | time   |       5 |        48,369 |                     3.210 |                 0.580 |
| Town        | no     |       4 |        24,861 |                     2.076 |                 0.104 |
| Town        | time   |       5 |        33,092 |                     1.858 |                 0.151 |
| Empty       | no     |       3 |           248 |                     1.059 |                 0.016 |
| Empty       | time   |       3 |           248 |                     0.770 |                 0.014 |

The three existing transaction compound indexes serve scope counts/retrieval; small incremental sorts handle explicit ID ties. Matching trend history uses the trend primary key. No new index or schema change was needed. Full plans and buffer hits/reads are in the evidence. Scans of the whole local corpus establish a conservative result envelope:

- Any 150 selected full transactions: **46,786 B** summed PG row-JSON upper bound.
- The largest 30 complete town/flat-type histories: **1,523,693 B**, at most 13,233 trend rows.
- Counts/control/description allowance: **100,000 B**.
- Combined current-corpus POST proxy bound: **1,670,479 B**.

JSON representations include field names/escaping and over-bound native selected-row protocol payload; fixed reserve covers count/control/row descriptions. The value is an engineering bound for this pinned corpus, not an enforced transfer cap or future-data guarantee. Recompute on corpus growth. The maximum public GET bound remains **13,667,516 B**. Therefore the maximum per-public-request envelope does not increase when POSTs join the same traffic population.

HEAD/Cookie GETs and public SEO/OG/sitemap are now explicitly included; they are **not zero-Neon-work**. At 9,730 blocks sitemap uses one bounded block page plus manifest. SEO uses at most one block projection plus manifest; OG uses a manifest and one block/two-town query, or a manifest plus image-cache hit. These selected columns/results are subsets of the full-summary transfer bound. They use <=2 application SELECTs at this corpus, below seven; sitemap paging/query count must be re-admitted past 10,000 blocks. Private shortlist traffic stays on D1. Any excluded traffic source must be added rather than treated as nonexistent.

## 6. Monthly allowance model and live-meter limitation

Use the accepted **166 invocation/month sensitivity** across _all database-backed public requests_ above, including uncached POST/non-API work; it is not a hard traffic cap or complete traffic census. Existing 141 request estimate and 166 sensitivity remain uncertainty bounds. If measured actual public population exceeds it, reassess; do not silently count GETs alone.

Conservative all-cold transfer allocation remains:

`166 × 13,667,516 + 493,707,924 baseline reconciliation + 1,000,000,000 reserve = 3,762,515,580 B`

Headroom is **1,237,484,420 B** against 5,000,000,000 B. Do not add 166 comparable POSTs on top without counting additional invocations. For comparison, 166 all-adjusted comparable requests under their own local bound contribute **277,299,514 B**; replacing GETs with POSTs cannot exceed the common envelope. With one reconciliation and reserve, 256 maximum-envelope public requests fit while 257 exceed: an alert/reassessment sensitivity, not an implemented cap.

At 1 CU, **eight** 60-second command attempts + 15-second connection acquisition + modeled ten-minute Hyperdrive retention + five-minute Neon suspension tail gives 23 minutes 15 seconds per invocation: `166 × (8 × 60 + 15 + 10 × 60 + 5 × 60) / 3600 = 64.325 CU-hours`. One separately admitted monthly job reserve adds 0.25, total **64.575 of 100 CU-hours**, leaving **35.425** before unrelated/already-consumed usage. COW/provisioning/acceptance share an additional **0.5 CU-hour startup reserve**, total first-month sensitivity **65.075 CU-hours** before unrelated usage. Successful comparable requests remain at most seven commands, including BEGIN/COMMIT; the eighth allowance covers failed-acknowledgement cleanup. The earlier 61.808333-CUh seven-command model is a successful-path sensitivity, superseded as the failure-inclusive upper envelope. These are configuration-based upper proxies; Hyperdrive natural idle behavior is not experimentally demonstrated by prior explicit cleanup. No persistent Node pool/open idle transaction/probe loop. All project branches/services share quotas.

Hyperdrive Free account budget is 100,000 SQL/day, resetting **00:00 UTC**. **Eight ×166=1,328 application/control command attempts** if all occur in one day; the successful-path comparison remains seven ×166=1,162. Tenfold sensitivity is **13,280**, below 100,000 but not a measured billing factor. Pool bookkeeping is additional: prior pilot showed 108 server-visible statements versus 74 application SELECTs. Other account consumers must be included. [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/), [connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/).

Current provider remaining compute/transfer is **UNKNOWN**. Saved API zero counters are invalid as live remaining balance. The saved period is 2026-10-01 00:00 UTC to 2026-11-01 00:00 UTC; resolve current period before operations. User screenshots confirm benchmark 0.25–1 CU / five-minute scale-to-zero, but show charts rather than cumulative allowance usage. Export is premium. This task's tool inventory contains no callable Chrome/CUA tool. An attempted native fallback located the Neon tab but returned Chrome error 12 (Apple Events JavaScript disabled). The separately delegated diagnostic confirmed the **supported Chrome extension works**; that error is unrelated to extension connectivity. No browser setting was changed, and no further native scripting is used. Route remaining observational browser reads through the working diagnostic task. No account credentials/cookies/connection strings were inspected. A cumulative UI reading with displayed precision, UTC capture, period and update time is sufficient; no premium export is required.

No repeated remote reconciliation was run: preserve D1's 1,281,644-read measurement and Neon's earlier 219-query / 14.905-second / 493,707,924-byte baseline. Cheap source hint checks remain distinct from expensive reconciliation. Monthly automation remains off pending production target admission and observed post-cutover headroom; no weekly/hint-triggered expensive extra reconciliation is silently added.

## 7. Cache and browser coherence

The original `worker/public-data-cache.ts` is unchanged. A facade prefixes _every_ pointer, response and suggestion-dictionary key with the captured backend/epoch. It retains version hashing, canonical query semantics and before/after manifest guard. Same backend, manifest and semantic query reuse a cache; another backend or epoch cannot read it. Warm pointer+response hit opens no PG connection and performs zero SQL/received DB bytes. HEAD/Cookie/Authorization and comparable POST bypass shared response caching; errors/private/set-cookie/no-store responses are not cached.

OG manifest memoization checks DB identity and backend namespace. The request-scoped Neon shim prevents cross-request/global metadata from leaking across candidate/backend changes; image-cache hits can still incur the explicit OG manifest read. Sitemap/OG keys include selected namespaces. These preserve per-request backend identity, not a claim that every multi-request UI load or SEO/OG read sequence is one PostgreSQL snapshot. Comparable POST alone pins a repeatable-read snapshot; public GET publication-race semantics remain the frozen implementation.

**Pre-flip client requirement still unimplemented:** Workbox NetworkFirst currently times out after **eight seconds**, uses `hdb-api-get-v1` and retains offline API responses for **30 days**. Server cache namespace alone cannot recall those responses. Prepare/test a public-API client cache epoch for first deployment and each rollback. On activation remove only obsolete public API caches; preserve shortlist localStorage, private user data and offline preference state. Newly activated/reconnected clients get the selected backend epoch; older/offline clients cannot be recalled remotely, and may require reload/reconnect. Do not claim worldwide instantaneous freshness. The starting newer Neon snapshot makes this requirement material, unlike the superseded equal-snapshot plan.

## 8. Candidate roles, Hyperdrive and config prerequisites

Fresh parent/child effective-privilege checks and an actual candidate connection prove the inherited **hdb_benchmark_runtime** login already has CONNECT, schema USAGE and SELECT on **transactions**, blocks, block_details, comparisons, town_flat_type_trends, manifest and mrt_geojson. The earlier GET-only list was incomplete; no transaction grant is needed. It has no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges on these tables, no shortlist/geocode/routing reads, no sequence access, no schema/database CREATE, and no superuser/create-role/create-db/bypass-RLS/replication or broad Neon/read-all/write-all membership. Existing credentials work on the child.

One explicitly requested follow-up connected as the inherited role without startup overrides and selected only catalog/settings metadata. It authoritatively reports **default_transaction_read_only=off**, **transaction_read_only=off**, **statement_timeout=0**, role_config=null and no applicable database-role overrides. The earlier verification connection used transient startup options (read-only and 1 minute); those were not persistent defaults. **Serving acceptance is blocked until the following exact candidate-only defaults are authorized/applied/read back.** Before serving, record action-time authorization for exactly these **candidate-only** catalog changes, with no grants/new password/new role:

```sql
-- ONLY br-rough-frost-b3e2ks1b / ep-steep-water-b300tebo
ALTER ROLE hdb_benchmark_runtime SET default_transaction_read_only = on;
ALTER ROLE hdb_benchmark_runtime SET statement_timeout = '60s';
```

They remain unapplied. Reconnect/read back effective role defaults afterward; include their small catalog delta in storage admission. No denied mutation needs to be attempted.

Hyperdrive uses this runtime login on the candidate's **direct** Singapore endpoint, query caching disabled, origin connection limit five. Avoid Neon pooler plus Hyperdrive double pooling. The limit is a provider soft global ceiling, not an experimentally proven global connection cap. Read back target/settings. Writer/admin credentials never enter Worker config, logs, CLI arguments, Library or client assets. Store authorized local secrets only mode-0600 in ignored state. Candidate runtime role changes are small catalog writes and count in COW unique storage admission. Benchmark/default production roles/settings remain untouched.

The unapplied patch proposes only `.gitignore` private production scratch, candidate Hyperdrive placeholder/default-D1 vars and moving existing pg to runtime dependencies. Env types and runtime selector code were implemented locally; the patch does not duplicate those already-applied local changes. Reconcile the lockfile importer when dependency classification is actually approved/applied. Preserve existing D1 binding/assets/compatibility/shortlist limiter. No runtime configuration is changed now; an unresolved Hyperdrive placeholder is not deployable.

The existing Worker cron is private D1 shortlist TTL cleanup. `.github/workflows/refresh-neon.yml` is unpushed and manual/benchmark guarded, not production monthly scheduling. No D1/Neon data refresh workflow is enabled.

## 9. Ordered release and full rollback, each after its own approval

1. Review this revised plan/local evidence and any bounded isolated POST acceptance request. Resolve live usage or explicitly acknowledge bounded meter uncertainty. Complete client cache activation/rollback tests and dependency/config packaging locally. Validate original GET/publisher freeze.
2. **Completed under explicit isolated-resource approval:** current-head LSN-pinned COW candidate and max 1 CU endpoint, all-public logical/schema/manifest/sequence equality and reported unique-storage admission. Preserve child/endpoint, benchmark and default branch. No import/default-branch overwrite or benchmark deletion.
3. Reuse the verified inherited runtime role. Under exact candidate-settings/Hyperdrive action-time approval, apply only the two role defaults above, provision candidate-scoped Hyperdrive with query cache disabled/origin limit five, and read back target/settings. No new grant/password is required. Keep all refresh off.
4. Record live Worker version/config, fallback D1 manifest, candidate manifest, cache epochs/client build and current quotas. Deploy the reviewed integration initially with **D1 selected**, only after separate application-deployment approval. Validate D1 for every public route, including POST/non-API, and private shortlist contracts without exporting/inserting user data. Record this new known-good D1 fallback version.
5. Under separate switch approval, set **Neon** for all public reads in the same reviewed deployment. Use no percent split/per-request error fallback. Run only a bounded acceptance set; existing verified GET paths need not be broadly benchmarked again. Confirm role/target, public counts/manifest/coherence, POST no-store/time adjustment, warm zero-SQL hits, client epoch activation, selected HEAD/Cookie/SEO/OG/sitemap and private D1 isolation.
6. Observe normal traffic usage/error/wake/warm/POP cache locality and natural idle tails without probe loops. Scheduling needs stable comfortable headroom and separately reviewed production publication admission. Cutover alone approves neither schedule nor data writes.

Rollback stops any Neon writer and sets **D1 for all public reads**, including comparable POST, HEAD/Cookie, SEO/OG/sitemap. Deploy the same tested integration with a fresh D1 server cache epoch and client API-cache epoch, or the recorded exact known-good version after verifying provider rollback semantics. Do not substitute an old pre-integration Worker as if it had current cache-epoch behavior. Check D1 manifest, public samples and POST/no-store; private state remains D1. Preserve both Neon branches/resources/evidence for diagnosis; no database reset, deletion or delta replay to D1.

**Freshness consequence is explicit:** rollback returns from 988,128/45,028 to the older frozen D1 985,533/44,826, plus older derived artifacts and its Aug-29 manifest. The 2,595 newer transactions/202 trend rows remain retained in Neon; no corruption/loss of stored Neon facts or mutation of D1 occurs. Each request uses one backend, but deployment propagation, already-running requests and older/offline clients can straddle releases. Client activation/reconnect handling cannot make this globally instantaneous.

## 10. Future publisher and next bounded evidence request

Frozen staged publisher semantics remain authoritative: staged caches, affected dependency sets, detail field ownership, stable identities, source/context/retention/schema/code/SQL/COPY pins, exact mutation witnesses and manifest last in one transaction. Its transport/admission has **benchmark-specific branch guards and the exact approved 2,595-insert envelope**. A candidate URL/credential substitution is not a valid production publisher. Future production-bound admission requires a separately approved target wrapper, schema/grants, unique-storage/quotas and narrower tests while retaining the frozen originals; no generalization is implemented now.

The local new POST path has not been measured from Singapore Cloudflare/Hyperdrive. The COW creation authorization and existing credential reuse do not silently extend the exhausted 32-GET pilot grant. Current recorded authority does not include this **new** bounded POST pilot. If remote acceptance is approved, its exact benchmark-only resource names are `hdb-neon-comparable-pilot-20261005` for one temporary Worker and one temporary Hyperdrive, deleted after completion. The concrete caps remain:

- Existing benchmark only, existing SELECT-only role if its effective transaction SELECT access is sufficient; if not, stop and ask for the exact benchmark grant. No candidate/default production SQL, imports, publications, schema/index/grant changes or production routing.
- One temporary non-production Worker and one temporary Hyperdrive, query cache disabled, origin limit five, benchmark endpoint max 1 CU already configured. Record/delete only those newly created temporary resources; preserve benchmark.
- At most **10 sequential POST requests**: each block/street/town/empty with and without time adjustment (eight), up to two planned repeat/wake/invalid-body requests. No fabricated million-row download or repeated full reconciliation. Current handler caps and one snapshot/client remain.
- At most **90 database commands**, at most 13 connections (three diagnostic plus at most 10 request-scoped clients), **25,000,000 received PG bytes**, **1,000,000 sent bytes**, **five minutes active wall**, and **0.35 CU-hour upper proxy including cleanup/tail** (five minutes active plus ten-minute Hyperdrive and five-minute Neon tails = 0.333334 CU-hours at 1 CU). All phases share one ledger; no budget reset. Metadata/HTTP/control-plane transfers are recorded separately. Reserve **eight command attempts per POST**, including cleanup, and **at most six diagnostic SQL commands** across the three diagnostic connections. Ten ×eight +six =**86 commands**, leaving four inside the unchanged 90-command ceiling for exceptional diagnostic cleanup. Reserve the full request allowance before dispatch; stop instead of starting any request that cannot fit. Diagnostic role/statistics queries are bounded server aggregates and count toward command/byte/time caps.
- Capture per-query shape/count/returned rows/received bytes, total wall/SQL-statistics delta, actual POP, role/target and suspended/warm effects separately where possible. Keep controlled publication failure/version-race injections local, already covered; do not manufacture runtime writes.
- Stop on admission failure, lost outcome/target/role/limit, incomplete cleanup or permission barrier. No blind retry or automatic budget increase. Unknown live allowance does not become zero used.

The optional isolated pilot adds its own 0.35-CUh maximum reserve; combined with the 0.5-CUh candidate startup reserve, the first-month maximum sensitivity is **65.425 CU-hours** before unrelated/already-consumed project usage. Its returned bytes fit inside the existing 1-GB overhead allocation. This is a concrete reviewable request, **not authority to execute it**. It may be unnecessary if the operator accepts the local-query proof and performs equivalent bounded candidate acceptance after separate provisioning approval; do not repeat experiments for completeness alone.

Local verification: prescribed full `vp run check` passes, including format, lint, typecheck, **2,062 tests in 201 files**, boundaries/build/bundle checks. The 37 new tests cover original comparable parity/duplicates/caps/time adjustment, read-only snapshot failure/lazy transport, all public routing/D1 rollback/private isolation/warm cache/no-failover. Existing lint warnings in frozen modules remain unchanged. The dedicated local PG container was deleted and a filtered container listing confirms it is absent. The full Worker bundle also passes local Wrangler --dry-run; nothing was uploaded. The subsequent authorized COW phase created only one isolated child and one 1-CU endpoint and ran bounded read-only equality/access checks. This resource/documentation phase leaves runtime/tests/frozen publisher code unchanged; their hashes still match the full check. No commit/push/PR/merge/application deployment/production write/schedule occurred.

The COW candidate and endpoint remain for subsequent acceptance; no temporary pilot Worker/Hyperdrive exists. Remaining gates are the exact candidate role defaults/Hyperdrive action scope, separately bounded POST acceptance if requested, live project usage or explicit bounded uncertainty admission, client cache activation/rollback tests and dependency/config packaging. Application deployment and the D1→Neon policy flip each still require their own instruction.

One final control-plane read after the idle tail observes candidate endpoint idle (suspended_at=2026-10-05T09:10:17Z) and benchmark endpoint idle. Neither was forcibly suspended. Final reported project storage remains **452,173,824 B**. This verifies the direct Neon endpoint idle policy at this observation; Hyperdrive retention remains unmeasured. No probe loop or additional SQL was used.

The proposed benchmark-only POST pilot must also prove a server-side statement-timeout mechanism on that branch within its unchanged command budget, or request exact benchmark-only role-default authorization. Candidate role defaults do not propagate backward to the benchmark. Current persistent defaults are unset; client timeout alone is insufficient. The new pilot remains unexecuted.

The explicit persistent-default follow-up added one connection/one SELECT, 1,052 received / 1,021 sent PG proxy bytes and 1,285.811ms active wall. Combined candidate verification totals are **four connections / 12 commands / 57,140 received / 18,545 sent PG proxy bytes / 58,903.075ms active connection wall**, upper startup compute proxy **0.266362 CU-hour**, below the unchanged 0.5-CUh reserve. The tiny supplemental sent-byte estimate of 1,000 B was exceeded by 21 B; the original shared 1,000,000 B sent cap remains comfortably satisfied. No larger-limit retry or extra query followed. This catalog proof is not a new query benchmark.

The settings follow-up occurred after the candidate had naturally suspended, so the combined startup proxy includes **three five-minute idle cycles** (benchmark once, candidate initial verification and candidate follow-up), not two. Formula: `(58,903.075 + 900,000) / 3,600,000 = 0.266362 CU-hour` at pinned max 1 CU, below the 0.5-CUh reserve. The prior first-two-cycle observation had 9–15 seconds of suspension grace; this remains a policy sensitivity with startup margin, not exact provider compute accounting. Recurring monthly 64.575 / startup-inclusive 65.075 / optional-pilot-inclusive 65.425 figures are unchanged. No new POST pilot or production action occurred.

## Approved isolated comparable pilot — stopped, 2026-10-05

The new 0.35-CUh pilot executed once on `br-rough-frost-b3e2ks1b` / `ep-steep-water-b300tebo`, from 10:16:13.968 to 10:16:39.851 UTC. Wrangler refreshed the existing OAuth session with unchanged scopes; no interactive authorization, new role, grant or password was introduced. The candidate-only existing runtime role now has persistent `default_transaction_read_only=on` and `statement_timeout=60s`, verified in the final role catalog. This closes the catalog-default gap from the earlier COW inspection, **not** the serving write-rejection or server-cancellation proof.

A temporary cache-disabled Hyperdrive with origin limit five and temporary Worker were created, then deleted; both absences were confirmed. Public counts, max transaction ID and publication ID remained unchanged. The first safeguard HTTP GET stopped before complete HTTP/SQL evidence was retained, so its exact response-level cause is **UNKNOWN**. No comparable POST ran. Do not classify this as a PostgreSQL semantic failure or retry it under the consumed one-shot allowance.

Four owner SQL commands and 83 additional successful runtime-role calls were observed through `pg_stat_statements`, totaling 87 observed commands. The latter include provider/session activity outside the application client. Failed/opaque attempts are not completely accounted for because the safeguard response lacked retained instrumentation; 87 is **not** a certified exact count or complete upper bound under the 90-command cap. The remaining observed margin of three commands cannot admit the requested proof suite. Future admission must include measured connection/session setup overhead and capture HTTP status before response parsing; do not simply increase the cap or repeat requests.

Measured owner wire proxy was 1,945 received / 2,765 sent bytes, with one measured owner connection. Worker/Hyperdrive-origin transfer and failed runtime attempts are unknown. Active wall was 25,882.605 ms; adding the reserved ten-minute Hyperdrive and five-minute Neon tails at pinned maximum 1 CU gives a **0.257190-CUh policy proxy**, within 0.35, not provider billing. The six current-fact offline oracle cases remain available against 988,128 transactions / 45,028 trends. All six remote semantic results, actual write-rejection and actual SQLSTATE `57014` cancellation remain **NOT DEMONSTRATED**. Production, all other Neon branches, D1, routing, schedules and frozen application/publisher code remain untouched. See the [pilot receipt](../evidence/neon-comparable-candidate-pilot-2026-10-05.json).
