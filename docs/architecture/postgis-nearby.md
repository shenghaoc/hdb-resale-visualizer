# PostGIS nearby spatial queries

PostGIS is an optional, **Neon-only** serving path for nearby HDB blocks and MRT locations. The existing D1 rollback, existing public routes, current precomputed walking times and raw transaction facts are unchanged.

## Reproducible migration prerequisites

The original Neon publisher and base schema remain in a separate **locally untracked** codebase, not in the reviewed repository. Before adoption, reviewers must inspect the publisher code itself and verify its current revision/identity.

The inspected local publisher (`scripts/sync-neon.ts`) is reported to use only in-place `INSERT INTO <table> (explicit_columns) SELECT ...` and `UPDATE ... FROM` operations, with no `DELETE`, `TRUNCATE` or table swap. It is **manual and pinned to the benchmark branch** `br-wispy-boat-b34glczl`; it does not refresh the web-serving snapshot.

The web-serving branch `br-rough-frost-b3e2ks1b` (`production-candidate-20261005`) was forked on **2026-10-05**, and its manifest was last written **2026-10-04T15:30Z**. It is a **static snapshot**: no publisher or scheduled refresh job targets it (project-owner verification). The derived spatial tables stay correct while that snapshot remains unchanged. For any future in-place update, the `block_location_sync` and `mrt_geojson_poi_sync` triggers must remain installed and enabled. No `TRUNCATE` or table swap may bypass/destroy them. A future serving-branch refresh must connect as a writer role for which the `SECURITY DEFINER` trigger functions have been tested; retest if any new dedicated publisher role appears. Its `NeonPlanningStore.inspectSchema()` accepts only `text`, `int2`, `int4`, `int8`, `float8`, `jsonb` and `timestamptz` on these **nine** scanned tables: `transactions`, `blocks`, `block_details`, `comparisons`, `town_flat_type_trends`, `mrt_geojson`, `manifest`, `geocode_cache`, `walking_time_cache`. **Never add a PostGIS column to any of them, and do not widen the publisher's allowlist to accommodate this migration.**

The expected base schema is `scripts/neon-benchmark/schema.sql`: `blocks(address_key PK, lat/lng NOT NULL)` and `mrt_geojson(kind PK)`. The SELECT-only runtime role `hdb_benchmark_runtime` is created by `scripts/neon-benchmark/runtime-role.mjs`. The migration checks the required tables, coordinate columns, role and absence of a previously added `blocks.location` before any DDL. A base-schema or role mismatch **must stop** the migration, not silently fall back.

Run `sql/neon/001_postgis_nearby.sql` atomically **only on a disposable Neon branch** and verify the full publisher admission fingerprint; do not run against production, change `migrations/*.sql`, or deploy a Worker. `NEON_SPATIAL_ENABLED` stays `"false"`.

## Derived spatial model and ownership

- `blocks` remains unchanged. `block_locations` holds `(address_key,lat,lng,location)`, with `location` a stored generated `geography(Point,4326)` and a GiST index. A trigger limited to `INSERT`, `DELETE` and `UPDATE OF lat,lng` maintains this relation. An update to `median_price`, transaction counts or other non-coordinate columns does **not** touch `block_locations`. The DELETE trigger explicitly removes the derived row; the foreign key retains `ON DELETE CASCADE` as an additional safeguard. Unchanged coordinates cause no derived writes. The sandbox source-write test also verifies a non-coordinate update leaves the derived row `xmin` unchanged.
- `poi_locations` contains authoritative MRT station and MRT exit source observations, their source identifiers and a generated point with GiST index. Other POI kinds are reserved until independently admitted source data is available; no missing coordinates are invented.
- Triggers use tightly scoped `SECURITY DEFINER` functions with `search_path = pg_catalog, pg_temp` and schema-qualified access. They are owned by the trusted migration owner. The publisher should only need its pre-existing INSERT/UPDATE privileges on the authoritative source tables; it must **not** be granted write access to either derived table. `hdb_benchmark_runtime` retains SELECT-only access.

**A2 role compatibility: verified for the current two-role setup.** Both the serving candidate (`br-rough-frost-b3e2ks1b`) and benchmark (`br-wispy-boat-b34glczl`) expose only `neondb_owner` and the SELECT-only `hdb_benchmark_runtime` as application roles. The existing publisher must therefore use `neondb_owner` to write, and disposable-branch sandbox source DML executed successfully as `current_user=neondb_owner`, exercising the `SECURITY DEFINER` triggers. This is a role/privilege proof for the **present role inventory**, not an inspection of the secret `NEON_REFRESH_DATABASE_URL`. The publisher is currently pinned to the benchmark branch; the mechanism that refreshes the web-serving candidate is **still unresolved**. If a new writer role is added or the serving refresh mechanism changes, re-run A2 using that exact role and connection. Do not publish credentials.

