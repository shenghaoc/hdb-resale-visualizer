# PostGIS nearby spatial queries

PostGIS is an optional, **Neon-only** serving path for nearby HDB blocks and MRT locations. The existing D1 rollback, existing public routes, current precomputed walking times and raw transaction facts are unchanged.

## Reproducible migration prerequisites

The Neon publisher (`scripts/sync-neon.ts`, `scripts/lib/sync/neon*.ts`) was recovered from a locally untracked working tree and is now in the repository. The base schema and role scripts (`scripts/neon-benchmark/`) are not part of the repository; the byte-exact recovery snapshot ([commit b80446400](https://github.com/shenghaoc/hdb-resale-visualizer/tree/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6), branch `feat/neon-refresh-publisher`) holds them and preserves their provenance. Before adoption, reviewers must still inspect the publisher code itself and verify its current revision/identity.

The inspected local publisher (`scripts/sync-neon.ts`) is reported to use only in-place `INSERT INTO <table> (explicit_columns) SELECT ...` and `UPDATE ... FROM` operations, with no `DELETE`, `TRUNCATE` or table swap. It is **manual and pinned to the benchmark branch** `br-wispy-boat-b34glczl`; it does not refresh the web-serving snapshot.

The web-serving branch `br-rough-frost-b3e2ks1b` (`production-candidate-20261005`) was forked on **2026-10-05**, and its manifest was last written **2026-10-04T15:30Z**. It is a **static snapshot**: no publisher or scheduled refresh job targets it (project-owner verification). The derived spatial tables stay correct while that snapshot remains unchanged. For any future in-place update, the `block_location_sync` and `mrt_geojson_poi_sync` triggers must remain installed and enabled. No `TRUNCATE` or table swap may bypass/destroy them. A future serving-branch refresh must connect as a writer role for which the `SECURITY DEFINER` trigger functions have been tested; retest if any new dedicated publisher role appears. Its `NeonPlanningStore.inspectSchema()` accepts only `text`, `int2`, `int4`, `int8`, `float8`, `jsonb` and `timestamptz` on these **nine** scanned tables: `transactions`, `blocks`, `block_details`, `comparisons`, `town_flat_type_trends`, `mrt_geojson`, `manifest`, `geocode_cache`, `walking_time_cache`. **Never add a PostGIS column to any of them, and do not widen the publisher's allowlist to accommodate this migration.**

The expected base schema is [`scripts/neon-benchmark/schema.sql`](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/scripts/neon-benchmark/schema.sql) (in the recovery snapshot): `blocks(address_key PK, lat/lng NOT NULL)` and `mrt_geojson(kind PK)`. The SELECT-only runtime role `hdb_benchmark_runtime` is created by [`scripts/neon-benchmark/runtime-role.mjs`](https://github.com/shenghaoc/hdb-resale-visualizer/blob/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6/scripts/neon-benchmark/runtime-role.mjs). The migration checks the required tables, coordinate columns, role and absence of a previously added `blocks.location` before any DDL. A base-schema or role mismatch **must stop** the migration, not silently fall back.

Run `sql/neon/001_postgis_nearby.sql` atomically **only on a disposable Neon branch** and verify the full publisher admission fingerprint; do not run against production, change `migrations/*.sql`, or deploy a Worker. `NEON_SPATIAL_MODE` selects what the Worker may ask (see "Mode" below); it does not apply the migration.

## Derived spatial model and ownership

- `blocks` remains unchanged. `block_locations` holds `(address_key,lat,lng,location)`, with `location` a stored generated `geography(Point,4326)` and a GiST index. A trigger limited to `INSERT`, `DELETE` and `UPDATE OF lat,lng` maintains this relation. An update to `median_price`, transaction counts or other non-coordinate columns does **not** touch `block_locations`. The DELETE trigger explicitly removes the derived row; the foreign key retains `ON DELETE CASCADE` as an additional safeguard. Unchanged coordinates cause no derived writes. The sandbox source-write test also verifies a non-coordinate update leaves the derived row `xmin` unchanged.
- `poi_locations` contains authoritative MRT station and MRT exit source observations, their source identifiers and a generated point with GiST index. Other POI kinds are reserved until independently admitted source data is available; no missing coordinates are invented.
- Triggers use tightly scoped `SECURITY DEFINER` functions with `search_path = pg_catalog, pg_temp` and schema-qualified access. They are owned by the trusted migration owner. The publisher should only need its pre-existing INSERT/UPDATE privileges on the authoritative source tables; it must **not** be granted write access to either derived table. `hdb_benchmark_runtime` retains SELECT-only access.

**A2 role compatibility: verified for the current two-role setup.** Both the serving candidate (`br-rough-frost-b3e2ks1b`) and benchmark (`br-wispy-boat-b34glczl`) expose only `neondb_owner` and the SELECT-only `hdb_benchmark_runtime` as application roles. The existing publisher must therefore use `neondb_owner` to write, and disposable-branch sandbox source DML executed successfully as `current_user=neondb_owner`, exercising the `SECURITY DEFINER` triggers. This is a role/privilege proof for the **present role inventory**, not an inspection of the secret `NEON_REFRESH_DATABASE_URL`. The publisher is currently pinned to the benchmark branch; the mechanism that refreshes the web-serving candidate is **still unresolved**. If a new writer role is added or the serving refresh mechanism changes, re-run A2 using that exact role and connection. Do not publish credentials.

## Deliberate MRT publication invariant

The first migration is intentionally **fail-closed** for a complete MRT GeoJSON source replacement. It rejects non-Point/invalid geometry, missing required fields including `EXIT_CODE`, and duplicate source IDs (including station names). The corresponding source UPDATE rolls back atomically with all derived POI changes; it must not produce a partial published amenity dataset. The entire prepared publication may therefore fail if official MRT data breaks those assumptions. This is deliberate; future quarantine/integration/aggregation work belongs in separate follow-up PRs with explicit review and provenance.

An MRT UPDATE that does not change the GeoJSON has no derived POI writes. A genuine change rebuilds only the affected station/exit kind. No changed-MRT publisher cost or WAL envelope has been proven yet.

The migration's source-failure test is `sql/neon/verify_mrt_failclosed.sql` (sandbox-only). It verifies expected SQL errors, unchanged source/POI digests and no-op avoidance.

## Mode: `NEON_SPATIAL_MODE`

| Value    | What `GET /api/nearby-places` answers                                       |
| -------- | --------------------------------------------------------------------------- |
| `off`    | Nothing: a `no-store` 503 before any limiter, cache or database connection. |
| `blocks` | The nearest MRT exits to one published HDB block, named by its address key. |

Absent or unrecognized values are `off` (`parseNeonSpatialMode`, `shared/nearby-places.ts`). **No mode accepts coordinates.** Searching around an arbitrary point is not authorised and has no code path in the Worker; it would need its own mode, its own cost analysis and the owner's approval.

## Block-only nearby search and cache

The request is `GET /api/nearby-places?block=<address_key>` and nothing else. The radius (**1,500 m**), the kind set (**MRT exits**) and the limit (**25**) are fixed in `shared/nearby-places.ts`, because they are the ones the block drawer uses. Any other parameter, a repeated `block`, a key that is not a lower-case address-key slug, and every request that carries `lat` or `lng` answers `400` before the cache or the database is touched.

The Worker never receives or sends a coordinate. The block's stored location is looked up **inside the one statement** (`NEARBY_BLOCK_SPATIAL_SQL` takes its centre from `block_locations` by address key), so the centre is exactly the published point of that block, with no snapping.

The request space is therefore the published block list: about 9,700 blocks, one cache entry per block and publication (`/api/nearby-places?block=<key>` under the usual backend, epoch and version prefix). A client that walks every block causes at most one statement per block per location and publication, and the limits below bound that.

**Unknown blocks cost no statement.** On a cache miss the Worker first checks the key against the published block list (`worker/nearby-block-index.ts`) and answers `404` if it is not there. The list is the address keys of the current publication, read through the shared public-data cache under an internal path that no route serves (`/api/block-index`), and each isolate keeps the parsed set for 60 seconds. Trying unknown keys therefore reaches the database only for that occasional refresh, never once per key. If the list cannot be read the request is refused with a `no-store` 503.

The spatial query searches `block_locations` joined by primary key to `blocks` and independently searches `poi_locations`, using `ST_DWithin`. These are straight-line spheroidal distances, **not** walking routes; the old walking-time estimates remain separate.

For MRT exit results, the query partitions all radius-matched source observations by `source_properties->>'STATION_NA'`, chooses the nearest exit with a deterministic source-ID tie-break (`id COLLATE "C"`), and only **then** applies the global fixed limit. It returns the source `STATION_NA` and `EXIT_CODE` independently as `stationName` and `exitCode`; the client does not parse display-name suffixes. A "station" here is a distinct source `STATION_NA` label, which is not always a physical station (see the known source quirk below). On disposable branch `postgis-type-safe-review-20261009`, `central-area-535-upp-cross-st` has **91 nearby exits under 20 distinct `STATION_NA` labels** at 1,500 m, whereas a naive pre-group limit of 25 exits reaches only **6**. The shipped query returned all **20**.

`sql/neon/verify_nearby_spatial_sql.sql` is the committed, read-only regression check. `NEARBY_SPATIAL_SQL` is the query centred on a coordinate pair; no route sends it, and the statement the Worker sends (`NEARBY_BLOCK_SPATIAL_SQL`) is the same text with the centre taken from the block's stored location and the parameters renumbered, which `tests/unit/nearby-places.test.ts` pins. The verifier runs `NEARBY_SPATIAL_SQL` against a brute-force oracle that shares no code with it (no index, `DISTINCT ON` instead of `ROW_NUMBER()`): the grounded case above, boundary and offshore centres, a deterministic block sample, and every MRT exit as its own centre, across every radius bucket and kind set. On the disposable branch it reported **0 mismatches in 1,868 combinations**; a mutant that cuts to 25 exits before grouping fails the grounded phase, and a mutant that keeps the farthest exit per station fails 1,394 combinations. The script embeds the query verbatim and `tests/unit/nearby-spatial-verifier.test.ts` fails if that copy drifts from the constant, so a passing run verifies the SQL the Worker sends. It runs inside a READ ONLY transaction and refuses to run otherwise; point it at a disposable branch only. It replaces the earlier verifier, which restated the algorithm instead of executing the shipped query.

### Known source quirk: station codes in `STATION_NA`

Seven `STATION_NA` values in the current serving snapshot (manifest 2026-10-04) are station codes rather than names: `CC30`, `CC31`, `CC32`, `CC9`, `DT18`, `DT4` and `NE18` (17 of 613 exits). The `mrt_station` rows are code-named in the same way (`CC30`, `CC31`, `CC32` and `DT18` were checked). Two of the codes label exits of stations that other exits label by name: `CC9` sits 50 m from `PAYA LEBAR MRT STATION` and `DT18` 76 m from `TELOK AYER MRT STATION`, so one physical station can take two result slots. Block 535's 20 labels include both `DT18` and `TELOK AYER MRT STATION`. The other five codes have no named exit within 228 m and are returned exactly as the source records them. Separately, 23 of the 613 exits use a short `EXIT_CODE` without the `Exit ` prefix (`1` to `4`, `A`, `C` to `H`), which is why the client reads `exitCode` directly and never parses `name`.

This stack groups by the source label verbatim and deliberately does **not** normalise codes to names: that needs an authoritative code-to-name mapping and belongs to the POI-integration follow-up. Until then the user guide describes the list as one entry per source-recorded station name, not per physical station.

## Rate limiting and the global daily budget

A cache miss on `GET /api/nearby-places` runs a spatial query on a metered Neon branch through Hyperdrive. Three controls stand in front of it. All are inert while `NEON_SPATIAL_MODE` is `off`, because the mode gate answers 503 before any of them runs.

| Control                 | Where                        | Limit                            | Key                             | Spent                                      | Over the limit                                       | If the control itself fails     |
| ----------------------- | ---------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------ | ---------------------------------------------------- | ------------------------------- |
| `NEARBY_IP_LIMITER`     | Rate Limiting binding `1003` | 30 per 60 s, per location        | client key (below)              | by every request that passes the mode gate | `429`, `Retry-After: 60`, `no-store`                 | **refused** `503`, error logged |
| `NEARBY_ORIGIN_LIMITER` | Rate Limiting binding `1004` | 300 per 60 s, per location       | one shared key, `nearby-origin` | on a cache miss, just before the statement | `503`, `Retry-After: 60`, `no-store`                 | **refused** `503`, error logged |
| `NEARBY_BUDGET`         | one Durable Object           | **20,000 per UTC day, globally** | one object, `global`            | on a cache miss, last                      | `503`, `Retry-After` to the next UTC day, `no-store` | **refused** `503`, error logged |

Order in the Worker (`worker/index.ts`): mode gate, then the per-client limit, then the public-read cache; on a miss only, once the request is known to be valid and answerable: the published-block check, the origin limiter, the global daily budget, then one labelled PostGIS statement. A limited client touches neither the cache nor the database; a cache hit spends none of the miss controls and never contacts the Durable Object; a request that never reaches the database (invalid input, an unknown block, a backend without PostGIS) spends none of them. The budget is asked last, so a request another control refuses takes nothing from the day. The miss controls answer `503` rather than `429` because the client did nothing wrong; the service is protecting itself. None of these answers is stored: the public-read cache keeps only `200` responses marked `public`, and the PWA's `NetworkFirst` API rule admits only `200`s with a consistent cache label.

**Client key** (`nearbyClientRateLimitKey`, `functions/_lib/nearby-rate-limit.ts`) comes from `CF-Connecting-IP`, the address Cloudflare reports for the connecting client. IPv4 is used as it is; an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) maps to the embedded IPv4; any other IPv6 address collapses to `v6:` plus its first four hextets (its `/64`), because one subscriber normally owns a whole `/64` and could otherwise rotate addresses inside it; a missing or malformed value shares one `unknown-ip` bucket, so a bad header cannot mint fresh buckets. Cloudflare advises against IP addresses as keys because many users share one. The route is anonymous, so the address is the only identity available. 30 requests a minute is well above ordinary use (one request when a block's MRT list is expanded, repeated centres served from cache), which makes it unlikely that users behind a shared NAT notice, and `429` is retryable.

**What the two rate limits are, and are not.** Counters are local to each Cloudflare location, and Cloudflare describes the binding as permissive and eventually consistent, not an accurate accounting system. The numbers are therefore per location and approximate. A client that moves between locations, or many clients together, can exceed them in aggregate. They shape bursts and per-client fairness; they cannot bound a day, because the binding only supports 10 and 60 second windows and never shares a counter between locations. Neither limiter is a global quota. The global daily budget below is.

### Why a cache miss used to cost three statements, and why nearby now costs one

Hyperdrive's Free plan allows [100,000 database statements a day](https://developers.cloudflare.com/hyperdrive/platform/pricing/) across the account, reset at 00:00 UTC, and counts every statement, cached or not. Every route that reads Neon spends from it, so a runaway nearby workload would starve the rest of the site, whose reads then fail until the reset.

The shared public-data cache (`worker/public-data-cache.ts`) labels every stored answer with the generation of data it was computed from (the SHA-256 of the manifest text), and must be sure an answer did not mix two generations while the publisher replaced tables under it. It does that **around** the handler, so a cache miss on any route costs three statements:

1. read the manifest before: learn the current generation, and whether a publication is in progress;
2. the handler's own query;
3. read the manifest again: store the answer only if the two reads are identical.

Two of the three statements move the whole manifest, about 10 KB on the serving branch, to carry a 64-character identity. For a small nearby answer that is most of the bytes a miss moves out of Neon, which also counts against its monthly transfer allowance. This is how every other route behaves today.

Nearby search is a single-statement route, so the label can be taken in the same statement. `NEARBY_LABELLED_SQL` (`worker/nearby-spatial-query.ts`) embeds the verified places query verbatim and adds a header row: `version` (the SHA-256 of `manifest.json::text`, computed in SQL so the manifest never leaves the database), the manifest's JSON type and its `publicationInProgress` marker. One SQL statement sees one snapshot, and the publisher stamps the marker before it touches any table, so the manifest as of that snapshot says whether the tables were mid-replacement; the before and after reads have nothing left to prove. The shared cache gets an additive `AtomicRead` mode for this and the multi-statement path every other route uses is unchanged (its tests pass unchanged). Result:

| Request                             | Before                 | Now                      |
| ----------------------------------- | ---------------------- | ------------------------ |
| cache hit on a live 60 s pointer    | 0 statements           | 0 statements             |
| cache hit after the pointer expired | 1 statement (manifest) | 1 statement (the answer) |
| cache miss                          | **3** statements       | **1** statement          |

The labelled statement must return the same places in the same order as the verified base query, plus exactly one header row, and its SQL-side `version` must equal the manifest's `manifestVersion`, including for a manifest that contains non-ASCII text. The parked deployed-path harness (see Verification) checks all three against a real database. `sql/neon/verify_nearby_spatial_sql.sql` still verifies the embedded base query against its brute-force oracle. A publication in progress is not cached and is labelled `BYPASS` (or the previous generation is served as `HIT-STALE`), exactly as for the other routes.

### The global daily miss budget

`NearbyDailyBudget` (`worker/nearby-budget.ts`) is one SQLite-backed Durable Object, addressed by the fixed name `global` from every location. It stores one value, the UTC day and the statements granted in it. On a cache miss the Worker asks it for one statement; it grants while the count is below the budget, writes the new count before answering, and starts again from zero when the UTC date changes. A Durable Object handles one request at a time around its storage operations, so two misses cannot both take the last statement.

The budget is **20,000 statements per UTC day** (`NEARBY_DAILY_MISS_BUDGET` in `shared/nearby-limits.ts`, mirrored by the variable of the same name in `wrangler.jsonc`; `tests/unit/nearby-rate-limit.test.ts` fails when they differ, and the Worker refuses a configured value that is missing, not a whole number, or above the constant). That is a fifth of Hyperdrive Free's 100,000 statements a day, so nearby search cannot starve the other routes. One full walk of the block list is about 9,700 statements per location and publication; 20,000 covers ordinary use and stops a walk repeated from many locations.

It fails closed. A missing binding, an invalid budget, an object that throws, an error status or an answer that is not understood all refuse the request with a `no-store` 503 and log the error; a stored value that is not understood counts as a spent day, never as zero. Cached answers keep being served, because hits never reach the object.

This is not the statement counter that was removed earlier. That design counted in D1 or in PostgreSQL, where a refusal itself spends a statement of the allowance it protects (PR #431 was closed for that reason). A Durable Object request spends no Hyperdrive statement.

**Arbitrary-coordinate search stays not authorised.** The budget bounds the day's statements, not the request space; the block-only mode is what keeps that space small enough to cache.

**Failure handling.** All three controls fail closed on missing bindings and thrown errors, responding with `503` and `no-store`. A normal exceeded client limit answers `429`; the origin limit and the daily budget answer `503`. Invalid inputs and unknown blocks consume nothing. A previously cached answer may continue to be served when a miss control is down; it never opens a database connection.

**Configuration.** `shared/nearby-limits.ts` pins the rate-limiting bindings and the daily budget in `wrangler.jsonc`; `tests/unit/nearby-rate-limit.test.ts` also asserts the mode, the Durable Object binding and its migration. A temporary verification Worker must have its own name and limiter namespace IDs and uses **one** fork-scoped read-only Hyperdrive config, with no write-capable role.

**D1 rollback.** With `PUBLIC_DATA_BACKEND` set to `d1`, the capability probe reports `off`, the drawer hides the control, and a direct request answers a `no-store` 503 without consulting any limiter or the budget.

## Capability probe: `GET /api/nearby-capabilities`

The browser asks `GET /api/nearby-capabilities` whether to offer the optional MRT-exit control. The Worker answers `{ "available": boolean, "mode": "off" | "blocks" }` as a `no-store` response **without opening a database connection**. `mode` is the mode in effect: the configured `NEON_SPATIAL_MODE` when `PUBLIC_DATA_BACKEND` is `"neon"` and the `HDB_PUBLIC_NEON` Hyperdrive binding exists, otherwise `off`; `available` is `mode !== "off"`. It does **not** mean that `sql/neon/001_postgis_nearby.sql` has been applied to the serving branch, that the derived tables are populated, or that anything keeps them in sync. Selecting a mode before the migration shows the control and makes each lookup fail into the retryable error state (never a false "no exits"), so the order stays: migrate and verify first, select the mode last.

Client behaviour (`src/features/block-detail/nearbyMrtExitsApi.ts`): the drawer asks for the selected block by its address key and sends no coordinates. A successful capability answer, `true` or `false`, is remembered for the page session. A network error, non-2xx status or malformed body counts as "not available" for that mount but is **not** remembered, so the next block selected probes again. The PWA service worker's `NetworkFirst` API rule admits only responses that carry a Worker cache label, so this unlabelled `no-store` answer is never kept for offline use. While the mode is `off` the probe is the only request this feature makes, and `GET /api/nearby-places` answers a `no-store` 503 before any Neon connection is created. `tests/unit/nearby-places-worker-gate.test.ts` drives the real Worker entry through both behaviours.

## Coordinate-system contract

Stored coordinates are WGS84 (EPSG:4326) in longitude, latitude order. Every distance that decides a result is a geodesic on `geography` (the spheroid), reported in metres. Planar, metre-based work belongs in SVY21 (EPSG:3414) and is reached only with `ST_Transform`; `ST_SetSRID` is a label and is used for exactly one thing, `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`. The standing rules are R1 in `.kiro/specs/geospatial-programme/requirements.md`.

Two guards keep the contract from eroding:

- `tests/unit/crs-contract.test.ts` runs in CI. It reads the migration, the verifiers and the shipped query and fails on a swapped `ST_MakePoint`, an `ST_SetSRID` that is not the one allowed form, an `ST_Transform` to anything but 3414 or 4326, and an `ST_DWithin` or `ST_Distance` whose two operands are not provably `geography`: each must end in an explicit `::geography` cast or be a name that a declaration types as geography (a column of the migration, or an alias the statement casts), so a geography column cast to `geometry` is caught. It also fails if PostGIS in any spelling (a function call in either case, a `::geography` or `::geometry` cast, the `<->` operator) appears in `functions/`, `scripts/`, `shared/`, `src/` or `worker/` outside `worker/nearby-spatial-query.ts`, and checks that the statement the Worker sends constructs no point at all (its centre is the block's stored `geography`), while the verified coordinate-centred text keeps `ST_MakePoint` in longitude, latitude order.
- `sql/neon/verify_crs_contract.sql` is the executable counterpart. It needs only PostGIS and writes nothing. It first turns `plpgsql.check_asserts` on for its own transaction and proves that an assertion fires, because PL/pgSQL skips every `ASSERT` when that setting is off. It then asserts that a longitude/latitude swap and a relabelled SVY21 point fall outside the Singapore bounding box, that `ST_DWithin(…, 500)` on `geometry(4326)` means 500 degrees while on `geography` it means 500 metres, and that over 500 deterministic pairs up to 3 km apart the SVY21 round trip and SVY21 planar distance agree with the geodesic. Local run (PostgreSQL 18.6, PostGIS 3.6.3): SVY21 round trip within floating-point noise, SVY21 distance within 0.020 m of the geodesic, and the spherical distance between −0.112% and +0.561% of it.

The approximations that remain are deliberate and listed: the browser's near-me filter and the build-time nearest-amenity distances use haversine on a 6,371 km sphere, which reads north-south distances 0.56% high and east-west distances 0.11% low at Singapore's latitude; the `<->` operator ranks by sphere too, so it is a candidate generator and never the decision. The measurements and the commands that reproduce them are in the description of pull request #425.

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

**Verification:** The unit tests in the repository cover the labelled statement, the cache modes and both limiters, and `sql/neon/verify_nearby_spatial_sql.sql` verifies the query against its oracle. The deployed-path harness is not in the repository. Its last version is commit `c7b2f6b` in this pull request's history, with its [runbook](https://github.com/shenghaoc/hdb-resale-visualizer/blob/c7b2f6b91be4e135d26757d999eb86cf09bb1e33/tests/deployed-path/README.md): a local rehearsal of the real Worker against a scratch PostgreSQL/PostGIS database, and a client for a temporary Worker behind one temporary Hyperdrive configuration on a disposable fork. Real Worker → Hyperdrive → fork verification is still required before any deployment, and has not been run. The test Worker may temporarily enable the flag on the isolated fork, but production must remain disabled until a global budget is approved and verified.
