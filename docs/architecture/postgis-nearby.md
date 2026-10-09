# PostGIS nearby spatial queries

PostGIS is an optional, **Neon-only** serving path for nearby HDB blocks and MRT locations. The existing D1 rollback, existing public routes, current precomputed walking times and raw transaction facts are unchanged.

## Reproducible migration prerequisites

The original Neon publisher and base schema remain in a separate **locally untracked** codebase, not in the reviewed repository. Before adoption, reviewers must inspect the publisher code itself and verify its current revision/identity.

The publisher is reported to use only in-place `INSERT INTO <table> (explicit_columns) SELECT ...` and `UPDATE ... FROM` operations, with no `DELETE`, `TRUNCATE` or table swap. Its `NeonPlanningStore.inspectSchema()` accepts only `text`, `int2`, `int4`, `int8`, `float8`, `jsonb` and `timestamptz` on these **nine** scanned tables: `transactions`, `blocks`, `block_details`, `comparisons`, `town_flat_type_trends`, `mrt_geojson`, `manifest`, `geocode_cache`, `walking_time_cache`. **Never add a PostGIS column to any of them, and do not widen the publisher's allowlist to accommodate this migration.**

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

Accepted query coordinates are restricted to latitude [1.15, 1.55] and longitude [103.55, 104.15]. The query centre is snapped to the nearest **0.0001°** on *both* axes before **both** the SQL call and the Worker Cache API key are formed. The response publishes the snapped centre, never an unrounded centre masquerading as the query point.

Each coordinate differs by at most 0.00005°, or approximately **7.88 m at worst along the diagonal** using the conservative 111.32 km/degree bound. For a 100 m minimum radius this can shift the inclusion boundary by up to ~7.9 m; results are explicitly approximate near a radius edge. A finer grid would reduce that error at the cost of a larger cache key space.

The bounded input region has **4,001 × 6,001 = 24,010,001** distinct snapped centres. Radius values from 100..2500 m round **up** to one of **100, 250, 500, 1000, 1500 or 2500 m** (e.g. 101 m becomes 250 m, so the search never silently shrinks). The server accepts only a fixed **25-result** limit; `limit` may be omitted or set to 25, and it is not part of the cache key. Seven nonempty combinations of three POI kinds produce a theoretical maximum of **24,010,001 × 6 × 7 = 1,008,420,042** canonical nearby-search keys. Both radius and centre are normalized before SQL and caching, and the response reports the effective (bucketed) radius and centre. This is a finite keyspace **not** a practical quota or rate limit: cache misses still query Neon. The browser loads the nearby MRT exit list only when the user expands it.

The spatial query searches `block_locations` joined by primary key to `blocks` and independently searches `poi_locations`, using `ST_DWithin`. These are straight-line spheroidal distances, **not** walking routes; the old walking-time estimates remain separate.

## Measured disposable-branch evidence

Disposable Neon branch **`postgis-type-safe-review-20261009`** (`br-orange-sky-b30msckg`), forked from `br-rough-frost-b3e2ks1b`; PG18/PostGIS 3.6 series. Administrative/migration connection was `neondb_owner`.

| Sandbox observation | Verified |
| --- | ---: |
| HDB source blocks / derived block points | 9,730 / 9,730 |
| MRT stations / MRT exits | 190 / 613 |
| Coordinate discrepancies across both derived tables | 0 |
| Unsupported types in the nine scanned publisher tables | 0 |
| Generated location and two GiST indexes | Present |
| HDB + MRT 1 km query returned results | 25 |
| Measured single execution / planning time | 1.785 ms / 0.542 ms |
| Spatial indexes in the query plan | Both GiST indexes |
| Changing a block coordinate updated derived point, then restored | Passed |
| Missing exit code, duplicate station name, non-Point geometry | All rejected; source/POI hashes unchanged |
| Unchanged MRT source update | No POI MVCC row changes |
| Sandbox trigger source writes as `neondb_owner` (current writer role) | Passed; non-coordinate updates leave derived `xmin` intact |
| Exact secret publisher connection / serving refresh mechanism | **Not inspected / unresolved** |
| Production migration or Worker serving probe | **Not attempted** |

The 1.785 ms sample is a single plan/execution, **not** p50/p95 or an edge/Hyperdrive measurement. PostgreSQL planner and network results for future 1M-point data remain unmeasured.

## Release gates

Before merging or enabling the feature: re-verify any newly introduced publisher role and identify the still-unknown serving-branch refresh path; inspect exact untracked publisher and schema-fingerprint admission against the derived tables and triggers; run replay/rollback/WAL/storage proof on an isolated branch; verify the Worker response/cache contracts against an isolated test endpoint; separately approve any production migration and rollout. `NEON_SPATIAL_ENABLED` remains `"false"`. The browser preview must not access the disabled spatial endpoint.

POI admission/quarantine, multi-source matching and aggregation, a second authoritative dataset, reverse geocoding and a 1M-point benchmark are separate follow-up PRs and are **not** claimed implemented or measured here.
