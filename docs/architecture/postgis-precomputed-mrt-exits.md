# Published MRT exits in the block detail

The block drawer lists up to five nearby MRT stations, each with its nearest exit. The list is the same for every reader of a publication, so it is computed once, when the serving data is published, and stored in the block detail as `nearbyMrtExits`. The drawer reads it from the detail it has already loaded. It makes no request to `/api/nearby-capabilities` or `/api/nearby-places`.

`GET /api/nearby-places` is a different feature (any coordinate, any radius). It stays in the Worker with its tests, gated off in production by `NEON_SPATIAL_ENABLED="false"`. Opening it still needs a separately approved global budget protection (`docs/architecture/postgis-nearby.md`).

## The field

`AddressDetail.nearbyMrtExits` (`shared/data-types.ts`, validated by `addressDetailSchema` in `src/shared/lib/dataSchemas.ts`) is optional:

```ts
nearbyMrtExits?: { stationName: string; exitLabel: string; distanceMeters: number; exitId: string }[]; // at most 5
```

| Stored value      | Meaning                                                     | Drawer                        |
| ----------------- | ----------------------------------------------------------- | ----------------------------- |
| a populated array | the nearest stations, nearest first                         | renders the published exits   |
| `[]`              | the publication found no exit within 1,500 m                | shows "none within range"     |
| no field          | the document was published without this step (D1, old data) | hides the section; no request |

Both public-read backends return the stored document text unchanged, so each returns the field exactly when its document holds it (`tests/unit/public-data-parity.test.ts`). Only the Neon serving child's publication step writes it. The D1 publication path (`scripts/sync-data.ts`) does not, so D1 documents do not carry the field; D1 needs no migration to stay a valid rollback target.

## The calculation

`sql/neon/publish_block_detail_nearby_mrt_exits.sql` uses PostGIS and the same rules as `NEARBY_SPATIAL_SQL` (`worker/nearby-spatial-query.ts`) for kind `mrt_exit` at 1,500 m:

1. The block centre is snapped to the 0.0001-degree grid (`round(lat, 4)`, `round(lng, 4)`).
2. Candidate exits are those within 1,500 m (`ST_DWithin` on geography); distances are spheroidal (`ST_Distance`).
3. Candidates are grouped by station **before** any limit, and the nearest exit of each station is kept. Ties go to the lower exit id under `COLLATE "C"`.
4. The result is ordered by the distance rounded to 0.1 m, then kind, then exit id, and the first five are stored.
5. `stationName` and `exitLabel` are the source fields `STATION_NA` and `EXIT_CODE`. The display name is never parsed, so short codes such as `E` are stored as the source gives them.

### One explicit normalisation

The source records a few exits under a station code instead of the station name. Two of those codes label extra exits of a station whose other exits carry its name. Without a rule, that one station takes two of the five places.

| Source `STATION_NA` | Published as             | Grounding in the 2026-10-04 publication           |
| ------------------- | ------------------------ | ------------------------------------------------- |
| `CC9`               | `PAYA LEBAR MRT STATION` | 2 exits, 50.3 to 61.4 m from a `PAYA LEBAR` exit  |
| `DT18`              | `TELOK AYER MRT STATION` | 2 exits, 75.8 to 143.5 m from a `TELOK AYER` exit |

The alias is a literal list in the SQL file. It changes the station an exit is grouped and shown under; the exit code and exit id stay the source values. Every run checks it against the candidate's own data: each exit under an aliased code must lie within 200 m of an exit that carries the station name, or the publication stops. The other code labels of that publication (`CC30`, `CC31`, `CC32`, `DT4`, `NE18`) have no named exit within 227 m and are published as recorded. `GET /api/nearby-places` is not changed and groups by the source label verbatim.

## Where it runs

The benchmark publisher's schema, its COPY stage and the upstream change guard are not touched: the field is never part of a benchmark publication. It is a child-only stage of the promotion in `.kiro/specs/serving-data-refresh/design.md`:

1. Publish and verify the benchmark's base data.
2. Create the unserved candidate child and prepare its PostGIS data (role defaults, `sql/neon/001_postgis_nearby.sql`).
3. Prove base-table equality between the candidate and the benchmark.
4. Materialize `nearbyMrtExits` on the candidate and verify it independently.
5. Admit the candidate for the separately approved promotion.

The publication is one transaction. It derives a list for every row of the candidate's own `block_details` (including blocks with no new resale transaction), requires the derived key set to equal the `block_details` key set, writes only the documents whose list differs, and writes the private manifest marker `nearbyMrtExitsMaterialization` last. The marker holds the parameters, the alias, the candidate's own block-detail count and a SHA-256 of every key and its list. The Worker's cache generation is the hash of the stored manifest text, so the marker gives the candidate a new generation; the public `/api/manifest` returns the contract keys only and does not show it.