## Deliberate MRT publication invariant

The first migration is intentionally **fail-closed** for a complete MRT GeoJSON source replacement. It rejects non-Point/invalid geometry, missing required fields including `EXIT_CODE`, and duplicate source IDs (including station names). The corresponding source UPDATE rolls back atomically with all derived POI changes; it must not produce a partial published amenity dataset. The entire prepared publication may therefore fail if official MRT data breaks those assumptions. This is deliberate; future quarantine/integration/aggregation work belongs in separate follow-up PRs with explicit review and provenance.

An MRT UPDATE that does not change the GeoJSON has no derived POI writes. A genuine change rebuilds only the affected station/exit kind. No changed-MRT publisher cost or WAL envelope has been proven yet.

The migration's source-failure test is `sql/neon/verify_mrt_failclosed.sql` (sandbox-only). It verifies expected SQL errors, unchanged source/POI digests and no-op avoidance.

## Bounded nearby search and cache

Accepted query coordinates are restricted to latitude [1.15, 1.55] and longitude [103.55, 104.15]. The query centre is snapped to the nearest **0.0001°** on _both_ axes before **both** the SQL call and the Worker Cache API key are formed. The response publishes the snapped centre, never an unrounded centre masquerading as the query point.

Each coordinate differs by at most 0.00005°, or approximately **7.88 m at worst along the diagonal** using the conservative 111.32 km/degree bound. For a 100 m minimum radius this can shift the inclusion boundary by up to ~7.9 m; results are explicitly approximate near a radius edge. A finer grid would reduce that error at the cost of a larger cache key space.

The bounded input region has **4,001 × 6,001 = 24,010,001** distinct snapped centres. Radius values from 100..2500 m round **up** to one of **100, 250, 500, 1000, 1500 or 2500 m** (e.g. 101 m becomes 250 m, so the search never silently shrinks). The server accepts only a fixed **25-result** limit; `limit` may be omitted or set to 25, and it is not part of the cache key. Seven nonempty combinations of three POI kinds produce a theoretical maximum of **24,010,001 × 6 × 7 = 1,008,420,042** canonical nearby-search keys. Both radius and centre are normalized before SQL and caching, and the response reports the effective (bucketed) radius and centre. This is a finite keyspace **not** a practical quota or rate limit: cache misses still query Neon. The browser loads the nearby MRT exit list only when the user expands it.

The spatial query searches `block_locations` joined by primary key to `blocks` and independently searches `poi_locations`, using `ST_DWithin`. These are straight-line spheroidal distances, **not** walking routes; the old walking-time estimates remain separate.

For MRT exit results, the query partitions all radius-matched source observations by `source_properties->>'STATION_NA'`, chooses the nearest exit with a deterministic source-ID tie-break (`id COLLATE "C"`), and only **then** applies the global fixed limit. It returns the source `STATION_NA` and `EXIT_CODE` independently as `stationName` and `exitCode`; the client does not parse display-name suffixes. A "station" here is a distinct source `STATION_NA` label, which is not always a physical station (see the known source quirk below). On disposable branch `postgis-type-safe-review-20261009`, `central-area-535-upp-cross-st` has **91 nearby exits under 20 distinct `STATION_NA` labels** at 1,500 m, whereas a naive pre-group limit of 25 exits reaches only **6**. The shipped query returned all **20**.

`sql/neon/verify_nearby_spatial_sql.sql` is the committed, read-only regression check. It runs the shipped `NEARBY_SPATIAL_SQL` against a brute-force oracle that shares no code with it (no index, `DISTINCT ON` instead of `ROW_NUMBER()`): the grounded case above, boundary and offshore centres, a deterministic block sample, and every MRT exit as its own centre, across every radius bucket and kind set. On the disposable branch it reported **0 mismatches in 1,868 combinations**; a mutant that cuts to 25 exits before grouping fails the grounded phase, and a mutant that keeps the farthest exit per station fails 1,394 combinations. The script embeds the query verbatim and `tests/unit/nearby-spatial-verifier.test.ts` fails if that copy drifts from the constant, so a passing run verifies the SQL the Worker sends. It runs inside a READ ONLY transaction and refuses to run otherwise; point it at a disposable branch only. It replaces the earlier verifier, which restated the algorithm instead of executing the shipped query.

### Known source quirk: station codes in `STATION_NA`

