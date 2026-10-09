# Requirements: POI Source Integration

Scope: integrate more than one source for the PostGIS `poi_locations` kinds `mrt_station`, `mrt_exit`, `school`, `supermarket`, `hawker_centre` and `park` without hiding uncertainty. Evidence for every claim about a source is in `docs/architecture/poi-source-admission.md`; the mechanism is in `design.md`.

Terms: a **publication** is one fetched, hashed copy of a source; an **observation** is one record of a publication with its provenance; an **entity** is a set of observations judged to describe one place; a **resolution class** is one of `verified`, `rule-supported`, `ambiguous`, `unmatched` (entity level) or `rejected` (pair level).

## R1 - Source admission and registry

- **R1.1** WHEN a source is proposed THEN it SHALL have a registry record naming its publisher, dataset id and landing page, licence id and licence-text URL, attribution string, independence group, access method, declared CRS, record-key specification and admission status, and nothing SHALL be loaded from a source whose status is not `admitted`.
- **R1.2** WHEN two sources share an independence group, or one is derived from the other (a station point computed from exits, a geocoded coordinate), THEN agreement between them SHALL NOT count as corroboration.
- **R1.3** WHEN a source's licence imposes share-alike (ODbL) THEN it SHALL remain `candidate` until a recorded owner decision exists, and its observations SHALL carry `licence_class = share-alike` so that every serving view can exclude or separate them.
- **R1.4** WHEN a source needs a token, account, API key or registration (OneMap Search, LTA DataMall `AccountKey`) THEN it SHALL NOT be admitted.
- **R1.5** WHEN data is fetched THEN it SHALL be fetched at build time by a script under `scripts/`; no code under `src/`, `functions/` or `worker/` SHALL request an upstream data source, and no hosted AI or model API SHALL be used anywhere in the pipeline.
- **R1.6** WHEN two admitted sources of different independence groups are resolved against each other THEN the run SHALL report, per source pair, the share of mutual pairs whose points coincide within 0.5 m and whose names are equal (a label-free copy signal); a high share SHALL be raised to the owner as a candidate registry change (merging the groups) and the report SHALL NOT change any class by itself.

## R2 - Publications, validation and quarantine

- **R2.1** WHEN a source is fetched THEN the result SHALL be recorded as a publication (content SHA-256, retrieval time in UTC, upstream last-updated time, record count, status) before any observation is promoted.
- **R2.2** WHEN a publication fails a hard validation check (unparseable or duplicate record keys, wrong geometry type, coordinates outside the admission region, longitude and latitude swapped, SRID or unit mismatch, an SVY21 attribute pair that disagrees with the geometry in more than a configured share of rows) THEN the whole publication SHALL be quarantined, none of its observations SHALL be promoted, and the previously accepted publication of that source SHALL keep serving with a staleness caveat.
- **R2.3** WHEN a record is outside a source's admission filter (NEA status other than `Existing*`, an NParks record that is not a park by the class table, a supermarket licence without a usable address) THEN the observation SHALL be stored with `admission = excluded` and a reason code; this is deterministic gating, not a validation failure, and the counts SHALL appear in the publication report.
- **R2.4** WHEN a publication is promoted THEN promotion SHALL be one transaction that supersedes the previous accepted publication of that source, and serving SHALL change only after a new `NEON_PUBLIC_CACHE_EPOCH` is deployed.
- **R2.5** The existing fail-closed MRT trigger (`refresh_mrt_poi_locations_trigger`) SHALL stay unchanged until a separate, owner-approved migration moves MRT onto publications; no phase before that SHALL edit `sql/neon/001_postgis_nearby.sql`.

## R3 - Observation provenance

