# Tasks: POI Source Integration

> Execution checklist. Nothing below is done; the spec itself is the only deliverable so far. Each phase is one small pull request (two where noted), independently verifiable, in dependency order. "Disposable branch" means a throwaway copy-on-write Neon branch; no phase runs against production, deploys a Worker or flips `NEON_SPATIAL_ENABLED`. Requirement ids refer to `requirements.md`; design sections to `design.md`.

## Phase 0 - Owner decisions and samples (no code)

- [ ] **T0.1** Record the owner's answers to OD1 to OD8 (`docs/architecture/poi-source-admission.md`, section 7) with date and rationale, as a "Decision" column in that table. OD3 names the writer role and the cache-epoch rule.
  -> Every decision has an answer or an explicit "deferred"; phases that depend on a deferred decision stay unstarted. (R1.3, R9.3)
- [ ] **T0.2** If OD2 is yes: take a one-off Singapore bounding-box extract of Overture Places on a developer machine with tooling that is not a repo dependency, and write the descriptive counts into the admission document: records per relevant category, share with a name, share with confidence above stated cut-offs, overlap with the NEA, NParks and MOE records by postal code or distance. No accuracy figure.
  -> The admission document's "Not verified" list shrinks by the Overture items; the acceptance criteria OD2 asked for are stated, not assumed. (R12.1)
- [ ] **T0.3** If OD1 is B or C: obtain an OSM extract (Overpass when it answers, or a regional extract) for the six kinds and record counts, `source=*` provenance and whether government imports are visible.
  -> The OSM items in "Not verified" are resolved or restated; option C also lists the files that would be published. (R1.3)
- [ ] **T0.4** Ask LTA about the DataMall static layers if OD5 is yes; record the answer.
  -> The Train Station layer is either admitted as an `lta`-group source or listed as unavailable.

## Phase 1 - Registry, publication and observation schema

- [ ] **T1.1** Add `sql/neon/002_poi_provenance.sql`: `poi_source`, `poi_publication` (with the one-accepted-per-source partial index), `poi_observation` (generated `location` and `loc_svy21`), `poi_match`, `poi_entity`, `poi_entity_member`, `poi_entity_alias`, `poi_rule_set`, with a preflight that mirrors `001`'s (tables, roles, PostGIS and `pg_trgm` present, no earlier version), one transaction, and no grant to the runtime role yet.
  -> Applies atomically on a disposable branch; the nine publisher-scanned tables are byte-identical afterwards; `NeonPlanningStore.inspectSchema()` still accepts them. (R9.1, R9.2)
- [ ] **T1.2** Add `sql/neon/verify_poi_schema.sql` in the style of `verify_nearby_spatial_sql.sql` (read-only transaction, refuses otherwise): constraint checks by inserting invalid rows inside subtransactions that must fail (duplicate accepted publication, `lng` out of range, `admission = excluded` without a code, `obs_a >= obs_b`), and checks that `loc_svy21` equals a direct `ST_Transform`.
  -> Every invalid insert is rejected; the verifier ends in `ROLLBACK`. (R3.3, R4.1, R14.2)
- [ ] **T1.3** Add the typed row shapes and Zod schemas in `shared/poi/types.ts` and `scripts/lib/poi-schemas.ts` with a parity test that fails when one changes without the other (steering requires the pair to move together).
  -> `vp run typecheck` and the parity test pass. (R9.2)
- [ ] **T1.4** Document the new tables in `docs/architecture/postgis-nearby.md` ("Derived spatial model and ownership") and say that `poi_locations` stays the MRT surface until Phase 11.
  -> The release gates paragraph lists the new verifiers.

## Phase 2 - Coordinate-system contract

- [ ] **T2.1** Add `shared/poi/region.ts` (admission box: same longitude and southern bounds as the request box in `shared/nearby-places.ts`, a lower northern bound, see design 5.3) and `shared/poi/crs.ts` (swap detector, range checks, SVY21 attribute comparison returning the metres and a swapped flag, tolerance constants).
  -> Unit tests cover every row of the adversarial table in design 5.4 on the TypeScript side, including the official vectors NEA 119477, NParks 120001 and the swapped NEA 119460 pair. (R4.3, R4.4, R4.5)
