# PostGIS location search — isolated LBS milestone

This is an **additive Neon-only** feature for `hdb-resale-visualizer`, motivated by real HDB buyer nearby-place searches and general LBS data engineering. It does not replace any existing search, MRT walking-time estimate, D1 rollback path or published public response.

## Data contract and current proof

- `blocks` retains `lat` and `lng` and adds a **stored generated** `geography(Point,4326)` `location`. Longitude is X, latitude is Y. Never put geographic coordinates on every transaction row.
- `poi_locations` stores provenance `(source,poi_kind,source_id)`, original scalar coordinates, original nonprivate MRT source properties, and a generated geographic point. No confidence or geocodes are fabricated.
- `mrt_geojson` remains authoritative. A database trigger rebuilds its dependent `mrt_station` or `mrt_exit` rows in the **same transaction** when a source row is inserted, updated or deleted. Invalid feature coverage aborts that source change instead of silently dropping observations. An unchanged GeoJSON update leaves the POI rows untouched, avoiding unnecessary index and WAL churn. Future source-type integrations need their own independently reviewed ingestion and publication strategy.
- A GiST index on `blocks.location` and another on `poi_locations.location` support index-aware `ST_DWithin` queries. Distances are **straight-line geographic metres**, not walking distances or travel times.
- Exact measurements on the isolated Neon sandbox `postgis-lbs-sandbox-20261009`: PostGIS 3.6.4; 9,730 HDB blocks, 190 MRT stations and 613 exits with matching source coordinates; no original block rows or D1 data changed.

## Publication and rollout

1. Review and run `sql/neon/001_postgis_nearby.sql` **on an isolated Neon branch** before any candidate or production migration. The full script should be executed atomically with a transactional runner (for example, `psql --single-transaction -v ON_ERROR_STOP=1 -f ...`) and output recorded.
2. Verify count/identity/coordinate hashes, affected-row and trigger rollback behavior, query plans and fixed corpus publication invariants; the new source trigger changes write amplification if `mrt_geojson` changes, so previous publisher bounds **cannot** be assumed unchanged in that scenario.
3. Keep `NEON_SPATIAL_ENABLED=false` until separately approved database and serving acceptance. The Worker returns 503/no-store **without opening a Neon transport** while this feature is disabled; enable it only with a coordinated release and cache epoch.
4. Keep existing `PUBLIC_DATA_BACKEND` selection intact. The new route is only available when the Neon spatial method exists; D1 rollback returns an explicit unavailable status for this _new_ optional route. All pre-existing routes stay fully functional on D1.
5. Confirm Neon Free storage/compute/transfer headroom, source and publication freshness, and Worker caching/cold-query performance before exposing UI callers. Do **not** auto-deploy the database migration or enable CI to run it against production.
6. Only after backend acceptance: add an unobtrusive buyer-facing nearby-place section. Keep precomputed walking times distinct. Schools, supermarkets, hawkers and parks remain follow-up source-ingestion milestones.

## Example read-only validation SQL

```sql
SELECT extversion FROM pg_extension WHERE extname='postgis';
SELECT count(*) AS total, count(location) AS located,
  count(*) FILTER (WHERE ST_X(location::geometry)<>lng OR
                         ST_Y(location::geometry)<>lat) AS mismatched
FROM public.blocks;
SELECT poi_kind, count(*) AS total,
  count(*) FILTER (WHERE ST_X(location::geometry)<>lng OR
                         ST_Y(location::geometry)<>lat) AS mismatched
FROM public.poi_locations GROUP BY poi_kind;
EXPLAIN SELECT source,source_id,name FROM public.poi_locations
WHERE ST_DWithin(location,
  ST_SetSRID(ST_MakePoint(103.75,1.35),4326)::geography,1000)
LIMIT 25;
```

Unresolved HDB addresses retain their original nonspatial transactions and provenance. No OneMap token or runtime upstream requests are required.
