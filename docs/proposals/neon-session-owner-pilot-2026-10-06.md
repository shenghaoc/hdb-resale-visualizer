# Candidate session-owner pilot and mandatory recovery — 2026-10-06

**The single authorized pilot failed before any comparable POST. Mandatory candidate restoration succeeded; temporary resources are gone.** No further remote execution is admitted. This adds evidence to the existing Neon investigation and does not certify production cutover.

## Scope and identity

Authorization: `Sentinel_9ea27d6fc4108191b87096ddab998ff9`. Fresh cohort: `candidate-session-owner-20261006`. Existing project `wispy-mouse-67963002`, isolated `production-candidate-20261005` / `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, `neondb`, AWS Singapore. No second project/branch/corpus was created or imported.

Checkout before/after: `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`. The initial working tree contained 13 tracked modifications plus previously untracked Neon work; it was preserved. All 33 frozen fingerprints match, and the 6 failed-run files frozen before recovery remain byte-identical.

## Admission and local validation

The required fresh original runtime observation adds 1 command/connection to the earlier conditional 60-command model. The revised reservation is **61 SQL commands, 13 connections, 3 comparable POSTs**, 6,917,504 received bytes and 319,376 sent bytes. It fits the unchanged 90-command / 25 MB / 1 CU limits. The expected result-message reservation is 465,600 B.

The compute arithmetic is `(234000 server  + 30000 client-only initial SET  + 195000 acquisition  + 45000 cleanup  + 600000 Hyperdrive tail  + 300000 Neon tail) / 3600000 = 0.39 CU-hours`. The fixed plan remains 0.45 CU-hours with a separate 0.05 CU-hour / 180,000 ms contingency, total 0.50. No allowance was resized, merged or refunded. Initial SET and login have no proven server ceiling before acknowledgement; their actual bounded client intervals are charged separately. These models are not provider billing or proven physical caps.

Pre-remote `vp run check` passed **2,183 tests / 211 files**, including 19 entrypoint cases, with 18 existing lint warnings and no new warnings. Strict private executor/Worker typechecking and Wrangler 4.99.0 `--dry-run` passed. The normal existing Wrangler OAuth refresh succeeded with unchanged account/scopes. API-only preflight at 02:23:21.035UTC verified the candidate idle / max 1 CU and temporary names absent, with zero SQL.

## Actual remote sequence

| Step                                      | Commands | Result                                                                                                 |
| ----------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------ |
| Fresh original runtime                    |        1 | 60 seconds, read-only, SELECT granted, transaction writes and private shortlist access denied          |
| Dedicated owner prefix                    |        2 | SET 2s acknowledged; raw readback `2000/ms/session` saved before guard                                 |
| Owner catalog + scoped lower              |        2 | Original role catalog 60s/read-only recorded; only candidate runtime IN DATABASE timeout changed to 2s |
| Fresh post-lower runtime + manifest check |        2 | 2s/read-only/SELECT-only verified; pinned publication matched                                          |
| Worker controls                           |    0 SQL | Import, retirement and retirement lookup each returned404                                              |
| Reserved owner recovery prefix + restore  |        3 | Same fresh owner client SET/readback/restore 60s acknowledged                                          |
| Reserved fresh runtime verification       |        1 | 60s/read-only/SELECT-only verified; no private access                                                  |
| **TOTAL**                                 |   **11** | **5 native connections; 0 comparable POSTs; 0 data mutations**                                         |

Owner startup `statement_timeout`/`options` were absent. Session SET/readback guarded all later owner commands on that same dedicated connection. No stored owner default was changed. Native sessions closed. Query receipts were fsynced before parsing/guards/finally, including raw safe values.

## Worker failure and deletion

Temporary Worker `hdb-neon-session-pilot-20261006`, version `c3596070-c9f3-4a55-8ef0-e57869f4615a`, deployed successfully to its expected workers.dev URL. Hyperdrive `504042a1e3fd4fffb1c61e7ac2e0c44a` used the exact direct candidate origin, existing SELECT-only role, disabled query caching and origin connection limit 5.

The first `/control/begin` at 02:24:09.673UTC returned a 19,984-byte HTML 404. `/control/retire` and `/control/retired-handoff` returned the identical HTML fingerprint. No serving safeguards, shared sequential/concurrent diagnostics, producer certificates or comparable cases ran. The precise cause remains **UNKNOWN**. The retained evidence cannot distinguish route readiness, wrong serving service or another edge condition. A successful deployment receipt did not establish public serving readiness.

Worker and Hyperdrive DELETEs returned 200. Lists then proved Worker, Hyperdrive and counter namespace absence at **02:24:17.336UTC**, before restoration. No temporary remote resource remains. The candidate/benchmark branches are retained; neither production branch nor application was deleted/changed.

## Local 404 forensics

This follow-up used retained files and validated code only: **zero provider, database, resource or settings calls**. No remote attempt was repeated.

The exact first request was `POST https://hdb-neon-session-pilot-20261006.shenghaoc.workers.dev/control/begin`, carrying `Content-Type: application/json`, an 11,076-byte serialized handoff body and the existing `x-benchmark-token` header. Credential values are omitted. The same local token file was read by the caller and supplied as `BENCHMARK_TOKEN` through Wrangler's secrets-file option; the deployment output confirms the hidden secret binding, not its remotely evaluated value.