- [ ] **T2.2** Add `sql/neon/verify_poi_crs.sql`: the PostGIS side of 5.4, including the mutants (`ST_SetSRID(..., 3414)`, `ST_DWithin` and DBSCAN on 4326 with metre values, mixed SRIDs) that must fail, the 1 mm round-trip check, and the `poi_assert_svy21` helper.
  -> On a disposable branch every case passes and every mutant fails. (R4.1, R4.2, R14.2)
- [ ] **T2.3** Add a lint test that greps `sql/neon/` and `shared/poi/` for `ST_SetSRID(` with any SRID other than 4326 and for planar functions applied to columns not typed `3414`.
  -> The test fails on a seeded violation and passes on the tree. (R4.1)

## Phase 3 - Name normalisation

- [ ] **T3.1** Add `shared/poi/lexicon.ts` (versioned: stop words, subtype lexicons, abbreviation maps, level patterns, station-code pattern) and `shared/poi/normalize.ts` implementing design section 7.
  -> Table-driven tests built from the real strings in the admission document (code labels, `Queen Street Blk 270 (Albert Centre)`, `ST. MARGARET'S SCHOOL (SECONDARY)`, `SENG KANG`, `PK`/`PG`/`OS`/`FC`, `<Null>`, trailing spaces) pass; level and subtype words are never dropped; the function is pure. (R6.1, R6.2, R6.4, R6.5)
- [ ] **T3.2** Add the name-channel function (`EXACT`, `ALIAS`, `NEAR_SPELL`, `NEAR_EXT`, `NEAR_SUBTYPE`, `DIFF`, `NA`).
  -> Tests include pairs that a trigram rule would get wrong (Zhenghua/Zhonghua, Chua/Yio Chu Kang, Yishun/Yishun Town) and assert they are not `EXACT` or `ALIAS`. (R6.3)

## Phase 4 - Candidate generation

- [ ] **T4.1** Add the parameterised candidate query (DBSCAN partition with `minpoints = 1`, then `ST_DWithin` in SVY21, per-kind radii from one constants file) and the register blocking by postal code and name token.
  -> The group-size guard stops a run on an oversized group and reports it. (R5.1, R5.2, R5.4)
- [ ] **T4.2** Add `sql/neon/verify_poi_candidates.sql`: brute-force oracle, equality of pair sets for every kind, identical pair digests under at least six input orders, and the degrees-as-metres and `minpoints > 1` mutants that must fail.
  -> On a disposable branch loaded with the samples the generator equals the oracle with 0 missing and 0 extra; mutants fail. (R5.3)

## Phase 5 - Decision engine, identifiers, entities (pure TypeScript)

- [ ] **T5.1** Add `shared/poi/decide.ts`: pair features in, class and rule ids out, implementing the tiers, exclusivity and the rule table of design 8.3, plus the intra-source policy and the two collapse forms; `rule_set_version` derived from the rule table's own hash.
  -> One test per rule id on constructed feature rows; precedence tests (first match wins); tests that an `EXACT` partner dominates `NEAR_*` competitors and that equal-strength competitors are `ambiguous`; a test that shuffling candidate order never changes any class. (R7.1, R7.2, R7.3, R7.4, R7.5)
- [ ] **T5.2** Add `shared/poi/ids.ts` (observation and entity ids, alias rows, digest) and `shared/poi/entities.ts` (components, anchor, class, scope, position, caveats).
  -> The 100-shuffle property test yields one digest; a lower-ranked observation joining leaves ids unchanged; a higher-ranked one produces an alias row; hand-computed hash vectors are asserted. (R8.1, R8.2, R8.3, R8.4, R7.6)