Seven `STATION_NA` values in the current serving snapshot (manifest 2026-10-04) are station codes rather than names: `CC30`, `CC31`, `CC32`, `CC9`, `DT18`, `DT4` and `NE18` (17 of 613 exits). The `mrt_station` rows are code-named in the same way (`CC30`, `CC31`, `CC32` and `DT18` were checked). Two of the codes label exits of stations that other exits label by name: `CC9` sits 50 m from `PAYA LEBAR MRT STATION` and `DT18` 76 m from `TELOK AYER MRT STATION`, so one physical station can take two result slots. Block 535's 20 labels include both `DT18` and `TELOK AYER MRT STATION`. The other five codes have no named exit within 228 m and are returned exactly as the source records them. Separately, 23 of the 613 exits use a short `EXIT_CODE` without the `Exit ` prefix (`1` to `4`, `A`, `C` to `H`), which is why the client reads `exitCode` directly and never parses `name`.

This stack groups by the source label verbatim and deliberately does **not** normalise codes to names: that needs an authoritative code-to-name mapping and belongs to the POI-integration follow-up. Until then the user guide describes the list as one entry per source-recorded station name, not per physical station.

## Rate limiting, the daily ceiling and origin protection

A cache miss on `GET /api/nearby-places` runs a spatial query on a metered Neon branch through Hyperdrive, and the canonical keyspace above (about 1.0 billion keys) is far too large for the cache to bound that work: a client walking the grid never hits. Two approximate per-location rate limits shape its traffic, but neither limits global daily usage. All are inert while `NEON_SPATIAL_ENABLED` is `"false"`, because the flag gate answers 503 before any of them runs.

| Control                     | Where                              | Limit                                 | Key                             | Spent                                         | Over the limit                                   | If the control itself fails     |
| --------------------------- | ---------------------------------- | ------------------------------------- | ------------------------------- | --------------------------------------------- | ------------------------------------------------ | ------------------------------- |
| `NEARBY_IP_LIMITER`         | Rate Limiting binding `1003`       | 30 per 60 s, per location             | client key (below)              | by every request that passes the flag gate    | `429`, `Retry-After: 60`, `no-store`             | request proceeds, error logged  |
| `NEARBY_ORIGIN_LIMITER`     | Rate Limiting binding `1004`       | 300 per 60 s, per location            | one shared key, `nearby-origin` | on a cache miss, just before the statement    | `503`, `Retry-After: 60`, `no-store`             | **refused** `503`, error logged |

Order in the Worker (`worker/index.ts`): flag gate, then the per-client limit, then the public-read cache; on a miss only, once the request is known to be valid and answerable, the origin limiter, then one labelled PostGIS statement. A limited client touches neither the cache nor the database; a cache hit spends neither origin control, so popular locations stay cheap; a request that never reaches the database (invalid input, a backend without PostGIS) spends neither. The origin controls answer `503` rather than `429` because the client did nothing wrong; the service is protecting itself. None of these answers is stored: the public-read cache keeps only `200` responses marked `public`, and the PWA's `NetworkFirst` API rule admits only `200`s with a consistent cache label.

