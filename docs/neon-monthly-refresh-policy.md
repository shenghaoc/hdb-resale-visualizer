# Neon refresh policy

The Neon publisher (`vp run sync-data:neon`) is **manual only**: one explicit, bounded invocation at a time, against the isolated benchmark branch. Upstream timestamps and content hints are observability only; a change in them, or the age of the last run, never starts an expensive reconciliation. The policy is one explicit reconciliation per UTC calendar month plus explicit manual runs. Monthly Neon scheduling is not enabled: `--reconcile-monthly` is refused.

## Invocation and state

| Invocation                                    | Behavior                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `vp run sync-data --plan`                     | Read-only hint observation; no corpus reconciliation.                                                                        |
| `vp run sync-data --check-upstream`           | Read-only hint observation, even with a manual or monthly flag.                                                              |
| `vp run sync-data --plan --reconcile-monthly` | Read-only transaction preflight if no reconciliation was published in this UTC month.                                        |
| `vp run sync-data --plan --reconcile-manual`  | Explicit read-only transaction preflight, even after a publication this month.                                               |
| `--force`                                     | Alias for manual intent in the incremental modes; on a plain run it keeps its meaning of repeating the full publication.     |
| `vp run sync-data:neon --plan` / `--apply`    | Require `--reconcile-manual`, `--branch` and `--usage-before`; `--report` writes the receipt. `--check-upstream` needs none. |

- Monthly and manual intent are mutually exclusive. The monthly check compares the UTC month and year of `reconciledAt` with now, not a rolling 30 days. A missing, malformed or future `reconciledAt` is never taken as proof of a completed monthly reconciliation: explicit intent proceeds, plain observation still skips. A successful manual publication satisfies that month's check too.
- A plain `vp run sync-data`, with or without `--force`, is the marked full publication to D1. `--reconcile-monthly` and `--reconcile-manual` are rejected unless `--plan` or `--apply-rehearsal` is also given, and `--apply-rehearsal` accepts only a loopback emulator.
- Failed or rolled-back publications and read-only preflights never advance the manifest, so repeating them spends budget again. A client response lost after a successful commit is checked against the committed manifest and is never treated as rolled back.
- A reviewed reconciliation (`--reconciliation-review`) also needs `--report` and `--source-capture-directory .neon-benchmark/<name>`. The gitignored `.neon-benchmark/` is created when it is missing, and the run folder must not exist yet: an earlier capture is refused, never reused or overwritten.

## Manual workflow

`.github/workflows/refresh-neon.yml` runs on `workflow_dispatch` only. It has no schedule, migration, deployment or automatic retry, and it holds read-only repository permission.

| Input                                           | Meaning                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `confirm_target`                                | Must be `benchmark-d1-migration`; the job does not run otherwise.                                                 |
| `mode`                                          | `plan` (the default) or `apply`. A dispatch that does not choose a mode cannot publish.                           |
| `usage_baseline`                                | A captured Neon Console baseline; API zeros are refused (see "Unsettled usage receipts").                         |
| `onemap_search_budget`, `onemap_routing_budget` | OneMap HTTP attempts this run may make, retries included. Both default to 0, which makes no request of that kind. |

The job uses the environment `neon-benchmark-refresh` and the secret `NEON_BENCHMARK_REFRESH_DATABASE_URL`, plus `DATA_GOV_API_KEY` and the OneMap credentials when they are set. It runs on Node 24 with Vite+ in a concurrency group per branch that never cancels a run in progress, times out after 30 minutes and uploads the sanitized receipt as an artifact for 14 days. `tests/unit/neon-refresh.test.ts` pins the default and the option order of `mode`.

### What each mode touches

| Mode    | Benchmark database                                                    | data.gov.sg                                            | OneMap                                     |
| ------- | --------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `plan`  | Two `REPEATABLE READ READ ONLY` snapshots; no publication or mutation | Metadata and dataset downloads (needed to plan at all) | None, unless a budget is given (default 0) |
| `apply` | The same snapshots, then at most one publication transaction          | The same                                               | Only within the given budgets (default 0)  |

