# Design: POI Source Integration

> Status: Proposed. This spec adds no code, migration or data. The source-by-source analysis (licences, coverage, quality and the admission recommendation) is in the evidence attached to PR #428, with its commands in the PR description, not in the repository. OpenStreetMap is excluded by the owner's decision of 2026-10-10. Section 10 is a key list, not DDL.

## Problem

`poi_locations` (`sql/neon/001_postgis_nearby.sql`) holds one source (LTA exits and their derived station centroids), no per-row provenance, and a primary key of `(source, poi_kind, source_id)`. Four of its six kinds are reserved until "independently admitted source data is available". Adding sources by joining on name or proximity would go wrong in ways the evidence already shows:

1. **Names are not identities.** Different schools can be closer by name than one hawker centre is to its own common name; no similarity threshold separates them.
2. **Labels can be codes.** Some `STATION_NA` values are station codes, and a station that also appears under its name takes two result slots (`docs/architecture/postgis-nearby.md`).
3. **Sources lie about lifecycle and type.** Hawker centres under construction, "parks" that are playgrounds or car parks, planned stations in planning outlines, theme parks under a "park" class.
4. **Registers have no coordinates.** MOE and the supermarket licence register give identity only, and the one anonymous geocoder is token-gated.
5. **Coordinate systems bite.** A source can carry swapped SVY21 attributes; `ST_DWithin` on SRID 4326 geometry reads its distance in degrees; `ST_SetSRID(point, 3414)` on degrees lands tens of kilometres away.
6. **Licences differ.** SODL, CDLA, CC0 and ODbL impose different obligations, and ODbL's share-alike may attach to a merged table.

## Goals

- Record where every POI observation came from, before anything is aggregated (provenance before aggregation).
- Resolve observations of the same place across independent sources with rules that are exact, deterministic, versioned and explainable per pair, and say how sure we are: five classes, a corroboration scope, position uncertainty and caveat codes, never a silent merge.
- Fail closed per publication: a bad fetch is quarantined, never partially promoted, and never replaces good data.
- Keep geometry honest (geodesic on `geography` for people, SVY21 metres only through `ST_Transform` for machines) and results reproducible (identical inputs give identical ids and outputs in any order).
- Keep evaluation honest: no accuracy figure without owner-approved labels.
- Land in small, independently verifiable pull requests.

## Non-goals

- Admitting any source (that is gated by the owner decisions OD1 to OD8 under "Decisions").
- Walking distances, routing or travel times (OneMap routing stays a separate, token-gated concern).
- Runtime fetching of any upstream source, runtime geocoding, or any hosted AI, embedding or reranking service.
- Machine-learning matching. DBSCAN is only a way to batch candidates; every decision is a rule.
- Changing D1, the nine publisher-scanned Neon tables, or the existing MRT fail-closed trigger.
- Reverse geocoding, a 1M-point benchmark, or a second authoritative HDB dataset.

## Decisions

Decided by the owner (2026-10-10) or fixed by the project's constraints. The analysis behind each is in the evidence attached to PR #428.

| Decision | Reason |
| --- | --- |
| **OpenStreetMap is not used** (OD1, option A) | ODbL share-alike attaches to a publicly used derivative database, and the OSMF Collective Database guideline places a merged "own list plus OSM, duplicates removed" outside its safe harbour. The alternatives were rejected: internal corroboration only (B) turns on whether even a boolean is a "Produced Work", and a separate ODbL layer (C) commits the project to publishing a derivative layer |
| Only Singapore Open Data Licence, CDLA-Permissive-2.0, Apache-2.0 and CC0 sources feed `poi_*` | Anything else needs a new, explicit decision; `licence_class` stays on every source and observation so that a share-alike source could be excluded or separated |
| No source that needs a token, account or key | OneMap Search has needed a token since 1 October 2025 and the owner ruled tokens out, so geocodes already in `geocode_cache` are frozen, single-source evidence and no new school or supermarket coordinates are produced (OD6) |
| `mrt_station` is the only kind with two licence-clear, anonymous sources today | LTA exit points (the station point is their centroid) and URA rail-station outlines, both under SODL. Every other kind is single-source by design until a second source is admitted: Overture Places (per-provider CDLA-Permissive-2.0, Apache-2.0 or CC0-1.0; not yet sampled, OD2) and, for parks, URA Land Use polygons as area evidence |
| Single-source kinds say so | `corroboration_scope = single-source-by-design` and the caveat `SINGLE_SOURCE`; nothing is "verified" without two independent sources agreeing |
| SQL computes features, TypeScript decides | One authoritative decider that Vitest can test without PostGIS, with the SQL features verified against brute-force oracles (section 1) |
| Quarantine is additive | The fail-closed MRT trigger stays unchanged until a separate, owner-approved migration (R2.5) |

