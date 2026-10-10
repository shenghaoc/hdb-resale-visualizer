# Neon PostgreSQL daily budget — integration contract

**Status: draft implementation, not deployed.** This is the Postgres-side replacement for the proposed D1 counter in PR #421. It is not wired into the Worker yet. Do not enable `NEON_SPATIAL_ENABLED` on the strength of this migration alone.

## Security boundary

The existing public data role `hdb_benchmark_runtime` has `default_transaction_read_only=on` and a 60-second statement timeout. A SECURITY DEFINER function cannot override a transaction's read-only state. Leave that role untouched.

Use a separate minimal LOGIN role, `hdb_nearby_budget`, with no DML rights on user/public data. It should have `default_transaction_read_only=off` and a short statement timeout. A trusted migration owner installs `002_nearby_daily_budget.sql`, whose only grant to that role is EXECUTE on `public.reserve_nearby_statement(integer)`. Configure a dedicated Hyperdrive binding for this role, not a production password copied to test forks. Do not expose this credential to the browser.

The function uses one atomic PostgreSQL UPSERT per attempt. Concurrent successful reservations cannot exceed the configured ceiling, capped in SQL at 10,000 for this feature. Failed or ambiguous reservations must stop the Worker before it sends the spatial query. The function returns only a boolean; it never returns counter details.

## Cost and the unavoidable limitation

The budget reservation and PostGIS search are **two Hyperdrive statements per admitted cold miss**, not one. The labelled PostGIS SQL is still one statement. A refused quota reservation also traverses Hyperdrive and consumes one statement. Therefore an in-Neon quota can cap **admitted PostGIS searches**, but it cannot guarantee the whole account stays under Cloudflare's Hyperdrive Free daily quota. Cloudflare's own 100,000-statement limit is the final hard stop. Per-client and per-location limits, fail-closed error handling, and rate-limiting of denied requests remain necessary.

## Blue/green continuity

Neon branches are independently writable snapshots: forking or switching the serving child can copy/reset this table. Before cutover or rollback, disable the spatial gate, reconcile the current UTC-day count between old and new children, preserve the maximum count, and do not reopen the gate until the old pool has drained and the check is independently verified. If continuity cannot be proven, leave the feature disabled rather than reset the allowance silently.

## Verification requirements

- Reversible SQL checks on a disposable branch; include concurrent sessions competing for the final slot.
- Verify the dedicated budget role can execute exactly the budget function but cannot select/write `public.nearby_daily_budget` or mutate resale tables.
- Verify the public data role still has `default_transaction_read_only=on` and cannot call the reservation function.
- Verify actual Worker → budget Hyperdrive → Neon, and Worker → read-only Hyperdrive → PostGIS, including denial, cache HIT, midnight rollover, network failure and statement counts.
- Keep the production feature flag off until these tests pass. No credential files, generated datasets or raw evidence may be uploaded to GitHub.