Results of OneMap attempts made by `plan` are not kept: its staged cache writes are discarded with the plan.

### Transaction boundaries

No network-bound work runs inside a PostgreSQL transaction. A run holds one session (and its advisory lock) and uses it in three phases:

1. **Baseline snapshot** (read only): the publication version, transaction facts, published artifacts and both caches, then `COMMIT`.
2. **Preparation, with database access closed** (`NeonSessionGuard`): amenity downloads, budgeted OneMap attempts, a second read of the upstream inventory (it must equal the first, or the run stops), and the artifact build. Cache writes are staged in memory. Any query sent in this phase is refused before it reaches the server.
3. **Planning snapshot** (read only): first requires the publication version to be unchanged, then reads the stored rows the planner compares against. With `--apply`, publication runs in its own transaction, re-checks the same version under `SELECT … FOR UPDATE`, writes the data, writes the manifest last and commits.

The publication version is the manifest JSON **and** its `updated_at`. Every publication rewrites `updated_at` in the same transaction as its data, so an unchanged version proves that nothing was published between the two snapshots or before the write, including a republish that left the JSON identical. `idle_in_transaction_session_timeout` stays at 120 s; it only covers the short snapshots and the publication.

### OneMap budgets

OneMap geocoding and routing are optional enrichments with explicit per-run budgets: `--onemap-search-budget N` and `--onemap-routing-budget N` (workflow inputs `onemap_search_budget` and `onemap_routing_budget`). Both default to **0**. Running without OneMap credentials remains fully supported; no token is requested or provisioned.

Budgets are counted in **physical HTTP attempts**, not logical lookups. The shared fetch helper (`fetchWithRetry`) retries after a network error, HTTP 429 or 5xx, up to six attempts, and every one of those attempts is charged.