Open owner decisions. T0.1 records the answers here, with date and rationale.

| Id | Decision | Why it blocks |
| --- | --- | --- |
| OD2 | Approve a one-off, local Overture Places extract for a Singapore bounding box with tooling that is not a repo dependency (for example DuckDB on a developer machine), and the acceptance criteria for admitting it | Overture is the best-licensed second coordinate source and has not been sampled |
| OD3 | Who writes the `poi_*` tables on the serving branch and with which role, and the rule for bumping `NEON_PUBLIC_CACHE_EPOCH` on each promotion | The serving branch is a static snapshot refreshed by no tracked job; the existing triggers and role inventory constrain any writer |
| OD4 | What counts as a supermarket (allow-list of brands, licence class, or both), and the handling of licensees that are natural persons | The register includes butchers, fishmongers, traders and individuals |
| OD5 | Ask LTA whether the DataMall static "Train Station" layer may be used under SODL, or ignore it | An official station point would improve the station kind, but its licence is not established |
| OD6 | Confirm that the token ban stands, so cached geocodes stay frozen | The only anonymous geocoder is gone |
| OD7 | Label approvers, a second reviewer if any, and minimum sample sizes per kind (see "Labelling protocol") | No metric may be reported before labels are approved |
| OD8 | Where attributions appear in the app and who owns keeping them current | SODL requires a conspicuous notice |

## Architecture

### 1. Overview

Build time (`scripts/poi`, owner-run) fetches each source into a hashed publication, validates it, stages observations, collapses duplicates within a source, forms candidate groups in SVY21, computes pair features in SQL, decides in TypeScript with a versioned rule table, and builds entities that a serving view exposes to the existing nearby query. Pure logic lives in `shared/poi/*.ts` (no I/O, never imported by `src/`), adapters and the runner in `scripts/poi/*.ts`, schema in new numbered `sql/neon/00N_poi_*.sql` files and verifiers in `sql/neon/verify_poi_*.sql`. SQL computes features and TypeScript decides, so there is one decider, testable without PostGIS.

### 2. Source registry and independence

`poi_source` has one reviewed row per source: publisher, dataset, licence and its text URL, `licence_class` (`permissive`, `attribution`, `share-alike`), attribution string, `independence_group`, `anchor_rank` (official registers first), `position_method` (ranked `source-point`, `source-polygon`, `derived-centroid`, `geocoded-cache`, `none`), key specification and `admission_status` (only `admitted` loads). Today only the LTA exit file is admitted; URA outlines, MOE, NEA, NParks and the frozen geocode cache are candidates, Overture waits on OD2, OpenStreetMap is excluded, and the LTA code registry and Wikidata station codes are alias dictionaries that never give a position. Sources in one group never corroborate each other, and copies cross groups, so every resolution run reports, per source pair, the share of mutual pairs that coincide within 0.5 m with equal names (R1.6); the report changes no class, and a high share is evidence for the owner to merge two groups (a `rule_set_version` bump).

### 3. Publications, validation and quarantine

