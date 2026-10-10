# Requirements: Nearby Search Production Gates

## Scope and release decision

The `GET /api/nearby-places` endpoint remains in the Worker and its PostGIS tests remain in the repository. **`NEON_SPATIAL_ENABLED` must remain `"false"` on production.** The UI's fixed per-block MRT-exit lookup is being replaced by publish-time detail data in independent PR #432. There is **no global statement-budget counter** in this PR.

**Enabling arbitrary-coordinate search publicly requires a separately approved and verified global cost-control mechanism.** Workers Rate Limiting counters are per location and approximate, not an account-wide daily quota.

## R1 — Both limiters fail closed

- **R1.1** Requests passing the flag gate consult a per-client limit of 30/60s before the shared cache or any database connection. Over-limit returns `429`, `Retry-After: 60`, `no-store`.
- **R1.2** Only valid cache misses consult the shared origin limiter (300/60s per location); cache hits spend nothing. A normal origin refusal returns `503` with `Retry-After: 60`, `no-store`.
- **R1.3** **Both limiters fail closed** on missing bindings or thrown errors: return `503`, no origin query for that request, no response cached. Invalid requests and D1-backend requests spend no origin-limit unit.
- **R1.4** Client keys use IPv4, IPv4-mapped IPv6 or IPv6 /64, with one fallback key for missing/invalid addresses. A test pins Wrangler values, distinct namespace IDs and the closed feature flag.

## R2 — Spatial query and cache consistency

- **R2.1** A valid cache miss issues **one labelled, parameterized PostGIS SELECT** returning places and the publication identity from the same database snapshot. The shared cache makes no extra manifest queries for this route; its legacy multi-statement routes are unchanged.
- **R2.2** Canonical coordinate grid, radius buckets, nearest MRT exit per `STATION_NA` before result LIMIT, deterministic tie-breaking and version-scoped cache semantics are pinned by unit and SQL differential tests.
- **R2.3** A cache HIT emits no database statement. A malformed request emits none. Responses from incomplete publications cannot be stored under a finished generation.

## R3 — Safe isolated real-path verification

- **R3.1** Run a temporary Worker with its own name and rate-limit namespaces against a **disposable Neon PostGIS fork**, using **one** temporary Hyperdrive configuration with a fork-only SELECT-only role. Do not reuse serving credentials.
- **R3.2** The temporary Worker is the only place where the spatial flag may be temporarily true for this verification. Do not modify production Worker, Hyperdrive, or D1.
- **R3.3** Verify independent SQL fingerprints, cache MISS/HIT, canonical keys, both limiter refusals and end-to-end latency. Record results as text only; no credential/evidence uploads.
- **R3.4** Teardown removes only resources demonstrably created by this run. The safe local rehearsal creates unique per-run databases and never uses `DROP DATABASE ... WITH (FORCE)`.

## R4 — Deferred public release

- **R4.1** The current two per-location limiters do **not** authorize public exposure. An approved global cost budget, including worst-case behaviour during refusals and all Cloudflare locations, must be implemented and verified in a distinct future proposal before opening `NEON_SPATIAL_ENABLED` in production.
- **R4.2** Neither D1 nor Neon gets a new runtime statement-budget table, write-capable role or Hyperdrive binding in this PR.
