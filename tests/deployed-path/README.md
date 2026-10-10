# Single-config deployed-path check for `GET /api/nearby-places`

**Production stays disabled.** The client-facing MRT-exit panel is moving to precomputed block details (draft #432). This check exists to verify that the general-purpose PostGIS route works on a disposable Neon fork. It does not justify enabling public arbitrary-coordinate searches: rate limits are per Cloudflare location, not a global daily budget.

## Local rehearsal (no cloud operations)

On a developer's disposable PostgreSQL 18 + PostGIS installation:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \
  node --import tsx tests/deployed-path/local-rehearsal.mjs /tmp/hdb-nearby-local
```

The script makes a random per-run scratch database, refuses a preexisting name, terminates none of its bystanders and cleans up only its own database. It exercises the real local Worker, PostgreSQL, the shipped query, both limiters and the cache. It cannot verify real Hyperdrive or Cloudflare's distributed counters.

## Optional isolated deployed path (separate approval)

1. Verify the identity of a **disposable fork** of the serving Neon snapshot with PostGIS migration 001. Never apply migration SQL to the serving branch.
2. Provision **one** temporary Hyperdrive config against that fork, using fork-only credentials for the existing SELECT-only role; disable Hyperdrive query caching and cap origin connections. **Do not create a second Hyperdrive config or any write-capable role.**
3. Fill `wrangler.deployed.template.jsonc` with the temporary Worker name, repo path, temporary read-only Hyperdrive ID and unique cache epoch. The template has no D1 binding. Use distinct rate-limit namespace IDs from production.
4. Deploy only the temporary Worker with `NEON_SPATIAL_ENABLED=true`. Production remains `false`.
5. From the verification host, run these independent phases (allow a new 60 s limit window between burst phases):

```bash
BASE_URL=https://<temporary-worker>.workers.dev \
  node tests/deployed-path/verify-client.mjs functional
BASE_URL=https://<temporary-worker>.workers.dev \
  node tests/deployed-path/verify-client.mjs client-limit
```

For `origin-limit`, redeploy **that temporary Worker only** with the origin binding changed from 300 to 10 (the client limit remains 30), then run `verify-client.mjs origin-limit`. For latency, restore an appropriate temporary limit to allow 40 distinct cache misses and hits, then run `verify-client.mjs latency`. The expected SQL fingerprints and the direct read-only SQL verifier must match the same fork.

6. Delete only temporary resources proven owned by that verification run; record identifiers and outcomes in prose without uploading credentials, screenshots, raw dumps or evidence files.

## Release restriction

This procedure tests functional correctness only. **The public endpoint must not be enabled without a separately approved global budget control** that can limit worst-case statements across all Cloudflare locations, including refusal behaviour. Neither D1 nor Neon gets a runtime budget counter in this repository.
