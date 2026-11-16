# Design: Geospatial Programme

> Status: the decisions and contracts of the programme. The audit of `main` at `bb0a476ba` (2026-10-10) that they rest
> on, with its measurements, provider limits and discrepancy register, is recorded in the description of PR #425. The
> roadmap that follows from it is `tasks.md`.

## 1. Coordinate reference systems

### 1.1 Where each system is used

| Place                                                        | System and type                             | Distance meaning                      |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------- |
| Source tables `blocks`, `poi_locations`                      | WGS84 `double precision` lat/lng            | none                                  |
| Derived `block_locations.location`, `poi_locations.location` | `geography(Point,4326)`, generated, GiST    | spheroidal geodesic (`ST_Distance`)   |
| Nearby query                                                 | `ST_DWithin` / `ST_Distance` on `geography` | spheroidal geodesic, rounded to 0.1 m |
| Browser near-me, build-time nearest amenity                  | haversine, sphere of R = 6,371,000 m        | spherical approximation               |
| SVY21 (EPSG:3414)                                            | not used anywhere yet                       | planar metres, for POI blocking       |

### 1.2 Decision

Distances computed in the database are geodesic, computed on `geography`, both when they are shown and when they
decide a result. The two spherical haversine shortcuts stay where they are, labelled as approximations, and they do
decide results: `shared/product/filtering.ts` compares a haversine distance with the near-me radius, and
`scripts/lib/pipeline.ts` uses one for amenity inclusion and nearest-amenity order. A point within the error below of
a radius boundary can therefore fall on the other side of it than the geodesic would put it (at 1,500 m, up to about
8 m north-south and 2 m east-west). That is accepted for these two paths; no new path decides with a spherical
shortcut (R1.2). Their error is systematic, not noise: at 1.35°N the WGS84
meridian radius of curvature is about 6,335.5 km and the east-west (prime vertical) radius about 6,378.1 km, so a
6,371 km sphere over-reads north-south distances by about 0.56% and under-reads east-west ones by about 0.11%.

SVY21 is within centimetres of the geodesic at ranges up to 3 km, so planar, metre-based blocking in EPSG:3414 is
safe for candidate generation. It is never the decision, and `ST_SetSRID` is never used to convert between systems.

### 1.3 Nearest-neighbour operator versus exact order

The ranking of the GiST `<->` operator on `geography` is spherical. It is a candidate generator, never the decision:
a KNN result must be re-ranked exactly or labelled approximate, and any strategy that uses it reports its
disagreement with the exact answer.

### 1.4 Contract and tests to build

Rows R1.1 to R1.5 become tests: longitude/latitude swap rejected; a degree value passed as metres rejected by a
bounds guard; SRID relabelling forbidden by a static check on SQL text; SVY21 round trip within a stated tolerance;
points offshore and at the allowed box's corners behave as documented.

## 2. What the nearby path guarantees

The model, the bounded keyspace, the grouping fix, the differential verifier, the capability probe and the rate
limits are specified in `docs/architecture/postgis-nearby.md`. Not yet shown: behaviour through a deployed Worker
and Hyperdrive (`nearby-search-production-gates`, Phase 3) and latency percentiles.