A publication (content SHA-256) is the unit of acceptance: `staged`, then `accepted` or `quarantined`, then `superseded`, one accepted per source. Hard checks quarantine the whole publication: rows that do not parse against the source's Zod schema; record keys that are not unique and non-empty (the source's own id, `OBJECTID` for LTA exits); a geometry type other than the registry's; coordinates that are not finite, are swapped or fall outside the admission box (lng 103.55 to 104.15, lat 1.15 to 1.47, sharing the nearby request box's longitude and southern bounds); more than 10 % of rows whose SVY21 attributes differ from the transformed geometry by over 0.05 m (fewer are row flags and the geometry wins); a record count outside a band of the previous publication; fields outside the allow-list or any personal data; encoding damage. Admission gates are not failures: they mark observations `excluded` with a code, counted per code in the report. Promotion is one transaction. A quarantined publication leaves serving untouched, and the older copy gains `STALE_SOURCE` past 400 days. The fail-closed MRT trigger stays; quarantine is additive, and moving MRT onto publications is a separate owner-approved migration (R2.5).

### 4. Observations and provenance

An observation keeps its source, publication, kind and record key; the verbatim name and the persisted outputs of normalisation (normalised name, aliases, identity keys, subtype); lifecycle and raw status; WGS84 longitude and latitude (or none) with position method and coordinate checks; generated `geography` and SVY21 points, and a footprint for outlines; its admission result and exclusion code; allow-listed properties only; and quality flags that seed caveats. Observations are inserted or superseded, never updated in place.

### 5. Coordinate-system contract

The contract (WGS84 longitude then latitude, geodesic on `geography` for anything a user sees, SVY21 only through `ST_Transform`, with its static guard and PostGIS verifier) is the one #427 adds to `docs/architecture/postgis-nearby.md`; this spec adds only the admission box and the SVY21-attribute check of section 3.

### 6. Candidate generation

Blocking is spatial in SVY21 metres with a per-kind radius (stations 500 m, outlines 300 m, exits 100 m, hawker centres 400 m, parks 800 m or footprint containment); registers without coordinates (schools, supermarkets) block on the zero-padded postal code and a name-token index, and on geometry (600 m, 400 m) only when both sides have it. `ST_ClusterDBSCAN` with `minpoints := 1` only partitions candidates into order-independent connected components and never decides that two observations are one place. A group over the size cap (default 200) stops the run and is reported, not truncated, and the generator's pair set must equal a brute-force oracle's for every kind under shuffled input orders.

### 7. Name normalisation and similarity

`shared/poi/normalize.ts` is a pure, versioned, per-kind function: Unicode and case folding, punctuation, parenthetical aliases, address-style and station-code detection (no name channel for either), an abbreviation dictionary, and distinguishing words (hawker, park, MRT versus LRT, school level) kept as subtype features. A pair's name channel is `EXACT`, `ALIAS`, `NEAR_SPELL`, `NEAR_EXT`, `NEAR_SUBTYPE`, `DIFF` or `NA`; `pg_trgm` is only a candidate filter and a stored feature, never a reason to leave `ambiguous`. With only URA admitted, the LTA code registry resolves two of the seven code labels; the other five resolve by the weaker spatial-only rule and stay `rule-supported` with `CODE_NAMED_LABEL`. Vendoring Wikidata station codes as a reviewed alias dictionary would back six of them (an owner choice: a CC0 data file and a maintenance duty).

### 8. Decision classes

For a candidate pair from two admitted sources in different independence groups (after intra-source collapse) the decider computes `key` (`EQ`, `CONFLICT`, `NA`: zero-padded postal code or station code), `name` (the channel), `geo` (SVY21 distance mapped to `T1`, `T2`, `FAR`, `BEYOND` or `NA`) and `life` (`CONFLICT` when an operational record meets a planned, under-construction or interim one, or station or park subtypes differ). Tier A is `key = EQ` or an `EXACT`/`ALIAS` name, tier B a `NEAR_*` name, tier C geometry or registry only, processed in that order; per observation and other source the best positive candidate wins, only mutual pairs verify, equal-strength competitors make every pair among them `ambiguous`, and an observation taken in an earlier tier cannot be reused later. Band limits in metres (`t1` / `t2` / `rb`; placeholders chosen from point precision and footprint sizes, never fitted to unapproved labels, and any change bumps `rule_set_version`): station 150 / 300 / 500 (outline 50 / 150 / 300), exit 15 / 40 / 100, school 100 / 250 / 600, supermarket 75 / 200 / 400, hawker centre 60 / 150 / 400, park 150 / 500 / 800 (outline 0 / 100 / 300). The first matching rule decides:

