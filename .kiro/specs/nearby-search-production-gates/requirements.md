# Requirements: Nearby Search Production Gates

## Scope and release decision

`GET /api/nearby-places` answers one question: the nearest MRT exits to a published HDB block, named by its address key (`NEON_SPATIAL_MODE=blocks`). It accepts no coordinates. `NEON_SPATIAL_MODE` replaces `NEON_SPATIAL_ENABLED` and is `off` or `blocks`.

**Block-only mode is allowed once the global daily miss budget (R4) exists.** Arbitrary-coordinate search stays not authorised: it has no mode and no code path, and would need its own cost analysis and approval. Workers Rate Limiting counters are per location and approximate, not an account-wide daily quota; the budget in R4 is the global control.

## R1 — Both limiters fail closed

- **R1.1** Requests passing the mode gate consult a per-client limit of 30/60s before the shared cache or any database connection. Over-limit returns `429`, `Retry-After: 60`, `no-store`.
- **R1.2** Only valid cache misses consult the shared origin limiter (300/60s per location); cache hits spend nothing. A normal origin refusal returns `503` with `Retry-After: 60`, `no-store`.
- **R1.3** **Both limiters fail closed** on missing bindings or thrown errors: return `503`, no origin query for that request, no response cached. Invalid requests and D1-backend requests spend no origin-limit unit.
- **R1.4** Client keys use IPv4, IPv4-mapped IPv6 or IPv6 /64, with one fallback key for missing/invalid addresses. A test pins Wrangler values, distinct namespace IDs and the selected mode.

## R2 — Spatial query and cache consistency

- **R2.1** A valid cache miss issues **one labelled, parameterized PostGIS SELECT** returning places and the publication identity from the same database snapshot. The shared cache makes no extra manifest queries for this route; its legacy multi-statement routes are unchanged.
- **R2.2** The request is `?block=<address_key>` only; the radius (1,500 m), the kind set (MRT exits) and the limit (25) are fixed. A request carrying `lat` or `lng`, any other parameter or a malformed key answers `400` with no query.
- **R2.4** The block's location is looked up inside the same single statement; the Worker sends no coordinate. The statement is the verified query with only its centre and parameter numbers changed, pinned by a unit test. Nearest MRT exit per `STATION_NA` before the result LIMIT, deterministic tie-breaking and version-scoped cache semantics stay pinned by unit and SQL differential tests.
- **R2.5** A key that names no published block answers `404` without a nearby statement. The published block list is read through the shared cache and kept per isolate; if it cannot be read the request is refused (`503`).
- **R2.3** A cache HIT emits no database statement. A malformed request emits none. Responses from incomplete publications cannot be stored under a finished generation.

## R3 — Safe isolated real-path verification

- **R3.1** Run a temporary Worker with its own name and rate-limit namespaces against a **disposable Neon PostGIS fork**, using **one** temporary Hyperdrive configuration with a fork-only SELECT-only role. Do not reuse serving credentials. The harness for this is not in the repository; its last version is commit `c7b2f6b` in this pull request's history ([runbook](https://github.com/shenghaoc/hdb-resale-visualizer/blob/c7b2f6b91be4e135d26757d999eb86cf09bb1e33/tests/deployed-path/README.md)).
- **R3.2** A temporary Worker used for verification selects its mode in its own configuration. Do not modify production Worker, Hyperdrive, or D1.
- **R3.3** Verify independent SQL fingerprints, cache MISS/HIT, canonical keys, both limiter refusals and end-to-end latency. Record results as text only; no credential/evidence uploads.
- **R3.4** Teardown removes only resources demonstrably created by this run. The local rehearsal in the parked harness creates unique per-run databases and never uses `DROP DATABASE ... WITH (FORCE)`.

## R4 — Global daily miss budget

- **R4.1** One Durable Object holds a global budget of **20,000 database statements per UTC day** for this endpoint, across every Cloudflare location. The number lives in `shared/nearby-limits.ts` and is mirrored in `wrangler.jsonc`; a test pins them equal.
- **R4.2** The budget is consulted only on a cache miss, after the published-block check and the origin limiter and immediately before the statement. A cache hit never contacts the Durable Object.
- **R4.3** It fails closed: a missing binding, an invalid configured budget, an object that errors or an answer that is not understood refuse the request with a `no-store` 503. A refusal spends no Hyperdrive statement.
- **R4.4** The count resets when the UTC date changes, and a granted statement is recorded before it is granted.
- **R4.5** Neither D1 nor Neon gets a runtime statement-budget table, write-capable role or extra Hyperdrive binding.
- **R4.6** Arbitrary-coordinate search stays **not authorised**.
