# Design: Nearby Search Production Gates

> Status: Phase 1 and 2 complete (rate limiting, documentation). Phase 3 (the
> deployed-path run) is open. The feature flag stays `"false"`.

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
- Keep cache hits free, so popular locations stay cheap.
- Fail loudly on a misconfigured deployment and gracefully on a limiter fault.
- Exercise the deployed path on an isolated database before the flag is
  considered, and record what was and was not shown.

## Non-goals

- Opening the gate, applying the migration to the serving branch, or changing
  production Worker, Hyperdrive or D1 configuration.
- A global (cross-location) quota. The binding does not offer one.
- Treating the verification run as a benchmark. Synthetic scale benchmarks run
  on local PostgreSQL/PostGIS, not through this path.

## Architecture

```
request
  -> flag gate (NEON_SPATIAL_ENABLED)            503 when closed
  -> client limit  NEARBY_IP_LIMITER  30 / 60 s   429 + Retry-After
  -> public-read cache                            HIT: answer, no origin work
       miss
  -> origin limit  NEARBY_ORIGIN_LIMITER 300 / 60 s   503 + Retry-After
  -> handler -> Hyperdrive -> Neon (PostGIS)
```

`functions/_lib/nearby-rate-limit.ts` holds the key derivation and the two
checks. `worker/index.ts` calls the client check before `publicReads()` and runs
the origin check inside the `dispatch` function that `withPublicDataCache` calls
only on a miss. `shared/nearby-limits.ts` holds the numbers; `wrangler.jsonc`
mirrors them and `tests/unit/nearby-rate-limit.test.ts` pins the two together.

### Decisions

- **Origin limit answers 503, not 429.** The client did nothing wrong; the
  service is protecting itself. Clients and monitors can tell the cases apart.
- **The origin limit sits inside the cache's miss path.** A hit must not spend
  database budget, and a cache outage must not hide a request from the limiter.
- **IPv6 collapses to /64.** One subscriber normally owns a whole /64 and could
  otherwise rotate addresses to dodge a per-address limit.
- **Missing or malformed address shares one key.** A client cannot mint fresh
  buckets with a bad header; the cost is that such clients share a bucket.
- **Fail closed on a missing binding, fail open on a limiter fault.** A missing
  binding while the flag is on is a deployment mistake that should be loud. A
  throwing limiter is a platform fault; the feature is optional and the
  database is still bounded by the cache, the Hyperdrive origin limit and the
  transport's 15 s connect and 60 s query timeouts.
- **Anonymous IP keys are a compromise.** Cloudflare advises against IP keys
  because users share addresses. The route has no other identity. 30 per minute
  is well above ordinary use, and `429` is retryable.

### What the limits are not

Counters are local to each Cloudflare location and eventually consistent, so
the numbers are per location and approximate. Aggregate database work is bounded
by the number of active locations times 300 per minute, then by the Hyperdrive
origin limit and query time. This is a design estimate until Phase 3.

## Phase 3: deployed-path verification

A disposable Neon fork of the serving branch carries the shipped migration. A
SELECT-only role, a temporary Hyperdrive configuration (query caching off,
origin limit 5) and a temporary Worker built from this branch connect them. The
Worker has its own name and its own rate-limit namespace ids (namespace ids are
account-wide, so reusing `1003` or `1004` would share counters with production),
`NEON_SPATIAL_ENABLED="true"`, `PUBLIC_DATA_BACKEND="neon"` and a throwaway
cache epoch. The origin limit is lowered there so the `503` path is reachable.

Checks, each recorded with its result:

1. The capability probe answers `true`.
2. A recorded sample of requests, including the grounded case, returns the same
   stations and exits as the shipped SQL run directly against the fork.
3. The first request is a cache `MISS` and the repeat a `HIT`, on a canonical
   key.
4. A burst from one client reaches `429`; a burst of distinct cache-missing
   centres reaches `503`; neither is cached.
5. Latency is reported as a distribution with its sample size, vantage point and
   cache state.

Teardown deletes the temporary Worker and Hyperdrive configuration and the local
credential file. The fork is left for its owner to delete.

## Testing

- `tests/unit/nearby-rate-limit.test.ts`: key derivation table, both checks
  (allow, deny, missing binding, throwing limiter), the `wrangler.jsonc` pin and
  the closed-gate tripwire.
- `tests/unit/nearby-places-worker-gate.test.ts`: the real Worker entry with
  fake limiters. The gate-closed case never consults a limiter; a limited client
  reaches neither the cache, a transport nor the database; the origin budget is
  spent on misses only; a spent origin budget runs no SQL and caches nothing.
- Four mutations of the committed Worker code were each caught by a failing test.

## Risks

- **Shared NAT.** Many users behind one address share a bucket and may see `429`
  during bursts. Mitigation: a generous limit and `Retry-After`.
- **Distributed clients.** Many addresses together can exceed the per-location
  origin budget in aggregate. Mitigation: the origin cap and the Hyperdrive
  origin limit. Residual: no global quota exists, and the runtime role has no
  server-side statement timeout (the transport's `query_timeout` is client-side).
- **Limiter semantics.** The binding is permissive and eventually consistent.
  The limits are guard rails, not accounting.
- **Phase 3 needs a database credential.** A temporary SELECT-only role and a
  Hyperdrive configuration need a connection string. Provisioning it is an
  owner-approved step.
