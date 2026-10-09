# Local owner session integration and pilot admission — 2026-10-06

**Local integration is complete; remote pilot admission remains refused.** The actual dedicated owner path now uses the remotely demonstrated session `SET` and readback on each fresh owner connection. It does not rely on native startup timeout propagation. Conditional candidate-runtime-2s arithmetic fits the fixed envelope, but it conflicts with the latest instruction to leave the runtime role's stored 60s/read-only defaults unchanged. No remote execution follows from this report.

The completed session diagnostic remains separate: one dedicated connection, exactly 3 commands, PostgreSQL timeout acknowledgement after 2,009.239ms, clean close, zero stored-default changes. Its original source, raw receipts, report, and evidence retain their fingerprints. Report/evidence were saved to Library without modifying their bytes.

## Actual owner integration

The existing executor `.neon-benchmark/shared-counter-candidate-pilot-20261005/execute.mts` invokes `runDedicatedOwnerAttempt()` for both initial owner work and conditional terminal owner recovery. The existing isolated Worker uses the same revised full-plan signature; no parallel product implementation or alternate comparable SQL was introduced.

Each owner attempt has exactly one fresh dedicated native client, a 5-second client connection timeout and 15-second connect/operation client wall deadline. Both prefix commands are dispatched through the same durable authority and consume application SQL permits:

1. `SET statement_timeout = '2s'` — client deadline only until acknowledgement. Its permit records `serverTimeoutMs = 0` and `clientOnlyInitialSET = true`, explicitly representing no demonstrated server ceiling.
2. `SELECT setting, unit, source FROM pg_settings WHERE name = 'statement_timeout'` — raw values persisted before the guard. Required exact observation: `2000`, `ms`, `session`.
3. Only after that guard passes may later reserved owner SQL run on this same client under the observed 2s session setting.

The dedicated helper closes the client on success, guard failure, timeout or query failure. A deadline prevents a late acquisition or late readback from dispatching later SQL. There is no retry, owner pool/reconnection, startup `options`, startup `statement_timeout`, optional `SET LOCAL`, stored owner default change, or persistent owner restoration.

An ambiguous initial SET retains its original charged permit with an unknown outcome. The original custody is fenced and an explicit unresolved-bootstrap marker prevents recovery import; no finite server execution window is invented, no Infinity is serialized asnull, and no retry or follow-up SQL is permitted. The separately scoped candidate-runtime restoration proposal is distinct from the owner session closing naturally.

## Full conditional reservation

| Phase                                         | SQL permits | Connections | Post-SET/server SQL reserve ms | Initial client-only SET reserve ms |
| --------------------------------------------- | ----------: | ----------: | -----------------------------: | ---------------------------------: |
| `owner-record-and-lower`                      |           4 |           1 |                          6,000 |                             15,000 |
| `fresh-direct-runtime-before-pool`            |           2 |           1 |                          4,000 |                                  0 |
| `safeguards`                                  |           8 |           1 |                         16,000 |                                  0 |
| `candidate-sequential-diagnostic-20261005`    |           3 |           2 |                          6,000 |                                  0 |
| `candidate-concurrent-diagnostic-20261005`    |           1 |           1 |                          2,000 |                                  0 |
| `comparables`                                 |          30 |           3 |                         60,000 |                                  0 |
| `cleanup-observations-before-resource-delete` |           8 |           1 |                         16,000 |                                  0 |
| `owner-scoped-restore-after-resource-delete`  |           3 |           1 |                          4,000 |                             15,000 |
| `fresh-direct-runtime-restored-sixty`         |           1 |           1 |                         60,000 |                                  0 |
| **TOTAL**                                     |      **60** |      **12** |                    **174,000** |                         **30,000** |

The initial owner 4-command phase is SET, readback, catalog/identity read, then the proposed candidate-runtime ALTER. The terminal owner 3-command phase is a fresh SET, readback, then the proposed candidate-runtime 60s restoration. Those runtime ALTER operations are **not authorized or executed in this handoff**.

The rest of the existing safeguards, shared sequential/concurrent counter diagnostics, three selected comparable POSTs, producer certificates, cleanup observations, and fresh final runtime 60s verification remain reserved. Frozen serving/product/pipeline semantics and the three cases (`block-time-adjusted`, `street-raw`, `town-raw`) are unchanged.