- [ ] **T5.3** Add the feature-row builder that turns SQL candidate rows into decider inputs (no coordinates cross the boundary).
  -> A test asserts the decider module imports no database, `fetch` or geometry code.

## Phase 6 - First adapter: NEA hawker centres, end to end (two PRs)

- [ ] **T6.1** Adapter without a database: `scripts/poi/adapters/nea-hawker.ts` (fetch via the existing paced helpers, Zod parse, allow-list, status gate, SVY21 attribute check, key `OBJECTID`), a publication writer that emits SQL, and the validation report (H1 to H9).
  -> Tests on a small typed fixture cut from the real file shape: the gate excludes `Under Construction` and `Interim Centre`; the swapped-pair row is flagged and the geometry used; a mutated file (duplicate key, swapped coordinates, more than 10 % attribute mismatches) is rejected whole. (R2.2, R2.3, R3.1, R3.2, R4.3, R11.1)
- [ ] **T6.2** Load, quarantine and promote on a disposable branch: `sql/neon/verify_poi_quarantine.sql` proves a failing publication changes nothing served and that promotion supersedes atomically; the runner builds singleton entities and the `poi_serving_v1` view.
  -> The view returns the included NEA records (the sample gives 122 of 129) and nothing from a quarantined publication; no nearby route change yet. (R2.1, R2.4, R9.2)

## Phase 7 - MRT: second source for stations, code labels, exits

- [ ] **T7.1** URA adapter (`scripts/poi/adapters/ura-rail-stations.ts`): outlines transformed to `footprint_svy21`, null and `<Null>` names to `NA`, footprint-sibling collapse, `lifecycle = unknown`.
  -> Tests: 257 outlines in, 9 unnamed, the Dhoby Ghaut siblings collapse to one logical candidate. (R11.5)
- [ ] **T7.2** LTA observations as publications (`lta-mrt-exit-geojson`) from the same file `sync-data` already fetches: one exit observation per `OBJECTID`, one station observation per `STATION_NA` label with `derived-centroid`, code-label flags, registry aliases (`R-COLLAPSE-REGISTRY`), and the LTA code registry as a reviewed alias dictionary. The MRT trigger and `poi_locations` are untouched.
  -> Unit tests classify the seven code labels exactly as the table in design 7 says for the admitted sources; exit collisions are flagged `KEY_COLLISION`, never merged. (R6.4, R8.1)
- [ ] **T7.3** Resolve `mrt_station` and `mrt_exit` (membership against outlines, `parent_entity_id`) on a disposable branch and compare the station entities with the stations currently in `poi_locations`.
  -> Every existing station has an entity; any difference is listed, not hidden.

## Phase 8 - Nearby API exposure behind a flag

- [ ] **T8.1** Extend `shared/nearby-places.ts` and `worker/nearby-spatial-query.ts` to read `poi_serving_v1` for the new kinds and to group exits by `parent_entity_id`; add `PoiResolution` to the response type and Zod schema together; decide the `types` surface (presets or the restated cache-key bound).
  -> With the flag off, responses are byte-identical to today (golden test); with it on the block is present; `tests/unit/nearby-places*.test.ts` and the Worker gate test pass; `MAX_NEARBY_CACHE_KEYS` and its test are restated. (R10.1 to R10.4)
- [ ] **T8.2** Extend `sql/neon/verify_nearby_spatial_sql.sql` (or add a sibling) so the shipped query is still compared with a brute-force oracle including ambiguous entities and code-named exits.
  -> 0 mismatches on a disposable branch; the group-before-limit mutants still fail.

## Phase 9 - Interface and user documentation

- [ ] **T9.1** Show class, scope and caveats in the block-detail nearby list with the existing caveat-copy adapter pattern; add the attribution lines to the existing source-information surface.
  -> Component tests plus a Playwright check on the keyboard and mobile paths; no raw caveat codes reach the screen. (R13.1)