| Rule | Fires when | Class |
| --- | --- | --- |
| `R-REJ-LIFECYCLE` | `life = CONFLICT` | rejected |
| `R-REJ-KEY-CONFLICT` | `key = CONFLICT` and the name is not `EXACT`/`ALIAS` | rejected |
| `R-REJ-NAME-FAR` | name `DIFF`/`NA` and `geo` `FAR`/`BEYOND` | rejected |
| `R-REJ-DOMINATED` | an endpoint is taken by an earlier tier and the name is `ALIAS`, `NEAR_SPELL`, `NEAR_SUBTYPE` or `DIFF` | rejected |
| `R-AMB-MULTI` | two or more equal-strength candidates in the tier | ambiguous |
| `R-AMB-EXTENSION` | name `NEAR_EXT` and an endpoint is taken by an earlier tier | ambiguous |
| `R-AMB-CHANNEL-CONFLICT` | name `EXACT`/`ALIAS` but `geo` `FAR`/`BEYOND` or `key = CONFLICT` | ambiguous |
| `R-VER-KEY-NAME` | mutual, `key = EQ`, name `EXACT`/`ALIAS`, `geo` `T1`/`T2`/`NA` | verified |
| `R-VER-KEY-CODE` | mutual, a code label equal to the other record's own station code, `geo` `T1`/`T2` | verified |
| `R-VER-NAME-GEO` | mutual, `key = NA`, name `EXACT`, `geo = T1` | verified |
| `R-RS-REGISTRY-CODE` | mutual, a code label the registry maps to the other record's name, `geo` `T1`/`T2` | rule-supported |
| `R-RS-ALIAS-GEO` | mutual, name `ALIAS`, `key = NA`, `geo` `T1`/`T2` | rule-supported |
| `R-RS-EXACT-WIDE` | mutual, name `EXACT`, `key = NA`, `geo = T2` | rule-supported |
| `R-RS-NEAR-GEO` | mutual, name `NEAR_*`, `geo` `T1`/`T2`, `key` not `CONFLICT` | rule-supported |
| `R-RS-KEY-NEAR` | mutual, `key = EQ`, name `NEAR_*` | rule-supported |
| `R-RS-REGISTER-EXACT` | school register only: mutual, name `EXACT`, `key = NA`, `geo = NA`, name unique in both | rule-supported |
| `R-RS-SPATIAL-ONLY` | stations and exits only: mutual, name `NA`, `geo = T1`, the only candidate | rule-supported |
| `R-AMB-GEO-ONLY` | name `DIFF`/`NA`, `geo` `T1`/`T2`, not matched above | ambiguous |
| `R-AMB-INSUFFICIENT` | name `EXACT`/`ALIAS`/`NEAR_*`, `key = NA`, `geo = NA`, not matched by the register rule | ambiguous |
| `R-UNM-NO-CANDIDATE` | observation level: no pair of the observation matched any rule | unmatched |

Intra-source pairs never merge automatically (equal key within `rb`: `R-AMB-INTRA-COLLISION` with flag `KEY_COLLISION`; different keys: `R-REJ-INTRA-DISTINCT-KEY`; equal key beyond `rb`: `R-REJ-INTRA-FAR`); the only intra-source unions are `R-COLLAPSE-FOOTPRINT` (outlines of one source with the same core name and subtype within 150 m) and `R-COLLAPSE-REGISTRY` (a code label and a name label that a registry row equates). An entity is a connected component over `verified`/`rule-supported` and collapse edges: its class is the weakest edge, `corroboration_scope` is `multi-source`, `single-source-by-design` or `single-source-uncorroborated`, its name is the lowest-`anchor_rank` member's, its position comes from the best `position_method` then `anchor_rank`, and `position_uncertainty_m` is the largest geodesic spread among independent members. Caveats are codes (`SINGLE_SOURCE`, `CODE_NAMED_LABEL`, `POSITION_GEOCODED_FROZEN`, `STALE_SOURCE`, `LIFECYCLE_UNKNOWN` and others); ambiguous pairs list each other, and an exit's `parent_entity_id` is its station label's entity.

