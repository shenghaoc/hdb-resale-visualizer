# Design: Geospatial Programme — baseline audit

> Status: Baseline recorded 2026-10-10 against `main` at `bb0a476ba` (PostGIS
> stack merged). Read-only evidence only; no production change. The roadmap that
> follows from it is `tasks.md`.

## Method and evidence classes

Each fact carries a class. **V** is verified by a check that can be repeated (the
command or query is given). **P** is taken from the provider's current
documentation, fetched on the date above. **I** is inferred from code or notes and
not exercised. **U** is unverified.

## 1. The system as it is

| Layer                | What it does                                                                                                                                                                                                  | Class |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Ingestion            | `scripts/sync-data.ts` (build-time only) fetches data.gov.sg datasets and geocodes through OneMap; geocodes and walking times persist in `geocode_cache` / `walking_time_cache`. No runtime upstream calls.   | I     |
| Published data       | Nine publisher-scanned tables, manifest included. Served from Neon through Hyperdrive (`PUBLIC_DATA_BACKEND="neon"`); D1 is the rollback target (frozen at 2026-08-29) and still serves shortlists.                          | V     |
| Neon branches        | Benchmark branch is the only publisher target; the serving branch is a copy-on-write child of it, forked 2026-10-05 (`serving-data-refresh`).                                                                | V     |
| Spatial model        | `block_locations` and `poi_locations` hold generated `geography(Point,4326)` with GiST indexes, kept in sync by two `SECURITY DEFINER` triggers. MRT is the only populated POI source.                         | V     |
| Nearby API           | `GET /api/nearby-places`: query centre snapped to 0.0001°, radius rounded up to one of six buckets, fixed limit 25, `ST_DWithin` on `geography`, MRT exits grouped by source station label before the limit.    | V     |
| Protection           | Flag `NEON_SPATIAL_ENABLED="false"`; per-client and per-location rate limits (#421); Cache API keyed by manifest hash.                                                                                       | V     |
| Client distances     | Near-me filtering and build-time nearest-amenity distances use haversine with R = 6,371,000 m (`shared/product/filtering.ts`, `scripts/lib/pipeline.ts`).                                                     | V     |

## 2. Coordinate reference systems

### 2.1 Where each system is used

| Place                                              | System and type                                   | Distance meaning                      |
| -------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| Source tables `blocks`, `poi_locations`            | WGS84 `double precision` lat/lng                  | none                                  |
| Derived `block_locations.location`, `poi_locations.location` | `geography(Point,4326)`, generated, GiST   | spheroidal geodesic (`ST_Distance`)   |
| Nearby query                                       | `ST_DWithin` / `ST_Distance` on `geography`       | spheroidal geodesic, rounded to 0.1 m |
| Browser near-me, build-time nearest amenity        | haversine, sphere of R = 6,371,000 m              | spherical approximation               |
| SVY21 (EPSG:3414)                                  | not used anywhere yet                             | planar metres, for POI blocking       |

### 2.2 Measured differences (V)

20,000 pairs of random points inside Singapore's bounding box (lat 1.22 to 1.47,
lng 103.62 to 104.05), the second point 0 to 3 km away at a random bearing,
generated with a fixed seed on PostgreSQL 18.6, PostGIS 3.6.3, GEOS 3.14.1,
PROJ 9.7.1. The reference is `ST_Distance` on `geography` (spheroid).

| Band       | Pairs  | Sphere: max abs | Sphere: mean abs | Sphere: relative range | SVY21 planar: max abs | SVY21: max relative |
| ---------- | ------ | --------------- | ---------------- | ---------------------- | --------------------- | ------------------- |
| to 500 m   | 3,353  | 2.80 m          | 0.64 m           | −0.112% to +0.561%     | 3.5 mm                | 0.00072%            |
| to 1,500 m | 6,589  | 8.40 m          | 2.64 m           | −0.112% to +0.561%     | 1.1 cm                | 0.00075%            |
| to 3,000 m | 10,055 | 16.77 m         | 6.01 m           | −0.112% to +0.561%     | 2.3 cm                | 0.00079%            |

