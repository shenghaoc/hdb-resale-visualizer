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

## Rate limiting and origin protection

A cache miss on `GET /api/nearby-places` runs a spatial query on a metered Neon branch, and the canonical keyspace above (about 1.0 billion keys) is far too large for the cache to bound that work: a client walking the grid never hits. Two [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) bindings bound it instead. Both are inert while `NEON_SPATIAL_ENABLED` is `"false"`, because the flag gate answers 503 before either runs.

| Binding                 | Namespace | Limit        | Key                             | Spent                                         | Over the limit                                      |
| ----------------------- | --------- | ------------ | ------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `NEARBY_IP_LIMITER`     | `1003`    | 30 per 60 s  | client key (below)              | by every request that passes the flag gate    | `429`, `Retry-After: 60`, `Cache-Control: no-store` |
| `NEARBY_ORIGIN_LIMITER` | `1004`    | 300 per 60 s | one shared key, `nearby-origin` | only on a cache miss, just before the handler | `503`, `Retry-After: 60`, `Cache-Control: no-store` |

Order in the Worker (`worker/index.ts`): flag gate, then the per-client limit, then the public-read cache, then (on a miss only) the origin limit, then the handler and Neon. A limited client touches neither the cache nor the database, and a cache hit never spends the origin budget, so popular locations stay cheap. The origin cap answers `503` rather than `429` because the client did nothing wrong; the service is protecting itself. Neither answer is stored: the public-read cache keeps only `200` responses marked `public`, and the PWA's `NetworkFirst` API rule admits only `200`s.

**Client key** (`nearbyClientRateLimitKey`, `functions/_lib/nearby-rate-limit.ts`) comes from `CF-Connecting-IP`, the address Cloudflare reports for the connecting client. IPv4 is used as it is; an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) maps to the embedded IPv4; any other IPv6 address collapses to `v6:` plus its first four hextets (its `/64`), because one subscriber normally owns a whole `/64` and could otherwise rotate addresses inside it; a missing or malformed value shares one `unknown-ip` bucket, so a bad header cannot mint fresh buckets. Cloudflare advises against IP addresses as keys because many users share one. The route is anonymous, so the address is the only identity available. 30 requests a minute is well above ordinary use (one request when a block's MRT list is expanded, repeated centres served from cache), which makes it unlikely that users behind a shared NAT notice, and `429` is retryable.

**What the limits are, and are not.** Counters are local to each Cloudflare location, and Cloudflare describes the binding as permissive and eventually consistent, not an accurate accounting system. The numbers are therefore per location and approximate. A client that moves between locations, or many clients together, can exceed them in aggregate. The bound on database work is the number of active locations times 300 per minute, then the Hyperdrive origin limit of 5 connections and the query time (one 1.8 ms sample so far, no distribution). That is a design estimate, not a measurement; it stays unproven until the real-path run described under Release gates.

**Failure handling.** If the flag is on and a binding is missing, the route answers `503` (`Nearby search is not configured`) instead of running unlimited, so a deployment mistake is loud. If a limiter call throws, the request is allowed and the error is logged: the limiter is an abuse control, and failing closed would turn degraded protection into an outage of a feature that is optional anyway.

**Configuration.** The numbers live in `shared/nearby-limits.ts` and are mirrored in `wrangler.jsonc`. `tests/unit/nearby-rate-limit.test.ts` fails if they drift apart, if the period is not one the binding supports (10 or 60 s), if the two namespace ids collide, or if `NEON_SPATIAL_ENABLED` is no longer `"false"`; the last assertion is a deliberate tripwire, and the approved change that opens the gate updates it. Namespace ids are account-wide: any other Worker bound to `1003` or `1004` shares these counters, so a temporary verification Worker must use ids of its own.

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

Rate limiting (previous section) is implemented and unit-tested through the real Worker entry with fake limiters. What is **not** yet verified is the deployed path: a real Worker, a real Hyperdrive configuration and a real PostGIS branch with real rate-limit bindings, which mocked tests and direct SQL cannot establish. That run belongs on a disposable fork with a temporary Worker and Hyperdrive that use their own namespace ids, and its evidence must be recorded here before the flag is considered. The plan is in `.kiro/specs/nearby-search-production-gates/`. The capability probe reports configuration only, so apply and verify the migration on the serving branch (and run `sql/neon/verify_nearby_spatial_sql.sql` on a disposable fork of it) before flipping `NEON_SPATIAL_ENABLED`. It remains `"false"`. The browser preview must not access the disabled spatial endpoint.

POI admission/quarantine, multi-source matching and aggregation, a second authoritative dataset, reverse geocoding and a 1M-point benchmark are separate follow-up PRs and are **not** claimed implemented or measured here.