### 9. Deterministic identifiers

An observation id is a hash of source, kind and record key only, so reordering or re-fetching cannot change it. An entity id is a hash of its anchor, the member with the lowest `(anchor_rank, observation_id)`: a lower-ranked member joining never changes it, a higher-ranked one does, and then (as for merges and splits) a `poi_entity_alias` row maps old to new so stored references follow. The resolution digest is a hash of the sorted canonical JSON of matches and entities for a rule-set version, and a property test shuffles observations, publications and load order at least 100 times and requires one digest. SQL orders and breaks ties with `COLLATE "C"`, never `ROW_NUMBER()` over an unordered set; agency `OBJECTID` stability is not guaranteed, so adapters store `INC_CRC` and `FMEL_UPD_D` and report records whose key persists with materially different content.

### 10. Storage

New Neon-only tables in numbered `sql/neon/00N_poi_*.sql` files; none of the nine publisher-scanned tables changes. The DDL and constraint names wait for the migration pull request.

| Table | Key and constraints | Holds |
| --- | --- | --- |
| `poi_source` | PK `source_id`; checks on `licence_class`, `position_method` and `admission_status` | the registry of section 2 |
| `poi_publication` | PK `publication_id`; unique `(source_id, content_sha256)`; at most one `accepted` per source | status, counts, validation report, `rule_set_version` |
| `poi_observation` | PK `observation_id`; references publication and source; longitude/latitude range checks, both or neither; an excluded row needs a code; generated `location` (`geography`) and `loc_svy21` (`geometry(Point,3414)`); GiST on `loc_svy21` and the footprint, trigram index on the normalised name | the observations of section 4 |
| `poi_match` | PK `(obs_a, obs_b)` with `obs_a < obs_b` in `"C"` order; `decision`, at least one rule id, `rule_set_version`, `features`, `decided_by` (`rules` or `owner-override`) | pair decisions, rejected ones included |
| `poi_entity`, `poi_entity_member`, `poi_entity_alias`, `poi_rule_set` | PK `entity_id`; member rows link entities to observations; alias rows map old ids to new; rule sets record their hash | the entities of section 8, id history, rule-set versions |
| view `poi_serving_v1` | operational or unknown-lifecycle entities none of whose observations is in a non-accepted publication | what the nearby query reads |

The writer role (OD3) holds DML on `poi_*`; the SELECT-only runtime role gets `SELECT` on `poi_serving_v1` only; nothing is `SECURITY DEFINER`. `poi_locations` keeps serving MRT until Phase 11, and the four reserved kinds are never written to it, so there is no dual write path.

### 11. Exposure through the nearby API

`NearbyPlace` gains an optional `PoiResolution` block (class, scope, sources with attribution keys, `positionUncertaintyMetres`, lifecycle, caveat codes, `ambiguousWith`), changed in Zod and TypeScript together. Nothing hides uncertainty: `unmatched` entities return with `SINGLE_SOURCE`, `ambiguous` entities return as separate places that list each other, `rejected` pairs are never shown, and counts are entity counts with the class mix available. Exits group by `parent_entity_id` when the parent is `verified` or `rule-supported`, otherwise by the verbatim label with `CODE_NAMED_LABEL`. Distances stay ellipsoidal straight-line metres. `types` grows from three kinds to seven, multiplying the canonical cache-key space by about 18, so Phase 8 either keeps `types` to a few presets or restates `MAX_NEARBY_CACHE_KEYS` and its test. Each promotion needs a new `NEON_PUBLIC_CACHE_EPOCH`; the capability probe stays configuration-only; with the flag off the route answers byte for byte as today.

### 12. Source-specific gates

NEA hawker: `STATUS` must start with `Existing` (`STATUS_NOT_EXISTING`), and its SVY21 attributes are checked against the geometry (flag only). NParks points: a versioned suffix class table decides `park`, and playgrounds, open spaces, fitness corners and car parks are excluded (`PARK_CLASS_*`). MOE: postal codes are zero-padded, schools sharing a postal code stay separate, and only allow-listed columns are kept (the file carries personal data). NEA/SFA licences: a legal-entity check, a supermarket allow-list (OD4) and a usable postal code (`LICENSEE_NOT_A_LEGAL_ENTITY`, `NOT_ALLOW_LISTED_SUPERMARKET`, `NO_USABLE_ADDRESS`). URA outlines: `lifecycle = unknown`, and null and `<Null>` names are `NA`. LTA exits: code labels are flagged and `(label, code)` is not a key. Geocode cache: `position_method = geocoded-cache`, frozen, never refreshed.

