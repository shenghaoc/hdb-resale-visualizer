# Neon candidate serving acceptance — one bounded attempt, 2026-10-07

**Infrastructure acceptance passed; the first comparable POST failed on a pilot-only guard query that exceeded the temporarily lowered 2 s server timeout. The candidate was restored and every temporary resource is gone. Serving acceptance is still incomplete, and no retry was made.**

Authorization: the user's chat instruction of 2026-10-07 (label `UserChat_20261007_resume-neon-serving-acceptance`; no Sentinel token was supplied). Target: project `wispy-mouse-67963002`, branch `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, database `neondb`, role `hdb_benchmark_runtime`. Evidence: [JSON](../evidence/neon-serving-acceptance-2026-10-07.json); private receipts in `.neon-benchmark/serving-acceptance-20261007/`.

## Authentication and preflight

The 2026-10-06 `PREFLIGHT_NO_DATABASE` HTTP 401 was already diagnosed and repaired: the old harness read an expired cached OAuth token from Wrangler's TOML and never refreshed it ([diagnostic](neon-auth-path-diagnostic-2026-10-06.md)). Today the repaired helper (`wrangler auth token`) returned HTTP 200 for an authentication-only Hyperdrive list, then the exact `PREFLIGHT_NO_DATABASE` mode passed once: candidate endpoint idle, max 1 CU, direct, temporary names absent, reservation admitted (0.3997 CU-hours planned, 0.45 ceiling, 0.05 separate contingency), zero SQL.

Before credentials the local gate passed again: `vp run check` (217 files / 2,251 tests, 21 existing lint warnings, none in new files), strict private typecheck, Worker dry-run (same 1070.66 KiB bundle), 54-request workerd proof against the would-deploy artifact (same bundle SHA-256), and 70 focused tests. All 67 frozen hashes from the last attempt still matched.

## One reviewed harness change: SQL-free routing settle

Both earlier pilots stopped at a 19,984-byte platform HTML 404 on their first request, sent 42–43 ms after Wrangler's workers.dev subdomain POST returned; the one routing probe that waited a few seconds was served. `scripts/neon-benchmark/pilot/routing-settle.ts` now retries `GET /control/ready` only while it returns that exact signature (HTTP 404, `text/html`), inside the existing 35 s planned readiness reservation (28 s window, 1 s interval). Any other status or content type, including a Worker's own JSON/plain 404, stops immediately. No SQL, POST, plan or reservation changed. 15 unit tests cover it.

**Observed:** nine platform 404s with the same page digest as the earlier failures, then the Worker answered on request 10, **12.4 s after the deploy returned**. That replaces the earlier "cause UNKNOWN" with a direct observation consistent with route propagation lag. It does not show the lag is always that long.

## What passed remotely

| Item                                     | Result                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Runtime role through Worker → Hyperdrive | `hdb_benchmark_runtime`, `read_only=on`, `transaction_write=false`, `private_access=false`, SELECT allowed             |
| Server-side cancellation                 | SQLSTATE **57014** after 2,343 ms (first remote proof)                                                                 |
| Hyperdrive config                        | Created with query cache disabled and origin limit 5 (identity guard passed), then deleted                             |
| Control plane                            | ready, begin, charge-setup, configure, safeguards, accept-diagnostic, retire all 200                                   |
| Shared counter                           | sequential 200 then 409; concurrent one 200 and one 409                                                                |
| Restoration                              | Owner restore acknowledged; fresh runtime read-back 60 s / read-only / SELECT-only / no private access                 |
| Cleanup                                  | Worker, Hyperdrive and Durable Object namespace absent (harness proof plus an independent listing: 7 Workers, 0 and 0) |

## What failed

The first comparable POST (`block-time-adjusted`, JURONG WEST blk 211) returned **503 `{"error":"FAILED"}`** after 4.1 s. The ledger shows `BEGIN` succeeded in 350 ms, then statement 2 was canceled with **57014** after 2.34 s, followed by two cleanup statements. Statement 2's hash matches `COMPARABLE_RESULT_PREFLIGHT_SQL`, the harness's returned-data guard (three scope counts, the 150-row selection, history sizing and field-length checks in one statement). **The production Worker does not issue it.**

The role timeout was deliberately 2 s for this pilot, and the compute had been suspended about 31 hours and woken about 45 s before the POST. Why the guard exceeded 2 s is **not established**: cold buffers/pageserver reads on the copy-on-write child and a poor plan both fit the receipts, and no remote `EXPLAIN` was run. The earlier benchmark measured a 6.7 s first invocation after idle (including compute resumption and a heavy size query), so a cold multi-count query beyond 2 s is plausible. Production would run the handler's own three counts and selections under the 60 s role timeout, whose cold latency is **unmeasured**.

## Budget actually used

24 of 90 application statements, 11 native SQL results over 5 connections (all closed), 1 of 3 comparable POSTs, 56.9 s active wall, 28.2 s of the 180 s contingency, conservative proxy 0.2658 CU-hours including 15-minute tails (provider billing unknown). Neon's project counters now report real values for the period starting 2026-10-01: about 0.91 CU-hours (3,274 compute-seconds) and 690 MB transferred before this run, of 100 CU-hours and 5 GB. Provider counters lag.

## Decision needed (not taken)

This directory's one-shot authorization is consumed, and every option below changes the bounded plan or adds remote work, so none was started.

1. **Diagnose cold versus warm first (recommended, small).** One direct read-only connection as the runtime role under its normal 60 s timeout, at most 8 statements: `EXPLAIN (ANALYZE, BUFFERS)` of the handler's block, street and town counts and 150-row selections plus the guard, once on the cold compute and once warm. It separates cold buffers from a poor plan and gives real cold latency for the queries that will ship, for about a minute of compute.
2. **Real-Worker candidate acceptance (recommended next).** Port the selector onto current `main` (production has 19 commits this branch lacks, including a changed comparable handler), then deploy that exact bundle as a temporary token-gated, non-production Worker with Neon selected against the candidate. Run a bounded request set: public GET families, the three oracle POSTs cold then warm, HEAD/Cookie bypass, OG/sitemap/robots, cache hits with zero SQL, and shortlist reads confirmed on D1. This validates the code that will actually ship, which the isolated pilot cannot.
3. **Amend the isolated pilot.** Raise the comparable-phase timeout (for example to 10–15 s) and re-pin the SQL plan and proof. It stays isolated but is more rework and still does not exercise the real Worker.
4. **Skip further isolated acceptance** and rely on the D1-selected production deploy plus a bounded post-switch check with immediate rollback.

No D1/Neon `production` read or write, production routing/secret/schedule change, application deployment, commit, push, PR or merge occurred. `hdb-resale-qt` was not touched.