- [ ] **T9.2** Update `docs/guide/user-guide.md` (what "verified", "rule-supported", "ambiguous" and "single source" mean; that distances are straight-line) and the README data-source list (including the NParks and NEA/SFA dataset names).
  -> `docs-manifest` test passes; this is the P1 documentation requirement for a visible change. (R10.4, R14.3)

## Phase 10 - Remaining kinds, one PR each

- [ ] **T10.1** Parks: NParks points adapter with the versioned suffix class table and `PARK_CLASS_*` gates; the polygon layer as a geometry-quality input if sampled.
  -> Tests on 462-shaped data: 40 % of records excluded by class, none silently. (R11.2)
- [ ] **T10.2** Schools: MOE register adapter (allow-list, postal padding, shared-campus rows kept apart), joined to the frozen geocode cache with `position_method = geocoded-cache`.
  -> No personal-data column survives; `POSITION_GEOCODED_FROZEN` appears on every school entity. (R3.2, R3.4, R11.3)
- [ ] **T10.3** Optional land-mask guard from an admitted polygon source (URA Land Use after its metadata and licence are verified).
  -> Offshore and cross-border points that pass the admission box are rejected; documented otherwise as a limit of the box guard.
- [ ] **T10.4** Supermarkets: register adapter with the OD4 allow-list, legal-entity check, `NO_USABLE_ADDRESS` and the stale-source horizon.
  -> Natural-person licensees are never stored; the `0na` record is excluded with its code. (R11.4)
- [ ] **T10.5** Overture Places and OSM adapters, only if OD1 and OD2 allow, each with its own licence class, attribution string and, for OSM option C, the separate tables and the public file.
  -> No ODbL row appears in a view that serves SODL rows unless the owner chose to. (R1.3, R13.2)

## Phase 11 - Move MRT onto publications (owner-approved migration)

- [ ] **T11.1** Replace the MRT trigger path with publications, keeping the fail-closed intent at the publication level, with a rollback script and a parity check against the pre-migration `poi_locations` rows.
  -> Applied first to a disposable branch; the verifier shows source and derived digests unchanged for an unchanged document and the same rejection of malformed ones. (R2.5)

## Phase 12 - Evaluation tooling and guard

- [ ] **T12.1** `scripts/poi/sample-pairs.ts`: the seeded stratified sample from design's "Labelling protocol" over the real candidate set; output is a list to review, never a metric.
  -> The same seed yields the same list; the script refuses to run without an explicit `rule_set_version`.
- [ ] **T12.2** `tests/unit/poi-fixture-guard.test.ts` and the approved-label loader.
  -> The test fails if a test imports `PROPOSED-*` or an approved file holds an `unapproved` entry. (R12.3)
- [ ] **T12.3** `scripts/poi/report-metrics.ts`: reads only approved labels, prints false-merge and miss rates with Wilson intervals per kind, source pair and rule id, with the label-set hash.
  -> The script exits non-zero if given a file whose status is not approved. (R12.1, R12.4)
- [ ] **T12.4** `scripts/poi/audit-independence.ts`: per pair of admitted sources in different groups, the share of mutual pairs whose points coincide within 0.5 m with equal names (the label-free copy signal of design section 2).
  -> The output is a table for the owner; a test asserts it never changes a class or writes to `poi_match`. (R1.6)

## Phase 13 - Steering and architecture documents

- [ ] **T13.1** Update `.kiro/steering/pipeline.md` (new tables and the build-time publisher), `docs/architecture/postgis-nearby.md` (follow-up status), `AGENTS.md` (move the spec to Completed when done) and `docs/architecture/artifact-contracts.md` if the nearby response is documented there.
  -> The documents match the code that shipped.

## Verification for every phase

- Focused tests first, then `vp run check`; phases touching the Worker or nearby route also run the focused nearby suites; phases with SQL run their verifier on a disposable branch and attach the output to the PR.
- No phase reads `public/data/`; fixtures come from `tests/fixtures/`.
- No accuracy figure appears in any PR description unless it was computed from approved labels by `report-metrics.ts`.