The explicit deploy command targeted `.neon-benchmark/session-owner-pilot-20261006/wrangler.jsonc`. Its `main` resolves to `.neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts`, validated SHA-256 `9061c908c9efdb4cf01c8c2a7c5874a14b3038f0ac107c0e92f3936451037c41`. The default export has a `fetch` handler. Configuration has `workers_dev: true`, the exact fresh Worker/account/session identifiers, and no explicit custom routes or production route bindings. Its URL matches the URL printed by Wrangler. Version: `c3596070-c9f3-4a55-8ef0-e57869f4615a`. Reported upload was 6.31 seconds, trigger deployment 3.58 seconds, Worker startup 36ms; these are CLI observations, not an effective-route-readiness guarantee.

The source handles the exact POST/path before public identity/path validation. A matched control request returns JSON after the Durable Object call, or JSON409 if that control fails. Invalid/missing token returns plain403 `Forbidden`. The source's fallback404 is plain `Unknown path` and cannot be reached from the matched POST/path. **The observed HTML404 is therefore inconsistent with the intended handler's normal control/auth outcomes.** This does not prove which remote service generated it or that the route was absent.

| Request                        | UTC interval              | Client HTTP wall | Status/type    | Request/response body bytes |
| ------------------------------ | ------------------------- | ---------------: | -------------- | --------------------------: |
| POST `/control/begin`          | 02:24:09.673–02:24:10.100 |            427ms | 404 /text/html |              11,076 /19,984 |
| POST `/control/retire`         | 02:24:10.105–02:24:10.193 |             88ms | 404 /text/html |                   0 /19,984 |
| GET `/control/retired-handoff` | 02:24:10.197–02:24:10.281 |             84ms | 404 /text/html |                   0 /19,984 |

All three complete response-body SHA-256 values are `2000e6b28a1517ba1268e1649cd3163326ef839492edfdba31e8959830580976`. The first call began22ms after the recorded setup completion/custody retirement at02:24:09.651UTC. This timing is observed; propagation delay is not established as its cause.

**Evidence limitation:** body capture was deliberately disabled for control calls. Receipts retain byte count, digest, type/status and `[BODY_CAPTURE_DISABLED]`, but no raw HTML text or bounded safe snippet. Only Content-Type was recorded; Server, Cf-Ray, Location and other response headers were not retained. Native fetch defaults to following redirects; response URL, redirected flag, redirect chain and final method were not saved. No unavailable body/header/route fact has been reconstructed or claimed. A new request to obtain them is prohibited by this follow-up.

The generic HTTP receipt wrapper reports its unsynchronized last-count proxy0 because no remote ledger response was parsed. That is not a zero global SQL claim: the preserved direct ledger proves7 charged commands before failure, and the recovery ledger proves11 total. This attribution caveat does not reset or refund the authority.

The smallest local regression before another pilot is one actual-entrypoint case where deployment succeeds but an authenticated no-SQL serving-readiness request returnsHTML404. It must assert refusal before ordinary custody transfer or serving SQL, bounded safe failure evidence, deletion/absence before restore, and original-ledger mandatory restore plus fresh60s/read-only verification. Future error capture should retain final URL/redirect status, a sanitized bounded body snippet and a safe diagnostic header allowlist. This is a narrow readiness/recovery harness gate, not a product/database redesign. This forensic phase identifies it and performs no new serving implementation or remote experiment.

## Mandatory same-ledger recovery

No remote retirement certificate was returned. The ordinary executor therefore fenced its original local source and stopped. Its failed lifecycle, original custody, HTTP/native journals and process output remain unmodified.

A narrowly tested controller reconciliation used the exact original handoff plus deletion evidence and the three attempted control routes. Those routes only import/retire/read authority state; they construct no PG client. No SQL-capable request had been sent. The proof rejects source/counter drift, extra serving calls, response-status drift, missing resource absence and unresolved client-only SET outcomes.