## Labelling protocol

Purpose: turn agent proposals into evidence the project can trust, and stop anyone reporting a number before that exists.

1. The owner approves; a second reviewer is optional (OD7). The agent that proposed labels is never a reviewer, and its output is never evidence.
2. Per pair, two things are labelled and kept apart: `relationHolds` (`yes`, `no`, `part-of`, `undetermined`) and `classShouldBe`. Each entry records at least two independent public channels (`evidenceUsed`, `reviewedOn`); scraping brand sites and the proposal text are not evidence. Reviews of the random sample are blinded to the proposed and pipeline class.
3. One reviewer: `approved` or `corrected` (both stored). Two reviewers: both must agree on both fields, else the entry is `disputed` and excluded from every metric until the owner settles it in writing; there is no majority vote.
4. Two uses, never mixed: approved curated cases become `tests/fixtures/poi-ground-truth/<kind>.json` regression tests (chosen, so they estimate no rate); metrics come from a separate sample per `(kind, source pair, pipeline class)` stratum, ordered by `sha256(rule_set_version || stratum || obs_a || obs_b)`, taking the first `n` (start at 150, about a 2 % upper bound on the false-merge rate at zero observed errors; OD7).
5. Reported only then, per kind, source pair and rule id and never pooled across kinds: the false-merge rate among `verified`/`rule-supported`, the miss rate among `ambiguous`/`unmatched` where the label is `yes`, and the share of `ambiguous`, each with a Wilson 95 % interval, the label-set hash and `rule_set_version`.
6. Approved files drop the `PROPOSED-` prefix and carry `status: "APPROVED"`, the approver and the date; a guard test fails if a test imports a `PROPOSED-*` file or an approved file holds an unapproved entry. A `rule_set_version` bump, a source schema change or a publication changing more than 5 % of a kind's entities re-opens the affected labels.

## Testing

Vitest suites for normalisation, the decider (one test per rule, precedence, tiers, intra-source policy), identifiers (hash vectors, alias rows, the 100-shuffle digest), the adapters (allow-lists with no personal data, gates, zero padding, status mapping, tiny typed fixtures) and the fixture guard; read-only SQL verifiers on a disposable Neon branch for candidate generation against its oracle and for quarantine and atomic promotion; the nearby route and Worker gate suites for flag-off byte-identity and the new block. Mutants that must fail: a generator that clusters before projecting, `minpoints > 1`, `ST_SetSRID(..., 3414)` instead of `ST_Transform`, trigram-only acceptance, the farthest exit per station, a dropped status gate.

## Risks and trade-offs

- Single-source honesty versus noise: most kinds show `SINGLE_SOURCE` at first; caveats are codes and the copy lives in one adapter.
- Two languages, one decision: the verifiers run the SQL features against the oracle, and decider tests use feature rows.
- Placeholder thresholds degrade to `ambiguous`, never to a wrong merge, until labels are approved.
- ODbL is excluded; `licence_class` stays so that a share-alike source would need a new decision. Overture's quality ("high junk rate" is the publisher's own statement) is gated on a sample (OD2).
- Key stability, stale registers (`STALE_SOURCE`), cost on Neon (set-based and index-backed, unmeasured; a benchmark is a non-goal) and the cache keyspace (about 18 times larger with seven kinds; Phase 8) are known. D1 holds no POI tables, so rolling back to D1 simply has no nearby feature, as today.

## Open questions

- Which of OD2 to OD8 are settled, and in what order; OD2 (the Overture sample) gates the most value.
- Whether to vendor the Wikidata station-code alias dictionary.
- Whether `mrt_station` entities show the LTA label or a canonical name once resolved, and in which language, and whether the API exposes `ambiguous` entities by default or on request.