The sphere's error is systematic, not noise. At 1.35°N the WGS84 meridian radius
of curvature is about 6,335.5 km and the east-west (prime vertical) radius about
6,378.1 km, so a 6,371 km sphere over-reads north-south distances by 0.56% and
under-reads east-west ones by 0.11%. SVY21 is within centimetres of the geodesic
at these ranges, so planar metre-based blocking in EPSG:3414 is safe for
candidate generation. The decision still uses `geography`.

Reproduce (local PostGIS; the seed makes it deterministic):

```sql
SELECT setseed(0.4242);
CREATE TEMP TABLE pairs AS
WITH pts AS (
  SELECT g AS id, ST_SetSRID(ST_MakePoint(103.62 + random()*0.43, 1.22 + random()*0.25), 4326) AS a,
         random()*360 AS bearing_deg, random()*3000 AS dist_m
  FROM generate_series(1, 20000) g)
SELECT id, a, ST_Project(a::geography, dist_m, radians(bearing_deg))::geometry AS b FROM pts;
CREATE TEMP TABLE m AS
SELECT id, ST_Distance(a::geography, b::geography) AS geo,
       ST_Distance(a::geography, b::geography, false) AS sph,
       ST_Distance(ST_Transform(a,3414), ST_Transform(b,3414)) AS svy FROM pairs;
SELECT CASE WHEN geo<=500 THEN '1:<=500m' WHEN geo<=1500 THEN '2:<=1500m' ELSE '3:<=3000m' END AS band,
       count(*), max(abs(sph-geo)), avg(abs(sph-geo)), 100*max((sph-geo)/geo), 100*min((sph-geo)/geo),
       max(abs(svy-geo)), 100*max(abs(svy-geo)/geo)
FROM m WHERE geo>1 GROUP BY 1 ORDER BY 1;
```

### 2.3 Nearest-neighbour operator versus exact order (V)

On a disposable fork of the serving branch, for 500 blocks chosen by
`ORDER BY md5(address_key)`, the five nearest other blocks by the GiST `<->`
operator on `geography` were compared with the five nearest by exact
`ST_Distance` (ties broken by `address_key`). The **set** of five differed for 9
of 500 blocks (1.8%); the **order** differed for 26 of 500 (5.2%, which includes
tie-break noise between blocks at identical coordinates). The operator's ranking
is spherical, so it is a candidate generator, never the decision: a KNN result
must be re-ranked exactly or labelled approximate.

### 2.4 Contract and tests to build

Rows R1.1 to R1.5 become tests: longitude/latitude swap rejected; a degree value
passed as metres rejected by a bounds guard; SRID relabelling forbidden by a
static check on SQL text; SVY21 round trip within a stated tolerance; points
offshore and at the allowed box's corners behave as documented.

## 3. What the nearby path guarantees

The model, bounded keyspace (about 1.0 billion canonical keys), grouping fix,
differential verifier (0 mismatches in 1,868 combinations on the disposable
branch), capability probe and rate limits are specified in
`docs/architecture/postgis-nearby.md`. Not yet shown: behaviour through a deployed
Worker and Hyperdrive (`nearby-search-production-gates`, Phase 3) and latency
percentiles (one 1.8 ms single-execution sample exists).

## 4. Provider limits (P, fetched 2026-10-10)

| Limit                       | Value                                                                                                                              | Source                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Neon Free storage           | 1 GB of Postgres storage per project; the API reports a limit of 1,073,741,824 B. It is not 500 MB.       | neon.com/docs/introduction/plans                |
| Neon Free branches          | 10 per project                                                                                                                     | same                                            |
| Neon Free compute           | 100 CU-hours per project per month; up to 2 CU; scale to zero after 5 minutes, cannot be disabled                                  | same                                            |
| Neon Free egress            | 5 GB per project per month, shared across products; logical replication traffic counts                                            | same                                            |
| Neon Free history           | 6 hours, up to 1 GB-month                                                                                                          | same                                            |
| Hyperdrive Free             | 100,000 queries per day, reset at 00:00 UTC; 10 configs per account; about 20 origin connections per config; 60 s query duration   | developers.cloudflare.com/hyperdrive/platform   |
| Workers Rate Limiting       | period 10 or 60 s; counters local to each location, permissive and eventually consistent; keys not recommended to be IP addresses | developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit |

Note: the Neon plans page gives storage in GB without saying whether decimal or
binary; the API figure (1 GiB) is what the existing notes use.

### Actual project limits and use (V, Neon API read 2026-10-10 03:40 SGT)

`describe_project` for the project reports: subscription `free_v3`; `branches_limit` 10;
`branch_logical_size_limit_bytes` 1,073,741,824; history retention 21,600 s (6 h); default
compute 0.25 to 2 CU with no custom suspend timeout. Use in the current period (from
2026-10-01): 1,048,958,993 B transferred (about 1.05 GB of the 5 GB allowance), 11,881
compute seconds, `synthetic_storage_size` 452,190,208 B. Six of ten branches exist:

| Branch                        | Id                              | Parent       | Role                                                        |
| ----------------------------- | ------------------------------- | ------------ | ----------------------------------------------------------- |
| `production` (default)        | `br-broad-credit-b3bz9b61`      | none         | project default, nearly empty (31.7 MB)                     |
| `benchmark-d1-migration`      | `br-wispy-boat-b34glczl`        | production   | the only publisher target                                   |
| `production-candidate-20261005` | `br-rough-frost-b3e2ks1b`     | benchmark    | serving (Hyperdrive origin)                                 |
| `postgis-lbs-sandbox-20261009` | `br-sparkling-silence-b37kaz0y` | serving    | disposable, earlier PostGIS work                            |
| `postgis-type-safe-review-20261009` | `br-orange-sky-b30msckg` | serving      | disposable, review fork                                     |
| `postgis-realpath-20261010`   | `br-broad-cake-b3wl94ei`        | serving      | disposable, migration applied, held for the deployed-path run |

None of the three disposable forks has been deleted; deleting any branch needs the owner's
approval.

## 5. Discrepancy register

Items 1 to 17 come from the 2026-10-09 audit of `main` at `a2afa050b` and were
not all re-read after the PostGIS merge; re-verify a line before fixing it.
Items 18 to 29 were found or confirmed during this programme.

