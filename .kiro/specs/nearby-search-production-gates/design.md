# Design: Nearby Search Production Gates

> Status: Phase 1, 2 and 4a complete (rate limiting, documentation, one labelled spatial statement
> per miss, a proposed Neon-backed daily admission budget). Phase 3 (the deployed-path run)
> is open. The feature flag stays `"false"`.

## Problem

`GET /api/nearby-places` is the one public route whose cache misses run a
spatial query on a metered, shared Neon branch. Its canonical cache keyspace is
about 1.0 billion keys (`docs/architecture/postgis-nearby.md`), so the cache
cannot bound that work: a client walking the grid never hits. Until something
else does, enabling the flag would let any client spend the project's database
budget.

Separately, every check so far ran either against fakes (the Worker gate tests)
or directly in SQL (the differential verifier). Neither shows that a deployed
Worker reaches PostGIS through Hyperdrive and gets the same answer.

## Goals

- Bound origin work per client and per location, without a new service.
- Bound accepted spatial queries through an atomic Neon admission budget, failing closed, without adding D1 writes; acknowledge that denied reservations still count against Hyperdrive's account-wide allowance.
- Spend as few statements and bytes per miss as the cache's guarantees allow.
- Keep cache hits free, so popular locations stay cheap.
- Fail loudly on a misconfigured deployment, closed on a fault in front of the
  database and gracefully on a fault in the fairness limiter.
- Exercise the deployed path on an isolated database before the flag is
  considered, and record what was and was not shown.

## Non-goals

- Opening the gate, applying the migration to the serving branch, or changing
  production Worker, Hyperdrive or D1 configuration.
- A hard account-wide quota enforced by the app. Hyperdrive Free provides the final 100,000-statement hard cap. The Neon budget is branch-scoped and admits a bounded number of spatial reads, not denied reservations.
- Treating the verification run as a benchmark. Synthetic scale benchmarks run
  on local PostgreSQL/PostGIS, not through this path.

## Architecture

```
request
  -> flag gate (NEON_SPATIAL_ENABLED)            503 when closed
  -> client limit  NEARBY_IP_LIMITER  30 / 60 s   429 + Retry-After
  -> public-read cache                            HIT: answer, no origin work
       miss
  -> request valid and answerable?                400 / 503, nothing spent
  -> origin limit  NEARBY_ORIGIN_LIMITER 300 / 60 s   503 + Retry-After, fails closed
  -> Neon admission via HDB_NEARBY_BUDGET: 1 statement, 503 when denied
  -> ONE labelled SELECT via HDB_PUBLIC_NEON: PostGIS places + publication label
```

`functions/_lib/nearby-rate-limit.ts` holds the key derivation and the two
checks, `functions/_lib/nearby-budget.ts` the daily ceiling. `worker/index.ts`
calls the client check before `publicReads()` and hands `withPublicDataCache` an
`AtomicRead` for this route; the route calls the origin checks (`admit`) after
validation and just before its statement, and only on a miss.
`shared/nearby-limits.ts` holds the numbers; `wrangler.jsonc` mirrors the rate
limits and `tests/unit/nearby-rate-limit.test.ts` pins the two together.

### Decisions

- **Origin limit answers 503, not 429.** The client did nothing wrong; the
  service is protecting itself. Clients and monitors can tell the cases apart.
- **The origin limit sits inside the cache's miss path.** A hit must not spend
  database budget, and a cache outage must not hide a request from the limiter.
- **IPv6 collapses to /64.** One subscriber normally owns a whole /64 and could
  otherwise rotate addresses to dodge a per-address limit.
- **Missing or malformed address shares one key.** A client cannot mint fresh
  buckets with a bad header; the cost is that such clients share a bucket.
- **Fail closed on a missing binding and on a faulty origin limiter; fail open
  only on a faulty client limiter.** A missing binding while the flag is on is a
  deployment mistake that should be loud. The origin limiter is the guard in
  front of the metered database, so when it throws the request is refused (503)
  rather than forwarded unchecked; hits still work because they never reach it.
  The client limiter is about fairness between clients: when it throws the
  request proceeds, because the origin checks still bound the database (together
  with the Hyperdrive origin limit, the runtime role's server-side 60 s
  `statement_timeout` and the transport's client-side 15 s connect and 60 s
  query timeouts).
- **One SPATIAL statement per miss, because the label travels with the data.** The
  shared cache spends three statements per miss (manifest, handler, manifest) to
  prove that an answer is one generation, and moves the 10.6 KB manifest twice to
  do it. A single SQL statement sees one snapshot, and the publisher stamps its
  marker before touching any table, so a header row in the same statement (the
  SHA-256 of the manifest text computed in SQL, its type and its marker) proves the
  same thing. `NEARBY_LABELLED_SQL` embeds the verified places query verbatim, so
  `verify_nearby_spatial_sql.sql` still verifies it. The new mode is additive: no
  other route changes.
- **Admission after validation.** An invalid request, or a backend without
  PostGIS, never sends a statement, so it must not spend the origin limit or the
  day's allowance (it otherwise would, cheaply burning the global allowance).
- **The daily admission ceiling lives in Neon, not D1.** The dedicated role `hdb_nearby_budget` uses a distinct Hyperdrive binding and may only execute the narrow `public.reserve_nearby_statement(integer)` SECURITY DEFINER function on `nearby_daily_budget`. This preserves the existing reader's `default_transaction_read_only=on` and introduces **no runtime D1 write**. The accepted cold miss spends two Hyperdrive statements (reservation + spatial), and a refused reservation still spends one. Role isolation and a safe blue/green daily-counter handoff must be verified before rollout. Full rationale: `docs/architecture/neon-nearby-counter.md`.
- **Reservations are not returned.** Giving a statement back after a failure
  would need a second write and could under-count; over-counting only makes the
  guard stricter.