This is explicitly **controller reconciliation after proved deletion**, not a fabricated remote retirement certificate. It preserves the original run ID, start clock, all 7 existing SQL charges, plan, intervals and tombstone; it imports only terminal recovery custody at generation 2. Ordinary work remains stopped. No counters were reset/refunded and no new pilot allowance was created.

The entire failed import/deletion/diagnosis interval was charged. Final contingency is **249,069 ms**, exceeding 180,000 ms by **69,069 ms**. That invalidates the pilot and stops ordinary work; already-reserved mandatory cleanup remains subject to its separate hard-cap admission. No failed SET/ALTER was retried.

At **02:27:59.879UTC** the reserved restore 60s was acknowledged. At **02:28:00.074UTC** a fresh runtime SELECT returned `statement_timeout=1min`, `default_transaction_read_only=on`, transaction SELECT true, transaction write false, private access false. Its connection closed at 02:28:00.096UTC. Terminal component success does not make the original pilot pass.

## Measurements and limits

The 11 native commands returned **1,781 query-visible bytes**, sent **3,005 query-visible bytes**, and used **178 ms summed client query wall time**. These byte counters exclude startup/TLS and opaque Hyperdrive/provider traffic. Server SQL duration and finalized provider compute/network billing remain **UNKNOWN**.

Time from cohort start through restoration: **249,860 ms**. Adding the retained 900,000 ms tails at 1 CU gives a **0.319405556 CU-hour proxy**, not metered consumption or a certified physical ceiling. Unused reservations provide no counter refund or permission to resume after contingency invalidation.

Current Chrome screenshots/appshot display monitoring graphs and compute configuration, not allowance-period compute/transfer totals. No browser-control tool is exposed in this selected execution environment; hovering/export was not performed. Current usage totals/reset period remain unknown.

## Repository impact and final gate

Changes are limited to isolated pilot policy/harness/tests plus this report/evidence/patch. No production runtime, data publisher, schema, routing, schedule, dependency, secret or personal MCP change was made in this handoff. Existing user changes remain untouched.

- Existing policy/harness: `session-plan.ts`, `session-owner.ts`, actual ignored `execute.mts`, `neon-pilot-entrypoint.test.ts`.
- New terminal-only proof/helper: `import-failure-recovery.ts`, `neon-pilot-import-recovery.test.ts`.
- New ignored workspace: `.neon-benchmark/session-owner-pilot-20261006/`, containing fresh config, receipts, source snapshots, one-shot recovery harness and validation. Credentials remain in existing ignored files; no password, URI or token appears in deliverables.
- New repository-visible artifacts: this report, evidence JSON and code-only review patch.

Recovery-specific 4 tests and strict typechecking passed. The final `vp run check` passed **2,187 tests / 212 files**, including the 4 recovery cases and 19 actual-entrypoint cases. Format, lint, typecheck, boundaries, tests, build and bundle checks passed; 18 existing lint warnings remain, with no new warnings. `git diff --check`, the review patch reverse check and the deliverable secret scan passed. The exact final `git status --short` is recorded in the evidence and the private final snapshot.

## Decision

**Serving pilot: FAILED, safely restored, stopped. The accepted Free-safe project/budget assessment is unchanged.** Existing [full-corpus setup/storage/query/publication measurements](../neon-benchmark-2026-10-04.md) are preserved and were not rerun. This harness failure demonstrates incomplete serving acceptance, not a measured Neon sustainability failure. It does not revise the subsequently accepted Free-safe budget assumptions. Production cutover still waits for its outstanding acceptance gates.

Before any separately authorized fresh pilot, the harness needs authenticated no-SQL serving readiness before custody transfer and automatic tested terminal handling of no-SQL control-import failure. Serving 2s cancellation, shared diagnostics and the exact 3 semantic cases still require remote evidence. A new pilot is not authorized by this report; no automatic resource recreate/retry follows.

D1 requests/mutations, default Neon production SQL, retained benchmark mutations, candidate data publication, production application deployment/secret/routing changes, schedule changes, commits, pushes, PRs and merges in this handoff: **zero**. No production cutover or automated refresh is proposed.

Deliverables: [sanitized evidence](../evidence/neon-session-owner-pilot-2026-10-06.json), [review patch](../evidence/neon-session-owner-pilot-2026-10-06.patch), and complete ignored receipts under `.neon-benchmark/session-owner-pilot-20261006/`.
