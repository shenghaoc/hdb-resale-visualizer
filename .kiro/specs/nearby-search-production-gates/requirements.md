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
  keep query caching off and use a small origin connection limit. Its D1 binding
  is a throwaway database of its own that carries only the budget table, never
  the production database.
- **R2.4** Answers obtained through the Worker equal the shipped SQL's results
  obtained directly, for a recorded sample that includes the grounded
  `central-area-535-upp-cross-st` case.
- **R2.5** The run observes the cache contract (`MISS` then `HIT`, canonical
  keys), both limiter paths (`429`, `503`) and the daily ceiling (`503` once it
  is spent, a cached answer still served) on the deployed Worker.
- **R2.6** Latency is reported as a distribution with its sample size, vantage
  point and cache state. It is not presented as a benchmark.
- **R2.7** Teardown deletes the temporary Worker, the temporary Hyperdrive
  configuration and any local credential material. The fork is left for its
  owner to delete.

## R4 — A bounded Hyperdrive budget

Hyperdrive's Free plan allows 100,000 database statements a day for the whole
account. Every public route spends from it.

- **R4.1** WHEN a nearby cache miss goes to the database THEN it sends exactly one
  statement, which returns the places together with the identity of the
  publication they were read from. A cache hit on a live pointer sends none. The
  multi-statement path of every other public route is unchanged.
- **R4.2** WHEN the answer must come from the database THEN, after the request is
  known to be valid and answerable and the origin limit has passed, the Worker
  takes one statement from a global per-UTC-day allowance in one atomic statement
  before it sends the query. The allowance is 10,000 unless the Worker var
  `NEARBY_DAILY_STATEMENT_CEILING` (a whole number from 1 to 100,000) says
  otherwise.
- **R4.3** WHEN the allowance is spent THEN the response is `503` with
  `Retry-After` set to the seconds until 00:00 UTC (never below 60) and
  `no-store`, no spatial SQL runs and nothing is cached. Cache hits are
  unaffected.
- **R4.4** (fail closed) WHEN the D1 binding is missing, the ceiling is configured
  invalidly, the counter errors or does not answer within 2 s, or answers anything
  other than "granted" or "refused" THEN the request is refused with `503` and
  nothing reaches the database.
- **R4.5** Requests that never reach the database (invalid input, a backend without
  PostGIS) spend neither the origin limit nor the allowance.
- **R4.6** Granted reservations are never returned, so the counter can only
  over-state a day's spend.
- **R4.7** The first publication of the budget table is migration
  `0012_nearby_statement_budget.sql`. It is applied to the remote D1 database only
  with approval, and before the flag is opened.

## R3 — The release gate stays closed

- **R3.1** `NEON_SPATIAL_ENABLED` remains `"false"` in `wrangler.jsonc` until a
  separate approval. `tests/unit/nearby-rate-limit.test.ts` asserts it.
- **R3.2** Opening the gate requires, in order: the spatial migration applied to
  the serving branch with approval; `sql/neon/verify_nearby_spatial_sql.sql`
  passing on a disposable fork of it; migration 0012 applied to the remote D1
  database with approval (R4.7); recorded R2 evidence; explicit approval of the
  rollout.