| #   | Finding                                                                                                                                                                  | Class | Resolution                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------- |
| 1   | Docs say Cloudflare Pages / Pages Functions; the app is a Worker with static assets (`AGENTS.md`, `pipeline.md`, `platform-parity.md`, `copilot-instructions.md`)        | V     | docs reconciliation PR                                           |
| 2   | Docs say data is read from D1; production selects Neon (`AGENTS.md`, `README.md`, `artifact-contracts.md`)                                                                | V     | docs reconciliation PR                                           |
| 3   | "D1 is the default backend"; the committed config selects Neon, D1 is only the code fallback                                                                              | V     | docs reconciliation PR                                           |
| 4   | README says production data updates when a maintainer runs `sync-data`; that refreshes D1 only                                                                            | V     | docs reconciliation PR, then `serving-data-refresh`              |
| 5   | `sync-data.ts` is called the single source of truth for ingestion; Neon's data came from an untracked publisher                                                           | V     | #423 / #424                                                      |
| 6   | `AGENTS.md` says seed local D1 from fixtures; README says there is no importer                                                                                            | I     | docs reconciliation PR                                           |
| 7   | "Run from CI" for `sync-data`; the workflow was removed                                                                                                                   | V     | docs reconciliation PR                                           |
| 8   | `testing.md` describes `pnpm` CI steps; CI uses `vp install` and `vp run check`                                                                                           | V     | docs reconciliation PR                                           |
| 9   | Spec index in `AGENTS.md` lists six Active specs that are complete and omits eleven specs                                                                                  | V     | docs reconciliation PR                                           |
| 10  | Missing paths named in `structure.md` and `testing.md` (`types/`, `src/lib/__tests__`); `src/features/docs` omitted                                                       | V     | docs reconciliation PR                                           |
| 11  | "Proximity metrics computed in scripts/ only" versus browser haversine for near-me search                                                                                 | V     | docs reconciliation PR (narrow the wording)                      |
| 12  | "OneMap GreyLite tiles" versus the Default and Night tile sets in `constants.ts`                                                                                           | I     | docs reconciliation PR                                           |
| 13  | "requiring Cloudflare and upstream credentials" versus README (only `CLOUDFLARE_*` required)                                                                               | I     | docs reconciliation PR                                           |
| 14  | `pnpm only` in `copilot-instructions.md` versus `vp`; README `vp run build:deploy` versus config `pnpm build:deploy`                                                       | I     | docs reconciliation PR                                           |
| 15  | Route-match comment, suggest table list and "only runtime D1 write path" are out of date                                                                                  | I     | docs reconciliation PR                                           |
| 16  | `DESIGN.md` colour tokens versus the semantic tokens in `ui-standards.md`                                                                                                 | I     | docs reconciliation PR                                           |
| 17  | Stale comments mentioning Pages / GitHub Actions in three source files                                                                                                    | I     | docs reconciliation PR                                           |
| 18  | `wrangler.jsonc` `assets` has no `binding`; unknown `/api/*` paths 500 and the HTML SEO rewrite cannot run (the owner recorded this on 2026-10-07)                         | I     | owner decision (changes request billing); separate PR            |
| 19  | Serving data is frozen at the 2026-10-04 publication; D1 at 2026-08-29; `main` has no refresh workflow                                                                     | V     | `serving-data-refresh` (#422)                                    |
| 20  | The PostGIS migration's triggers make the staged executor's schema admission refuse a migrated branch                                                                     | V     | blue/green design, or schema-version admission                   |
| 21  | Monthly volume (median 2,134 transactions) is about twice the 1,000-change guard; the October stage used 99.7% of the COPY ceiling                                         | V     | owner decision (`serving-data-refresh`, decisions 2 and 3)       |
| 22  | The staged executor is a one-shot (exactly 2,595 inserts, five retentions)                                                                                                 | V     | `serving-data-refresh`, Phase 3                                  |
| 23  | Seven `STATION_NA` values are station codes (CC30, CC31, CC32, CC9, DT18, DT4, NE18); `mrt_station` rows are derived centroids; 23 exits have a short `EXIT_CODE`          | V     | POI integration                                                  |
| 24  | The fail-closed MRT trigger means one malformed upstream feature blocks the whole Neon publication                                                                        | V     | MRT preflight validation task in POI integration                 |
| 25  | The app credits data.gov.sg and OneMap in its in-app FAQ and index pages and shows "© OneMap contributors" on the map, but names no licence and links none. The Singapore Open Data Licence v1.0 asks for a conspicuous notice in any product that uses the datasets, crediting the source and linking to the licence version (page read 2026-10-10; it gives an example notice, not mandatory wording). Whether the current credit is enough is a legal call; the missing licence link is a fact | V   | `poi-source-integration` licence review, then a user-guide PR   |
| 26  | Two spherical haversine implementations disagree with the geodesic by up to +0.56% / −0.11%                                                                                | V     | document in the CRS contract; no code change needed              |
| 27  | The runtime role's `statement_timeout` is 60 s and `default_transaction_read_only` is on at the catalog level (an earlier assumption said none)                             | V     | noted in `nearby-search-production-gates`                        |
| 28  | `postgis-nearby.md` said the publisher was untracked                                                                                                                      | V     | fixed in #423                                                    |
| 29  | The fetch summary of the Neon plans page reported a note asking AI assistants to POST feedback to an external URL; ignored                                                                                       | V     | none                                                             |

## 6. Verification status

Verified here: CRS error table; KNN comparison; fork catalog with triggers;
Hyperdrive configuration and Worker listing; rate-limit tests through the Worker
entry (fakes); publisher SQL identity equal to the October identity (#424); the
differential verifier on a disposable branch. Not verified: the deployed
Worker/Hyperdrive/PostGIS path; any latency distribution; the publisher against
real Neon; data licences (pending); planning-area data for 2025 (pending).
