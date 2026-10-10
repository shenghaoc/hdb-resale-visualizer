# Deployed-path verification for `GET /api/nearby-places`

Mocked tests and direct SQL cannot show that a deployed Worker reaches PostGIS through Hyperdrive and returns what the
shipped SQL returns. This directory holds the check that does, in two forms:

- a **local rehearsal** (no Cloudflare, no Neon): the real Worker under workerd against a seeded local PostgreSQL;
- the **deployed run**: a temporary Worker with its own rate-limit namespaces, a temporary Hyperdrive configuration and a
  disposable Neon fork that carries `sql/neon/001_postgis_nearby.sql`.

Spec: `.kiro/specs/nearby-search-production-gates/` (Phase 3). `NEON_SPATIAL_ENABLED` is never touched.

## Files

| File                               | Purpose                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `samples.mjs`                      | Request samples (coordinates from a fork of the serving branch, plus edge cases)              |
| `direct-sql.mjs`                   | Runs the shipped `NEARBY_SPATIAL_SQL` per sample, read only, and reports row count and md5    |
| `fork-expected.json`               | Those fingerprints for the fork `postgis-realpath-20261010` on 2026-10-10                     |
| `verify-client.mjs`                | HTTP client with four phases (functional, client-limit, origin-limit, latency)                |
| `local-rehearsal.mjs`              | Seeds a local database, applies the migration, runs the Worker under `wrangler dev`, verifies |
| `base-schema.sql`                  | Publisher base schema the migration expects (copy of `scripts/neon-benchmark/schema.sql`)     |
| `wrangler.deployed.template.jsonc` | Temporary Worker configuration for the deployed run                                           |

`tests/unit/deployed-path-harness.test.ts` keeps the samples, the canonicalisation, the fingerprint SQL and the template
in step with the Worker, and runs in CI.

## Local rehearsal

Needs `psql`, a PostgreSQL 18 superuser connection with PostGIS available, and `pnpm install`.

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \
  node --import tsx tests/deployed-path/local-rehearsal.mjs /tmp/nearby-rehearsal
```

It works in a database it creates itself, `hdb_realpath_local_<random run id>` (printed at the start), and drops only
that one at the end, also when a phase fails or on Ctrl-C. It never reuses a name: if the database already exists it
stops before touching anything (`SCRATCH_RUN_ID=<6-16 lowercase letters or digits>` fixes the id, which is how that
refusal is exercised on purpose). It never drops with `FORCE` and never terminates a session: it waits up to 20 s for its own
Worker's connections to close and, if something is still connected, leaves the database in place, prints
`LEFT IN PLACE: ...` with the exact `DROP DATABASE` command, and exits non-zero. The cluster-level role
`hdb_benchmark_runtime` is created if missing and left, because concurrent runs share it. The logic is in
`scripts/lib/scratch-database.ts`, covered by `tests/unit/scratch-database.test.ts`.
It takes about five minutes because two phases wait out a rate-limit window; `PHASES=functional` runs one phase.
It shows: capability probe, Worker answers equal to the shipped SQL for every sample (including a code-labelled station and
a distance tie), cache `MISS` then `HIT` on a canonical key, `429` after exactly 30 requests, `503` once the origin budget is
spent, and no caching of either. It does **not** show Hyperdrive behaviour, Cloudflare's real counters or edge latency.

## Deployed run

1. **Fork and migrate** (done on `postgis-realpath-20261010`, `br-broad-cake-b3wl94ei`): fork the serving branch, apply
   `sql/neon/001_postgis_nearby.sql` to the fork only, check the row counts.
2. **Temporary Hyperdrive configuration. This step needs the database password, so the owner runs it.** A fork inherits the
   serving branch's `hdb_benchmark_runtime` role and its password; use the fork's direct endpoint host:

   ```bash
   read -rs HDB_RUNTIME_PASSWORD && export HDB_RUNTIME_PASSWORD   # type the existing password; it stays out of shell history
   npx wrangler hyperdrive create hdb-realpath-20261010 --caching-disabled \
     --connection-string "postgresql://hdb_benchmark_runtime:${HDB_RUNTIME_PASSWORD}@<fork-endpoint-host>/neondb?sslmode=require"
   unset HDB_RUNTIME_PASSWORD
   npx wrangler hyperdrive update <id printed above> --origin-connection-limit 5
   ```

3. **Temporary Worker.** Fill the template and deploy it (origin limit 300, as in production):

   ```bash
   sed -e "s|__WORKER_NAME__|hdb-realpath-verify-20261010|" -e "s|__REPO_ROOT__|$PWD|" \
       -e "s|__HYPERDRIVE_ID__|<id>|" -e "s|__CACHE_EPOCH__|realpath-20261010|" \
       tests/deployed-path/wrangler.deployed.template.jsonc > /tmp/wrangler.realpath.jsonc
   npx wrangler deploy --config /tmp/wrangler.realpath.jsonc
   ```

   The Worker is reachable at its `workers.dev` URL for the minutes the check takes. It has no D1 binding and the database role
   is SELECT-only.

4. **Run the phases** (wait a minute between phases so each starts in a fresh rate-limit window):

   ```bash
   export BASE_URL=https://hdb-realpath-verify-20261010.<subdomain>.workers.dev
   node tests/deployed-path/verify-client.mjs functional   /tmp/functional.json
   node tests/deployed-path/verify-client.mjs client-limit /tmp/client-limit.json
   node tests/deployed-path/verify-client.mjs latency      /tmp/latency.json
   ```

   For `origin-limit`, refill the template with `-e '/NEARBY_ORIGIN_LIMITER/s/"limit": 300/"limit": 10/'` added to the `sed`,
   redeploy, and run `verify-client.mjs origin-limit`.

5. **Expected fingerprints.** `fork-expected.json` holds the shipped SQL's results on the fork. If the fork's data differs,
   regenerate with `node --import tsx tests/deployed-path/direct-sql.mjs` and run the printed statements on the fork through
   a READ ONLY transaction.
6. **Tear down:** `npx wrangler delete --name hdb-realpath-verify-20261010`, `npx wrangler hyperdrive delete <id>`, remove
   the filled configuration. The fork is left for its owner to delete.

## What counts as passing

- the capability probe answers `{"available": true}`;
- every sample's row count and md5 equal the expected fingerprint;
- each sample's first answer is a cache `MISS` and the repeat a `HIT`; the 101 m request is served from the 250 m entry; the
  reordered, perturbed request is a `HIT`;
- a repeated request is answered `429` with `Retry-After: 60` and `no-store`; distinct cache-missing centres are answered
  `503` with `Retry-After: 60` and `no-store` once the origin budget is spent; neither is cached;
- latency is reported as a distribution with its sample size and vantage point, not as a benchmark.