| Reservation                                          |                                    Amount |
| ---------------------------------------------------- | ----------------------------------------: |
| Work / cleanup SQL permits                           |                                    48 /12 |
| Total / application SQL ceiling                      |                                    60 /90 |
| Selected POSTs / user maximum                        | 3 /10; stricter internal ceiling remains3 |
| Reserved application connections                     |                    12; internal ceiling13 |
| Hyperdrive origin pool ceiling                       |                                         5 |
| Connection acquisition                               |                   12 ×15,000ms =180,000ms |
| Explicit initial SET client reservations             |                     2 ×15,000ms =30,000ms |
| Remaining SQL server reservations                    |                                 174,000ms |
| Protected cleanup wall                               |                                  45,000ms |
| Planned active reservation                           |                                 429,000ms |
| Hyperdrive idle tail                                 |                                 600,000ms |
| Neon idle tail                                       |                                 300,000ms |
| Maximum compute                                      |                                       1CU |
| Modeled planned CU-hours                             |                           **0.369166667** |
| Fixed planned envelope                               |                          **0.45CU-hours** |
| Separate setup/ambiguity contingency                 |               **0.05CU-hours /180,000ms** |
| Fixed total envelope                                 |                          **0.50CU-hours** |
| Planned modeled slack                                |            291,000ms /0.080833333CU-hours |
| Application-visible received reservation / ceiling   |                   6,851,968B /25,000,000B |
| Application-visible sent reservation / ceiling       |                      302,992B /1,000,000B |
| Expected successful result-message upper reservation |                                  400,064B |

Arithmetic: `(174,000 +30,000 +180,000 +45,000 +600,000 +300,000) /3,600,000 ×1CU =0.369166667CU-hours`. Adding the separate full 0.05 contingency gives0.419166667 of the fixed 0.50 envelope; planned and contingency allowances were not resized or merged.

**This is conditional reservation arithmetic, not measured billing or a proven physical compute ceiling.** The initial SET has only a client bound until its acknowledgement; a client abort does not prove server cancellation. Unknown outcomes stop/quarantine the protocol. Provider setup/cleanup uncertainty stays separately charged, both tails and all acquisitions remain reserved, and the 25 MB allowance covers application-visible database traffic. Opaque Hyperdrive-origin/provider traffic remains observational. The completed diagnostic overhead is separate and supplies no pilot-counter refund or new allowance.

## Runtime scope remains unresolved

The existing Worker/Hyperdrive safeguards require a fresh runtime connection's effective 2s timeout and server cancellation of a 3-second safe sleep. The owner session SET affects only that owner connection. It neither changes runtime connections nor supplies the pool with a 2s default.

Thus the conditional pilot still needs explicitly authorized candidate-only runtime 2s defaults and restoration to 60s. That approval is absent from this narrower handoff; its latest instruction leaves the stored runtime 60s/read-only defaults unchanged. The actual default admission checkpoint and CLI execution mode reject before credentials, endpoint preflight, SQL, or provisioning. Local integration tests can exercise only the explicitly labeled synthetic `LOCAL_SIMULATION_ONLY` path.

The separate unchanged60s counterfactual removes the initial runtime ALTER and replaces terminal owner ALTER with a read-only catalog audit. It reserves 59 commands, 12 connections,3,188,000ms of server SQL,30,000ms of initial-client-only reservations and the same acquisitions/cleanup/tails, totaling **1.206388889CU-hours**. It fails the 0.45 planned and 0.50 total envelope. This tighter counterfactual replaces the earlier same-command-set rough figure1.206944444; it includes zero persistent runtime changes and is **not an executable alternate Worker**, because the current Worker still requires 2s.

No startup-setting result has been reinterpreted, no runtime default has been silently lowered, and no new per-pool/per-request `SET LOCAL` design has been introduced. A different runtime strategy requires its own local proof and fresh explicit remote scope.

