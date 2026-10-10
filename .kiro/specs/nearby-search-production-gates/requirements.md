# Requirements: Nearby Search Production Gates

## R1 — Bounded origin work

- **R1.1** WHEN `GET /api/nearby-places` passes the feature gate THEN the Worker
  applies a per-client limit of 30 requests per 60 s before it consults the
  public-read cache or opens a database connection.
- **R1.2** WHEN a request exceeds the per-client limit THEN the response is
  `429` with `Retry-After: 60` and `Cache-Control: no-store`, and no cache or
  database work is done for it.
- **R1.3** WHEN an answer must come from the database (a cache miss) THEN the
  Worker spends one unit of a per-location budget of 300 per 60 s. A cache hit
  spends none.
- **R1.4** WHEN the origin budget is spent THEN the response is `503` with
  `Retry-After: 60` and `no-store`, no spatial SQL runs, and nothing is cached.
- **R1.5** The client key is the IPv4 address, the embedded IPv4 of an
  IPv4-mapped IPv6 address, or the `/64` prefix of any other IPv6 address. A
  missing or malformed address shares one fallback key, so a bad header cannot
  mint fresh buckets.
- **R1.6** WHEN a limiter binding is missing while the gate is open THEN the
  route answers `503` (fail closed). WHEN the origin limiter call throws THEN the
  request is refused with `503` and `no-store`, the error is logged and nothing
  reaches the database (fail closed); cache hits are unaffected. WHEN only the
  client limiter call throws THEN the request proceeds and the error is logged,
  because every request that reaches the database still passes the origin
  checks.
- **R1.7** The limits are defined once in `shared/nearby-limits.ts`. A test
  fails when `wrangler.jsonc` disagrees, when the period is not one the binding
  supports, or when two namespace ids collide.

## R2 — Real deployed-path verification

- **R2.1** Before the flag may be considered, the path real Worker, real
  Hyperdrive configuration, real PostGIS branch is exercised against an isolated
  database. Mocked tests and direct SQL verification do not satisfy this.
- **R2.2** The isolated database is a disposable fork of the serving branch that
  carries `sql/neon/001_postgis_nearby.sql`. The serving branch and the
  production Worker, Hyperdrive configuration and D1 database are not touched.
- **R2.3** The temporary Worker and Hyperdrive configuration have names and
  rate-limit namespace ids of their own, connect as a SELECT-only database role,
  keep query caching off and use a small origin connection limit.
- **R2.4** Answers obtained through the Worker equal the shipped SQL's results
  obtained directly, for a recorded sample that includes the grounded
  `central-area-535-upp-cross-st` case.
- **R2.5** The run observes the cache contract (`MISS` then `HIT`, canonical
  keys) and both limiter paths (`429`, `503`) on the deployed Worker.
- **R2.6** Latency is reported as a distribution with its sample size, vantage
  point and cache state. It is not presented as a benchmark.
- **R2.7** Teardown deletes the temporary Worker, the temporary Hyperdrive
  configuration and any local credential material. The fork is left for its
  owner to delete.

## R3 — The release gate stays closed

- **R3.1** `NEON_SPATIAL_ENABLED` remains `"false"` in `wrangler.jsonc` until a
  separate approval. `tests/unit/nearby-rate-limit.test.ts` asserts it.
- **R3.2** Opening the gate requires, in order: the migration applied to the
  serving branch with approval; `sql/neon/verify_nearby_spatial_sql.sql` passing
  on a disposable fork of it; recorded R2 evidence; explicit approval of the
  rollout.
