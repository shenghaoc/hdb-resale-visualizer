# Monthly reconciliation policy — local preparation

> **Provenance.** Links to files that are not part of this branch point at commit [b80446400](https://github.com/shenghaoc/hdb-resale-visualizer/tree/b8044640004ffc3ff60c1c874c33ac3b2aa5ceb6) of the recovery snapshot (branch `feat/neon-refresh-publisher`), which preserves provenance; generated evidence that was never recovered (`docs/evidence/*`) appears as plain paths.

> **Integration note (main).** The invocation table below is unchanged for `--plan` and `--check-upstream`. The "production freeze" it mentions guards the incremental apply (`--apply-rehearsal`, loopback emulator only). A plain `vp run sync-data`, with or without `--force`, is main's marked full publication, and `--reconcile-monthly` / `--reconcile-manual` are rejected unless `--plan` or `--apply-rehearsal` is also given. The Neon publisher (`vp run sync-data:neon`) is manual only: `--plan` and `--apply` require `--reconcile-manual` (only `--check-upstream` does not), and `--reconcile-monthly` is refused.

The adopted policy is **one explicit reconciliation per UTC calendar month plus explicit manual runs**. Upstream timestamps/content hints are observability only. Their changes and seven-day age no longer trigger expensive reconciliation. This replaces the old daily-hint/seven-day proposal; it does not change the exact reconciliation algorithm or activate a schedule.

Prepared on October 4, 2026 in `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`. The uncommitted Neon prototype, D1 implementation and [benchmark evidence](neon-benchmark-2026-10-04.md) are preserved. No remote database queries/mutations, resource creation, production cutover, Worker secret changes, commits, push, PR or merge were performed for this policy preparation.

## Invocation and state

| Invocation                                    | Behavior                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `vp run sync-data --plan`                     | Read-only hint observation; no corpus reconciliation.                                 |
| `vp run sync-data --check-upstream`           | Read-only hint observation, even with a manual/monthly flag.                          |
| `vp run sync-data --plan --reconcile-monthly` | Read-only transaction preflight if no reconciliation was published in this UTC month. |
| `vp run sync-data --plan --reconcile-manual`  | Explicit read-only transaction preflight even after a same-month publication.         |
| `--force`                                     | Existing alias for manual intent; does not override production freeze.                |

Monthly/manual flags are mutually exclusive. Monthly checks compare UTC month **and year**, rather than a rolling 30-day interval. Missing, malformed or future `reconciledAt` is not accepted as proof of a completed monthly reconciliation; only explicit monthly/manual intent can proceed. Observation still skips with such state. A successful manual publication in that month satisfies the monthly state check too. Failed, rolled-back publications and read-only preflights never advance the manifest, so repeated preflights consume budget again. A lost client response after a successful server commit is reconciled against the authoritative committed manifest; it must not be treated as a rolled-back publication.

The current coordinator remains D1-backed. Both coordinator and publisher production apply guards remain in place. The transaction multiset algorithm, stable identities and duplicate multiplicity, disappearance/correction guards, artifact dependency tracking, detail patches, staged caches and manifest-last atomic publication are unchanged. The policy is reusable for a future Neon ingestion port; none has been activated.

## Inactive workflow configuration

[`proposals/refresh-data-monthly.yml`](proposals/refresh-data-monthly.yml) is deliberately **outside `.github/workflows`**. The proposal has:

- one monthly cron: `0 2 1 * *` (first day at 02:00 UTC);
- explicit `workflow_dispatch` selecting manual intent;
- one concurrency group for monthly/manual runs, without cancelling an in-progress run;
- read-only repository permissions, Node 24 and the repository's Vite+/pnpm installation flow;
- existing Cloudflare/data.gov.sg secret references, without introducing or editing secrets;
- a static transfer report followed by **read-only D1 transaction preflight**;
- no migrations, data publication, application deployment or automatic retries.

The [setup-vp action](https://github.com/voidzero-dev/setup-vp/blob/main/action.yml) supports the selected Node input and disabling its implicit install before the explicit `vp install` step. This file is a reviewable policy/preflight template, not a ready Neon production refresh workflow. Activation and a publisher cutover require separate direction and live budget checks. In particular, serialized concurrency does not prevent sequential retries or manual budget exhaustion.

## Transfer budget

Use the hard **5,000,000,000 B/month** allowance and a proposed **1,000,000,000 B reserve**. Existing measured proxies are **493,707,924 B per full reconciliation** and **12,997,301 B per cold bootstrap equivalent** (blocks + trends + dictionary together). These are not finalized Neon billing receipts, nor per-visitor costs. Cache entries are POP-local and endpoint/key-specific. No full remote reconciliation was rerun.

One monthly reconciliation leaves **3,506,292,076 B** for runtime and other usage after the reserve. Manual runs share the same monthly project allowance; they do not receive a separate budget.

| Planned workload/month                      | Estimated transfer B | Remaining after 1 GB reserve B | Fits reserve before other usage |
| ------------------------------------------- | -------------------: | -----------------------------: | ------------------------------- |
| 1 monthly reconciliation                    |          493,707,924 |                  3,506,292,076 | Yes                             |
| 1 monthly + 100 cold bootstrap equivalents  |        1,793,438,024 |                  2,206,561,976 | Yes                             |
| 1 monthly + 200 cold bootstrap equivalents  |        3,093,168,124 |                    906,831,876 | Yes                             |
| 1 monthly + 1 manual + 200 cold equivalents |        3,586,876,048 |                    413,123,952 | Yes                             |
| 1 monthly + 2 manual + 200 cold equivalents |        4,080,583,972 |                    -80,583,972 | No                              |

Without other consumption, 269 cold bootstrap equivalents fit beside one reconciliation and the reserve; 270 do not. The practical allowance is smaller after detail/search/comparable/shortlist queries, other branches/projects sharing applicable allowance, control queries, failed attempts, repeats and traffic. A monthly run removes the previous potential 15.3 GB daily-hint reconciliation load, but does not certify runtime egress or compute. Existing measured storage headroom and cache-hit evidence remain unchanged. Compute active time, scale-to-zero tails and actual traffic still need a live budget before cutover.

The UTC calendar-month state check is a scheduling policy, not a claim about Neon's billing reset boundary. Before future activation, align consumed/manual/runtime accounting with the account's actual allowance period and reset time; do not infer a fresh quota solely from the first day of a UTC month.

Reproduce the local arithmetic without any credentials or network:

```bash
vp exec tsx scripts/report-neon-refresh-budget.ts
```

`estimateMonthlyNeonTransfer` validates nonnegative integral counts and overflow. Its result is an estimate, **not** a live quota guard or permission to refresh. Before any future activation/manual publication, account for already used transfer and pending runtime demand. If live usage is unavailable or budget is insufficient, defer the run rather than consume the reserve speculatively.

The future server-side staging/multiset and changed-only artifact reductions remain report-only in the benchmark report. This task does not implement them. Monthly policy can be evaluated first without changing ingestion semantics.

## Local verification and file impact

The repository-prescribed `node_modules/.bin/vp run check` passed: formatting, lint, typecheck, **1,846 tests in 188 files**, production build, boundaries (49 reachable script modules; 181 frontend modules) and bundle budget. The focused policy/source/coordinator/incremental suites passed **27 tests**. Two pre-existing UI stringification warnings remain in unchanged files. An initial local `tsx` CLI report attempt was blocked by sandbox IPC permissions; the same module ran successfully via `node --import tsx`, without any network. The full prescribed gate ran with approved local IPC access.

| Policy-task files                                                                               | Purpose                                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `scripts/lib/sync/refresh-policy.ts`                                                            | Explicit intent, UTC monthly check and validated transfer estimates.                             |
| `scripts/lib/sync/source-version.ts`, `scripts/sync-data.ts`                                    | Separate observed hint changes from reconciliation intent; keep production guards.               |
| `scripts/report-neon-refresh-budget.ts`, `evidence/neon-monthly-refresh-budget-2026-10-04.json` | Reproducible local budget scenarios; zero database activity.                                     |
| `tests/unit/refresh-policy.test.ts`, `tests/unit/source-version.test.ts`                        | Policy/budget boundaries, observed changes without corpus reads, freeze and workflow inactivity. |
| `proposals/refresh-data-monthly.yml`                                                            | Inactive read-only monthly/manual preflight configuration.                                       |
| `../README.md`, `d1-free-sustainability.md`, this report                                        | Current command/policy contracts, correcting the obsolete manual remote-apply claim.             |

All earlier uncommitted Neon setup/prototype files remain intact. No changes were made to `.github/workflows`, runtime `functions`/`worker`/`src`, migrations, `scripts/lib/sync/incremental.ts`, `scripts/lib/sync/store.ts`, or the Neon benchmark implementation. Future staged comparison remains documentation only. Exact policy-only diff (`docs/evidence/neon-monthly-refresh-policy-2026-10-04.patch`) and budget JSON (`docs/evidence/neon-monthly-refresh-budget-2026-10-04.json`) accompany this report.

Final `git status --short` (includes the preserved prior Neon changes):

```text
 M .gitignore
 M README.md
 M docs/d1-free-sustainability.md
 M package.json
 M pnpm-lock.yaml
 M scripts/lib/sync/source-version.ts
 M scripts/sync-data.ts
 M tests/unit/source-version.test.ts
?? docs/evidence/neon-benchmark-2026-10-04.json
?? docs/evidence/neon-monthly-refresh-budget-2026-10-04.json
?? docs/evidence/neon-monthly-refresh-policy-2026-10-04.patch
?? docs/neon-benchmark-2026-10-04.md
?? docs/neon-monthly-refresh-policy.md
?? docs/proposals/
?? neon.ts
?? scripts/lib/sync/refresh-policy.ts
?? scripts/neon-benchmark/
?? scripts/report-neon-refresh-budget.ts
?? tests/neon-benchmark.test.ts
?? tests/unit/refresh-policy.test.ts
```