A failed check rolls the transaction back. The candidate then has no marker, the verifier refuses it, and it is not promoted. An unchanged rerun writes nothing: no document, no marker, no `updated_at`.

## Checks

| Check                                                                    | Runs                                            | What it shows                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/postgis-sql.test.ts`                                         | every CI run, on PostGIS in process (PGlite)    | Executes the SQL files as `psql -f` would, on a fixture database with the publisher's schema: migration 001, the publication and an unchanged rerun, the corpus verifier, the synthetic cases and the CRS contract. Each verifier must also refuse a calculation with one rule broken on purpose. |
| `tests/unit/block-detail-nearby-mrt-exits-sql.test.ts`                   | every CI run                                    | The two scripts below execute the published core and the shipped `NEARBY_SPATIAL_SQL` verbatim. The plain-SQL apply stage: coverage refusals, the atomic write, manifest last, idempotence, and that the marker changes the cache generation but not the public manifest.                         |
| `sql/neon/verify_block_detail_nearby_mrt_exits_cases.sql`                | CI, and on the candidate; read only             | Synthetic cases on PostGIS: empty, the 1,500 m boundary, grouping before the limit in a dense area, the five-station limit, a short exit code, ties, the alias, and ordering after rounding.                                                                                                      |
| `sql/neon/verify_block_detail_nearby_mrt_exits.sql`                      | CI on fixtures, and on the candidate; read only | Every block detail against an oracle that shares no code with the publication; a sample against the shipped query; the alias grounding; the marker; and digests of the candidate without its derived data.                                                                                        |
| `tests/unit/NearbyMrtExits.test.tsx`, `tests/unit/DetailDrawer.test.tsx` | every CI run                                    | The three drawer states, each with no nearby request.                                                                                                                                                                                                                                             |

CI proves the SQL on fixtures. It cannot prove a candidate's data, so the two scripts are also run on every candidate before it can be promoted.

## Promotion procedure for the candidate

Run from a clean checkout. `$BENCHMARK_URL` and `$CANDIDATE_URL` are direct (non-pooler) connection strings kept in files that are not printed. Receipts go in the pull request that records the refresh, not in the repository.

1. **Base equality, before any derivation.** Run on both branches and compare. Every line must be equal.

   ```sql
   SELECT 'block_details' AS item, count(*) AS rows,
     encode(sha256(convert_to(COALESCE(string_agg(address_key || E'\t' || json::text, E'\n'
       ORDER BY address_key COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
   FROM public.block_details
   UNION ALL
   SELECT 'manifest', count(*), encode(sha256(convert_to(string_agg(json::text, ''), 'UTF8')), 'hex')
   FROM public.manifest WHERE id = 1;
   ```

   This is in addition to the nine-table proof of the refresh procedure. Keep the benchmark's two digests for step 5.

2. **Cases.** `psql "$CANDIDATE_URL" -X -q -v ON_ERROR_STOP=1 -f sql/neon/verify_block_detail_nearby_mrt_exits_cases.sql` must end with `PASS: 8 cases`.

3. **Cost baseline.** Record, on the candidate: `pg_total_relation_size('public.block_details')`, `pg_current_wal_lsn()`, the branch's logical size from the Neon API, and `sum(octet_length(json::text))` over `block_details`.

4. **Materialize.** `psql "$CANDIDATE_URL" -X -v ON_ERROR_STOP=1 -c '\timing on' -f sql/neon/publish_block_detail_nearby_mrt_exits.sql`. A non-zero exit rejects the candidate.

5. **Verify.** `psql "$CANDIDATE_URL" -X -q -v ON_ERROR_STOP=1 -f sql/neon/verify_block_detail_nearby_mrt_exits.sql` must end with `PASS`. Its notice gives the block-detail count, the populated and empty lists, and two digests of the candidate without its derived data. They must equal the benchmark's digests from step 1. A failure or a difference rejects the candidate.

6. **Idempotence.** Run step 4 again. It must report `UPDATE 0` twice, and step 5 must print the same marker digest.

7. **Cost after.** Read the four values of step 3 again and report the differences separately: JSON text growth (total and per document), physical growth of `block_details`, WAL written (`pg_wal_lsn_diff`), the publication's elapsed time, and the branch's logical size against its 1 GiB limit. The JSON figure is not a measure of the other three. Do not promote without headroom (R6.1b).

8. **Admit.** Only a candidate that passed steps 2, 5 and 6 goes on to the acceptance and the Hyperdrive switch. Those keep their own explicit approval.

Rollback is unchanged: the previous serving child is kept, and the switch back is one Hyperdrive origin change. A candidate that fails here is never served, so there is nothing to roll back.