- **R3.1** WHEN an observation is stored THEN it SHALL keep: source id, publication id, kind, source record key, raw name, normalised name and tokens, aliases, identity keys (postal code, station codes), subtype, lifecycle and the raw status text, WGS84 longitude and latitude (or none), position method, coordinate-check results, optional polygon footprint, admission and exclusion code, allow-listed source properties and quality flags.
- **R3.2** WHEN source properties are stored THEN they SHALL come from a per-source allow-list; personal data (principal and vice-principal names, phone, fax, e-mail, licensees that are natural persons) SHALL NOT be stored, and raw rows SHALL NOT be copied wholesale into `source_properties`.
- **R3.3** WHEN a new publication arrives THEN observations SHALL be inserted or marked superseded; no observation SHALL be updated in place, and an observation SHALL always be traceable to the exact publication that produced it.
- **R3.4** WHEN a position was geocoded THEN `position_method = geocoded-cache`, the geocoder and the cache write date SHALL be recorded, and the entity SHALL carry the caveat `POSITION_GEOCODED_FROZEN`.

## R4 - Coordinate-system contract

- **R4.1** WHEN coordinates are stored THEN they SHALL be WGS84 longitude then latitude (`lng`, `lat`), and any column named or typed as SVY21 (EPSG:3414) SHALL be produced only by `ST_Transform` from SRID 4326; `ST_SetSRID` SHALL be used only to label raw longitude and latitude as 4326.
- **R4.2** WHEN a planar quantity is computed (blocking radius, DBSCAN `eps`, tolerance bands, polygon containment) THEN it SHALL be computed on SRID 3414 geometries in metres; WHEN a distance is shown to a user THEN it SHALL be a geodesic distance on `geography` and SHALL NOT be described as a walking distance.
- **R4.3** WHEN a source carries SVY21 attributes (NEA `LANDXADDRESSPOINT` and `LANDYADDRESSPOINT`, NParks `X` and `Y`) THEN they SHALL be compared with the transformed geometry; a difference above 0.05 m SHALL set `COORD_ATTR_MISMATCH` with the metres, and a pair that matches the geometry only when its two numbers are swapped SHALL set `COORD_ATTR_SWAPPED`; the geometry SHALL win.
- **R4.4** WHEN a point is validated THEN it SHALL be rejected if latitude lies outside the admission box, if longitude and latitude are swapped, if an SVY21 coordinate lies outside the SVY21 image of the admission box, or if two geometries of different SRIDs are combined (an error, never a silent mix).
- **R4.5** The adversarial tests listed in `design.md` (longitude and latitude swapped, SRID relabelled, degrees passed as metres, offshore points, SVY21 round-trip tolerance, swapped SVY21 attributes) SHALL exist as automated tests before any source is loaded into a serving branch.

## R5 - Candidate generation

- **R5.1** WHEN candidates are generated THEN blocking SHALL be spatial in SVY21 metres with a per-kind block radius, and registers without coordinates SHALL be blocked by normalised postal code and name tokens.
- **R5.2** WHEN DBSCAN is used THEN it SHALL be used only to partition observations into candidate groups, with `minpoints = 1` so that groups are connected components that do not depend on row order; cluster labels SHALL NOT be stored, and DBSCAN SHALL NOT decide whether two observations are the same place.
- **R5.3** WHEN the generator runs on a disposable branch THEN its pair set SHALL equal the brute-force oracle's pair set (no index, no clustering) for every kind, and SHALL be identical under shuffled input orders.
- **R5.4** WHEN a candidate group exceeds the configured maximum size THEN the run SHALL stop and report the group; it SHALL NOT truncate it.

## R6 - Name normalisation and similarity

- **R6.1** WHEN a name is normalised THEN a versioned, kind-specific, deterministic TypeScript function SHALL do it (Unicode and case folding, punctuation, `&` and `and`, abbreviation dictionary, parenthetical aliases, address-style detection), and the result SHALL be persisted so that SQL never re-implements it.
- **R6.2** WHEN a name contains words that distinguish entities (school level words, hawker `market` versus `food centre`, park `park` versus `playground`, station `MRT` versus `LRT`) THEN those words SHALL be kept as features and SHALL NOT be discarded as noise.
- **R6.3** WHEN `pg_trgm` similarity is computed THEN it SHALL be used only as a candidate filter and a feature; no class above `ambiguous` SHALL follow from similarity alone.
- **R6.4** WHEN `STATION_NA` matches the station-code pattern (for example `CC30`, `CC31`, `CC32`, `CC9`, `DT18`, `DT4`, `NE18`) THEN the label SHALL be marked `label_kind = code` with the name channel absent; it SHALL be resolved only through a registry or spatial rule, and the source observation SHALL keep the label verbatim.
- **R6.5** WHEN a record supplies an alias (NEA parenthesised common name, Wikidata alias) THEN the alias SHALL be stored as an alias and used only for the `ALIAS` name channel, which is weaker than `EXACT`.