- Search plus routing plus at most one token attempt may not exceed **600 HTTP attempts per run**. Larger budgets are refused before any network or database activity.
- Pacing and the budget are applied together immediately before every OneMap attempt, retries included (`fetchWithRetry`'s `beforeAttempt` hook calling `waitForUpstreamSlot`). An exhausted budget refuses the attempt before it is sent, so a retry the budget cannot cover is never made, and the lookup or route ends there. The check runs once per attempt, so nothing is paced or charged twice.
- data.gov.sg and other consumers of the shared helper keep their existing behaviour: one pacing slot before the request, then the helper's own retries and backoff, with no OneMap budget.
- A configured `ONEMAP_TOKEN` is used as is and costs nothing. Email and password get an allowance of exactly one token attempt per run, not one per lookup. A failed token attempt is not retried; the run continues without OneMap (`tokenStatus: "unavailable"`) and the refused retry is reported.
- Block addresses are geocoded before amenities, so a small search budget goes to blocks first.
- Work beyond the remaining budget is deferred and reported, never started. An empty routing cache therefore costs the routing budget, not one request per block and exit. Because a retry spends budget, a run with transient OneMap errors completes fewer lookups than its budget; the difference is reported, not hidden.
- The budget is one object installed at the single choke point every OneMap attempt passes. The run reads its remaining allowance to decide how much work to start, but only the choke point charges it.
- The D1 sync (`runSyncData`, `runIncrementalSync`) has no budget but shares one OneMap session per run (`createOneMapSession`): a configured token costs nothing, otherwise the email and password login is made once however many lookups run at the same time, and block geocoding, amenity geocoding and routing all use it.

The receipt's `oneMap` section separates three counts per category (`auth`, `search`, `routing`): `httpAttempts` (requests actually sent), `budgetRefusals` (attempts the budget prevented, which were never sent) and `successfulOperations` (a token obtained, a lookup answered with or without a match, a route returned). Per purpose it also reports candidates, items started, results, items with no match, failures, items ended by a budget refusal and items deferred or not attempted for lack of a token. `unresolved` reports block addresses and amenities left without coordinates, and walking pairs without a route. Unresolved block addresses are not published and count toward the existing geocode-failure guard exactly as failed lookups do. Pairs without a route keep the pipeline's existing straight-line walking-time estimate; the published data does not mark which times are estimates.

### Unsettled usage receipts

A Console reading whose as-of time is unknown (`usageAsOf: "UNKNOWN"`) is accepted only with bounded evidence for every endpoint that could still be consuming:

- `servingOrigin`: the origin of the Hyperdrive configuration that serves the site, as read from Cloudflare (`hyperdriveConfigId`, `host`, `observedAt`). Its id must be the `HDB_PUBLIC_NEON` Hyperdrive committed in `wrangler.jsonc`, and the serving endpoint is derived from its host.
- `knownActivity.endpointInventory: "complete"` with every compute endpoint in the project, including the benchmark endpoint at 1 CU and the serving endpoint.

The check fails closed if:

- the serving origin is missing, stale, not a direct endpoint host, or from another Hyperdrive;
- the serving endpoint is the refresh write target or sits on the benchmark branch;
- the inventory omits the serving endpoint or repeats one;
- any other endpoint is still active.

It reserves the serving endpoint's maximum compute for the run window (20-minute deadline plus 5-minute suspend tail), because traffic can wake it at any time. The run cannot query Cloudflare itself, so the origin is operator-captured evidence checked against the repository's configuration. Settled (`REPORTED`) receipts are unchanged: their provider totals already cover every endpoint up to `settledThrough`.

## Limits the code enforces

| Limit                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Source completeness  | The resale, property and MRT sources are refused when empty or when normalization drops any row or feature (property and MRT before any database work). Amenity sources are refused when any row or feature no longer matches its schema; rows that only lack coordinates are published as unresolved and counted.                                                                                                                                                                                                         | `sync-neon.ts`, `sync-data.ts`             |
| Changed transactions | At most 1,000 per publication. A reviewed reconciliation allows `min(1000, floor(active baseline × 0.005))` inserts, within 35 days of the last accepted checkpoint, at most 5 new and 5 outstanding absent occurrences, and no correction or removal. A review may carry one allowance pinned to exact hashes, counts and IDs (at most 5,000 inserts and 62 days).                                                                                                                                                        | `incremental.ts`, `neon-reconciliation.ts` |
| Publication size     | 25,000 forecast index operations, 100 atomic statements (the plan plus the two manifest statements), 90,000,000 encoded bytes and 1,000,000 bytes per JSON parameter.                                                                                                                                                                                                                                                                                                                                                      | `statements.ts`, `neon.ts`                 |
| Session              | 120 s statement timeout, 30 s connection timeout, 120 s idle-in-transaction timeout, a 20-minute run deadline after which the connection is closed, and one advisory lock (`pg_try_advisory_lock(724921, 1)`).                                                                                                                                                                                                                                                                                                             | `neon.ts`, `sync-neon.ts`                  |
| OneMap               | 600 HTTP attempts per run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `onemap-budget.ts`                         |
| Transfer and compute | The reading plus one full reconciliation (reserved at its measured proxy of 493,707,924 B), a 1,000,000,000 B reserve and, when the as-of time is unknown, a further 1,000,000,000 B must fit in the 5,000,000,000 B monthly allowance. Compute (reading, 10 CU-hours when unknown, the serving endpoint's run window and 25 minutes at 1 CU) must stay within 100 CU-hours. A reading or serving-origin observation older than 20 minutes is refused, as is a settled reading older than 2 hours or an uncalibrated zero. | `refresh-policy.ts`, `neon-usage.ts`       |

These are limits, not forecasts: the usage gate is a conservative planning check against captured readings, not a live quota and not permission to refresh. If live usage is unavailable or the headroom is insufficient, defer the run rather than consume the reserve.
