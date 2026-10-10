# Publish-time MRT exits in block-detail artifacts

The site's block-detail panel only needs the five nearest source-recorded MRT exit labels within 1,500 metres of a selected HDB block. This is deterministic per publication and **does not justify an anonymous arbitrary-coordinate PostGIS endpoint**. The latter remains present, tested, and guarded by `NEON_SPATIAL_ENABLED=false` in production; enabling it requires separate global budget controls.

## Data flow and contract

1. The existing core Neon publisher writes base tables on its benchmark branch and proves their digests, without any schema change or extra COPY payload.
2. During #422's approved blue/green promotion, a **new, unserved child** gets `sql/neon/001_postgis_nearby.sql`. The trusted publisher operator then executes `sql/neon/publish_block_detail_nearby_mrt_exits.sql` there—not on the benchmark branch and never through a runtime role.
3. The SQL snaps each block centre to the Worker's 0.0001° grid, uses geography `ST_DWithin(..., 1500)` and spheroidal `ST_Distance`, partitions candidates by `(source, kind, STATION_NA)` **before applying any LIMIT**, selects the nearest per source-recorded station label with `id COLLATE "C"` tie-breaking, then stores the globally closest five in a compact array.
4. `block_details.json.nearbyMrtExits` becomes `{ stationName, exitLabel, distanceMeters, exitId }[]`, including `[]` for a source-verified empty result. Old publications lacking the field remain valid; the React control stays hidden for `undefined`.
5. A private `manifest.nearbyMrtExitsMaterialization` marker (version 1, radius 1500, maxStations 5) is written **after** all derived details, in the **same transaction**, creating a new cache generation. The public manifest contract does not gain the internal marker.
6. Before promotion, independently compare the derived arrays for **every** published block to the shipped `NEARBY_SPATIAL_SQL`, check idempotence, and re-run the base proof under an explicit rule that accounts for the child-only derived fields and marker. If any proof fails, abandon the child; the old serving branch and its Hyperdrive origin stay untouched.

The existing D1 rollback path may return old detail documents without this optional field. It does not need a new D1 migration, runtime budget write or additional Hyperdrive config.

## Measured JSON text growth on the disposable serving fork

The read-only 2026-10-10 SQL calculation covered all **9,730** detail documents using the snapped query centre and the same PostGIS/ordering semantics as the live spatial SQL. The new top-five arrays held **29,602** exits; **268** blocks had a verified empty list.

| Metric | Increase |
| --- | ---: |
| Total `jsonb::text` delta | 4,032,907 bytes |
| Mean per document | 414.48 bytes |
| Median | 414 bytes |
| 95th percentile | 674 bytes |
| Maximum | 685 bytes |
| Minimum (empty) | 22 bytes |
| Mean full detail before | 14,941.2 bytes |
| Mean full detail after | 15,355.7 bytes |

These are **logical JSON text** sizes. They are not measurements of PostgreSQL heap/TOAST pages, WAL, Neon billed storage or network egress. Those remain part of #422's child-promotion acceptance.

## Why it must be a child-only stage

The previous source COPY stage was **89,758,647 / 90,000,000 bytes**. Adding even the measured 4.03 MB of derived fields naively to that stage would exceed its guard. Post-fork processing leaves benchmark-source ingestion and the original COPY ceiling unchanged. It still writes child data and must be budgeted and verified separately. The upstream change-count guard is not bypassed; a separately bounded derived child stage is not a transaction-source change.

## Verification

`tests/integration/precomputed-block-mrt-exits.mjs` runs the actual publication SQL against disposable PostgreSQL 18 + PostGIS and compares against the shipped `NEARBY_SPATIAL_SQL`. Its fixture checks grouped-after-all-exits semantics, `(E)`-style short codes, empty lists, manifest identity and repeat idempotence. UI tests check field absence, the real empty case, source ordering, and zero additional network calls. This is not a production publication or deployment.