## R7 - Decision classes

- **R7.1** WHEN a candidate pair is evaluated THEN the rule table in `design.md` SHALL assign exactly one of `verified`, `rule-supported`, `ambiguous` or `rejected` by first match in the order rejected, ambiguous, verified, rule-supported, and SHALL store the rule ids, the rule-set version and the feature values.
- **R7.2** WHEN a pair would be `verified` or `rule-supported` THEN both observations SHALL come from admitted sources in different independence groups from non-quarantined publications.
- **R7.3** WHEN a pair is `ambiguous` THEN the observations SHALL NOT be merged, and both entities SHALL be published with `resolution_class = ambiguous` and each other's ids.
- **R7.4** WHEN a pair is `rejected` THEN it SHALL be stored so that it is not proposed again, and only an owner-approved override row SHALL change it.
- **R7.5** WHEN a threshold or rule changes THEN `rule_set_version` SHALL change and the whole resolution SHALL be recomputed; thresholds SHALL NOT be tuned on unapproved labels.
- **R7.6** WHEN an entity has one observation THEN `resolution_class` SHALL be `unmatched`, and `corroboration_scope` SHALL say whether any second admitted source covers the kind, so that single-source-by-design is not presented as a failed match.

## R8 - Deterministic identifiers

- **R8.1** WHEN an observation id is derived THEN it SHALL be a SHA-256 over source id, kind and source record key only, so it is stable across reruns and across the order sources are loaded.
- **R8.2** WHEN an entity id is derived THEN it SHALL be a SHA-256 over the anchor observation, where the anchor is the member with the lowest `anchor_rank`, then the lowest observation id in byte order; adding a lower-ranked observation SHALL NOT change the id.
- **R8.3** WHEN entities merge, split or change anchor THEN the superseded ids SHALL be recorded in an alias table with the reason, so that stored references can follow.
- **R8.4** WHEN the same inputs and rule-set version are processed in any row order THEN the outputs and their digest SHALL be byte-identical; a property test SHALL shuffle inputs and compare digests.

## R9 - Storage

- **R9.1** WHEN tables are added THEN they SHALL be new Neon-only tables created by new numbered SQL files under `sql/neon/`; no PostGIS column SHALL be added to any of the nine tables scanned by the publisher, and D1 migrations SHALL NOT change.
- **R9.2** The new tables SHALL be `poi_source`, `poi_publication`, `poi_observation`, `poi_match`, `poi_entity`, `poi_entity_member`, `poi_entity_alias` and `poi_rule_set`, with a serving view for the nearby query.
- **R9.3** WHEN the Worker role reads POI data THEN it SHALL hold `SELECT` only; the writer role SHALL be a build-time role approved under owner decision OD3.

## R10 - Exposure through the nearby API

- **R10.1** WHEN a place is returned THEN the response SHALL include its resolution class, corroboration scope, contributing sources with attribution keys, position uncertainty in metres or `null`, lifecycle and caveat codes; an `ambiguous` place SHALL be returned as separate places that reference each other, never silently merged or dropped.
- **R10.2** WHEN a place has a single source THEN it SHALL be returned with the caveat `SINGLE_SOURCE`; WHEN its position was geocoded THEN also `POSITION_GEOCODED_FROZEN`; WHEN its label is a station code THEN also `CODE_NAMED_LABEL`.
- **R10.3** WHEN distances are returned THEN they SHALL stay ellipsoidal straight-line metres; MRT exits SHALL be grouped by the resolved station entity when its class is `verified` or `rule-supported` and by the verbatim label otherwise.
- **R10.4** WHEN the feature is off THEN existing responses SHALL be unchanged byte for byte; the response schema and shared types SHALL change together (Zod and TypeScript), the cache key space SHALL be recomputed and documented, and `docs/guide/` SHALL describe the labels in the PR that makes them visible.

