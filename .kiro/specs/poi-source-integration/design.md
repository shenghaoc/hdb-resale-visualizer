# Design: POI Source Integration

> Status: Proposed. This spec adds no code, migration or data. Evidence and the source-by-source analysis are in [`docs/architecture/poi-source-admission.md`](../../../docs/architecture/poi-source-admission.md). Rows tagged "(proposal)" come from `tests/fixtures/poi-ground-truth/PROPOSED-*.json`, which live in their own pull request ([#429](https://github.com/shenghaoc/hdb-resale-visualizer/pull/429), not merged with this one), are agent-proposed and **unapproved**: they illustrate the rules, they do not measure them. OpenStreetMap is excluded by the owner's decision of 2026-10-10. SQL in this document was run on a local PostGIS 3.6.3 / PostgreSQL 18.6 scratch database against the 2026-10-09 samples; it is a sketch, not a migration.

## Problem

`poi_locations` (`sql/neon/001_postgis_nearby.sql`) holds one source (LTA exits and their derived station centroids), no per-row provenance, and a primary key of `(source, poi_kind, source_id)`. Four of its six kinds are reserved until "independently admitted source data is available". Adding sources by joining on name or proximity would go wrong in ways the evidence already shows:

1. **Names are not identities.** In the exploratory normalisation used for this analysis, `pg_trgm` similarity of 0.79 to 0.82 separates different schools (Zhenghua and Zhonghua; Chua Chu Kang and Yio Chu Kang; Yishun and Yishun Town; Jurong West and Jurong), while the same hawker centre can score 0.29 against its common name ("Queen Street Blk 270 (Albert Centre)" against "Albert Centre Market & Food Centre"). No threshold separates them.
2. **Labels can be codes.** Seven `STATION_NA` values are station codes; two of those stations also appear under their names, so one physical station takes two result slots (`docs/architecture/postgis-nearby.md`).
3. **Sources lie about lifecycle and type.** NEA lists six hawker centres under construction and one interim; NParks "parks" are 40 % playgrounds, open spaces, fitness corners and a car park; URA outlines include stations that are not built; Wikidata's "park" class includes theme parks.
4. **Registers have no coordinates.** MOE and the supermarket licence register give identity only, and the one anonymous geocoder is token-gated.
5. **Coordinate systems bite.** One NEA record has its SVY21 X and Y swapped (20 km off); `ST_DWithin` on SRID 4326 geometry reads its distance in degrees; `ST_SetSRID(point, 3414)` on degrees lands 45 km away.
6. **Licences differ.** SODL, CDLA, CC0 and ODbL impose different obligations, and ODbL's share-alike may attach to a merged table.

## Goals

- Record where every POI observation came from, before anything is aggregated (provenance before aggregation).
- Resolve observations of the same place across independent sources with rules that are exact, deterministic, versioned and explainable per pair.
- Say how sure we are on every result: five classes, a corroboration scope, position uncertainty and caveat codes, never a silent merge.
- Fail closed per publication: a bad fetch is quarantined, never partially promoted, and never replaces good data.
- Keep geometry honest: geodesic on `geography` for people, SVY21 metres only through `ST_Transform` for machines.
- Be reproducible: identical inputs give identical ids and outputs in any order.
- Keep evaluation honest: no accuracy figure without owner-approved labels.
- Land in small, independently verifiable pull requests.

## Non-goals

- Admitting any source (that is gated by the owner decisions OD1 to OD8 in the admission document).
- Walking distances, routing or travel times (OneMap routing stays a separate, token-gated concern).
- Runtime fetching of any upstream source, runtime geocoding, or any hosted AI, embedding or reranking service.
- Machine-learning matching. DBSCAN is only a way to batch candidates; every decision is a rule.
- Changing D1, the nine publisher-scanned Neon tables, or the existing MRT fail-closed trigger.
- Reverse geocoding, a 1M-point benchmark, or a second authoritative HDB dataset.

## Architecture

### 1. Overview

```
build time (scripts/poi, owner-run)                    Neon (PostGIS)                       runtime (Worker, SELECT only)
fetch -> publication(hash) -> validate -----+
          |                                 v
          +--> stage observations --> accept | quarantine
                (admission gates, allow-lists, CRS checks)
                     |
                     v
        intra-source collapse (footprints, registry aliases)
                     |
        candidate groups: SVY21 blocking, DBSCAN as partitioner only
                     |
        pair features (SQL: distances, trigram)  +  name channels (TS)
                     |
        decide: tiers + rule table (TS, versioned)  ->  poi_match
                     |
        entities: components, anchor, ids, class, scope, caveats  ->  poi_entity
                     |                                                    |
                     +----------------------------------------------> poi_serving_v1 -> nearby query -> API
```

| Concern | Where it lives | Why |
| --- | --- | --- |
| Normalisation lexicons, name channels, rule table, tier algorithm, id derivation, digest | `shared/poi/*.ts` (pure, no I/O) | One authoritative implementation, Vitest-testable without PostGIS, importable by scripts and tests (never by `src/`) |
| Source adapters: fetch, parse, allow-list, publication writer, resolution runner, report | `scripts/poi/*.ts` | Build-time only, like `scripts/sync-data.ts`; the only code allowed to reach upstream hosts |
| Schema | `sql/neon/00N_poi_*.sql` (new numbered files) | Neon-only, run by hand on a disposable branch first, like `001_postgis_nearby.sql` |
| Candidate and feature queries, verifiers | `sql/neon/verify_poi_*.sql`, and the parameterised queries the runner issues | Set-based and index-backed; verifiers are read-only and compare against brute-force oracles |
| Serving | `worker/nearby-spatial-query.ts`, `shared/nearby-places.ts`, `functions/api/nearby-places.ts` | Existing route; reads a view only |

The decision logic is **not** duplicated in SQL. SQL computes features (distances, trigram similarity, containment); TypeScript decides. The parity risk the repo manages elsewhere (D1 against Neon) is avoided by having a single decider and verifying the SQL features against an oracle.

### 2. Source registry and independence

`poi_source` holds one row per source, with the fields in R1.1. Rows are data, reviewed in a PR, never inferred from code.

| Column | Meaning |
| --- | --- |
| `independence_group` | Two sources in one group never corroborate each other. Groups: `lta`, `ura-plan`, `moe`, `nea`, `nparks`, `sla-onemap`, `osm-volunteer`, `overture-places`, `wikidata-community` |
| `anchor_rank` | Lower wins when an entity anchor is chosen (R8.2); official registers first |
| `position_method` | `source-point`, `source-polygon`, `derived-centroid`, `geocoded-cache`, `none`; ranked in that order when an entity picks its position |
| `licence_class` | `permissive`, `attribution`, `share-alike`; every observation inherits it, so a serving view can exclude a class |
| `admission_status` | `candidate`, `admitted`, `suspended`, `rejected`; only `admitted` rows may be loaded |

Initial rows (proposal; statuses reflect the admission document, nothing is admitted by this spec):

| `source_id` | Group | Licence class | Status | Notes |
| --- | --- | --- | --- | --- |
| `lta-mrt-exit-geojson` | `lta` | attribution | admitted (already served) | Exits are `source-point`; station observations are `derived-centroid` of their label's exits |
| `ura-mp2019-rail-station-amendment` | `ura-plan` | attribution | candidate, admitted in Phase 7 | `source-polygon`; `lifecycle = unknown` |
| `moe-general-information-of-schools` | `moe` | attribution | candidate | `none`; identity only |
| `nea-sfa-list-of-supermarket-licences` | `nea` | attribution | candidate | `none`; stale since 2024-06-06 |
| `geocode-cache-onemap` | `sla-onemap` | attribution | candidate, frozen | `geocoded-cache`; read from D1 `geocode_cache` by the existing sync tooling; never refreshed |
| `nea-hawker-centres-geojson` | `nea` | attribution | candidate | `source-point`, status gate |
| `nparks-parks-points` | `nparks` | attribution | candidate | `source-point`, class gate; the polygon layer is a geometry-quality input, not an independent source |
| `overture-places` | `overture-places` | permissive | candidate, blocked on OD2 | |
| `osm-overpass` | `osm-volunteer` | share-alike | **excluded** (OD1 decided 2026-10-10: not used); kept only so a future share-alike source has a precedent row | |
| `lta-station-code-registry`, `wikidata-station-codes` | none | none | alias dictionaries, not observation sources | vendored as reviewed data with their licence noted; never contribute a position |

Independence is a registry claim, and copies happen: a source in another group can still be an import of the one it is compared with. In the proposal sample, `hawker_centre-001` pairs an NEA record with a Wikidata item whose coordinates equal NEA's to six decimals (1 of the 30 hand-picked NEA-Wikidata proposal pairs: an observation, not a rate; admission document 5.4 notes that several hawker items look bulk-created). The resolution run therefore reports, per source pair, the share of mutual pairs whose points coincide within 0.5 m and whose names are equal (R1.6). The report is label-free and changes no class by itself; a high share is evidence for the owner to merge the two groups in the registry, which is a reviewed change that bumps `rule_set_version`.

### 3. Publications, validation and quarantine

A publication is the unit of acceptance. `publication_id = 'pub_' || first 32 hex of sha256(source_id || 0x1f || content_sha256)`; two fetches of identical content are one publication (`UNIQUE (source_id, content_sha256)`).

States: `staged` -> `accepted` | `quarantined`; `accepted` -> `superseded` when a newer publication of the same source is promoted. A partial unique index allows one `accepted` publication per source.

Hard checks (any failure quarantines the **whole** publication):

| Id | Check | Evidence that it is realistic |
| --- | --- | --- |
| H1 | Every row parses against the source's Zod schema | |
| H2 | `source_record_key` is unique and non-empty | LTA `(label, exit code)` is not unique, so the key is `OBJECTID`; uniqueness is checked, not assumed |
| H3 | Geometry type equals the registry's (Point, or Polygon/MultiPolygon for outlines) | NParks polygons would yield nothing in a Point-only normaliser |
| H4 | Longitude and latitude finite and inside the admission box (R4.4) | |
| H5 | No swapped longitude/latitude: a pair whose latitude is inside the longitude range and vice versa | Singapore's longitude (about 103.8) is above 90, so a swapped pair is also an invalid latitude |
| H6 | SVY21 attribute share: more than 10 % of rows with an attribute pair that disagrees with the transformed geometry by more than 0.05 m | NEA today is 6 of 129 (4.7 %), one of them swapped, so it passes with row flags; a systematic offset would fail |
| H7 | Record count within the band relative to the previous accepted publication (first publication: owner approval) | |
| H8 | Allow-listed fields present; no deny-listed (personal-data) column in the allow-list | MOE carries principal names, phone and e-mail |
| H9 | Encoding sanity: share of U+FFFD and stray trailing `?` below a limit | 12 supermarket licensee names end in `?` today (an encoding loss) |

Deterministic admission gates (R2.3) are **not** validation failures; they mark observations `excluded` with a code (`STATUS_NOT_EXISTING`, `PARK_CLASS_PLAYGROUND`, `PARK_CLASS_OPEN_SPACE`, `PARK_CLASS_FITNESS_CORNER`, `PARK_CLASS_CAR_PARK`, `NO_USABLE_ADDRESS`, `NOT_ALLOW_LISTED_SUPERMARKET`, `LICENSEE_NOT_A_LEGAL_ENTITY`). The publication report lists counts per code, so a gate that suddenly excludes half a source is visible.

Promotion is one transaction: supersede the old accepted publication, mark the new one `accepted` with its `rule_set_version`, rebuild affected entities, and write the digest. A quarantined publication leaves serving untouched: the previous accepted publication keeps serving and entities derived from it gain the caveat `STALE_SOURCE` once it is older than the source's staleness horizon (registry column, default 400 days).

Relationship to the existing MRT trigger: `refresh_mrt_poi_locations_trigger` aborts the whole transaction that writes `mrt_geojson` when the MRT document is malformed. That is fail-closed in the strict sense and it stays. Quarantine is the additive, weaker-coupling mechanism for **new** publications: a bad school file never blocks anything else. Moving MRT itself onto publications would change a deliberate invariant from "the whole prepared publication may fail" to "this source is quarantined and the previous copy keeps serving"; that is a separate, owner-approved migration (R2.5).

### 4. Observations and provenance

| Field | Purpose | Notes |
| --- | --- | --- |
| `observation_id` | stable identity of the record | `obs_` + 32 hex of sha256(source id, 0x1f, kind, 0x1f, record key) (section 9) |
| `source_id`, `publication_id` | which source and exact fetch | traceability (R3.3) |
| `poi_kind`, `source_record_key` | what and how the source names it | key spec in the registry (`OBJECTID`, `STATION_NA:<label>`, `licence_num`, `<name>\|<postal6>`) |
| `raw_name` | verbatim | never rewritten |
| `name_norm`, `aliases`, `identity_keys`, `subtype`, `label_kind`, `name_style` | outputs of `shared/poi/normalize.ts` | persisted so SQL never re-implements them |
| `lifecycle`, `status_raw` | `operational`, `planned`, `under_construction`, `interim`, `unknown` | mapped per source; LTA and URA are `unknown` because they have no status field |
| `lng`, `lat` | WGS84, longitude first | nullable for registers |
| `position_method`, `coord_checks` | how the point arose and what was checked | `{svy21_attr_diff_m, swapped, box_ok, ...}` |
| `location`, `loc_svy21` | generated | `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` and `ST_Transform(..., 3414)` |
| `footprint_svy21` | polygon outlines | transformed at load |
| `admission`, `exclusion_code` | gate result | |
| `source_properties` | allow-listed extras | no personal data |
| `quality_flags` | caveat seeds | `COORD_ATTR_MISMATCH`, `COORD_ATTR_SWAPPED`, `ADDRESS_STYLE_NAME`, `CODE_NAMED_LABEL`, `NAME_UNUSABLE`, `KEY_COLLISION` |

### 5. Coordinate-system contract

#### 5.1 Which CRS each stage uses

| Stage | Input | Works in | Output | Rule |
| --- | --- | --- | --- | --- |
| Fetch and parse | source files | none | raw values and any SVY21 attributes, as received | never reproject here |
| Validate | WGS84 `[lng, lat]`, optional SVY21 `[x, y]` | WGS84 ranges; SVY21 only for the consistency check | flags | H4 to H6 |
| Load | `lng`, `lat` | | columns plus generated `location geography(Point,4326)` and `loc_svy21 geometry(Point,3414)` | the only `ST_SetSRID` is `ST_MakePoint(lng, lat), 4326`; 3414 comes only from `ST_Transform` |
| Block and cluster | `loc_svy21`, `footprint_svy21` | SVY21 metres | candidate pairs | `ST_DWithin`, `ST_ClusterDBSCAN`, `ST_Distance` on `*_svy21` only |
| Features | both | SVY21 for bands; geography for the reported distance | `d_svy21_m`, `d_geodesic_m` | the two must agree within `0.1 m + 5e-4 * d` or the pair is flagged `CRS_DISTANCE_DISAGREE` |
| Decide | features | none | classes | no coordinate is read here |
| Entity | observations | geography | `poi_entity.location geography(Point,4326)` | position chosen by `position_method` rank, then `anchor_rank`, then id |
| Serve | `location` | geography | metres | ellipsoidal straight line, never "walking" |

Evidence for the tolerances (2026-10-09 samples, PROJ 9.7.1, EPSG:3414 `+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84`):

- WGS84 to SVY21 to WGS84 round trip: worst geodesic error 0.000000000 mm over 1,204 points (613 LTA exits, 129 NEA hawker centres, 462 NParks points). The contract tolerance is 1 mm.
- `ST_Transform(geometry, 3414)` against the agency's own SVY21 attributes: NParks max 0.000 m over 462 rows; NEA 123 of 129 under 1 mm, six larger (section 5.4).
- Planar SVY21 distance against geodesic distance over 660 candidate pairs up to 800 m: worst difference 0.002 m (relative 6e-6). At island scale (Tuas to Changi, 39,270 m) they differ by 0.1 m.
- `ST_Transform` works inside a stored generated column on PostGIS 3.6.3 / PostgreSQL 18.6.

#### 5.2 Rules

1. Longitude is always the first element: `ST_MakePoint(lng, lat)`, GeoJSON `[lng, lat]`, `ST_X` is longitude in 4326 and easting in 3414.
2. No `ST_SetSRID(x, 3414)` anywhere. A lint test greps `sql/neon/` and `shared/poi/` for it. 3414 values originate only in `ST_Transform`.
3. Every planar function takes a column that is typed `geometry(..., 3414)`; the column type is the guard. Helpers that take a bare `geometry` assert the SRID with an exception function (`poi_assert_svy21`).
4. Distances shown to users are `geography`; the response field stays `distanceMeters` and its documentation keeps saying "straight line, not walking".
5. Mixed SRIDs are an error in PostGIS and stay one: no `ST_Transform` is added merely to make a call succeed.
6. The geometry wins over SVY21 attributes whenever they disagree.

#### 5.3 Guards

| Guard | Where | Effect |
| --- | --- | --- |
| `CHECK (lng BETWEEN 103.0 AND 105.0 AND lat BETWEEN 1.0 AND 2.0)` | `poi_observation` | rejects swaps and foreign points at the table |
| Admission box (lng 103.55 to 104.15, lat 1.15 to 1.47, constants in `shared/poi/region.ts`; a proposal that covers the largest latitude in the samples, 1.462, with margin, and shares its longitude and southern bounds with the nearby route's request box, whose northern bound is 1.55) | validator H4 | hard failure |
| SVY21 image of the box, computed with `ST_Transform` at load, not typed in | validator | catches relabelled values |
| Swap detector | validator H5 | hard failure |
| Attribute check | validator H6 | row flag, publication failure above 10 % |
| `poi_assert_svy21(geometry)` | SQL helpers | exception on any other SRID |
| Pair guard `CRS_DISTANCE_DISAGREE` | feature step | flag and quarantine of the group if any pair disagrees |

The admission box is a **region** guard, not a land mask: the southern part of Johor Bahru lies inside it (a Woodlands-side point and a Johor point can differ by 2 km), so offshore and cross-border points are caught only when they fall outside the box. A land mask from an admitted polygon source is a later hardening task (T10.3), not assumed.

#### 5.4 Adversarial tests and vectors

All run in `tests/unit` (TypeScript guards) and `sql/neon/verify_poi_crs.sql` (PostGIS), and each has a mutant that must fail.

| Case | Input | Expected | Evidence run on the scratch database |
| --- | --- | --- | --- |
| Longitude and latitude swapped | `ST_MakePoint(1.3521, 103.8198)` as 4326 then 3414 | error, never a row | `ST_Transform` raises `transform: Invalid coordinate (2049)`; the `lat` check also rejects it |
| SRID relabel | `ST_SetSRID(ST_MakePoint(103.8198, 1.3521), 3414)` | caught by the SVY21-image guard and the lint | the relabelled point is 45,556 m from the correct SVY21 point and converts back to (103.582685, 1.016277), in the sea south-west of the island |
| Degrees passed as metres | `ST_DWithin(a4326, b4326, 50)` on points 32,391 m apart | the verifier fails the mutant | returns `true` on SRID 4326 geometry and `false` on 3414; DBSCAN with `eps := 400` on 4326 geometry collapses 168 NEA and Wikidata hawker points into 1 group, against 104 groups on 3414 |
| Mixed SRIDs | `ST_Distance(a4326, b3414)` | error | `Operation on mixed SRID geometries (Point, 4326) != (Point, 3414)` |
| Offshore / foreign point | (lng 103.72, lat 1.17), open water off the southern islands by judgement (no land mask was used) and inside both boxes; a point at lat 1.60 | outside the admission box is rejected; inside-box offshore is **not** caught (documented limit) | the first is inside both boxes (`true`), which is why the box is not claimed to be a land mask |
| SVY21 round trip | WGS84 to 3414 to WGS84 | at most 1 mm | 0.000000000 mm over 1,204 points |
| Official vector 1 | NEA 119477: WGS84 (103.80036727142618, 1.3069001323584224) | SVY21 (24332.82477688, 32135.91866726) within 0.05 m | computed (24332.8248000, 32135.9186999) |
| Official vector 2 | NParks 120001: WGS84 (103.7842062105903, 1.3137632887404946) | SVY21 (22534.26299996, 32894.84093008) within 0.05 m | computed (22534.2630000, 32894.8409000) |
| Swapped SVY21 attributes | NEA 119460: attributes X 35883.10858126, Y 21533.66534254 | `COORD_ATTR_SWAPPED`; geometry used | the geometry transforms to X 21533.6653, Y 35883.1086 |
| Centre-of-island vector | WGS84 (103.8198, 1.3521) | SVY21 (26495.534871, 37133.868476) within 1 mm | PROJ 9.7.1 |

### 6. Candidate generation

Per-kind block radius `RB` (provisional, section 8.1):

| Kind | Block | Notes |
| --- | --- | --- |
| `mrt_station` | SVY21 radius 500 m (outline distance 300 m) | point is a centroid of exits, outlines are footprints |
| `mrt_exit` | 100 m for intra-source collisions; membership against outlines 300 m | no cross-source exit pairs until a second exit source exists |
| `school`, `supermarket` | registers without coordinates: normalised postal code equality, plus name-token inverted index; geometry only when both sides have it (600 m, 400 m) | postal code is zero-padded to six digits first |
| `hawker_centre` | 400 m | |
| `park` | 800 m, or footprint containment when a polygon exists | |

Algorithm (all in SVY21):

1. Partition included observations of one kind with `ST_ClusterDBSCAN(geom, eps := RB, minpoints := 1) OVER (PARTITION BY poi_kind)`. With `minpoints = 1` every point is a core point, so groups are the connected components of the "within RB" graph. Membership therefore does not depend on row order; the numeric labels do, and they are never stored or compared.
2. Inside each group, pair observations of different sources with `ST_DWithin(a, b, RB)`.
3. If a group exceeds `MAX_GROUP` (default 200), stop and report it (R5.4): chains through a corridor such as Orchard or the Marina Bay interchange are a data problem to look at, not to truncate.

DBSCAN is a batching device. It never decides that two observations are the same place; `minpoints` larger than 1 or any density parameter would introduce border-point order dependence and is not allowed.

Evidence (geometry only, no labels), `sql/neon/verify_poi_candidates.sql` shape: on the 2026-10-09 samples (NEA and Wikidata hawker points; LTA label centroids and URA outlines) the DBSCAN-then-`ST_DWithin` generator returned 422 pairs, equal to the brute-force oracle's 422 (no index, no clustering, `ST_Distance` instead of `ST_DWithin`) with 0 missing and 0 extra, under six different input orders with one identical pair digest; DBSCAN partitions of the hawker and station kinds were identical under the same six orders.

### 7. Name normalisation and similarity

`shared/poi/normalize.ts` exposes `normalizeName(kind, raw, source) -> { core, subtype, subtypeAttr, aliases, labelKind, nameStyle, coreKey }`, driven by a versioned lexicon (`shared/poi/lexicon.ts`). Steps, in order:

1. Unicode NFKC, strip diacritics, lower-case; remove apostrophes; `&` becomes `and`; other punctuation becomes a space; collapse spaces.
2. Parenthetical aliases: text in parentheses becomes an alias; the text outside is the primary name. School level suffixes `(PRIMARY)`, `(SECONDARY)`, `(JUNIOR)`, `(MAIN)` are level words, not aliases.
3. Address-style detection: a primary name made of a street name, `Blk` and a number with no alias gets `nameStyle = address` and the name channel is absent for it.
4. Station labels: a label matching `^[A-Z]{2}[0-9]{1,2}$` gets `labelKind = code` (name channel absent). A trailing `MRT STATION` or `LRT STATION` becomes `subtypeAttr = MRT | LRT`; `INTERCHANGE`, `STATION` and `MRT` are ignored as name words for stations.
5. Abbreviation dictionary, by kind (examples): parks `PK -> park`, `PG -> playground`, `OS -> open space`, `FC -> fitness corner`; addresses `JLN -> jalan`, `RD -> road`, `AVE -> avenue`; schools `ST. -> saint` only before a name and after `CHIJ`, `ST` at the end of an address is `street`.
6. Stop words (`the`, `of`, `and`, `blk`, `block`, `singapore`) removed.
7. Subtype lexicon extraction: words that distinguish entities are moved out of the core into `subtype` (hawker: `hawker`, `centre`, `food`, `market`, `village`, `complex`, `cooked`; park: `park`, `garden`, `nature`, `reserve`, `playground`; school levels stay in the core because they distinguish entities).
8. `core` is the sorted token list; `coreKey` is the space-free concatenation (so `SENG KANG` equals `Sengkang`).

Name channel (computed by the decider from two normalised records):

| Channel | Definition |
| --- | --- |
| `EXACT` | `coreKey` equal and subtype sets equal or one empty |
| `ALIAS` | `EXACT` between one record's alias and the other's primary name, or between aliases |
| `NEAR_SPELL` | cores equal except one token within Damerau-Levenshtein distance 1, token length at least 3 |
| `NEAR_EXT` | one core is a strict subset of the other, at most two extra tokens |
| `NEAR_SUBTYPE` | cores equal, subtype sets differ and neither is empty |
| `DIFF` | none of the above |
| `NA` | code label, address-style name with no alias, null or placeholder (`<Null>`, `na`) |

`pg_trgm` is used for two things only: a candidate filter for registers that have no geometry, and a feature `trgm` stored in `poi_match.features` for reviewers. It is never an input to a class above `ambiguous`. The decider's design assumption that no similarity threshold is safe is backed by the pairs in Problem point 1.

Code-named labels. The 17 exits of the seven code labels resolve only through rules, never by rewriting the source:

| Label | LTA registry row | Wikidata item and code | URA outline within the tight band | Result under the rules |
| --- | --- | --- | --- | --- |
| `CC9` | yes (Paya Lebar) | Q3272113, CC9 | PAYA LEBAR INTERCHANGE | registry rule; also collapses with the name label `PAYA LEBAR MRT STATION` |
| `DT18` | yes (Telok Ayer) | Q7697794, DT18 | TELOK AYER | registry rule; collapses with `TELOK AYER MRT STATION` |
| `DT4` | no | Q62004591, DT4 | HUME | spatial-only |
| `NE18` | no | Q30643856, NE18 | PUNGGOL COAST | spatial-only |
| `CC31` | no | Q19580291, CC31 | CANTONMENT | spatial-only |
| `CC32` | no | Q22082862, CC32 | PRINCE EDWARD ROAD | spatial-only |
| `CC30` | no | Q20983869 (Keppel), no code statement | KEPPEL | spatial-only |

With only URA admitted (Wikidata is an alias dictionary), the LTA code rows exist for two of seven labels, so five labels resolve by the weaker `R-RS-SPATIAL-ONLY` rule and stay `rule-supported` with `CODE_NAMED_LABEL`. Vendoring Wikidata station codes as a reviewed alias dictionary would let `R-RS-REGISTRY-CODE` back six of them with a name channel instead of two, and would turn a code that names a different station than the nearest outline into an `ambiguous` pair (`R-AMB-GEO-ONLY`) instead of a silent spatial match; the class stays `rule-supported`, because a dictionary-mediated key is a third party's assertion. `R-VER-KEY-CODE` is reserved for a code carried on the other source's own record (as in the Wikidata example below, where Wikidata stands in for such a source). Whether to vendor the dictionary is a choice for the owner (it adds a CC0 data file and a maintenance duty).

### 8. Decision classes

#### 8.1 Pair features and bands

For a candidate pair `(a, b)` from two admitted sources of **different independence groups** and the same kind, after intra-source collapse (section 8.5):

- `key`: `EQ`, `CONFLICT` or `NA`. Postal code (six digits, zero padded) for registers and hawker centres; station codes for stations (a code label equal to the other record's code is `EQ`).
- `name`: the channel in section 7.
- `geo`: distance `d` in SVY21 metres (0 inside a footprint) mapped by the kind's bands: `T1` (`d <= t1`), `T2` (`t1 < d <= t2`), `FAR` (`t2 < d <= rb`), `BEYOND` (`d > rb`), `NA` when either side has no geometry.
- `life`: `CONFLICT` when one record is `operational` and the other `planned`, `under_construction` or `interim`, when station subtypes differ (`MRT`, `LRT`, `monorail`, `railway`), or when park classes differ (park against playground); `unknown` is compatible with everything.

Provisional bands in metres (placeholders: chosen from point precision and footprint sizes, informed by the offsets seen in the samples, **not** fitted to labels; replace only through approved labels):

| Kind | `t1` | `t2` | `rb` | Outline `t1` / `t2` / `rb` |
| --- | --- | --- | --- | --- |
| `mrt_station` | 150 | 300 | 500 | 50 / 150 / 300 |
| `mrt_exit` | 15 | 40 | 100 | 50 / 150 / 300 (membership) |
| `school` | 100 | 250 | 600 | |
| `supermarket` | 75 | 200 | 400 | |
| `hawker_centre` | 60 | 150 | 400 | |
| `park` | 150 | 500 | 800 | 0 / 100 / 300 |

#### 8.2 Tiers and exclusivity

A pair's **tier** is A when `key = EQ` or `name` is `EXACT` or `ALIAS`; B when `name` is a `NEAR_*`; C otherwise (geometry or registry only). Tiers are processed in order A, B, C. Within a tier a pair is **positive** when it is not rejected and its geometry is `T1`, `T2` or `NA` (tier C needs `T1`). Per observation and other source, the best positive candidate is the one of best name rank (`EXACT`, `ALIAS`, key only, then `NEAR_*`), then geometry, then distance. A pair is **mutual** when each side's best candidate is the other and no equally ranked competitor exists on either side. Mutual pairs of a tier get a verified or rule-supported class and their endpoints become **taken**; equal-strength competitors make every pair among them `ambiguous`. Observations taken in an earlier tier do not take part in later tiers: a later pair that involves one is `rejected` if its name is `ALIAS`, `NEAR_SPELL`, `NEAR_SUBTYPE` or `DIFF`, and `ambiguous` if it is `NEAR_EXT`. For `NEAR_EXT` pairs the competitor count uses the block radius, because sub-area records of a large place can sit far from the other source's point.

This gives "exact dominates near" without a score, and makes every outcome a function of the pair set, not of iteration order.

#### 8.3 Rule table

First match wins in this order; ids are stored in `poi_match.rule_ids` with `rule_set_version`.

| # | Id | Fires when | Class |
| --- | --- | --- | --- |
| 1 | `R-REJ-LIFECYCLE` | `life = CONFLICT` | rejected |
| 2 | `R-REJ-KEY-CONFLICT` | `key = CONFLICT` and `name` is not `EXACT` or `ALIAS` | rejected |
| 3 | `R-REJ-NAME-FAR` | `name` is `DIFF` or `NA` and `geo` is `FAR` or `BEYOND` | rejected |
| 4 | `R-REJ-DOMINATED` | an endpoint is taken by an earlier-tier partner and `name` is `ALIAS`, `NEAR_SPELL`, `NEAR_SUBTYPE` or `DIFF` | rejected |
| 5 | `R-AMB-MULTI` | at least two equal-strength candidates in the pair's tier | ambiguous |
| 6 | `R-AMB-EXTENSION` | `name = NEAR_EXT` and an endpoint is taken by an earlier-tier partner | ambiguous |
| 7 | `R-AMB-CHANNEL-CONFLICT` | `name` is `EXACT` or `ALIAS` and (`geo` is `FAR` or `BEYOND`, or `key = CONFLICT`) | ambiguous |
| 8 | `R-VER-KEY-NAME` | mutual, `key = EQ`, `name` is `EXACT` or `ALIAS`, `geo` is `T1`, `T2` or `NA` | verified |
| 9 | `R-VER-KEY-CODE` | mutual, the label is a code equal to the other record's station code, `geo` is `T1` or `T2` | verified |
| 10 | `R-VER-NAME-GEO` | mutual, `key = NA`, `name = EXACT`, `geo = T1` | verified |
| 11 | `R-RS-REGISTRY-CODE` | mutual, the label is a code, the registry maps it to a name equal to the other record's name, `geo` is `T1` or `T2` | rule-supported |
| 12 | `R-RS-ALIAS-GEO` | mutual, `name = ALIAS`, `key = NA`, `geo` is `T1` or `T2` | rule-supported |
| 13 | `R-RS-EXACT-WIDE` | mutual, `name = EXACT`, `key = NA`, `geo = T2` | rule-supported |
| 14 | `R-RS-NEAR-GEO` | mutual, `name` is a `NEAR_*`, `geo` is `T1` or `T2`, `key` is not `CONFLICT` | rule-supported |
| 15 | `R-RS-KEY-NEAR` | mutual, `key = EQ`, `name` is a `NEAR_*` | rule-supported |
| 16 | `R-RS-REGISTER-EXACT` | school register only: mutual, `name = EXACT`, `key = NA`, `geo = NA`, name unique in both sources | rule-supported |
| 17 | `R-RS-SPATIAL-ONLY` | stations and exits only: mutual, `name = NA`, `geo = T1`, the only candidate | rule-supported |
| 18 | `R-AMB-GEO-ONLY` | `name` is `DIFF` or `NA` and `geo` is `T1` or `T2`, not matched by 17 | ambiguous |
| 19 | `R-AMB-INSUFFICIENT` | `name` is `EXACT`, `ALIAS` or a `NEAR_*`, `key = NA`, `geo = NA`, not matched by 16 | ambiguous |
| - | `R-UNM-NO-CANDIDATE` | observation level: no pair of this observation matched any rule | unmatched |

Intra-source policy (never automatic merges): `R-AMB-INTRA-COLLISION` (equal identity key within `RB`, flagged `KEY_COLLISION`), `R-REJ-INTRA-DISTINCT-KEY` (different identity keys), `R-REJ-INTRA-FAR` (equal key beyond `RB`). Collapse is the only intra-source union and it has two named forms, `R-COLLAPSE-FOOTPRINT` (outlines of one source with the same core name and subtype within 150 m, as the three Dhoby Ghaut outlines) and `R-COLLAPSE-REGISTRY` (a code label and a name label that a registry row equates, centroids within `t2`).

#### 8.4 Entities

An entity is a connected component over observations joined by `verified` and `rule-supported` pairs and collapse edges.

| Field | Rule |
| --- | --- |
| `resolution_class` | weakest class among its edges (`rule-supported` below `verified`); `ambiguous` for an observation with no positive edge and at least one ambiguous pair; else `unmatched` |
| `corroboration_scope` | `multi-source` when the entity has two independent sources; `single-source-by-design` when the kind has only one admitted source; `single-source-uncorroborated` when a second source exists for the kind but did not match |
| `canonical_name` | the name of the lowest `anchor_rank` member; aliases stay on observations |
| `location`, `location_observation` | the member with the best `position_method` rank, then `anchor_rank`, then id |
| `position_uncertainty_m` | maximum geodesic distance among position-bearing members from independent sources; `null` when there is one |
| `lifecycle` | most specific known; `unknown` stays `unknown` |
| `caveats` | `SINGLE_SOURCE`, `CODE_NAMED_LABEL`, `POSITION_GEOCODED_FROZEN`, `POSITION_SINGLE_SOURCE`, `POSITION_DISAGREEMENT`, `ADDRESS_STYLE_NAME`, `KEY_COLLISION`, `COORD_ATTR_MISMATCH`, `COORD_ATTR_SWAPPED`, `STALE_SOURCE`, `GRANULARITY_MISMATCH`, `LIFECYCLE_UNKNOWN` |
| `ambiguous_with` | entity ids of the other side of each ambiguous pair |
| `parent_entity_id` | for exits: the entity of the exit's station label observation |

Examples under these rules (all from unapproved proposals; "holds" is the owner-to-confirm truth proposal):

| Proposal id | Pair | Rule | Class |
| --- | --- | --- | --- |
| `mrt_station-001` | LTA BEDOK centroid and URA BEDOK outline, 0.7 m, equal names | `R-VER-NAME-GEO` | verified |
| `mrt_station-010` | LTA `CC31` and Wikidata Cantonment (code CC31) | `R-VER-KEY-CODE` | verified |
| `mrt_station-021` | LTA `CC30` and URA KEPPEL outline 16.4 m away; no code on either | `R-RS-SPATIAL-ONLY` | rule-supported |
| `mrt_station-024` | LTA Fort Canning and URA outline named RIVER VALLEY that contains it | `R-AMB-GEO-ONLY` | ambiguous |
| `mrt_station-027` | LTA Bencoolen and Wikidata Bras Basah, 178.6 m | `R-REJ-DOMINATED` | rejected |
| `mrt_station-025` | LTA Tuas Link and a Wikidata point 684.6 m away, equal names | `R-AMB-CHANNEL-CONFLICT` | ambiguous |
| `hawker_centre-020` | NEA "Hawker Centre @ Our Tampines Hub" and Wikidata "The Hawker Centre @ Our Tampines Hub", 90.5 m | `R-RS-EXACT-WIDE` | rule-supported |
| `hawker_centre-026` | NEA "Redhill Market" and the Wikidata item "Redhill Food Centre" already taken by Blk 85 | `R-REJ-DOMINATED` | rejected |
| `hawker_centre-024` | NEA address-only name and Wikidata Bedok Interchange Hawker Centre, 12.6 m | `R-AMB-GEO-ONLY` | ambiguous |
| `school-009` | MOE Radin Mas (postal `99840` as published) and Wikidata (`099840`) | `R-VER-KEY-NAME` | verified |
| `school-021` | MOE Greenridge and Wikidata, equal names, postal codes disagree | `R-AMB-CHANNEL-CONFLICT` | ambiguous |
| `school-031` | MOE Zhenghua and Wikidata Zhonghua | `R-REJ-DOMINATED` | rejected |
| `park-015`, `park-024` | NParks BIDADARI PK (exact) and BIDADARI PARK SOUTH (extension) against one Wikidata item | `R-VER-NAME-GEO`, `R-AMB-EXTENSION` | verified, ambiguous |
| `mrt_exit-001` | two `CHOA CHU KANG MRT STATION` `Exit A` records 3.5 m apart | `R-AMB-INTRA-COLLISION` | ambiguous |

Wikidata is the second record in the station, hawker, school and park examples only because it was the sampled second source for those kinds. It is not admitted (the registry lists it as an alias dictionary), the fixtures assign the class "independent of whether either source is admitted", and under R7.2 these pairs would not be evaluated at all until a second source in another independence group is admitted. The examples show which rule fires, not that either source is evidence for the other.

#### 8.5 Why thresholds are placeholders

Every band and the 10 % attribute share are written down so they can be reviewed, versioned and replaced; none was tuned against labels, and none will be until the owner approves labels (R7.5, R12.1). Changing one bumps `rule_set_version`, recomputes everything and, once approved labels exist, re-reports the metrics.

### 9. Deterministic identifiers

- `observation_id = 'obs_' || substr(encode(sha256(source_id || E'\x1f' || poi_kind || E'\x1f' || source_record_key), 'hex'), 1, 32)`. Only these three inputs, so reordering, re-fetching or loading sources in another order cannot change it.
- `entity_id = 'poi_' || kind || '_' || substr(encode(sha256('anchor' || E'\x1f' || anchor_observation_id), 'hex'), 1, 26)`, where the anchor is the member with the lowest `(anchor_rank, observation_id COLLATE "C")`.
- Anchors are a function of the current observation set. A new lower-ranked member never changes the id; a new higher-ranked member (for example an official register entering a cluster of community records) does. That event writes `poi_entity_alias(old, new, 'anchor-changed')`, as do merges and splits, so stored references (shortlists, links) can follow.
- Digest: `sha256` over the sorted canonical JSON of `poi_match` and `poi_entity` rows for a rule-set version, stored with the publication. The property test shuffles observations, publications and source load order at least 100 times and requires one digest.
- SQL uses `COLLATE "C"` for every ordering and tie-break, like `NEARBY_SPATIAL_SQL`, and no `ROW_NUMBER()` over an unordered set.

| Event | Observation ids | Entity ids |
| --- | --- | --- |
| Rerun, identical inputs, any order | unchanged | unchanged |
| New publication of a source, same record keys | unchanged | unchanged |
| Record key changes upstream (renumbered `OBJECTID`) | new id for the changed record | the entity keeps its id if its anchor is unchanged; otherwise an alias row |
| Lower-ranked observation joins | unchanged | unchanged |
| Higher-ranked observation joins | unchanged | alias row, new id |
| Entity splits | unchanged | alias rows for the parts |

`OBJECTID` stability across releases is not guaranteed by the agencies (UNVERIFIED), so each adapter also stores `INC_CRC` and `FMEL_UPD_D` as drift evidence and reports records whose key persists with materially different content.

### 10. Storage

New Neon-only tables (sketch below was executed on the scratch database; constraint names and exact text will be finalised in Phase 1). None of the nine publisher-scanned tables changes, so `NeonPlanningStore.inspectSchema()` is unaffected.

```sql
CREATE TABLE poi_source (
  source_id text PRIMARY KEY CHECK (source_id ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  publisher text NOT NULL, dataset_ref text NOT NULL,
  dataset_url text NOT NULL CHECK (dataset_url !~ '[?]'),         -- landing page, never a pre-signed URL
  licence_id text NOT NULL, licence_url text NOT NULL,
  licence_class text NOT NULL CHECK (licence_class IN ('permissive','attribution','share-alike')),
  attribution_text text NOT NULL, independence_group text NOT NULL,
  anchor_rank smallint NOT NULL CHECK (anchor_rank BETWEEN 1 AND 99),
  position_method text NOT NULL CHECK (position_method IN
    ('source-point','source-polygon','derived-centroid','geocoded-cache','none')),
  declared_crs text NOT NULL, key_spec text NOT NULL,
  admission_status text NOT NULL CHECK (admission_status IN ('candidate','admitted','suspended','rejected')),
  admission_ref text NOT NULL
);

CREATE TABLE poi_publication (
  publication_id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES poi_source,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  retrieved_at timestamptz NOT NULL, upstream_updated_at timestamptz,
  record_count integer NOT NULL CHECK (record_count >= 0),
  status text NOT NULL CHECK (status IN ('staged','accepted','quarantined','superseded')),
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb, rule_set_version text,
  UNIQUE (source_id, content_sha256)
);
CREATE UNIQUE INDEX poi_publication_one_accepted ON poi_publication (source_id) WHERE status = 'accepted';

CREATE TABLE poi_observation (
  observation_id text PRIMARY KEY,
  publication_id text NOT NULL REFERENCES poi_publication,
  source_id text NOT NULL REFERENCES poi_source,
  poi_kind text NOT NULL CHECK (poi_kind IN
    ('mrt_station','mrt_exit','school','supermarket','hawker_centre','park')),
  source_record_key text NOT NULL CHECK (length(btrim(source_record_key)) > 0),
  raw_name text, name_norm text, aliases text[] NOT NULL DEFAULT '{}',
  identity_keys jsonb NOT NULL DEFAULT '{}'::jsonb, subtype text,
  lifecycle text NOT NULL CHECK (lifecycle IN
    ('operational','planned','under_construction','interim','unknown')),
  status_raw text,
  lng double precision CHECK (lng BETWEEN 103.0 AND 105.0),
  lat double precision CHECK (lat BETWEEN 1.0 AND 2.0),
  position_method text NOT NULL, coord_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  location geography(Point,4326) GENERATED ALWAYS AS (
    CASE WHEN lng IS NULL OR lat IS NULL THEN NULL
         ELSE ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography END) STORED,
  loc_svy21 geometry(Point,3414) GENERATED ALWAYS AS (
    CASE WHEN lng IS NULL OR lat IS NULL THEN NULL
         ELSE ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 3414) END) STORED,
  footprint_svy21 geometry(MultiPolygon,3414),
  admission text NOT NULL CHECK (admission IN ('included','excluded')),
  exclusion_code text, source_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_flags text[] NOT NULL DEFAULT '{}',
  CHECK ((lng IS NULL) = (lat IS NULL)),
  CHECK (admission = 'included' OR exclusion_code IS NOT NULL)
);
CREATE INDEX ON poi_observation USING gist (loc_svy21);
CREATE INDEX ON poi_observation USING gist (footprint_svy21);
CREATE INDEX ON poi_observation USING gin (name_norm gin_trgm_ops);

CREATE TABLE poi_match (
  obs_a text NOT NULL REFERENCES poi_observation, obs_b text NOT NULL REFERENCES poi_observation,
  decision text NOT NULL CHECK (decision IN ('verified','rule-supported','ambiguous','rejected')),
  rule_ids text[] NOT NULL CHECK (cardinality(rule_ids) >= 1),
  rule_set_version text NOT NULL, features jsonb NOT NULL,
  decided_by text NOT NULL CHECK (decided_by IN ('rules','owner-override')),
  PRIMARY KEY (obs_a, obs_b),
  CHECK (obs_a COLLATE "C" < obs_b COLLATE "C")
);
-- poi_entity, poi_entity_member, poi_entity_alias, poi_rule_set: as in requirements R9.2
```

`poi_entity` carries `entity_id`, `poi_kind`, `anchor_observation`, `canonical_name`, `location geography(Point,4326)`, `location_observation`, `position_uncertainty_m`, `resolution_class` (`verified`, `rule-supported`, `ambiguous`, `unmatched`), `corroboration_scope`, `lifecycle`, `caveats text[]`, `ambiguous_with text[]`, `parent_entity_id` and `rule_set_version`.

Serving view (executed on the scratch database over singleton NEA entities):

```sql
CREATE VIEW poi_serving_v1 AS
SELECT e.entity_id AS id, e.poi_kind AS kind, e.canonical_name AS name,
       ST_Y(e.location::geometry) AS lat, ST_X(e.location::geometry) AS lng, e.location,
       e.resolution_class, e.corroboration_scope, e.position_uncertainty_m,
       e.lifecycle, e.caveats, e.ambiguous_with, e.parent_entity_id
FROM poi_entity e
WHERE e.lifecycle IN ('operational','unknown')
  AND NOT EXISTS (SELECT 1 FROM poi_entity_member m
                  JOIN poi_observation o ON o.observation_id = m.observation_id
                  JOIN poi_publication p ON p.publication_id = o.publication_id
                  WHERE m.entity_id = e.entity_id AND p.status <> 'accepted');
```

With the NEA gate applied, the scratch run produced 122 entities (129 records, 7 excluded: 6 `Under Construction`, 1 `Interim Centre`), and a query shaped like `NEARBY_SPATIAL_SQL` over the view (same `ORDER BY distance, kind COLLATE "C", id COLLATE "C"`, `LIMIT`) returned the five nearest around Toa Payoh.

Grants: the writer role (OD3) holds DML on the `poi_*` tables; the existing SELECT-only runtime role gets `SELECT` on `poi_serving_v1` and nothing else; no function in this design is `SECURITY DEFINER`. `poi_locations` keeps serving MRT until Phase 11; the four reserved kinds are never written to `poi_locations`, so there is no dual write path.

### 11. Exposure through the nearby API

`NearbyPlace` gains an optional block (Zod and TypeScript together, R10.4):

```ts
type PoiResolution = {
  class: "verified" | "rule-supported" | "ambiguous" | "unmatched";
  scope: "multi-source" | "single-source-by-design" | "single-source-uncorroborated";
  sources: { sourceId: string; attributionKey: string }[];
  positionUncertaintyMetres: number | null;
  lifecycle: "operational" | "planned" | "under_construction" | "interim" | "unknown";
  caveats: PoiCaveatCode[];
  ambiguousWith?: string[];
};
```

Semantics:

- No hidden uncertainty: `unmatched` entities are returned with `SINGLE_SOURCE`; `ambiguous` entities are returned as separate places that list each other; `rejected` pairs are never shown. Counts such as "N parks within 1 km" are entity counts with the class mix available, not a single number that hides the mix.
- MRT exits are grouped by `parent_entity_id` when the parent station entity is `verified` or `rule-supported`; otherwise by the verbatim label, with `CODE_NAMED_LABEL`. The user guide's sentence "one entry per source-recorded station name, not per physical station" becomes true per class.
- Distances stay ellipsoidal straight-line metres; nothing is described as walking.
- `types` grows from three kinds to seven. The canonical cache key space grows with it (127 non-empty subsets instead of 7, about 18 times larger); Phase 8 either keeps `types` to a small fixed set of presets or restates the bound in `MAX_NEARBY_CACHE_KEYS` and its test.
- A promotion changes results, so each one needs a new `NEON_PUBLIC_CACHE_EPOCH` (existing mechanism). The capability probe stays configuration-only.
- With the flag off the route answers exactly as today.

### 12. Source-specific gates

| Source | Gate | Exclusion code | Evidence |
| --- | --- | --- | --- |
| NEA hawker | `STATUS` must start with `Existing` | `STATUS_NOT_EXISTING` | 6 `Under Construction`, 1 `Interim Centre` of 129 |
| NEA hawker | SVY21 attributes checked against geometry (R4.3) | flag only | one swapped pair, five offsets of 0.5 m to 49 m |
| NParks points | suffix class table decides `park` | `PARK_CLASS_*` | by a simple suffix pattern: 162 playgrounds, 18 open spaces, 5 fitness corners, 1 car park of 462 |
| MOE | pad postal codes; keep two schools at one postal code separate; keep only allow-listed columns | none | 4 codes lost a zero; 2 shared campuses; personal-data columns |
| NEA/SFA licences | company legal-entity check, supermarket allow-list (OD4), usable postal code | `LICENSEE_NOT_A_LEGAL_ENTITY`, `NOT_ALLOW_LISTED_SUPERMARKET`, `NO_USABLE_ADDRESS` | natural-person licensees; butchers and fishmongers; one `0na` record; stale since 2024-06-06 |
| URA outlines | `lifecycle = unknown`; null and `<Null>` names are `NA` | none | 9 unnamed outlines; 39 outlines without an LTA partner |
| LTA exits | code labels flagged; `(label, code)` is not a key | flag only | 7 code labels, 8 colliding code groups |
| Geocode cache | `position_method = geocoded-cache`, frozen, never refreshed | none | OneMap Search is token-gated |

## Labelling protocol

Purpose: turn agent proposals into evidence the project can trust, and stop anyone reporting a number before that exists.

1. **Who.** The project owner is the approver. A second reviewer is optional (decision OD7). The agent that proposed labels is never a reviewer, and its output is never evidence.
2. **What is labelled.** Two things per pair, kept apart: `relationHolds` (`yes`, `no`, `part-of`, `undetermined`) and `classShouldBe` (the class the rule table should give from the evidence shown). The PROPOSED files carry both as proposals.
3. **Evidence required.** For each entry the reviewer records at least two independent public channels used, for example the agency's own listing page, a map or aerial view, and the two source records' fields and distance; the entry stores `evidenceUsed` and `reviewedOn`. Scraping brand sites and relying on the proposal text are not evidence.
4. **Blinding.** For the random sample (below) the reviewer sees the two records, the distance and the sources but not the proposed or pipeline class. Curated entries may show the proposal.
5. **Agreement rule.** One reviewer: the entry is `approved` when confirmed, `corrected` when changed (both the proposal and the correction are stored). Two reviewers: both must agree on both fields; otherwise the entry is `disputed` and excluded from every metric until the owner settles it in writing. There is no majority vote.
6. **Two uses, never mixed.** Approved **curated** cases (the hand-picked entries) become `tests/fixtures/poi-ground-truth/<kind>.json` and serve as regression tests; they cannot estimate a rate because they were chosen, not sampled. **Metrics** come from a separate sample: for each `(kind, source pair, pipeline class)` stratum, sort candidate pairs by `sha256(rule_set_version || stratum || obs_a || obs_b)` and take the first `n`. With zero observed false merges in `n = 150` pairs the 95 % upper bound on the false-merge rate is about 2 % (rule of three), so 150 per stratum is the starting size; the owner may choose differently (OD7).
7. **What is reported, and only then.** False-merge rate among `verified` and `rule-supported`; miss rate among `ambiguous` and `unmatched` where the label is `yes`; the share of `ambiguous`; each with a Wilson 95 % interval, per kind and source pair and rule id, together with the label-set hash and `rule_set_version`. Never pooled across kinds.
8. **Storage and guard.** Approved files are named without the `PROPOSED-` prefix and carry `status: "APPROVED"`, the approver, the date and no `unapproved` entry. A guard test fails if any test imports a `PROPOSED-*` file or an approved file contains an unapproved entry.
9. **Re-review.** A `rule_set_version` bump, a source schema change, or a publication that changes more than 5 % of a kind's entities re-opens the affected labels.

## Testing

| Suite | What it proves | Phase |
| --- | --- | --- |
| `tests/unit/poi-normalize.test.ts` | normalisation steps, code labels, address style, aliases, level words kept, trigram never decisive (table-driven from the real strings above) | 3 |
| `tests/unit/poi-decide.test.ts` | each rule fires on a constructed feature row; precedence; tiers and exclusivity; intra-source policy | 5 |
| `tests/unit/poi-ids.test.ts` | formulas, alias rows, 100-shuffle digest equality | 5 |
| `tests/unit/poi-adapters-*.test.ts` | allow-lists (no personal data), gates, zero padding, status mapping, using tiny typed fixtures cut from `tests/fixtures/public-data/`-style samples | 6 to 10 |
| `tests/unit/poi-crs.test.ts` | the adversarial table in 5.4 on the TypeScript guards, plus the lint for `ST_SetSRID(..., 3414)` | 2 |
| `sql/neon/verify_poi_crs.sql` | PostGIS side of 5.4 including mutants | 2 |
| `sql/neon/verify_poi_candidates.sql` | generator equals the brute-force oracle for every kind; shuffle digests; the degrees-as-metres mutant fails | 4 |
| `sql/neon/verify_poi_quarantine.sql` | a failing publication changes nothing served; promotion is atomic | 1 and 4 |
| `tests/unit/poi-fixture-guard.test.ts` | no test imports `PROPOSED-*`; approved files are clean | 12 |
| nearby route and Worker gate suites | flag off is byte-identical; flag on adds the block; Zod and types agree | 8 |

Mutants that must fail the verifiers: a generator that clusters before projecting; `minpoints > 1`; `ST_SetSRID(..., 3414)` in place of `ST_Transform`; trigram-only acceptance; picking the farthest exit per station; dropping the status gate.

## Risks and trade-offs

- **Single-source honesty versus noise.** Five of six kinds show `SINGLE_SOURCE` everywhere at first. That is the truth; the UI copy and the response grouping must make it calm rather than alarming. Mitigation: caveats are codes, copy lives in one adapter like the existing caveat messages.
- **Two languages, one decision.** SQL computes features and TypeScript decides. A drift would show as feature rows the decider cannot interpret; the verifiers run the SQL features against the oracle, and the decider's tests use feature rows, not databases.
- **Placeholder thresholds.** Until approved labels exist the bands are guesses. Mitigation: they are named, versioned, never fitted to unapproved labels, and the classes degrade to `ambiguous`, not to a wrong merge, when evidence is weak.
- **ODbL.** Excluded (OD1 = A, 2026-10-10). Were a share-alike source ever added, strict table separation and a public derivative release would be real engineering and legal work, which is why `licence_class` stays on every source and observation.
- **Overture quality.** "High junk rate" is the publisher's own statement; the admission gate for it is a sample evaluation (OD2), not an assumption.
- **Wikidata alias dictionary.** CC0 and useful, but vendored codes can go stale; each entry carries a retrieval date and a reviewer.
- **Key stability.** Agency `OBJECTID`s may be renumbered; the id table and drift report make that visible rather than silent.
- **Stale registers.** The supermarket register is more than two years old at the time of writing; `STALE_SOURCE` and the horizon make that visible.
- **Cost on Neon.** Entity builds are set-based and index-backed; nothing is measured yet beyond the 2026-10-09 sample sizes (all under a thousand rows per kind). A benchmark is a non-goal here.
- **Cache keyspace.** Seven kinds multiply the bound by about 18; Phase 8 restates it.
- **Rollback.** D1 holds no POI tables; rolling the Worker back to D1 simply has no nearby feature, as today.

## Open questions

- Which of the owner decisions OD2 to OD8 (admission document, section 7) are settled, and in what order; OD1 is settled (OpenStreetMap is not used), so OD2 (the Overture sample) now gates the most value.
- Whether the Wikidata station-code alias dictionary is worth vendoring (it lets the registry-code rule back six of seven code labels with a name channel instead of two, and turns a mismatching code into an `ambiguous` pair; the class stays `rule-supported`).
- Whether `mrt_station` entities should show the LTA label or a canonical name once resolved, and in which language (the LTA registry also carries Chinese names).
- Whether the nearby API should expose `ambiguous` entities by default or only on request.
