# Explicit session timeout diagnostic — 2026-10-06

The one authorized session-only diagnostic passed and stopped. A fresh dedicated direct owner connection acknowledged `SET statement_timeout = '2s'`, returned `setting = 2000`, `unit = ms`, `source = session`, and received PostgreSQL SQLSTATE `57014` (`canceling statement due to statement timeout`) for `SELECT pg_sleep(3)` after **2,009.239 ms**. The connection then closed cleanly. This proves the explicit session timeout on this particular tested direct connection.

Authorization: `Sentinel_30c8584e60ac819182c7ce6f0fd30886`. The earlier broader delegation was not revived. This proof has separate verification overhead and does not reuse, reset, refund, or continue the retired Oct5 pilot counter.

## Exact target and commands

- Existing project: `wispy-mouse-67963002`, AWS Singapore.
- Isolated candidate: `production-candidate-20261005` / `br-rough-frost-b3e2ks1b`.
- Direct endpoint: `ep-steep-water-b300tebo`; database `neondb`; existing owner `neondb_owner`.
- Fresh connections: **1**; SQL attempts: **3**; control API requests: **0**; retries: **0**.
- UTC receipt interval: **2026-10-06T01:34:11.018Z → 2026-10-06T01:34:14.436Z**.

| Command                                                                          | Outcome                                | Client query wall | Visible received / sent |
| -------------------------------------------------------------------------------- | -------------------------------------- | ----------------: | ----------------------: |
| `SET statement_timeout = '2s'`                                                   | `SET` acknowledgement; session only    |          9.356 ms |               15 / 34 B |
| `SELECT setting, unit, source FROM pg_settings WHERE name = 'statement_timeout'` | One row: `2000`, `ms`, `session`       |         56.752 ms |              133 / 84 B |
| `SELECT pg_sleep(3)`                                                             | Server timeout error, SQLSTATE `57014` |      2,009.239 ms |              150 / 24 B |

Raw returned settings were saved and fsynced before evaluating the settings guard. The conditional slow read ran only after that guard passed. The prepared native connection had neither failed startup `statement_timeout` nor `options` fields. No runtime connection, application-data read, or private-data access occurred.

## Bounds and lifecycle

- Native client connection wall: **1,181.163 ms**.
- Connect plus three-command operation wall: **3,289.387 ms**.
- Close wall: **120.769 ms**; client lifecycle including close: **3,410.160 ms**.
- Entire supervised process wall: **5,128.590 ms**; exit status **0**.
- Client connection timeout: **5 seconds**; strict connect/operation client wall deadline: **15 seconds**; outer process fail-safe: **30 seconds**. None fired.
- Initial `SET` was protected only by the client deadline until its acknowledgement. No server ceiling is claimed for connection setup or the first `SET`.
- The server's statement-timeout error was acknowledged. Client abort/cancellation was not requested. `client.end()` completed and the stream close was observed.
- Visible query/close protocol traffic: **298 B received / 147 B sent**, including the 5-byte termination message. Startup, TLS, TCP, and opaque provider traffic are excluded. Provider-billed compute and transfer remain **UNKNOWN**; these socket counts are not a billing measurement.

The three SQL commands above are the complete remote sequence. There was no post-cancellation validation query, `ALTER ROLE`, `ALTER DATABASE`, persistent settings change, or restoration SQL. Session settings ended with the dedicated connection. Existing runtime-role 60s/read-only stored defaults were not changed and were not re-queried in this narrow task.

## Scope and preserved evidence

There were zero application-data reads, publication attempts, comparable POSTs, resources created, production data/routing changes, schedule changes, deployments, commits, pushes, PRs, or merges. Existing branches remain. The Oct5 pilot and the earlier Oct6 startup-setting diagnostic retain their original receipts and counters. All 18 fingerprinted pre-existing modified tracked files/selected investigation receipts match their pre-diagnostic hashes.

The prior startup-setting result remains valid: the earlier native preparation did not become an effective server timeout. Today's explicit session `SET` supplies new evidence and does not rewrite that earlier observation or establish the cause of its mismatch.

## Local verification and artifacts

Seven credential-free, network-free safety tests passed. They cover the full three-command path, rejected readback retaining raw settings without running the sleep, failed initial `SET`, unexpected slow-read error, connection deadline, readback deadline preventing a late sleep, and failed raw retention preventing the sleep. Strict standalone TypeScript verification passed. Repository formatting is checked using the prescribed `vp run format:check` command. The prior full repository gate (2,174 tests across 211 files) remains applicable because this diagnostic did not change repository code.

- Public safe evidence: `docs/evidence/neon-session-timeout-diagnostic-2026-10-06.json`.
- Ignored standalone source and immutable one-shot receipts: `.neon-benchmark/session-timeout-diagnostic-20261006/`.
- Raw settings and command intents are mode `0600`; no credentials or connection string are included in the report/evidence.

Git branch and HEAD remain `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`. Existing uncommitted work was preserved. New repository-visible files from this task are this report and its evidence JSON; the diagnostic harness and receipts stay ignored.

The diagnostic is complete and stopped. It authorizes no further pilot execution, resource creation, persistent settings change, or data publication. A subsequent pilot needs its own explicit admission and scope.