The Oct 5 cohort remains retired and fenced. Its old receipt/counter is never reset, reused or retried. Even a later decision to authorize candidate runtime 2s would require a fresh named cohort and receipts, newly verified bounds/scope, and separately authorized resource lifecycle. This report grants none of those actions.

## Local verification and repository impact

`vp run check` passed with **2,181 tests across 211 files**, including **17 actual-entrypoint tests**. Format, lint, strict TypeScript, boundaries, build, and bundle checks passed; 18 pre-existing lint warnings remain and there are zero new warnings. The initial sandbox attempt passed all tests but blocked `tsx` build IPC; the reviewed local IPC rerun completed the whole prescribed gate with exit 0. No remote provider/SQL call was part of those checks.

Private executor/Worker strict typechecking passed. Wrangler4.99.0 isolated Worker `--dry-run` bundling passed and explicitly exited without deployment. No new dependency, production configuration, schema, routing, schedule or data-pipeline change was required.

The 17 entrypoint tests cover admission/scope refusal before callbacks, full mocked entrypoint and Worker flow, producer rejection, resource uncertainty, durable fenced transfer, terminal handling, exact owner prefix/order/same-client close, raw readback retention before rejection, definitive SET failure, lost SET outcome quarantine, late acquisition and late readback deadlines, preserved TLS, and immutable counters.

Source diff relative to the captured pre-integration checkout:

- `.neon-benchmark/shared-counter-candidate-pilot-20261005/execute.mts` — existing isolated harness/test source.
- `.neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts` — existing isolated harness/test source.
- `scripts/neon-benchmark/pilot/accounting.ts` — existing isolated harness/test source.
- `scripts/neon-benchmark/pilot/cohort-store.ts` — existing isolated harness/test source.
- `scripts/neon-benchmark/pilot/dispatch.ts` — existing isolated harness/test source.
- `scripts/neon-benchmark/pilot/ledger-transfer.ts` — existing isolated harness/test source.
- `scripts/neon-benchmark/pilot/plan.ts` — existing isolated harness/test source.
- `scripts/neon-benchmark/pilot/terminal-recovery.ts` — existing isolated harness/test source.
- `tests/unit/neon-pilot-entrypoint.test.ts` — existing isolated harness/test source.
- `scripts/neon-benchmark/pilot/session-owner.ts` — new isolated harness source.
- `scripts/neon-benchmark/pilot/session-plan.ts` — new isolated harness source.

The 11 source-file changes are confined to isolated pilot harness/policy/tests; the actual executor and Worker sources remain ignored. This report, its evidence JSON, and code-only patch are new repository-visible artifacts. All 33 preserved fingerprints match, including 19 frozen product/pipeline/serving files, 6 original failed-pilot artifacts, 4 retired Oct5 receipts, 2 completed diagnostic receipts and the completed diagnostic report/evidence. Existing uncommitted work was preserved. Branch/HEAD remain `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`.

## Saved diagnostic artifacts

- Report: Library ID `libfile_9d24ad8de4488191a3dc157df0663c55`, file ID `file_00000000bcec82078a9fd315a62e8191`, confirmed version **0**.
- Evidence: Library ID `libfile_7b92df0a677881918a25b6d16f7d509f`, file ID `file_000000009e3482078e7a3ccf84f7a11b`, confirmed version **0**.
- Both original local files retain their confirmed Library identity/version metadata and original byte fingerprints. No credentials or connection strings were uploaded.

The current prepared helper reported its prepare action unavailable before any preparation/write. Ordered owned-file creates then succeeded and local metadata was applied. An earlier helper import under Python 3.9 failed before any app action; supported Python 3.14 was used. There was no uncertain upload replay or duplicate create.

Local deliverables: `docs/evidence/neon-session-owner-integration-2026-10-06.json`, `docs/evidence/neon-session-owner-integration-2026-10-06.patch`, and private complete receipts/source snapshots under `.neon-benchmark/session-owner-integration-20261006/`.

**Outcome: local integration and recalculation complete; no further remote execution admitted.** Provider API/database queries, persistent role/database changes, resource creation, application deployment, production routing/D1/Neon production mutations, cron changes, commits, pushes, PRs and merges in this integration handoff: **zero**. The only external writes were the explicitly requested two Library artifact saves.