- **Anonymous IP keys are a compromise.** Cloudflare advises against IP keys
  because users share addresses. The route has no other identity. 30 per minute
  is well above ordinary use, and `429` is retryable.

### What the limits are not

Counters are local to each Cloudflare location and eventually consistent, so
the numbers are per location and approximate. Aggregate database load is shaped
by the number of active locations times 300 per minute, then by the Hyperdrive
origin limit and query time; this is a design estimate until Phase 3. The per-serving-branch **accepted spatial queries** are bounded atomically, but a rejected reservation also reaches Hyperdrive and costs a statement. This is not a hard account-wide quota; Cloudflare still enforces its own Free daily limit.

## Phase 3: deployed-path verification

A disposable Neon fork of the serving branch carries the shipped migration. Two narrowly scoped roles (the unchanged SELECT-only reader and a separate quota-only login), two temporary Hyperdrive configs (query caching off, origin limit 5) and a temporary Worker connect them. The
Worker has its own name and its own rate-limit namespace ids (namespace ids are
account-wide, so reusing `1003` or `1004` would share counters with production),
`NEON_SPATIAL_ENABLED="true"`, `PUBLIC_DATA_BACKEND="neon"` and a throwaway
cache epoch. The origin limit is lowered there so the `503` path is reachable.

The temporary Worker binds no D1 counter database. The disposable Neon fork carries migration `sql/neon/002_nearby_daily_budget.sql`, and the Worker sets `NEARBY_DAILY_STATEMENT_CEILING` small enough to reach.

The harness is `tests/deployed-path/` (client, shipped-SQL fingerprints, Worker
template, local rehearsal). Checks, each recorded with its result:

1. The capability probe answers `true`.
2. A recorded sample of requests, including the grounded case, returns the same
   stations and exits as the shipped SQL run directly against the fork.
3. The first request is a cache `MISS` and the repeat a `HIT`, on a canonical
   key.
4. A burst from one client reaches `429`; a burst of distinct cache-missing
   centres reaches `503`; neither is cached.
5. With the ceiling set to a small number, that many distinct misses are answered,
   the next are refused with `503` and a `Retry-After` to 00:00 UTC, and a cached
   answer is still served; the counter row equals the ceiling.
6. Latency is reported as a distribution with its sample size, vantage point and
   cache state.

Teardown deletes the temporary Worker and Hyperdrive configuration and the local
credential file. The fork is left for its owner to delete.

## Testing

- `tests/unit/nearby-rate-limit.test.ts`: key derivation table, both checks
  (allow, deny, missing binding, throwing limiter), the `wrangler.jsonc` pin and
  the closed-gate tripwire.
- `tests/unit/nearby-places-worker-gate.test.ts`: the real Worker entry with
  fake limiters and a mock Neon budget responses. The gate-closed case
  never consults a limiter; a limited client reaches neither the cache, a
  transport nor the database; the origin budget is spent on misses only; a spent
  origin budget runs no SQL and caches nothing; a miss is exactly one statement
  and no manifest read; the ceiling trips at its value, resets on the next UTC day,
  and every way of not knowing refuses; invalid requests spend nothing.
- `tests/unit/nearby-budget.test.ts`: the reservation statement on real SQLite
  (200 concurrent callers never pass the ceiling), every fail-closed case, the
  migration's constraints.
- `tests/unit/public-data-cache.test.ts`, `nearby-places.test.ts`,
  `publication-state.test.ts`: the single-statement cache mode, the labelled SQL
  and the label's agreement with reading a full manifest.
- `tests/unit/scratch-database.test.ts`: the rehearsal never drops a database it
  did not create.
- The local rehearsal (`tests/deployed-path/local-rehearsal.mjs`) runs against
  real PostgreSQL/PostGIS and the disposable PostgreSQL budget table and counts statements with
  `pg_stat_statements`.
- Mutations of the committed code (Worker admission order, the reservation
  statement, the fail-closed branches, the cache mode, the label) were each caught
  by a failing test.

## Risks

- **Shared NAT.** Many users behind one address share a bucket and may see `429`
  during bursts. Mitigation: a generous limit and `Retry-After`.
- **Distributed clients.** Many addresses together can exceed the per-location
  origin budget in aggregate. Mitigation: the origin cap, the Hyperdrive origin
  limit and the runtime role's 60 s `statement_timeout` (read back on a fork of
  the serving branch: `default_transaction_read_only=on`, `statement_timeout=60s`).
  Residual: no global quota exists.
- **Limiter semantics.** The binding is permissive and eventually consistent.
  The limits are guard rails, not accounting.
- **Free-plan query budget.** Hyperdrive Free allows 100,000 statements a day for
  the whole account. A nearby miss used to cost three (about 33,000 misses starve
  every other route until 00:00 UTC); it now costs one, and the daily ceiling caps
  the route at 10,000 a day. Residual: the ceiling bounds nearby search's own
  spend, not the account's, it was chosen without a measurement of the site's
  current use, and when it is spent nearby search is down until 00:00 UTC by
  design. The value, and Neon admission role and database, are the owner's to confirm
  (T4.7).
- **Phase 3 needs a database credential.** A temporary SELECT-only role and a
  Hyperdrive configuration need a connection string. Provisioning it is an
  owner-approved step.
