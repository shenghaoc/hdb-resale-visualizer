# POI source admission

> Status: research and design. Nothing here is implemented, admitted or deployed. Evidence was collected on **2026-10-09 (UTC)** against `origin/main` at `bb0a476ba`. This is engineering analysis, **not legal advice**; every licence conclusion that needs a decision is routed to the project owner in section 7.

This document answers one question for the PostGIS `poi_locations` table (`sql/neon/001_postgis_nearby.sql`): which independent, anonymously reachable, appropriately licensed sources may feed the kinds `mrt_station`, `mrt_exit`, `school`, `supermarket`, `hawker_centre` and `park`? Today only the two MRT kinds are populated, from one source. The other four are reserved "until independently admitted source data is available" (`docs/architecture/postgis-nearby.md`).

Companions: the Kiro spec `.kiro/specs/poi-source-integration/` (how admitted sources are integrated) and `tests/fixtures/poi-ground-truth/PROPOSED-*.json` (agent-proposed, **unapproved** label proposals; no accuracy figure has been computed against them).

## 1. Findings in brief

1. **Only `mrt_station` has two independent, licence-clear, anonymous sources**: the LTA exit file (the repo derives station points as the mean of exit coordinates) and URA's Master Plan rail-station outlines. Both are under the Singapore Open Data Licence (SODL) v1.0. Every other kind is single-source today, and this document says so rather than pretending otherwise.
2. **OneMap Search needs a token.** OneMap's own workshop slides (26 Aug 2025) and site banner say Search requires token-based authentication from 1 Oct 2025, and that a token is needed for every endpoint except basemaps and static maps. `scripts/lib/sync/geocode.ts` calls Search with no `Authorization` header. The owner has ruled tokens out, so school and supermarket coordinates cannot be refreshed or extended; whatever is already in `geocode_cache` is frozen, single-source evidence.
3. **The MOE school register and the NEA/SFA supermarket licence register have no coordinates at all.** They give identity (names, addresses, postal codes), not position.
4. **OpenStreetMap is the obvious second source for four kinds and is the one that needs an owner decision.** ODbL share-alike is triggered by a publicly used derivative database, and OSMF's own Collective Database guideline says that merging an own list with OSM data "removing any duplicate objects" is outside the safe harbour. I could not sample OSM: three public Overpass instances answered 504 or 500 on all seven attempts.
5. **Overture Maps Places is the best-licensed unsampled candidate** (CDLA-Permissive-2.0, Apache-2.0 for Foursquare, CC0 for AllThePlaces; Overture states the theme "contains no OpenStreetMap data"). I verified the licences and the schema notes in its documentation but could not sample Singapore records without new tooling, so its coverage and quality are **UNVERIFIED**. Overture itself warns of "duplicates, a high junk rate, and low property completeness".
6. **Wikidata (CC0) is useful as an alias and station-code dictionary, not as a coordinate source.** Of 242 station items with coordinates, 161 cite English Wikipedia and 63 cite nothing; of 236 school items, 135 cite English Wikipedia and 94 nothing; four hawker and ten park coordinate statements cite Google Maps.
7. **The official files carry traps that a naive join would turn into wrong results**; the main ones are listed in section 5 and each is reproduced in a proposed fixture: seven station labels that are codes, exit-code collisions, URA outlines without names, NEA hawker centres that are under construction or interim, one NEA record with swapped SVY21 X/Y attributes, NParks "parks" that are mostly playgrounds and open spaces, MOE postal codes that lost a leading zero, shared school campuses, supermarket licences held by butchers, fishmongers and natural persons.

## 2. Method, evidence and limits