**Client key** (`nearbyClientRateLimitKey`, `functions/_lib/nearby-rate-limit.ts`) comes from `CF-Connecting-IP`, the address Cloudflare reports for the connecting client. IPv4 is used as it is; an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) maps to the embedded IPv4; any other IPv6 address collapses to `v6:` plus its first four hextets (its `/64`), because one subscriber normally owns a whole `/64` and could otherwise rotate addresses inside it; a missing or malformed value shares one `unknown-ip` bucket, so a bad header cannot mint fresh buckets. Cloudflare advises against IP addresses as keys because many users share one. The route is anonymous, so the address is the only identity available. 30 requests a minute is well above ordinary use (one request when a block's MRT list is expanded, repeated centres served from cache), which makes it unlikely that users behind a shared NAT notice, and `429` is retryable.

**What the two rate limits are, and are not.** Counters are local to each Cloudflare location, and Cloudflare describes the binding as permissive and eventually consistent, not an accurate accounting system. The numbers are therefore per location and approximate. A client that moves between locations, or many clients together, can exceed them in aggregate. They shape bursts and per-client fairness; they cannot bound a day, because the binding only supports 10 and 60 second windows and never shares a counter between locations. Neither limiter is a global quota. Public activation is forbidden until a separately approved global cost-control design exists.

### Why a cache miss used to cost three statements, and why nearby now costs one

Hyperdrive's Free plan allows [100,000 database statements a day](https://developers.cloudflare.com/hyperdrive/platform/pricing/) across the account, reset at 00:00 UTC, and counts every statement, cached or not. Every route that reads Neon spends from it, so a runaway nearby workload would starve the rest of the site, whose reads then fail until the reset.

The shared public-data cache (`worker/public-data-cache.ts`) labels every stored answer with the generation of data it was computed from (the SHA-256 of the manifest text), and must be sure an answer did not mix two generations while the publisher replaced tables under it. It does that **around** the handler, so a cache miss on any route costs three statements:

1. read the manifest before: learn the current generation, and whether a publication is in progress;
2. the handler's own query;
3. read the manifest again: store the answer only if the two reads are identical.

Two of the three statements move the whole manifest, **10,618 bytes** on the serving branch, to carry a 64-character identity. For the block panel's nearby answer (average 1,259 bytes, p95 3,446 bytes, measured below) the manifest is about 94% of the bytes a miss moves out of Neon, which also counts against its 5 GB a month transfer allowance. This is how every other route behaves today; it is measured, not assumed: the local rehearsal's control request (`/api/mrt-stations`: one miss and one hit) sends exactly three statements.

Nearby search is a single-statement route, so the label can be taken in the same statement. `NEARBY_LABELLED_SQL` (`worker/nearby-spatial-query.ts`) embeds the verified places query verbatim and adds a header row: `version` (the SHA-256 of `manifest.json::text`, computed in SQL so the manifest never leaves the database), the manifest's JSON type and its `publicationInProgress` marker. One SQL statement sees one snapshot, and the publisher stamps the marker before it touches any table, so the manifest as of that snapshot says whether the tables were mid-replacement; the before and after reads have nothing left to prove. The shared cache gets an additive `AtomicRead` mode for this and the multi-statement path every other route uses is unchanged (its tests pass unchanged). Result:

| Request                             | Before                        | Now                           |
| ----------------------------------- | ----------------------------- | ----------------------------- |
| cache hit on a live 60 s pointer    | 0 statements                  | 0 statements                  |
| cache hit after the pointer expired | 1 statement (manifest)        | 1 statement (the answer)      |
| cache miss                          | **3** statements, about 22 KB | **1** statement, about 1.4 KB |

Verified, on PostgreSQL 18.6 with PostGIS 3.6.3 and the real D1 emulator (local rehearsal, not Hyperdrive): 10 cache misses produced exactly 10 statements from the runtime role, all of them the labelled statement; the SQL-side hash equals `manifestVersion` on a 10 KB manifest containing non-ASCII text; the labelled statement returns the same places in the same order as the verified base query for every sample, and exactly one header row (the deployed-path check asserts the same on the fork). `sql/neon/verify_nearby_spatial_sql.sql` still verifies the embedded base query against its brute-force oracle. A publication in progress is not cached and is labelled `BYPASS` (or the previous generation is served as `HIT-STALE`), exactly as for the other routes.

### No budget counter is implemented

The earlier D1 statement-budget proposal was removed. PR #431 (the Neon-counter alternative) was closed **without merging**. A refused PostgreSQL reservation itself spends a Hyperdrive statement, so that design cannot impose a hard account-wide statement cap. The remaining Workers Rate Limiting bindings are per Cloudflare location and approximate: 300 misses/minute/location is potentially 432,000 requests per location per day, well beyond the shared 100,000 Hyperdrive statements/day allowance. **The production `NEON_SPATIAL_ENABLED` flag must remain `"false"`; enabling public arbitrary-coordinate searches requires an independent global budget control first.**

The fixed block-detail MRT-exit UI is moving to publish-time materialization in separate draft PR #432; this runtime route remains available only behind its disabled feature flag. A single-read-only-Hyperdrive deployed-path verification on a disposable Neon fork is independent of the future public-budget decision.

### What a cache miss costs when the answer is a fixed fact about a block

The only caller today asks the same fixed question for each of the 9,730 blocks. [nearby-exits-precompute-evaluation.md](./nearby-exits-precompute-evaluation.md) evaluates computing those lists once at publish time instead (41,172 rows, 802 ms to compute, about 10 MB as JSON) and recommends it for the block panel as part of the serving-refresh work. It is not built.

**Failure handling.** Both the per-client and the per-location limiter fail closed on missing bindings and thrown errors, responding with `503`, `Retry-After: 60` and `no-store`. A normal exceeded client limit answers `429`; the origin limit answers `503`. Invalid inputs do not consume origin-limit attempts. A previously cached answer may continue to be served when the origin limiter is down; it never opens a database connection.

**Configuration.** `shared/nearby-limits.ts` pins the existing rate-limiting bindings in `wrangler.jsonc`; `tests/unit/nearby-rate-limit.test.ts` also asserts the production spatial flag is `"false"`. A temporary verification Worker must have its own name and limiter namespace IDs and uses **one** fork-scoped read-only Hyperdrive config, with no D1 counter or write-capable role.


## Capability probe: `GET /api/nearby-capabilities`

The browser asks `GET /api/nearby-capabilities` whether to offer the optional MRT-exit control. The Worker answers `{ "available": boolean }` as a `no-store` response **without opening a database connection**. `available` is `true` only when all three configuration facts hold: `NEON_SPATIAL_ENABLED` is exactly `"true"`, `PUBLIC_DATA_BACKEND` is `"neon"`, and the `HDB_PUBLIC_NEON` Hyperdrive binding exists. It does **not** mean that `sql/neon/001_postgis_nearby.sql` has been applied to the serving branch, that the derived tables are populated, or that anything keeps them in sync. Enabling the flag before the migration shows the control and makes each lookup fail into the retryable error state (never a false "no exits"), so the release gates below keep the order: migrate and verify first, flip the flag last.

Client behaviour (`src/features/block-detail/nearbyMrtExitsApi.ts`): a successful answer, `true` or `false`, is remembered for the page session. A network error, non-2xx status or malformed body counts as "not available" for that mount but is **not** remembered, so the next block selected probes again. The PWA service worker's `NetworkFirst` API rule admits only responses that carry a Worker cache label, so this unlabelled `no-store` answer is never kept for offline use. While the flag is `"false"` the probe is the only request this feature makes, and `GET /api/nearby-places` answers a `no-store` 503 before any Neon connection is created. `tests/unit/nearby-places-worker-gate.test.ts` drives the real Worker entry through both behaviours.

## Measured disposable-branch evidence

Disposable Neon branch **`postgis-type-safe-review-20261009`** (`br-orange-sky-b30msckg`), forked from `br-rough-frost-b3e2ks1b`; PG18/PostGIS 3.6 series. Administrative/migration connection was `neondb_owner`.

| Sandbox observation                                                   |                                                                      Verified |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------: |
| HDB source blocks / derived block points                              |                                                                 9,730 / 9,730 |
| MRT stations / MRT exits                                              |                                                                     190 / 613 |
| Coordinate discrepancies across both derived tables                   |                                                                             0 |
| Unsupported types in the nine scanned publisher tables                |                                                                             0 |
| Generated location and two GiST indexes                               |                                                                       Present |
| HDB + MRT 1 km query returned results                                 |                                                                            25 |
| Measured single execution / planning time                             |                                                           1.785 ms / 0.542 ms |
| Spatial indexes in the query plan                                     |                                                             Both GiST indexes |
| Shipped `NEARBY_SPATIAL_SQL` vs brute-force oracle                    |          0 mismatches in 1,868 combinations (`verify_nearby_spatial_sql.sql`) |
| Changing a block coordinate updated derived point, then restored      |                                                                        Passed |
| Missing exit code, duplicate station name, non-Point geometry         |                                     All rejected; source/POI hashes unchanged |
| Unchanged MRT source update                                           |                                                       No POI MVCC row changes |
| Sandbox trigger source writes as `neondb_owner` (current writer role) |                    Passed; non-coordinate updates leave derived `xmin` intact |
| Actual secret publisher connection                                    | **Not inspected**; role inventory and source writes verified as current owner |
| Web-serving candidate update method                                   |    **Static snapshot**; no refresh publisher or schedule currently targets it |
| Production migration or Worker serving probe                          |                                                             **Not attempted** |

The 1.785 ms sample is a single plan/execution, **not** p50/p95 or an edge/Hyperdrive measurement. PostgreSQL planner and network results for future 1M-point data remain unmeasured.

## Release gates

Before enabling or refreshing the static serving branch: confirm that any future writer uses a tested role and preserves the synchronization triggers; inspect exact untracked publisher and schema-fingerprint admission against the derived tables and triggers; run replay/rollback/WAL/storage proof on an isolated branch; verify the Worker response/cache contracts against an isolated test endpoint; separately approve any production migration and rollout.

**Verification:** The previous local rehearsal (PostgreSQL 18.6 and PostGIS 3.6.3) demonstrated one labelled spatial statement per uncached request, identical SQL fingerprints, cache MISS/HIT and the per-client and origin-limit denials. That older run included a D1 counter experiment that is **no longer part of the design**; do not cite its budget phase as current evidence. The streamlined single-config harness in `tests/deployed-path/` still requires real Worker → Hyperdrive → fork verification before any deployment. The test Worker may temporarily enable the flag on the isolated fork, but production must remain disabled until a global budget is approved and verified.