## R11 - Source-specific gates

- **R11.1** WHEN an NEA hawker record's `STATUS` is anything other than `Existing`, `Existing (new)` or `Existing (replacement)` THEN it SHALL be excluded with `STATUS_NOT_EXISTING`.
- **R11.2** WHEN an NParks record is classified (by a versioned name-suffix table) as playground, open space, fitness corner or car park THEN it SHALL be excluded as a `park` with its class recorded.
- **R11.3** WHEN an MOE postal code has fewer than six digits THEN it SHALL be left-padded to six digits, and rows sharing a postal code SHALL stay separate observations.
- **R11.4** WHEN an NEA/SFA licensee is not a legal entity, is not allow-listed as a supermarket, or has no usable postal code (`0na`) THEN the licence SHALL be excluded with a reason code and SHALL NOT be stored with the licensee's name.
- **R11.5** WHEN URA outlines are used THEN planned or unbuilt stations SHALL NOT be presented as open: with no status field, an outline that has no operational partner SHALL have `lifecycle = unknown`.

## R12 - Evaluation and labels

- **R12.1** WHEN any precision, recall, false-merge rate or other accuracy figure is reported THEN it SHALL be computed only against owner-approved labels, per kind and source pair, from a seeded random sample of candidate pairs; no such figure SHALL be computed against the `PROPOSED-*` files.
- **R12.2** WHEN labels are reviewed THEN the protocol in `design.md` ("Labelling protocol") SHALL be followed, and a label SHALL be `approved` only after the owner (and a second reviewer if one exists) signs it.
- **R12.3** WHEN a test reads a ground-truth file THEN a guard test SHALL assert that the file's status is approved and that no entry is `unapproved`; no test SHALL import a `PROPOSED-*` file.
- **R12.4** WHEN hand-curated approved cases are used THEN they SHALL be used as regression tests only, never as estimators of a rate.

## R13 - Licence compliance and attribution

- **R13.1** WHEN a place is shown THEN the attribution strings of its contributing sources SHALL be available from the registry and displayed in the app's existing source information surface.
- **R13.2** WHEN an ODbL-derived layer is adopted THEN it SHALL live in separate tables and files, SHALL carry the ODbL notice, SHALL be offered for download as the licence requires, and SHALL NOT be blended into SODL rows or columns.
- **R13.3** WHEN source records contain personal data THEN it SHALL be excluded from storage, fixtures, logs and API responses.

## R14 - Phasing and verification

- **R14.1** WHEN the work is delivered THEN it SHALL be delivered in small pull requests, each independently verifiable by its own tests or by a read-only SQL verifier run on a disposable Neon branch, in the order given in `tasks.md`.
- **R14.2** WHEN a phase touches SQL THEN it SHALL ship a verifier in the style of `sql/neon/verify_nearby_spatial_sql.sql` (read-only transaction, brute-force oracle, mutants that must fail) and SHALL NOT be run against production.
- **R14.3** WHEN a phase changes user-visible behaviour THEN `docs/guide/user-guide.md` SHALL be updated in the same PR.
- **R14.4** Every phase SHALL pass `vp run check`; phases that change the Worker or the nearby route SHALL also pass the focused nearby suites.

## Acceptance criteria

1. The registry, publication and observation model exist with provenance on every row and no personal data.
2. The coordinate-system contract is enforced by tests, including every adversarial case in `design.md`.
3. Candidate generation equals the brute-force oracle and is order-independent.
4. Every pair carries exactly one class with rule ids; ambiguous pairs are never merged; rejected pairs persist.
5. Entity and observation ids are stable under shuffles; merges leave alias rows.
6. The nearby API shows class, scope, sources, uncertainty and caveats, and is byte-identical when the feature is off.
7. No accuracy figure exists anywhere unless computed against owner-approved labels.