- **Sources of truth.** Primary pages and datasets only: data.gov.sg dataset metadata API and licence page, agency pages, licence texts, OSMF guidelines, Overture, Wikidata and OneMap documentation. A search engine was used only to find URLs (14 queries); nothing below rests on a search snippet unless marked **UNVERIFIED**.
- **Request budget and etiquette.** 55 anonymous GET requests in total (41 answered 200, 7 answered 201 on data.gov.sg `poll-download`, 5 answered 504 and 2 answered 500 from Overpass). No account, token, cookie or API key was used or requested. data.gov.sg requests were paced at least 12 s apart (the repo's own `scripts/lib/sync/rate-limits.ts` interval for anonymous downloads), other hosts at least 3 s, Overpass at least 15 s with longer back-offs after failures. Responses were capped at 8 MB each. The largest downloads were the 786 kB URA outline file and a 5.2 MB OneMap PDF; the largest data sets were small official files (all under 0.8 MB) and one 69 kB GeoNames country file. No bulk dataset was fetched. The request ledger is summarised in appendix A.
- **Where the evidence lives.** One directory per source under the session scratch directory (`.../scratchpad/poi-admission/sources/<source>/`), not committed. Pre-signed download URLs were never recorded.
- **Tags.** A statement without a tag was read in a fetched primary source. **DOCS-ONLY** means the licence or schema was read in documentation but no records were sampled. **UNVERIFIED** means not fetched, not testable under the etiquette rules, or contradicted by nothing but not confirmed.
- **Independence.** Two sources are independent only when they differ in **publisher and collection method**. Derived observations are not independent of what they derive from: a station point computed from exits is the exit source again, and a geocoded coordinate is the geocoder again. Groups used below: `lta` (exits, code registry, DataMall layers, School Zone), `ura-plan` (rail outlines, land use), `nea` (hawker layer, hawker register, supermarket licences), `nparks`, `moe`, `sla-onemap` (geocoder), `osm-volunteer` (OSM and every ODbL Overture theme that is OSM-derived), `overture-places`, `wikidata-community`.
- **Personal data.** The MOE file includes principal and vice-principal names, phone numbers and e-mail addresses, and the supermarket register includes licensees that are natural persons. SODL excludes "any personal data in the dataset". None of it is reproduced in the fixtures, and the spec requires allow-listed source properties.

## 3. What the repository does today

| Kind            | Source today                                                                                                   | Coordinates come from                                   | Lands in                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `mrt_exit`      | LTA MRT Station Exit GeoJSON `d_b39d3a0871985372d7e1637193335da5`                                              | the file (WGS84 points)                                 | D1 `mrt_geojson` row `exits`, then `poi_locations` by trigger         |
| `mrt_station`   | none of its own: `buildMrtStationsGeoJson` averages exit lon/lat per `STATION_NA` label                        | derived from exits                                      | D1 `mrt_geojson` row `stations`, then `poi_locations`                 |
| `school`        | MOE `d_688b934f82c1059ed0a6993d2a829089`, `PRIMARY` rows only (`normalizeSchoolRows`)                          | OneMap Search by postal code, cached in `geocode_cache` | counts and distances inside block comparisons; not in `poi_locations` |
| `supermarket`   | SFA/NEA register `d_11edd0117280c5776651d7891114c88c`                                                          | OneMap Search, cached                                   | same                                                                  |
| `hawker_centre` | NEA `d_4a086da0a5553be1d89383cd90d07ecd` (`normalizeAmenityGeoJson`: Point features, `NAME`, no status filter) | the file                                                | same                                                                  |
| `park`          | NParks `d_0542d48f0991541706b58059381a6eca` (same normaliser)                                                  | the file                                                | same                                                                  |

Facts that matter for admission:

- `poi_locations` stores `source`, `poi_kind`, `source_id`, `name`, `lat`, `lng`, raw `source_properties` and a generated `geography(Point,4326)`. It has **no** publisher, dataset id, licence, retrieval time, status, position method or per-source version. Provenance fields therefore have to be added before a second source can be told apart from the first.
- The existing MRT trigger is deliberately fail-closed: a malformed MRT update aborts the whole source write. Quarantine in this design is additive and does not touch it (see the spec).
- `worker/nearby-spatial-query.ts` partitions exits by the verbatim `STATION_NA` label, so the seven code labels below can occupy result slots next to named labels of the same physical station.
- Documentation drift worth correcting when the spec's docs phase runs: the README calls `d_0542…` "NParks Parks and Nature Reserves" but its live name is "Parks" (points); the polygon layer "NParks Parks and Nature Reserves" is `d_77d7ec97be83d44f61b85454f844382f` (3,095,917 bytes). The README also calls `d_11ed…` "SFA Licensed Supermarkets" while data.gov.sg lists it as "List of Supermarket Licences", `managedBy` National Environment Agency.

## 4. Licences and what each one obliges

| Licence                                                                                             | Text read at                                                                                                     | Obligations that matter here                                                                                                                                                                                                                                                                                        | Storing derived rows in our database and serving them through the API                                                                              |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Singapore Open Data Licence v1.0                                                                    | <https://data.gov.sg/open-data-licence>                                                                          | Conspicuous attribution with dataset name, access date, source and a link to the licence; no implied official status or endorsement; no rights over personal data, third-party rights or trademarks; sub-licence only where necessary for users of the app; licensee indemnifies the agency; "as is"; Singapore law | **Compatible.** No share-alike; commercial use and adaptation allowed. Keep the access date (`retrieved_at`) because the attribution text needs it |
| ODbL 1.0 (OpenStreetMap)                                                                            | <https://opendatacommons.org/licenses/odbl/1-0/>, <https://www.openstreetmap.org/copyright>                      | Attribution; **share-alike** for a publicly used Derivative Database; offer a machine-readable copy of the derivative database (cl. 4.6); no technical restrictions (cl. 4.7); "Produced Works" need a notice only                                                                                                  | **Needs an owner decision** (section 4.2)                                                                                                          |
| CDLA-Permissive-2.0 (Overture Places: Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, BrightQuery) | <https://cdla.dev/permissive-2-0/>                                                                               | When sharing Data, make the licence text available with it; no restriction on "Results"                                                                                                                                                                                                                             | **Compatible.** No attribution clause in the licence itself                                                                                        |
| Apache-2.0 (Foursquare records inside Overture Places)                                              | named on <https://docs.overturemaps.org/attribution/>; licence text not fetched                                  | Retain notices (Overture links a `NOTICE.txt`)                                                                                                                                                                                                                                                                      | **Compatible** if the notice is kept (DOCS-ONLY)                                                                                                   |
| CC0 1.0 (AllThePlaces inside Overture Places; Wikidata structured data)                             | <https://www.wikidata.org/wiki/Wikidata:Licensing> for Wikidata; the CC0 legal code itself was not fetched       | none                                                                                                                                                                                                                                                                                                                | **Compatible**, but see provenance of Wikidata coordinates                                                                                         |
| CC BY 4.0 (GeoNames)                                                                                | <https://www.geonames.org/export/> ("cc-by licence ... give credit to GeoNames ... commercial usage is allowed") | credit                                                                                                                                                                                                                                                                                                              | Compatible, but coverage is far too thin (section 5.6)                                                                                             |
| LTA DataMall Terms of Use                                                                           | <https://datamall.lta.gov.sg/content/datamall/en/term-of-use.html>                                               | "Except as otherwise provided, the Contents of this website shall not be reproduced, republished, uploaded, posted, transmitted ... without the prior written permission of LTA"                                                                                                                                    | **Not established** for the static DataMall downloads: the static-datasets page contains no mention of SODL. Use the data.gov.sg copies instead    |
| OneMap API Terms of Service                                                                         | <https://www.onemap.gov.sg/legal/apitermsofservice.html>                                                         | Data is governed by SODL; per-API terms and credentials "if applicable"; the agency may suspend or terminate access for any reason                                                                                                                                                                                  | Output stored in `geocode_cache` is SODL data; **new** output needs a token, which is ruled out                                                    |

### 4.1 SODL in practice

- It is site-wide: the dataset metadata API returns `datasetId`, `name`, `description`, `format`, `lastUpdatedAt`, `coverageStart`, `managedBy`, `contactEmails`, `datasetSize` and schema, and **no per-dataset licence field**. The licence text says it governs "the datasets on the Relevant Websites" and excludes "third party rights that the Agency is not authorised to license", so a dataset page that states something different must be honoured when it appears.
- Attribution template (verbatim from the licence): `Contains information from {name of dataset} accessed on {date of access of dataset} from {source of data} which is made available under the terms of the Singapore Open Data Licence version 1.0 {URL link to licence}`. Appendix B has one filled-in string per source.
- The indemnity clause is a real obligation, not boilerplate; it applies to claims arising from our use or from our applications. The owner should know it exists.

### 4.2 ODbL: why this is an owner decision

What the licence text says (clause numbers are ODbL 1.0):

- "Derivative Database" includes "Extracting or Re-utilising the whole or a Substantial part of the Contents in a new Database" (definition; cl. 4.4 b). "Substantial" is measured by quantity or quality, and "the repeated and systematic Extraction ... of insubstantial parts ... may amount to" a Substantial part.
- Share-alike (cl. 4.4 a) binds "any Derivative Database that You Publicly Use". Cl. 4.4 c adds that a Derivative Database is Publicly Used when a Produced Work made from it is publicly used. Cl. 4.5 b says using a database to create a Produced Work does not itself create a Derivative Database. Cl. 4.6 requires an offer of the whole derivative database, or a file of alterations, free of charge over the internet.
- OSMF's Substantial guideline (board-endorsed 2014-06-06): not substantial only if the extraction is one-off and under 100 features, or non-systematic and based on the user's own qualitative criteria, or confined to an area of up to 1,000 inhabitants; "repeated small extractions" count as one big one; "the systematic extraction of all eating places within an area" is systematic. Extracting every school, supermarket, park, station and entrance in Singapore on every sync is outside every allowance.
- OSMF's Collective Database guideline (board-endorsed 2016-06-17): OSM and non-OSM data in one database stay independent when "the data used for a particular data type is either all OSM or all non-OSM within the same regional cut", and a join key is a reference. Its third example is our case: "You have a proprietary list of restaurants for a country. You would like to complement your list with the corresponding data from OpenStreetMap removing any duplicate objects in the process. The resulting, combined database would not be covered by this guideline and you would, if the dataset is publicly used, have to consider that your proprietary data may be subject to the ODbL share-alike terms."
- SODL allows a sub-licence only "if this is necessary to enable users of your application", and grants "no rights to Downstream Sub-Licensees". A derivative database that must be offered to everyone under ODbL could therefore pull SODL rows into terms SODL does not let us grant. I have not resolved this; it is a legal question (**UNVERIFIED conclusion**).

Consequences for the design, independent of the choice:

| Option                                 | What it means                                                                                                                                                                 | What it costs                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A. Do not use OSM                      | Admit only SODL, CDLA, Apache and CC0 sources.                                                                                                                                | Fewer second sources; the school, supermarket and hawker kinds stay single-source until Overture is sampled.                            |
| B. Internal corroboration only         | OSM rows exist only in a build-time scratch database to compute a boolean corroboration; no OSM-derived field, row or identifier reaches the serving database or the API.     | Whether even the boolean is a "Produced Work" under cl. 4.3 is a legal call. Loses per-record provenance in the product.                |
| C. Adopt ODbL for an OSM-derived layer | Keep OSM-derived rows in their own tables and files, never blended into SODL rows or columns, publish that layer under ODbL with the required notice and a downloadable copy. | Engineering for strict separation, a public data release obligation, and a decision on how the nearby API presents a mixed result list. |

The spec supports A and C structurally (a `licence_class` on every source and observation, serving views that can filter by class) and treats B as a research mode, not a product mode.

### 4.3 What each licence means for the fixtures and tests

Fixtures copy a handful of identifiers, names and coordinates from SODL, CC0 sources and (none from) OSM. Each fixture file names its sources, licence, retrieval time and upstream `lastUpdatedAt`, and no personal data is included.

## 5. Source inventory

Shared facts for every data.gov.sg dataset below: licence SODL v1.0 (section 4.1); anonymous access through `GET https://api-production.data.gov.sg/v2/public/api/datasets/{id}/metadata` and `GET https://api-open.data.gov.sg/v1/public/api/datasets/{id}/poll-download`, which returns a short-lived pre-signed object URL (it worked without `initiate-download`); limits without an API key are 6 requests per 10 s for real-time APIs, 4 per 10 s for datastore search and **2 per 10 s for dataset downloads**, `429` beyond (<https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits>, page marked "last updated 9 months ago"). The repo's additional guard of about 5 anonymous downloads per minute comes from a code comment and was not re-verified (**UNVERIFIED**). A key is not needed and none was used.

### 5.1 Station and exit kinds

**LTA MRT Station Exit (GEOJSON)**, `d_b39d3a0871985372d7e1637193335da5`, publisher Land Transport Authority.

- Last update (metadata) 2026-09-16T10:06:48+08:00; `coverageStart` 2025-08-18; update frequency is not in the metadata (a search snippet said six-monthly: **UNVERIFIED**). 213,057 bytes.
- Schema: 613 Point features, properties `OBJECTID` (21121 to 21733, unique), `STATION_NA`, `EXIT_CODE`, `INC_CRC`, `FMEL_UPD_D` (three values: 20251202172807, 20260717145303, 20260717145318). No `crs` member, so GeoJSON's WGS84 lon/lat default applies; coordinates carry 14 to 16 decimal digits (a conversion artefact, not precision). Extent lon 103.637 to 103.989, lat 1.265 to 1.449.
- Coverage: 190 distinct `STATION_NA` labels: 142 `... MRT STATION`, 41 `... LRT STATION`, 7 bare codes.
- Quality issues, all reproduced in `PROPOSED-mrt_station.json` and `PROPOSED-mrt_exit.json`:
  - **Seven code labels** (17 exits): `CC30` (3), `CC31` (4), `CC32` (2), `CC9` (2), `DT18` (2), `DT4` (2), `NE18` (2). `CC9` and `DT18` stations also exist under name labels in the same file.
  - 23 exits use a short `EXIT_CODE` without the `Exit ` prefix.
  - `(STATION_NA, EXIT_CODE)` is **not unique**: eight groups collide (`BUKIT PANJANG MRT STATION` Exit A three times; `CHOA CHU KANG MRT STATION` Exit A, C and D twice; `BEDOK NORTH`, `EXPO`, `HARBOURFRONT`, `UPPER CHANGI` once each). Pairs sit from 3.5 m to 348 m apart.
  - Different exits can be 3.6 m apart.
  - Nothing says which stations are open: the July 2026 additions (CC30 to CC32) sit beside long-open ones.

**LTA "Train Station Chinese Names" (code registry)**, `d_d312a5b127e1ae74299b8ae664cedd4e`, publisher LTA.

- CSV, 184 rows, columns `stn_code`, `mrt_station_english`, `mrt_station_chinese`, `mrt_line_english`, `mrt_line_chinese`; description "Train station names updated for DTL2. (Dec 2015)"; `lastUpdatedAt` 2024-06-06; `coverageStart` and `coverageEnd` both 2017-06-27. 9,610 bytes.
- It resolves `CC9` to Paya Lebar and `DT18` to Telok Ayer and has **no row** for `CC30`, `CC31`, `CC32`, `DT4` or `NE18`. It is stale and same-publisher, so it is an alias dictionary, not a second source.

**URA "Amendment to Master Plan 2019 Rail Station layer"**, `d_9a6bdc9d93bd041eb0cfbb6a8cb3248f` (collection 2110, `frequency: ad-hoc`), publisher Urban Redevelopment Authority.

- `lastUpdatedAt` 2025-12-26T10:07:18+08:00; `coverageStart` 2025-09-17; 786,379 bytes. Description: "Indicative MRT and LRT station outline layer ... extracted from the latest Master Plan 2019 which may be updated from time to time".
- Schema: 257 features (253 `Polygon`, 4 `MultiPolygon`), properties `OBJECTID`, `GRND_LEVEL` (ABOVEGROUND, UNDERGROUND), `RAIL_TYPE` (MRT, LRT), `NAME`, `INC_CRC`, `FMEL_UPD_D`, `SHAPE.AREA`, `SHAPE.LEN`. WGS84 by GeoJSON default. The earlier base layer `d_8d886e3a83934d7447acdf5bc6959999` ("approved on 18 Nov 2019", 784,676 bytes, `lastUpdatedAt` 2025-12-05) was read in metadata only. Whether a Master Plan 2025 layer exists was not checked (**UNVERIFIED**).
- Quality: 248 named and 9 unnamed outlines (8 null `NAME`, one literal `"<Null>"`); 5 names carry a trailing space; interchanges have several outlines (Dhoby Ghaut 3, Outram Park 3, Marina Bay 4); names differ from LTA's (`JELEPANG`/Jelapang, `SUM KEE`/Sam Kee, `ONE NORTH`/ONE-NORTH, `RIVER VALLEY` at the Fort Canning station, `BUGIS` and `BUGIS MRT`, `... INTERCHANGE` suffixes); **no status field**; 39 outlines (36 distinct names, plus 3 unnamed LRT outlines) have no LTA exit label within 150 m: mostly names of stations that are not in the exits file (for example AVIATION PARK, TENGAH, JURONG TOWN HALL, DEFU), consistent with planned stations (**UNVERIFIED**), plus the fourth Marina Bay outline; four exits lie 130 m or more from any outline (up to 334 m, Marine Parade exit 5).
- Why it is the second source: different publisher, different method (planning outline versus survey of exits), same licence.

**LTA DataMall static datasets** (<https://datamall.lta.gov.sg/content/datamall/en/static-data.html>, "Last updated 08 October 2026").

- Lists "Train Station" (a point per station, `TrainStation_Sep2026.zip`), "Train Station Exit Point" and "Train Station Codes and Chinese Names" under `/content/dam/datamall/datasets/Geospatial/`. The API request form asks for name, e-mail and phone (an account key); the static links carry no key. **Not downloaded.** Format, CRS, anonymity of the file download and, above all, licence are **UNVERIFIED**; the Terms of Use quoted in section 4 restrict reproduction. The station layer would be valuable (an official station point, not a centroid) but it is the same publisher as the exits, so it would not add independence. Ask LTA (decision OD5) or ignore.

**Wikidata** (`query.wikidata.org/sparql`, CC0 for structured data).

- Anonymous SPARQL, results of 2026-10-09: 254 station items of Singapore, 242 with coordinates (167 of those with a station code, P296) and 12 without.
- Coordinate provenance (items by reference on the P625 statement): 161 imported from English Wikipedia, 63 no reference, 9 Polish Wikipedia, 4 Chinese Wikipedia, 2 OpenStreetMap, 2 Finnish Wikipedia, 1 Dutch Wikipedia. Several coordinates are degree-minute-second values rounded to an arc-second (about 30 m). `Q1096333` is the former mainland "Tanjong Pagar railway station", 1,019 m from the MRT station.
- Observed offsets between a Wikidata point and the LTA exit centroid range from a few metres to 685 m (`Tuas Link`).
- Verdict: alias and code dictionary only.

**OpenStreetMap** (`railway=station`, `railway=subway_entrance`): ODbL; **sample not obtained** (section 5.6). **UNVERIFIED** coverage, tags and independence from government imports.

### 5.2 School

**MOE "General information of schools"**, `d_688b934f82c1059ed0a6993d2a829089`, publisher Ministry of Education.

- CSV, 135,972 bytes, `lastUpdatedAt` 2026-04-17T15:05:04+08:00, `coverageStart` 2026-01-01, `coverageEnd` 2026-12-31. 31 columns including personal data (principal, vice-principals, phone, fax, e-mail). **No coordinates.**
- 337 rows: `PRIMARY` 179, `SECONDARY (S1-S5)` 117, `SECONDARY (S1-S4)` 16, `JUNIOR COLLEGE` 10, `MIXED LEVEL (S1-JC2)` 10, `MIXED LEVEL (P1-S4)` 3, `MIXED LEVEL (S1-S5, JC1-JC2)` 1, `CENTRALISED INSTITUTE` 1; 335 distinct postal codes.
- Quality: **four postal codes lost the leading zero** (`88256`, `99138`, `99757`, `99840`; the repo's `sgPostalCodeSchema` pads them); **two shared campuses** (Singapore Chinese Girls' Primary and Secondary at 309437; Methodist Girls' School Primary and Secondary at 599986); mixed-case addresses; free-text `mrt_desc`.
- Today's pipeline keeps only `PRIMARY` and geocodes the postal code through OneMap (now token-gated).

**LTA School Zone**, `d_abf023b38d9bc451484e3d67b562bc5c`, publisher LTA. Metadata only: GEOJSON, 216,428 bytes, `lastUpdatedAt` 2024-06-06, properties `Name` and `Description`. Polygons named after schools (a search snippet; **UNVERIFIED**). Stale and partial; at best a weak corroboration of where a school is, not admitted.

**Wikidata**: 236 school items with coordinates (18 primary, 108 secondary, 1 junior college, 108 other by label), 93 with a postal code. Provenance: 135 English Wikipedia, 94 no reference. One MOE row maps to two Wikidata items with identical names and coordinates (Hai Sing Catholic School). Several postal codes disagree with the register (Greenridge, Outram, Zhenghua). Alias dictionary and cross-check only.

**OneMap Search** (the current geocoder): `GET https://www.onemap.gov.sg/api/common/elastic/search`. The workshop PDF (<https://www.onemap.gov.sg/apidocs/static/media/OneMap_API_Workshop_Demo_260825.6522ddef4affd370a81a.pdf>, 26/08/2025) shows the banner "From 01 October 2025, Search API access will require token-based authentication", the error "Authentication token missing. Please create an account and generate or renew your API Token." and "Token is needed for all endpoints except basemaps and staticmap api"; tokens last 3 days. A registration e-mail shown on another slide lists a 250 calls per minute limit for the token APIs (it still listed Search among the no-token APIs, which the 1 Oct 2025 banner supersedes). Whether an unauthenticated call today fails outright or returns reduced results was **not tested** (calling the API is outside the etiquette limit); the slides show a missing-token reply that still carried results, so the enforcement mode is unknown. Excluded by the no-token constraint.

**OpenStreetMap** (`amenity=school`, `amenity=college`) and **Overture Places** (education categories): see 5.6.

### 5.3 Supermarket

**"List of Supermarket Licences"**, `d_11edd0117280c5776651d7891114c88c`, `managedBy` National Environment Agency (the register concerns Singapore Food Agency supermarket licences).

- CSV, 42,172 bytes; `lastUpdatedAt` **2024-06-06**; `coverageStart` and `coverageEnd` both 2016-06-26. Columns `licence_num`, `licensee_name`, `building_name`, `block_house_num`, `level_num`, `unit_num`, `street_name`, `postal_code`. **No coordinates.** 478 rows, 478 unique licence numbers, 445 distinct postal codes, 24 postal codes carry more than one licence.
- Quality: `licensee_name` is a company, not a store name (`COLD STORAGE SINGAPORE (1983) PTE LTD`, `NTUC Fairprice Co-operative Ltd`); the register includes butchers, fishmongers, traders and licensees that are natural persons; 12 names end in a stray `?` (`PRIME SUPERMARKET LIMITED?` 10, `ISETAN (SINGAPORE) LIMITED?` 2); 204 `building_name` values are the placeholder `na`; one record has block `na` and postal code `0na` (no usable address); some postal codes carry two licences of the same licensee (80 Marine Parade Road; New World Centre).
- Stale by more than two years at the time of the evidence.

**OpenStreetMap** (`shop=supermarket`) and **Overture Places** (grocery/supermarket categories): see 5.6. Brand store locators were not considered: no open licence or documented anonymous API was found, and scraping them is excluded by the project constraints (**UNVERIFIED** per brand).

### 5.4 Hawker centre

**NEA "Hawker Centres (GEOJSON)"**, `d_4a086da0a5553be1d89383cd90d07ecd`, publisher National Environment Agency.

- 140,561 bytes; `lastUpdatedAt` 2026-10-09T10:06:43+08:00; `coverageStart` 2025-11-07; feature `FMEL_UPD_D` values 20241211100036, 20250405100117, 20250807100106, 20260313100124.
- 129 Point features; properties `OBJECTID`, `NAME`, `STATUS`, `ADDRESSBUILDINGNAME`, `ADDRESSBLOCKHOUSENUMBER`, `ADDRESSSTREETNAME`, `ADDRESSPOSTALCODE`, `ADDRESS_MYENV`, `NUMBER_OF_COOKED_FOOD_STALLS`, `LANDXADDRESSPOINT` and `LANDYADDRESSPOINT` (SVY21, EPSG:3414), dates and photo URL.
- `STATUS`: Existing 103, Existing (new) 16, Existing (replacement) 3, **Interim Centre 1, Under Construction 6**. The current normaliser does not look at `STATUS`.
- `NAME` mixes an address label and a common name in parentheses (`Queen Street Blk 270 (Albert Centre)`), or only an address (`New Upper Changi Road Blk 208B`).
- **SVY21 check.** Transforming the WGS84 geometry with `ST_Transform(..., 3414)` reproduces the file's `LANDX/LANDY` to under 1 mm for 123 of 129 rows. Six differ: 0.5 m (Bedok Food Centre), 2.9 m (Tekka), 6.8 m (Fernvale), 43.2 m (Bukit Timah Market, under construction), 49.0 m (Amoy Street) and **20,293 m for OBJECTID 119460 (Bukit Timah Interim Hawker Centre and Market), whose X and Y are swapped** (X 35883.1, Y 21533.7 where the geometry gives X 21533.7, Y 35883.1). The geometry is right; the attribute pair is not.

**NEA "List of Government Markets and Hawker Centres"**, `d_68a42f09f350881996d83f9cd73ab02f`: only seen in search results (**UNVERIFIED**). Same publisher, so not an independent source. NEA also posts monthly PDF lists (`list-of-hcs_-17-august-2026.pdf`, seen in a search result), which are not machine-readable open data.

**Wikidata**: 46 items with a hawker or food-centre label and coordinates (many with names that match NEA's alias in parentheses); provenance: 39 no reference, 4 Google Maps, 3 English Wikipedia, 1 a commercial site. Several items were created in bulk (Q1357xxxxx), which suggests an import from NEA data (**UNVERIFIED**), in which case they are not independent. The label filter also catches a restaurant brand (`Hawker Chan`).

### 5.5 Park

**NParks "Parks" (points)**, `d_0542d48f0991541706b58059381a6eca`, publisher National Parks Board.

- 168,423 bytes; `lastUpdatedAt` 2026-10-09T10:06:45+08:00; description "The points in this layer represents the indicative Managed Areas of Parks which are under the purview of NParks."
- 462 Point features; properties `OBJECTID`, `NAME`, `X`, `Y` (SVY21), `INC_CRC`, `FMEL_UPD_D` (ten values from 20260115 to 20260703). **`X` and `Y` agree with the WGS84 geometry to 0.000 m for all 462 rows** under `ST_Transform(..., 3414)`. Extent lat 1.214 to 1.462, lon 103.693 to 104.054 (includes offshore islands; seven records lie north of lat 1.45).
- **Most records are not parks.** Names are abbreviated and carry the type as a suffix. Classifying by name with a simple deterministic pattern (descriptive, not a decision): park 216, playground 162 (`PG`, `PLAYGROUND`), other 43, open space 18 (`OS`), garden 13, fitness corner 5 (`FC`), nature reserve 4, car park 1 (`EAST COAST PARK AREA E1 CAR PARK`). `PK`, `PG`, `OS`, `FC` and `JLN`-style abbreviations need a dictionary.
- Today's normaliser keeps all 462.

**NParks "NParks Parks and Nature Reserves" (polygons)**, `d_77d7ec97be83d44f61b85454f844382f`: metadata only; GEOJSON, 3,095,917 bytes, `lastUpdatedAt` 2026-10-09T10:06:45+08:00, properties `OBJECTID_1`, `L_CODE`, `NAME`, `N_RESERVE`, `SHAPE_1.AREA`, `SHAPE_1.LEN`. Same publisher, so geometry quality, not independence. The current normaliser would return no rows from it (it accepts Point features only). Not downloaded (above the small-sample limit); contents **UNVERIFIED**.

**URA Master Plan 2019 Land Use layer** (`d_90d86daa5bfaa371668b84fa5f01424f`, amendment `d_c0e06af6b1a36e6a82223f67c1e17fbd`): seen only in search results, **UNVERIFIED**. If its metadata and licence hold, zoning polygons are an independent official source of area evidence for parks (and schools).

**Wikidata**: 128 park, garden and nature-reserve items with coordinates. The `instance of park` closure also returns amusement and theme parks (Big Splash, Escape Theme Park, Gay World Amusement Park). Provenance of park coordinates: 53 English Wikipedia, 46 no reference, 17 an unresolved source item, 10 Google Maps. Five items carry two coordinates, up to about 4 km apart (Bukit Timah Nature Reserve).

### 5.6 Cross-kind candidates

**OpenStreetMap.** Licence section 4.2. The public Overpass API is the natural anonymous access route. Seven requests between 19:19 and 20:10 UTC (five to `overpass-api.de`, one to `overpass.kumi.systems`, one to `overpass.private.coffee`) all failed: `504` with `Dispatcher_Client::request_read_and_idx::timeout` from the main instance and `500` from the other two. The query was a plain `area["ISO3166-1"="SG"]` extraction of `railway=station` and `railway=subway_entrance`. I stopped after seven attempts to avoid hammering shared infrastructure. Overpass usage limits, tag coverage, `source=*` provenance, and whether Singapore mappers imported LTA, NEA or NParks data (which would make OSM non-independent) are all **UNVERIFIED**.

**Overture Maps.** Per-theme licences (<https://docs.overturemaps.org/attribution/>, footer "Last updated on May 15, 2026"): **Places** is Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, BrightQuery under CDLA-Permissive-2.0, Foursquare under Apache-2.0 and AllThePlaces under CC0-1.0; **Base, Buildings, Divisions and Transportation are ODbL** (OSM-derived). The Places guide (<https://docs.overturemaps.org/guides/places/>, "Last updated on Sep 23, 2026") states the theme "contains no OpenStreetMap data and carries none of the share-alike obligations of the ODbL", lists about 81 million places (Meta about 58.8 million), a monthly release cadence, a per-record existence `confidence`, and "known quality issues ... duplicates, a high junk rate, and low property completeness". It also warns that "joining CDLA Permissive 2.0 data to OpenStreetMap is permitted, but the resulting data may need to carry the ODbL if it is a derivative database". Overture's own merge promotes a single source per place and merges no attributes, which is the behaviour this design copies. Singapore coverage, the schools, supermarkets, hawker centres and parks categories, ID stability and the access route (cloud object store plus tooling such as DuckDB) are **DOCS-ONLY or UNVERIFIED**; no records were sampled.

**GeoNames.** CC BY 4.0, daily dumps, country file `SG.zip` (69,019 bytes, 1,979 features, latest modification 2026-09-14). Coverage is far too thin for any kind: 12 schools (`S.SCH`) against 337 in the register, 28 parks (`L.PRK`) against 462, 19 metro stations (`S.MTRO`) against 190 labels, no supermarket or hawker class. Rejected.

## 6. Admission recommendation

"Admit" means "approved to be loaded as an observation source by the spec's phases"; no source is admitted by this document.

| Kind            | Source A                                                                  | Source B                                                                                                                | Licence verdicts                                     | Position                                                                                                                                 | Owner decisions    |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `mrt_station`   | LTA exits (station point derived as the mean of exit points)              | URA MP2019 amendment outlines                                                                                           | both SODL: clear                                     | **Two independent sources.** LTA code registry and Wikidata station codes as an alias dictionary only (no Wikidata coordinates)          | OD5                |
| `mrt_exit`      | LTA exits                                                                 | none admitted; OSM `railway=subway_entrance` is the only candidate                                                      | A clear; B ODbL                                      | **Single source**, explicit `SINGLE_SOURCE` uncertainty; URA outlines give containment (membership), not corroboration of the exit point | OD1                |
| `school`        | MOE register (identity, no position) plus carried-forward cached geocodes | Overture Places (conditional); OSM (owner)                                                                              | A SODL clear; Overture clear but unsampled; OSM ODbL | **Single coordinate source** (frozen geocodes, provenance `geocoder:onemap-search`)                                                      | OD1, OD2, OD6      |
| `supermarket`   | NEA/SFA licence register plus cached geocodes                             | Overture Places (conditional); OSM (owner)                                                                              | same                                                 | **Single coordinate source**, plus an admission gate (type, personal data, unusable addresses)                                           | OD1, OD2, OD4, OD6 |
| `hawker_centre` | NEA hawker GeoJSON                                                        | Overture Places (conditional); OSM (owner); NEA's other register is not independent                                     | A clear                                              | **Single source** with a status gate (Existing only) and an SVY21 consistency check                                                      | OD1, OD2           |
| `park`          | NParks points (class-gated)                                               | NParks polygons for geometry (same publisher); URA Land Use for independent area evidence (UNVERIFIED); Overture or OSM | A clear                                              | **Single publisher family**; independent corroboration conditional                                                                       | OD1, OD2           |

The last column lists the kind-specific owner decisions of section 7. Every row also depends on the platform-level decisions OD3 (writer role and cache epoch), OD7 (label approvers) and OD8 (attribution placement).

Why `mrt_station` qualifies and nothing else does: it is the only kind where a second official, anonymous, SODL-licensed layer with coordinates and names exists and was sampled. For the other kinds the strict reading of "two independent sources where licensing genuinely allows" yields one source plus a candidate that is either unsampled (Overture), blocked on a legal decision (OSM) or too weakly sourced (Wikidata).

How the single-source kinds must present themselves: every entity carries `corroboration_scope = single-source-by-design` and the caveat `SINGLE_SOURCE`; the school and supermarket coordinates additionally carry `POSITION_GEOCODED_FROZEN` and the date the cached geocode was written. Nothing is described as "verified" without two independent sources agreeing.

## 7. Decisions needed from the project owner

Ids are `OD1` to `OD8` (owner decision), so that they cannot be mistaken for the Cloudflare D1 database that this repository also calls "D1".

| Id  | Decision                                                                                                                                                                                                             | Why it blocks                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| OD1 | OSM and ODbL: option A, B or C (section 4.2). If C, who publishes the derivative layer and where.                                                                                                                    | Decides whether any second source exists for exits, schools, supermarkets, hawker centres and parks.                                |
| OD2 | Approve a one-off, local Overture Places extract for a Singapore bounding box using tooling that is not a repo dependency (for example DuckDB on a developer machine), and the acceptance criteria for admitting it. | Overture is the best-licensed second coordinate source and could not be sampled with the allowed tools.                             |
| OD3 | Who writes the `poi_*` tables on the serving branch and with which role, and the rule for bumping `NEON_PUBLIC_CACHE_EPOCH` on each promotion.                                                                       | The serving branch is a static snapshot refreshed by no tracked job; the existing triggers and role inventory constrain any writer. |
| OD4 | What counts as a supermarket (allow-list of brands, licence class, or both), and the handling of licensees that are natural persons.                                                                                 | The register includes butchers, fishmongers, traders and individuals.                                                               |
| OD5 | Ask LTA whether the DataMall static "Train Station" layer may be used under SODL, or ignore it.                                                                                                                      | An official station point would improve the station kind but its licence is not established.                                        |
| OD6 | Confirm that the token ban stands, so cached geocodes stay frozen and no new school or supermarket coordinates are produced.                                                                                         | The only anonymous geocoder is gone.                                                                                                |
| OD7 | Label approvers, second reviewer if any, and minimum sample sizes per kind (spec design, "Labelling protocol").                                                                                                      | No metric may be reported before labels are approved.                                                                               |
| OD8 | Where attributions appear in the app and who owns keeping them current.                                                                                                                                              | SODL requires a conspicuous notice; appendix B lists the strings.                                                                   |

## 8. Not verified

- OSM: any record, tag, count or `source=*` provenance; the Overpass fair-use policy; independence from government imports.
- Overture: any Singapore record; category coverage for the six kinds; the object-store paths and access tooling beyond what the guide describes; the Apache-2.0 and CC0 legal texts.
- URA Master Plan 2019 Land Use layer metadata; NParks polygon contents; NEA register `d_68a42f09…`; whether a Master Plan 2025 layer exists.
- LTA DataMall static files (download, format, CRS, licence).
- Whether unauthenticated OneMap Search today fails or degrades; the OneMap 250-per-minute figure is from a 2025 registration e-mail shown in the slides.
- The 5-per-minute anonymous download guard cited in `rate-limits.ts`; the six-monthly update frequency of the LTA exit file; whether Wikidata hawker items were imported from NEA data.
- The CC0 and CC BY 4.0 legal code texts (only Wikidata's and GeoNames' own statements about their licences were read).
- Whether any name in the NEA supermarket register beyond the three observed is a natural person (not enumerated, deliberately).
- That the 39 unmatched URA outlines are planned stations.
- The legal conclusions in section 4.2.

## Appendix A. Request ledger summary

| Group                                                                                   | Requests | Notes               |
| --------------------------------------------------------------------------------------- | -------- | ------------------- |
| data.gov.sg licence page and rate-limit guide                                           | 2        | `sodl`              |
| LTA exit file (metadata, poll-download, object)                                         | 3        | `lta-mrt-exits`     |
| LTA code registry                                                                       | 3        | `lta-station-codes` |
| URA outlines (collection, dataset metadata, poll-download, object, base-layer metadata) | 5        | `ura-mp2019-rail`   |
| MOE, SFA/NEA, NEA hawker                                                                | 9        | 3 each              |
| NParks points and polygon metadata                                                      | 4        | `nparks-parks`      |
| LTA School Zone metadata                                                                | 1        | `lta-school-zone`   |
| LTA DataMall (API access page, static datasets page, Terms of Use)                      | 3        | `lta-datamall`      |
| OSM licence pages (copyright, ODbL, Collective Database, Substantial)                   | 4        | `osm-licence`       |
| Overpass (failed: 5 times 504, 2 times 500)                                             | 7        | `osm-overpass`      |
| Wikidata (licensing page, 5 SPARQL queries)                                             | 6        | `wikidata`          |
| Overture (attribution, Places guide, CDLA text)                                         | 3        | `overture`          |
| OneMap (API terms, docs shell, workshop PDF)                                            | 3        | `onemap`            |
| GeoNames (export page, `SG.zip`)                                                        | 2        | `geonames`          |

Total 55. Search-engine queries (URL discovery only): 14.

## Appendix B. Attribution strings

Fill `{date}` with the publication's `retrieved_at`.

- LTA exits: `Contains information from LTA MRT Station Exit (GEOJSON) accessed on {date} from Land Transport Authority via data.gov.sg which is made available under the terms of the Singapore Open Data Licence version 1.0 https://data.gov.sg/open-data-licence`
- URA outlines: same pattern with `Amendment to Master Plan 2019 Rail Station layer` and `Urban Redevelopment Authority`.
- MOE: `General information of schools`, `Ministry of Education`.
- NEA supermarket licences: `List of Supermarket Licences`, `National Environment Agency`.
- NEA hawker: `Hawker Centres (GEOJSON)`, `National Environment Agency`.
- NParks: `Parks`, `National Parks Board`.
- Overture Places (if admitted): the licence text per source plus `Overture Maps Foundation`, per its attribution page.
- OSM (if option C): `Contains information from OpenStreetMap, which is made available under the Open Database License (ODbL)`, linked to <https://www.openstreetmap.org/copyright>, and the ODbL 4.3 notice.
