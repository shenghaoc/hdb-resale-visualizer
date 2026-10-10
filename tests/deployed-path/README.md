# Deployed-path verification for nearby PostGIS search

**Status: draft. Production remains disabled.** These checks target a disposable fork and temporary Worker only. There is no D1 counter, no new D1 migration, and no permission to modify the serving branch.

## Architecture to verify

- Worker public data: `HDB_PUBLIC_NEON` through Hyperdrive using the existing SELECT-only role `hdb_benchmark_runtime`, which must keep `default_transaction_read_only=on`.
- Daily admission: `HDB_NEARBY_BUDGET` through a **different Hyperdrive config** using fork-only role `hdb_nearby_budget`, with only EXECUTE on `public.reserve_nearby_statement(integer)` and no direct table privileges.
- One accepted cold miss: one PostgreSQL quota reservation statement and one labelled PostGIS SELECT. One declined miss: one reservation statement only. A cached HIT issues neither.
- All failures fail closed for spatial cache misses. The database caps admitted queries at 10,000 per UTC day, or a lower Worker override. A denied reservation still consumes a Hyperdrive statement.

## Prerequisites (explicit owner approval for external mutations)

1. Start with the disposable Neon branch `postgis-realpath-20261010`. Verify the branch id, base schema and the existing `sql/neon/001_postgis_nearby.sql` migration. Never run against the serving branch.
2. On that fork only, create the dedicated `hdb_nearby_budget` login role with a fork-specific password, `default_transaction_read_only=off`, and a short statement timeout. Do not change `hdb_benchmark_runtime` or reuse its live password.
3. Apply `sql/neon/002_nearby_daily_budget.sql` on the **fork only** as the trusted migration owner, then run `sql/neon/verify_nearby_daily_budget.sql` in a disposable database. Add a concurrent two-session contention probe and a privilege negative control; a single-session SQL assertion does not prove concurrency.
4. Create two temporary Hyperdrive configs pointing at the fork: one with the read-only runtime role and one with the minimal budget role. Disable query caching and cap origin connections. Never place credentials or connection strings in Git or captured output.
5. Fill `wrangler.deployed.template.jsonc` locally using the IDs of these two **temporary** configs, a unique temporary Worker name, and its own rate-limit namespace ids. The template has **no D1 database binding**.
6. Deploy only that temporary Worker with `NEON_SPATIAL_ENABLED=true`. The production Worker keeps the gate false.

## Checks

- `node tests/deployed-path/verify-client.mjs functional`: compare all sample fingerprints with the independent direct SQL oracle; require MISS/HIT consistency, canonicalisation and publication hash agreement.
- `client-limit`: the expected 429 after the configured number of requests. `origin-limit`: 503 when that temporary Worker's origin limiter is lowered, with no spatial query.
- `ceiling`: use a deliberately small Worker override (for example, 5) **after resetting the counter on the disposable fork**. Require the first five distinct misses to pass, the next to return an uncached 503, and existing cache HITs to remain available.
- `budget-unavailable`: remove the temporary Worker's quota binding and verify 503 without a spatial statement.
- `latency`: measure end-to-end at the Worker, and separately identify both Hyperdrive statements. These are not interchangeable with native local PostgreSQL timings.

The HTTP verification client does not hold secrets. Record the result counts, status codes, durations and the exact commit/branch identities as **text**, without uploading private artifacts, screenshots, raw database dumps, tokens, or generated evidence files.

The local rehearsal (`local-rehearsal.mjs`) uses unique owned PostgreSQL databases, not shared fixed names. It now installs the quota schema inside its disposable PostgreSQL database and uses two separate local connections. It is **not** a substitute for real Hyperdrive verification.

## Safe cleanup

After verification, delete **only** the temporary Worker and Hyperdrive configs identified by this run and any owned disposable fork/resources the owner has approved deleting. Preserve the serving branch, benchmark publisher branch, old rollback child, and all unrelated worktrees. Report exact names and what was actually deleted.

## Rollout gate

Do not enable production until the dedicated quota role, migrations, concurrent quota semantics, no-D1 runtime behaviour, entire Worker → Hyperdrive → PostGIS path, and cache consistency are independently verified. Because blue/green branches do not share the day's counter, an approved cutover must disable nearby search and carry forward the maximum daily count before reopening the feature.

This budget can throttle accepted spatial queries but **cannot hard cap the entire account's Hyperdrive statements**, since refusals also spend a statement. Cloudflare's own Free allowance remains the ultimate hard cap.
