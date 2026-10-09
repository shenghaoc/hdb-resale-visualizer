# Comparable pilot: local harness repair review

Timestamp correction: the original Vitest `19:44:48` was local Asia/Singapore time (UTC+08:00), so the gate started at **11:44:48 UTC**, not 19:44:48 UTC. This package preserves the accepted repair snapshot and its original diff; separately authorized remote integration changes are recorded in the subsequent diagnostic report. No test rerun was needed for this correction.

The local repair passes the full repository gate. It replaces the unenforceable all-server SQL claim with a prospective **90 application-issued statement permit limit**, shared by the controller and every instrumented Worker context. It records HTTP intent before transport and preserves status and failure evidence before parsing. No candidate retry, database request, provider API call, credential change, resource creation or deployment was performed during this repair. The failed pilot's evidence remains unchanged.

This is a local review package. It does not certify a deployed distributed authority, provider billing, or successful candidate comparable requests. The original one-shot executable still refuses reuse of its existing terminal receipt. There is no new executable or deployed fetch entry point that silently retries it.

## Scope and repository state

- Branch: `feat/d1-free-incremental-refresh`.
- HEAD: `482be1eba9ff2091c1580f5757d7b33e20b26515`.
- The checkout already contained D1 and Neon work. All pre-existing changes are preserved; no commit, stage, push, PR, merge, schedule change or production routing change occurred.
- Only the new files under `scripts/neon-benchmark/pilot/`, the pilot fixture and four pilot test files were added for implementation. This report, its JSON receipt and its patch are review artifacts.
- All 19 frozen publisher/runtime/test files match their retained hashes. Both diagnostic SQL strings remain byte-identical. All six original failed-pilot source, receipt and deployment-log hashes match the earlier diagnostic.

## Prospective application SQL guarantee

The authority durably appends a unique statement ID and increments the global application sequence **before** invoking the driver. The ID is `requestId:s<localSequence>`; the global sequence runs from 1 through at most 90. Successful, failed and ambiguously completed permits remain charged. A process can crash between committing a permit and sending SQL, so charged permits conservatively upper-bound actual driver submissions; they are never refunded from returned statistics.

Every instrumented application query is counted, including owner/setup SQL, `BEGIN`, `COMMIT`, `ROLLBACK`, application `SET` and diagnostics. The dispatcher rejects multi-statement text, NUL and empty SQL before dispatch. It accepts the frozen single-statement query shapes without rewriting them or logging parameters. The returned row/parameter semantics are preserved, including legitimate duplicate-looking transactions with different IDs.

One authority is mandatory. `AtomicPilotStore.transact` must serialize and durably commit across the controller and **all** Worker instances. The file implementation uses an exclusive lock, fsync and atomic rename; separate instances share the persisted counter. The portable transaction-storage adapter contains no Node filesystem import and can back the same authority with shared transactional storage. The Worker dependency accepts that authority explicitly; it has no per-isolate counter fallback. Request activation is durable and one-time, preventing replay in another instance.

The local tests demonstrate the contract using independent authorities, serialized transactional storage and the file-backed implementation. A future distributed deployment must wire one authenticated durable authority/RPC identity to every owner and Worker dispatch path, then prove that wiring. No Durable Object namespace, RPC host, credential or permission was provisioned here. A per-isolate store or an uninstrumented driver would violate the reviewed contract and must fail the future admission review.

Ordinary work stops at 80 charged statements, protecting ten slots for application finalization and diagnostics within the same total of 90. This reserve is not an estimate of opaque provider cleanup. Request statement limits include their transaction boundaries and diagnostics; exhausting one refuses the next dispatch. Unknown requests retain full transfer and connection reservations and stop new work.

## Limits retained

| Boundary                          |               Retained value | Local enforcement/evidence                                                                 |
| --------------------------------- | ---------------------------: | ------------------------------------------------------------------------------------------ |
| Application SQL permits           |                     90 total | Atomic durable pre-send authorization; statement 91 never reaches driver                   |
| Application cleanup reserve       |                 10 within 90 | Work stops at 80; cleanup still obeys 90                                                   |
| Comparable POSTs                  |                           10 | Charged at request admission, including unknown outcomes                                   |
| Received database bytes           |                   25,000,000 | Full allowances reserved before dispatch; no refunds; stream overflow stops further SQL    |
| Sent database bytes               |                    1,000,000 | Full allowances reserved; supported stream writes checked before forwarding                |
| Application connection admissions |                           13 | One connection reservation per request; instrumented scope permits one constructed client  |
| Concurrent database requests      |                            1 | Shared outstanding admission and activation guards                                         |
| Server statement timeout          |                    60,000 ms | Frozen runtime SQL/transport unchanged; serving safeguard requires the same server setting |
| Active wall policy                |                   300,000 ms | Time checked before admission and permits; full request time reserved                      |
| Cleanup time reserve              | 45,000 ms within active wall | New work must finish its reserved window before the reserve                                |
| Compute policy proxy              |                 0.35 CU-hour | Unchanged, max 1 CU and original tail assumptions; actual billing unknown                  |
| Hyperdrive origin connections     |                            5 | Unchanged future configuration boundary; no Hyperdrive created here                        |
| Hyperdrive/Neon modeled tails     |         600,000 / 300,000 ms | Unchanged assumptions, not provider billing receipts                                       |

Comparable HTTP deadlines remain 35 seconds; the safeguard GET ceiling remains 85 seconds. Control HTTP defaults to 20 seconds and cleanup can use 10 seconds. The recorder forwards an AbortSignal and races cancellation through transport/body reading. The real transport must honor the signal. Client cancellation cannot prove termination of an already-accepted database operation; its charged permits and reserved bytes remain consumed.

Reservations prove bounded admission, not an exact physical cap on every provider packet. An already-delivered receive chunk can cross a threshold before the stream is destroyed. Startup bytes, missing stream telemetry, Hyperdrive-origin traffic and provider-internal work cannot be invented as zero. Measurement failure stops subsequent application SQL. Owner dispatch must use the same authority, one admitted connection and the same instrumentation contract in a future executable.

At max 1 CU, five active minutes plus the modeled fifteen-minute tails give a 0.333333 CU-hour policy proxy. This fits inside the retained 0.35 policy allowance, but does not establish actual compute suspension, billing or tail duration. Those remain remote admission/evidence requirements.

## Provider SQL observations

`pg_stat_statements` observations are separate from application authorization. Large, missing, reset or incomplete counters cannot increment, refund, reset or grant application permits. The unchanged diagnostic still aggregates by role without a database/statement/phase filter; its `completeAttemptAccounting` is explicitly false and missing fields remain null. A missing diagnostic role is not replaced with an invented successful observation.

The previous failed run's runtime-role delta of 83 and four owner statements remain historical observations. The repair does not retroactively certify a 90 all-server cap or claim an exact breach. Provider-generated setup, pooler, reset, cleanup, nested or failed SQL is not included in the new hard application scope unless the application explicitly sends it through the instrumented driver. Exact opaque-provider attribution remains UNKNOWN.

## Durable HTTP evidence

Both pilot requests and control-plane HTTP callbacks pass through the same recorder. It persists intent before obtaining the before-counter and before fetch. If the authority or journal is unavailable, dispatch fails closed. Headers/status are persisted immediately after a response arrives, before metrics or body parsing. The body is streamed with a two-megabyte retention ceiling. Each receipt keeps request ID/sequence, fixed operation label, method, UTC start/end, status or null, response availability, allowlisted MIME, HTTP byte counts, SHA-256 when the body completes, application counts/availability before and after, measurement availability and sanitized failure classification/stage.

Abort, timeout, admission, transport, body-limit, parse, HTTP-status and evidence failures are distinguished. The error name and transport cause use short allowlists; raw exception messages, URLs, authentication headers, request payloads and database parameters are never persisted. A public synthetic body snippet is opt-in, redacted and limited to 512 UTF-8 bytes. Control/auth bodies remain disabled by default. Malformed metrics and non-JSON bodies retain status and available public snippets instead of disappearing before receipt creation.

The JSONL journal is append-only and fsynced. Final updates run through `finally`; no cleanup method deletes receipt history or resets counters. If the final append fails, prior receipts remain and the caller receives an evidence failure. Missing after-counts stay null and stop progress. Disk/process loss can still prevent a final receipt; a local harness cannot manufacture an outcome after such a loss.

## Validation

`vp run check` completed with exit 0. Formatting, typed lint, typecheck, all unit/integration tests, boundaries, production build and bundle checks passed. The run contains **2,105 passing tests across 205 files**, including **43 focused pilot tests in four files**. Lint reports 18 existing `no-base-to-string` warnings outside the new harness; it reports no new harness errors or warnings. Vitest took 18.81 seconds. The initial sandboxed build failed only because `tsx` could not create its local IPC socket; the complete prescribed gate then passed with reviewed permission for that local socket. No remote verification was substituted for the local gate.

| Evidence group             | Tested result                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prospective SQL ceiling    | Exactly 90 charged/sent in the bounded fixture; attempt 91 refused before driver; 100 concurrent claims over shared authority admit at most 90                 |
| Cross-context accounting   | Owner `SET` and separate Worker dispatch share a monotonic application sequence; portable shared transaction adapter cannot reset the pool                     |
| Attribution/replay         | Intent exists before driver send; duplicate IDs and a second activation are refused                                                                            |
| Command classes            | `BEGIN`, `SET`, failed SQL, `ROLLBACK`, diagnostic SELECT and `COMMIT` are counted                                                                             |
| Provider isolation         | Huge and missing provider counters do not affect application count or admission                                                                                |
| Persistence faults         | Authorization-write failure sends no SQL; completion-write loss retains the charged unknown permit; corrupt counters fail closed                               |
| Transfer/connection/time   | Oversized allowances, connection 14, POST 11, concurrent request and expired request/statement reservations are refused; no refunds                            |
| HTTP evidence              | Intent and status precede parsing; 403/502, malformed JSON/metrics, non-JSON, aborts before/after headers and timeout retain evidence                          |
| Privacy/bounds             | Control bodies/headers hidden; credentials and partial known prefixes redacted; UTF-8 snippet stays at most 512 bytes                                          |
| Cleanup                    | Earlier append-only receipts survive failed cleanup and final-write errors; failed-unknown state cannot become complete                                        |
| Frozen handler integration | Original comparable snapshot/query handler preserves distinct legitimate duplicate IDs, records rollback, has no D1 fallback and stops after protocol overflow |

## Review result and remaining gate

The local dispatch/evidence repair is complete and ready for review. The full diff below is limited to the new harness and its tests. Existing publisher/read SQL, candidate rows, manifest, credentials and grants remain unchanged. The earlier diagnostic's loss of HTTP outcome is fixed prospectively, not reconstructed retrospectively.

A candidate-only remote retry remains **NOT RUN** and requires fresh approval after reviewing the shared-authority wiring and resource admission. Serving-role write rejection, the actual 60-second server cancellation, candidate comparable results, complete measured wire traffic and provider billing still need remote evidence. The old permission and terminal receipt cannot be reused. Production migration and scheduling remain outside this repair.

The machine-readable receipt and unified diff follow for review.

## Machine-readable receipt

```json
{
  "scope": "ACCEPTED LOCAL HARNESS REPAIR SNAPSHOT \u2014 corrected log timezone; predates separately authorized remote shared-counter integration",
  "capturedAtUTC": "2026-10-05T11:46:39.490772+00:00",
  "git": {
    "branch": "feat/d1-free-incremental-refresh",
    "HEAD": "482be1eba9ff2091c1580f5757d7b33e20b26515",
    "workingTreeWasAlreadyDirty": true,
    "uncommittedWorkPreserved": true,
    "statusAfterCodeValidation": " M .gitignore\n M README.md\n M cloudflare-env.d.ts\n M docs/d1-free-sustainability.md\n M package.json\n M pnpm-lock.yaml\n M scripts/lib/sync/fetchers.ts\n M scripts/lib/sync/source-version.ts\n M scripts/sync-data.ts\n M tests/unit/fetchers.test.ts\n M tests/unit/source-version.test.ts\n M worker/index.ts\n M worker/og.ts\n?? .github/workflows/refresh-neon.yml\n?? docs/evidence/neon-benchmark-2026-10-04.json\n?? docs/evidence/neon-cache-only-stage-2026-10-04.json\n?? docs/evidence/neon-comparable-candidate-pilot-2026-10-05.json\n?? docs/evidence/neon-comparable-local-2026-10-05.json\n?? docs/evidence/neon-comparable-pilot-diagnostic-2026-10-05.json\n?? docs/evidence/neon-comparable-pilot-repair-2026-10-05.json\n?? docs/evidence/neon-comparable-pilot-repair-2026-10-05.patch\n?? docs/evidence/neon-console-usage-2026-10-04.json\n?? docs/evidence/neon-context-provenance-forecast-2026-10-04.json\n?? docs/evidence/neon-cow-candidate-2026-10-05.json\n?? docs/evidence/neon-genuine-after-state-2026-10-04.json\n?? docs/evidence/neon-genuine-refresh-2026-10-04.json\n?? docs/evidence/neon-manual-cache-before-2026-10-04.json\n?? docs/evidence/neon-manual-recovery-2026-10-04.json\n?? docs/evidence/neon-manual-refresh-observability-2026-10-04.json\n?? docs/evidence/neon-manual-run-summary-2026-10-04.json\n?? docs/evidence/neon-materialized-detail-local-2026-10-04.json\n?? docs/evidence/neon-monthly-refresh-budget-2026-10-04.json\n?? docs/evidence/neon-monthly-refresh-policy-2026-10-04.patch\n?? docs/evidence/neon-official-context-capture-2026-10-04.json\n?? docs/evidence/neon-pg18-formal-verification-2026-10-04.json\n?? docs/evidence/neon-portability-proof-2026-10-05.json\n?? docs/evidence/neon-production-cutover-config-2026-10-05.patch\n?? docs/evidence/neon-production-cutover-plan-2026-10-05.json\n?? docs/evidence/neon-reconciliation-approval-2026-10-04.json\n?? docs/evidence/neon-reconciliation-policy-analysis-2026-10-04.json\n?? docs/evidence/neon-reconciliation-review-2026-10-04.json\n?? docs/evidence/neon-runtime-aggregate-bound-2026-10-05.json\n?? docs/evidence/neon-runtime-read-replay-2026-10-05.json\n?? docs/evidence/neon-source-discrepancy-2026-10-04.json\n?? docs/evidence/neon-source-offline-capture-2026-10-04.json\n?? docs/evidence/neon-staged-execution-2026-10-04.json\n?? docs/evidence/neon-staged-publication-proposal-2026-10-04.json\n?? docs/evidence/neon-staged-remote-admission-2026-10-04.json\n?? docs/evidence/neon-storage-proof-2026-10-04.json\n?? docs/neon-benchmark-2026-10-04.md\n?? docs/neon-manual-publication-2026-10-04.md\n?? docs/neon-monthly-refresh-policy.md\n?? docs/neon-reconciliation-proposal-2026-10-04.md\n?? docs/proposals/\n?? neon.ts\n?? scripts/lib/sync/neon-reconciliation.ts\n?? scripts/lib/sync/neon-usage.ts\n?? scripts/lib/sync/neon.ts\n?? scripts/lib/sync/refresh-policy.ts\n?? scripts/neon-benchmark/\n?? scripts/report-neon-refresh-budget.ts\n?? scripts/restore-neon-benchmark.ts\n?? scripts/sync-neon.ts\n?? tests/fixtures/neon-pilot.ts\n?? tests/neon-benchmark.test.ts\n?? tests/unit/neon-cache-only-context.test.ts\n?? tests/unit/neon-comparable-read.test.ts\n?? tests/unit/neon-context-forecast.test.ts\n?? tests/unit/neon-materialized-details.test.ts\n?? tests/unit/neon-pilot-accounting.test.ts\n?? tests/unit/neon-pilot-controller.test.ts\n?? tests/unit/neon-pilot-evidence.test.ts\n?? tests/unit/neon-pilot-worker.test.ts\n?? tests/unit/neon-public-routing.test.ts\n?? tests/unit/neon-reconciliation.test.ts\n?? tests/unit/neon-refresh.test.ts\n?? tests/unit/neon-runtime-read.test.ts\n?? tests/unit/neon-stage-artifacts.test.ts\n?? tests/unit/neon-staged-plan.test.ts\n?? tests/unit/neon-staged-publisher.test.ts\n?? tests/unit/neon-transport.test.ts\n?? tests/unit/refresh-policy.test.ts\n?? tests/unit/source-diagnostic.test.ts\n?? worker/neon-public-read-sql.ts\n?? worker/neon-read-db.ts\n?? worker/neon-transport.ts\n?? worker/public-read-backend.ts\n"
  },
  "countingScope": {
    "hardProspectiveApplicationStatementPermits": 90,
    "includes": [
      "owner/setup application SQL",
      "BEGIN",
      "COMMIT",
      "ROLLBACK",
      "application SET",
      "diagnostic SELECT",
      "failed driver attempts",
      "ambiguous committed permits"
    ],
    "providerInternalSQL": "Separate observational evidence; UNKNOWN when not captured; no authorization/refund effect",
    "allServer90StatementCeilingClaimed": false,
    "durableStoreRequired": "ONE shared transaction authority/RPC identity for controller and ALL Worker instances; commit before resolve; no per-isolate fallback"
  },
  "limits": {
    "applicationStatements": 90,
    "cleanupStatementReserve": 10,
    "comparablePOSTs": 10,
    "receivedDatabaseBytes": 25000000,
    "sentDatabaseBytes": 1000000,
    "applicationConnections": 13,
    "concurrentRequests": 1,
    "serverStatementTimeoutMs": 60000,
    "activeWallMs": 300000,
    "cleanupWallReserveMs": 45000,
    "computeCUHoursProxy": 0.35,
    "maximumCU": 1,
    "hyperdriveOriginConnections": 5,
    "hyperdriveTailMs": 600000,
    "neonTailMs": 300000
  },
  "tests": {
    "targeted": {
      "command": "vp run test neon-pilot",
      "testsPassed": 43,
      "filesPassed": 4
    },
    "fullGate": {
      "command": "vp run check",
      "exitCode": 0,
      "testsPassed": 2105,
      "filesPassed": 205,
      "vitestDurationSeconds": 18.81,
      "format": "PASS",
      "lint": "PASS (18 pre-existing no-base-to-string warnings)",
      "typecheck": "PASS",
      "boundaries": "PASS",
      "build": "PASS",
      "bundle": "PASS",
      "sandboxNote": "First build attempt blocked at tsx local IPC EPERM; complete prescribed gate passed with reviewed local IPC permission",
      "logSHA256": "31f74e3a6affa60a42587a2752ea46f9c15fa845dad7defc4bcd35ec79d22912",
      "lintWarningCount": 18,
      "startedAtUTC": "2026-10-05T11:44:48Z",
      "timestampEvidence": {
        "rawVitestStart": "2026-10-05 19:44:48",
        "rawLogTimezone": "Asia/Singapore",
        "offset": "+08:00",
        "correctedUTC": "2026-10-05T11:44:48Z",
        "checkLogMtimeUTC": "2026-10-05T11:45:10.808636+00:00",
        "verification": "Node Intl default Asia/Singapore; macOS date offset +0800; log mtime and 18.81-second test duration agree. Original incorrectly appended Z to local test time."
      }
    },
    "actualRemoteDriverUsed": false
  },
  "filesAddedThisRepair": {
    "scripts/neon-benchmark/pilot/accounting.ts": "74f12ac5a0fb76f5f4fc534e7ba758dd5d6a8d370c7927c3ba8a4f94ad1da590",
    "scripts/neon-benchmark/pilot/controller.ts": "e1e0106436202f70ad2d57820347c7b707e5caef2636de6df382e13284c5921d",
    "scripts/neon-benchmark/pilot/dispatch.ts": "6bffda2a2e17eb0232a5a8394e6b9c0df19666504696ba16bd4763cc16b4227a",
    "scripts/neon-benchmark/pilot/evidence.ts": "79ad33576a7340ae6e2ccc6b468e5d73682cf20d75bfd2bd0b46126da6fd3e9a",
    "scripts/neon-benchmark/pilot/node-journal.ts": "b08eb69917d35f5fd158c001a582cd0d8c7573dd9533c602def8e62123c3076c",
    "scripts/neon-benchmark/pilot/node-store.ts": "9919af9780102f65fd12c0cd0f9b35b67fbe9d336b8f60b157455bb252dada39",
    "scripts/neon-benchmark/pilot/pg-instrumentation.ts": "ce664dd60b8a840538fd6aebf0204eb458b89fbae26d55031863a3f698197b44",
    "scripts/neon-benchmark/pilot/transactional-store.ts": "271fbde5909baccd361e4a466b3010a281390f9cf76c73ff313f640bf3036d9b",
    "scripts/neon-benchmark/pilot/worker.ts": "816310f0b4f079540a97f4fcec19cd94ab7ba5f68657822a21a99e515fc923c4",
    "tests/fixtures/neon-pilot.ts": "36fd7db9a76f5a936b89711aa0365a59268dbfa11b751a3933cfac5c3ace74cb",
    "tests/unit/neon-pilot-accounting.test.ts": "5422ddb3af9bfdc3d91fd791138f9c9ba8bd3b6d23571d530de1df5058f49b13",
    "tests/unit/neon-pilot-controller.test.ts": "a73e190f0b077d2d3432297350ceb47321f638d9db734e8fc09f580ec0aaca11",
    "tests/unit/neon-pilot-evidence.test.ts": "7887f25e9bb1b388af1e85462ed732c9fa314a67a7cda01439ad5ab91b162e13",
    "tests/unit/neon-pilot-worker.test.ts": "a62e5eb9f69961c7596027609b8c56e1b7653bf6c818844cd689840e2cc9f545"
  },
  "frozenVerification": {
    "frozenFiles": {
      "scripts/neon-benchmark/materialized-details.ts": {
        "expected": "0989dc960c0063d3aa6de3a758db187e7beb10e9911cc1c222425f0044f89025",
        "actual": "0989dc960c0063d3aa6de3a758db187e7beb10e9911cc1c222425f0044f89025",
        "match": true
      },
      "scripts/neon-benchmark/staged-plan.ts": {
        "expected": "d0280b4e4f6538bd9b9a67e1c63e17fd29c3d60400b4733a4d04a19a715bdbd0",
        "actual": "d0280b4e4f6538bd9b9a67e1c63e17fd29c3d60400b4733a4d04a19a715bdbd0",
        "match": true
      },
      "scripts/neon-benchmark/staged-execution.ts": {
        "expected": "a20c3e7030660b6d6ab0260412b536e03b9f62e785bded24091183fbf37bfef0",
        "actual": "a20c3e7030660b6d6ab0260412b536e03b9f62e785bded24091183fbf37bfef0",
        "match": true
      },
      "scripts/neon-benchmark/staged-validation.ts": {
        "expected": "78c106a34b2dd79e0f7d9ad16f8c771ba34bbe89463d3812d28b9297cacdf5a8",
        "actual": "78c106a34b2dd79e0f7d9ad16f8c771ba34bbe89463d3812d28b9297cacdf5a8",
        "match": true
      },
      "scripts/neon-benchmark/staged-publisher.ts": {
        "expected": "39301b135ca6e4cfad7249bd271c5f62c31ea1571d221fa649d0ed672d61d586",
        "actual": "39301b135ca6e4cfad7249bd271c5f62c31ea1571d221fa649d0ed672d61d586",
        "match": true
      },
      "scripts/neon-benchmark/local-pg18.mts": {
        "expected": "0d33cde83a745bfffe106bde966f1e09615130dd7dbc638f7de872f6c28c981e",
        "actual": "0d33cde83a745bfffe106bde966f1e09615130dd7dbc638f7de872f6c28c981e",
        "match": true
      },
      "scripts/neon-benchmark/verify-pg18.mts": {
        "expected": "6a1a5d2224e797cf525360486caf4d5677ea710add86e45bf49c9fa6ecc1828e",
        "actual": "6a1a5d2224e797cf525360486caf4d5677ea710add86e45bf49c9fa6ecc1828e",
        "match": true
      },
      "scripts/neon-benchmark/verify-pg18-edges.mts": {
        "expected": "2f1cb6ac1253f9365a84809c53c27322dc1b18e7f68dd8d29acb190564732630",
        "actual": "2f1cb6ac1253f9365a84809c53c27322dc1b18e7f68dd8d29acb190564732630",
        "match": true
      },
      "scripts/neon-benchmark/verify-materialized-local.mts": {
        "expected": "e90faa58efbbb101b2fd60b67c80ea8677bfb1cacadf1b9bdf9ec0bfa3f97d67",
        "actual": "e90faa58efbbb101b2fd60b67c80ea8677bfb1cacadf1b9bdf9ec0bfa3f97d67",
        "match": true
      },
      "worker/neon-read-db.ts": {
        "expected": "f31704dc96c2ab0a2b552806e1ac574f02d21263f31fd5efd3d625bbe131601c",
        "actual": "f31704dc96c2ab0a2b552806e1ac574f02d21263f31fd5efd3d625bbe131601c",
        "match": true
      },
      "worker/neon-transport.ts": {
        "expected": "d353851961910986fcad1e78d4139c64517188a0986b3fa11ea051caf85889f8",
        "actual": "d353851961910986fcad1e78d4139c64517188a0986b3fa11ea051caf85889f8",
        "match": true
      },
      "worker/public-read-backend.ts": {
        "expected": "6a09d438a5be715a70caf5ed350e354ee9bf50c2a0b57d2efc4f46bb83d9f3c8",
        "actual": "6a09d438a5be715a70caf5ed350e354ee9bf50c2a0b57d2efc4f46bb83d9f3c8",
        "match": true
      },
      "worker/neon-public-read-sql.ts": {
        "expected": "bd9eb6651a19e6d6d45426a0f58e14113138d99363b580eeceb269d7305c154e",
        "actual": "bd9eb6651a19e6d6d45426a0f58e14113138d99363b580eeceb269d7305c154e",
        "match": true
      },
      "worker/index.ts": {
        "expected": "2268c5a0b2bf7e99b94115d05a6e6e4a77acd7eabbdf65869f0ca622d651a8ff",
        "actual": "2268c5a0b2bf7e99b94115d05a6e6e4a77acd7eabbdf65869f0ca622d651a8ff",
        "match": true
      },
      "worker/og.ts": {
        "expected": "b402ebe23cb3477d1d9792dd9610e2283b0fafb1794f6cda0e59d9200316da83",
        "actual": "b402ebe23cb3477d1d9792dd9610e2283b0fafb1794f6cda0e59d9200316da83",
        "match": true
      },
      "cloudflare-env.d.ts": {
        "expected": "121a83543641ecbeb86efa25969a8c178d0876f8ef78e5f436bb18fd86a2317a",
        "actual": "121a83543641ecbeb86efa25969a8c178d0876f8ef78e5f436bb18fd86a2317a",
        "match": true
      },
      "tests/unit/neon-comparable-read.test.ts": {
        "expected": "484fd52a06c63f176d4d3d9805e28798ab63b163988e757cc0e337e0a2d856cd",
        "actual": "484fd52a06c63f176d4d3d9805e28798ab63b163988e757cc0e337e0a2d856cd",
        "match": true
      },
      "tests/unit/neon-transport.test.ts": {
        "expected": "4c4b710dd4cb289109d7eeaafa89e9356d5696d95564593aecda52cb556e05d8",
        "actual": "4c4b710dd4cb289109d7eeaafa89e9356d5696d95564593aecda52cb556e05d8",
        "match": true
      },
      "tests/unit/neon-public-routing.test.ts": {
        "expected": "6f414ae8d99e0a4232707d2b9298eabec0e82788193fb1870423cf52ebb0ffb8",
        "actual": "6f414ae8d99e0a4232707d2b9298eabec0e82788193fb1870423cf52ebb0ffb8",
        "match": true
      }
    },
    "diagnosticSQL": {
      "PILOT_SERVER_STATS_SQL": {
        "match": true,
        "SHA256": "3963e8ba203f172627b08a61f420bf0c4f8ab52b785ec6dc0b02ecc3f032eb95"
      },
      "PILOT_SETTINGS_SQL": {
        "match": true,
        "SHA256": "6cb3cd6962764312924103a2367c607b0126afc7490df22c8198a95d2e53b619"
      }
    },
    "allMatch": true
  },
  "historicalEvidenceSHA256": {
    ".neon-benchmark/comparable-candidate-pilot/execute.mts": "f328b4b6c8863e2598b9a840ab8384cc74c2cb88500edb696841dedd2799b163",
    ".neon-benchmark/comparable-candidate-pilot/worker.mts": "0c781b7adb09565d49bd1c56104ae547afce4b3317ce41fbca5d8863f095c6dd",
    ".neon-benchmark/comparable-candidate-pilot/lifecycle.json": "c66cbb7d662cd0320a9796b51509cc41ba559606fedfd8fe2731f528dbf134f8",
    "docs/evidence/neon-comparable-candidate-pilot-2026-10-05.json": "80cd38d645572e123c93f163ab7a120897895abed2738e8e62a62d648aaba794",
    "docs/evidence/neon-comparable-pilot-diagnostic-2026-10-05.json": "f067b7ab5dff8a228dafbe22d086ed18b05a6c0ac57698c6e960288a2ff3f484",
    "docs/proposals/neon-comparable-pilot-diagnostic-2026-10-05.md": "7a699b7af63e528bfa5fd0ae276f611d406b0b2c0bec06674d17ca8366d7494e"
  },
  "remoteActionsThisRepair": {
    "NeonSQL": 0,
    "CloudflareNeonProviderAPI": 0,
    "databaseCredentialChanges": 0,
    "roleOrGrantChanges": 0,
    "workerDeployments": 0,
    "hyperdriveCreates": 0,
    "remoteRetries": 0,
    "productionMutations": 0,
    "gitCommitsPushPRMerge": 0,
    "scheduleChanges": 0
  },
  "remoteStatus": "NOT RUN \u2014 fresh approval and reviewed wiring required before any candidate-only retry",
  "remainingUnknowns": [
    "Actual provider-internal statements including failures/nested/reset counters",
    "Hyperdrive-origin wire bytes and full provider egress billing",
    "Provider billed compute and idle tails",
    "Actual Cloudflare RPC/durable authority wiring (not deployed or provisioned)",
    "Serving-role rejection and server timeout proof from the failed pilot",
    "Candidate comparable remote semantics under the repaired harness"
  ],
  "limitations": [
    "A committed permit may be charged before driver send if the process crashes; never refund it",
    "Fsync append/atomic rename preserve prior receipts, but disk/process loss cannot create missing outcomes",
    "Received stream chunks may cross a byte threshold before destruction; reservations are admission bounds, not a physical all-network cap",
    "Injected HTTP transports must forward AbortSignal; cancellation cannot prove termination of already-accepted server work",
    "0.35 CU-hour bound is the unchanged admission policy proxy, not a billing receipt"
  ],
  "originalFailedPilotVerification": {
    ".neon-benchmark/comparable-candidate-pilot/lifecycle.json": {
      "expected": "c66cbb7d662cd0320a9796b51509cc41ba559606fedfd8fe2731f528dbf134f8",
      "actual": "c66cbb7d662cd0320a9796b51509cc41ba559606fedfd8fe2731f528dbf134f8",
      "match": true
    },
    ".neon-benchmark/comparable-candidate-pilot/execute.mts": {
      "expected": "f328b4b6c8863e2598b9a840ab8384cc74c2cb88500edb696841dedd2799b163",
      "actual": "f328b4b6c8863e2598b9a840ab8384cc74c2cb88500edb696841dedd2799b163",
      "match": true
    },
    ".neon-benchmark/comparable-candidate-pilot/worker.mts": {
      "expected": "0c781b7adb09565d49bd1c56104ae547afce4b3317ce41fbca5d8863f095c6dd",
      "actual": "0c781b7adb09565d49bd1c56104ae547afce4b3317ce41fbca5d8863f095c6dd",
      "match": true
    },
    ".neon-benchmark/comparable-candidate-pilot/deploy.log": {
      "expected": "2d86518815858971e4c0a56a323df150c840ab687f35693c6e1a2ccbf9768e8a",
      "actual": "2d86518815858971e4c0a56a323df150c840ab687f35693c6e1a2ccbf9768e8a",
      "match": true
    },
    ".neon-benchmark/comparable-candidate-pilot/deploy.stdout": {
      "expected": "d4566852360ce8f292240e26dbefd8ef51fb5ff6cc303bae962a1783edf5b64d",
      "actual": "d4566852360ce8f292240e26dbefd8ef51fb5ff6cc303bae962a1783edf5b64d",
      "match": true
    },
    "docs/evidence/neon-comparable-candidate-pilot-2026-10-05.json": {
      "expected": "80cd38d645572e123c93f163ab7a120897895abed2738e8e62a62d648aaba794",
      "actual": "80cd38d645572e123c93f163ab7a120897895abed2738e8e62a62d648aaba794",
      "match": true
    }
  },
  "originalFailedPilotUnchanged": true
}
```

## Local implementation diff

```diff
diff --git a/scripts/neon-benchmark/pilot/accounting.ts b/scripts/neon-benchmark/pilot/accounting.ts
new file mode 100644
index 000000000..50360860c
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/accounting.ts
@@ -0,0 +1,397 @@
+/** One shared, durable authority per pilot. Provider counters never authorize SQL. */
+export const PILOT_LIMITS = Object.freeze({
+  applicationStatements: 90,
+  cleanupStatementReserve: 10,
+  comparablePOSTs: 10,
+  receivedDatabaseBytes: 25_000_000,
+  sentDatabaseBytes: 1_000_000,
+  applicationConnections: 13,
+  concurrentRequests: 1,
+  statementTimeoutMs: 60_000,
+  activeWallMs: 300_000,
+  cleanupWallReserveMs: 45_000,
+  computeCUHoursProxy: 0.35,
+  maximumCU: 1,
+  hyperdriveOriginConnections: 5,
+  hyperdriveTailMs: 600_000,
+  neonTailMs: 300_000,
+});
+
+export type StatementPurpose = "work" | "cleanup";
+export type StatementIntent = {
+  requestId: string;
+  localSequence: number;
+  label: string;
+  sqlSHA256: string;
+  purpose: StatementPurpose;
+};
+export type StatementRecord = StatementIntent & {
+  id: string;
+  applicationSequence: number;
+  authorizedAtUTC: string;
+  completedAtUTC: string | null;
+  outcome: "authorized-unknown" | "succeeded" | "failed";
+  sqlstate: string | null;
+};
+export type RequestAdmission = {
+  id: string;
+  sequence: number;
+  method: "GET" | "POST";
+  maximumStatements: number;
+  maximumReceivedDatabaseBytes: number;
+  maximumSentDatabaseBytes: number;
+  maximumWallMs?: number;
+  purpose?: StatementPurpose;
+};
+export type RequestRecord = RequestAdmission & {
+  admittedAtUTC: string;
+  deadlineAtMs: number;
+  activated: boolean;
+  ended: boolean;
+  outcome: "admitted-unknown" | "complete" | "failed-unknown";
+  applicationStatements: number;
+};
+export type ServerObservation = {
+  phase: string;
+  observedAtUTC: string;
+  role: string;
+  databaseId: string | null;
+  calls: number | null;
+  sqlMs: number | null;
+  completeAttemptAccounting: false;
+};
+export type PilotState = {
+  runId: string;
+  startedAtUTC: string;
+  startedAtMs: number;
+  stopped: boolean;
+  applicationStatements: number;
+  comparablePOSTs: number;
+  connectionAdmissions: number;
+  receivedDatabaseBytesReserved: number;
+  sentDatabaseBytesReserved: number;
+  requests: RequestRecord[];
+  statements: StatementRecord[];
+  serverObservations: ServerObservation[];
+};
+
+/** Must serialize across ALL controllers/Worker instances and commit before resolving. */
+export type AtomicPilotStore = {
+  transact<T>(
+    change: (current: PilotState | null) => {
+      next: PilotState;
+      result: T;
+    },
+  ): Promise<T>;
+};
+export type PilotAuthority = Pick<
+  AtomicPilotAuthority,
+  | "initialize"
+  | "snapshot"
+  | "admitRequest"
+  | "activateRequest"
+  | "finishRequest"
+  | "authorizeStatement"
+  | "completeStatement"
+  | "observeServer"
+  | "stop"
+>;
+
+const safeId = /^[a-zA-Z0-9_-]{1,96}$/;
+function requireId(id: string) {
+  if (!safeId.test(id)) throw new Error("Invalid pilot attribution ID");
+}
+function positiveInteger(value: number) {
+  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid pilot allowance");
+}
+function validateState(state: PilotState) {
+  if (
+    typeof state.stopped !== "boolean" ||
+    !Number.isFinite(state.startedAtMs) ||
+    !Number.isSafeInteger(state.applicationStatements) ||
+    state.applicationStatements < 0 ||
+    state.applicationStatements > PILOT_LIMITS.applicationStatements ||
+    !Array.isArray(state.statements) ||
+    state.statements.length !== state.applicationStatements ||
+    !Array.isArray(state.requests) ||
+    state.requests.length > PILOT_LIMITS.applicationConnections ||
+    !Array.isArray(state.serverObservations) ||
+    state.statements.some((record, index) => record.applicationSequence !== index + 1) ||
+    new Set(state.statements.map((record) => record.id)).size !== state.statements.length ||
+    ![
+      state.comparablePOSTs,
+      state.connectionAdmissions,
+      state.receivedDatabaseBytesReserved,
+      state.sentDatabaseBytesReserved,
+    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
+    state.comparablePOSTs > PILOT_LIMITS.comparablePOSTs ||
+    state.connectionAdmissions !== state.requests.length ||
+    state.comparablePOSTs !==
+      state.requests.filter((request) => request.method === "POST").length ||
+    state.receivedDatabaseBytesReserved > PILOT_LIMITS.receivedDatabaseBytes ||
+    state.sentDatabaseBytesReserved > PILOT_LIMITS.sentDatabaseBytes ||
+    state.receivedDatabaseBytesReserved !==
+      state.requests.reduce((sum, request) => sum + request.maximumReceivedDatabaseBytes, 0) ||
+    state.sentDatabaseBytesReserved !==
+      state.requests.reduce((sum, request) => sum + request.maximumSentDatabaseBytes, 0) ||
+    state.requests.filter((request) => !request.ended).length > PILOT_LIMITS.concurrentRequests ||
+    new Set(state.requests.map((request) => request.id)).size !== state.requests.length ||
+    new Set(state.requests.map((request) => request.sequence)).size !== state.requests.length ||
+    state.requests.some(
+      (request) =>
+        !Number.isSafeInteger(request.applicationStatements) ||
+        request.applicationStatements < 0 ||
+        request.applicationStatements > request.maximumStatements ||
+        request.applicationStatements !==
+          state.statements.filter((statement) => statement.requestId === request.id).length,
+    )
+  )
+    throw new Error("Corrupt pilot authority fails closed");
+}
+
+export class AtomicPilotAuthority {
+  constructor(
+    private readonly store: AtomicPilotStore,
+    private readonly runId: string,
+    private readonly now: () => number = Date.now,
+  ) {
+    requireId(runId);
+  }
+
+  private update<T>(change: (state: PilotState) => T): Promise<T> {
+    return this.store.transact((current) => {
+      if (!current || current.runId !== this.runId) throw new Error("Pilot authority unavailable");
+      validateState(current);
+      const state = structuredClone(current);
+      const result = change(state);
+      validateState(state);
+      return { next: state, result };
+    });
+  }
+
+  private withinTime(state: PilotState, purpose: StatementPurpose) {
+    const elapsed = this.now() - state.startedAtMs;
+    const maximum =
+      purpose === "cleanup"
+        ? PILOT_LIMITS.activeWallMs
+        : PILOT_LIMITS.activeWallMs - PILOT_LIMITS.cleanupWallReserveMs;
+    if (
+      !Number.isFinite(elapsed) ||
+      elapsed < 0 ||
+      elapsed >= maximum ||
+      (state.stopped && purpose !== "cleanup")
+    )
+      throw new Error("Pilot stopped or duration allowance exhausted");
+  }
+
+  async initialize(): Promise<void> {
+    await this.store.transact((current) => {
+      if (current) throw new Error("Existing pilot authority cannot be reset");
+      const startedAtMs = this.now();
+      return {
+        next: {
+          runId: this.runId,
+          startedAtMs,
+          startedAtUTC: new Date(startedAtMs).toISOString(),
+          stopped: false,
+          applicationStatements: 0,
+          comparablePOSTs: 0,
+          connectionAdmissions: 0,
+          receivedDatabaseBytesReserved: 0,
+          sentDatabaseBytesReserved: 0,
+          requests: [],
+          statements: [],
+          serverObservations: [],
+        },
+        result: undefined,
+      };
+    });
+  }
+
+  snapshot(): Promise<PilotState> {
+    return this.update((state) => structuredClone(state));
+  }
+
+  admitRequest(admission: RequestAdmission): Promise<RequestRecord> {
+    requireId(admission.id);
+    if (
+      !["GET", "POST"].includes(admission.method) ||
+      (admission.purpose !== undefined && !["work", "cleanup"].includes(admission.purpose))
+    )
+      throw new Error("Invalid pilot request scope");
+    for (const value of [
+      admission.sequence,
+      admission.maximumStatements,
+      admission.maximumReceivedDatabaseBytes,
+      admission.maximumSentDatabaseBytes,
+    ])
+      positiveInteger(value);
+    return this.update((state) => {
+      const purpose = admission.purpose ?? "work";
+      this.withinTime(state, purpose);
+      const maximumWallMs =
+        admission.maximumWallMs ??
+        (admission.method === "POST" ? 35_000 : purpose === "cleanup" ? 10_000 : 85_000);
+      positiveInteger(maximumWallMs);
+      if (
+        maximumWallMs > 85_000 ||
+        this.now() + maximumWallMs >
+          state.startedAtMs +
+            PILOT_LIMITS.activeWallMs -
+            (purpose === "cleanup" ? 0 : PILOT_LIMITS.cleanupWallReserveMs)
+      )
+        throw new Error("Pilot duration reservation exhausted before dispatch");
+      if (
+        state.requests.length >= 64 ||
+        state.requests.some((request) => request.id === admission.id || !request.ended) ||
+        state.requests.some((request) => request.sequence === admission.sequence) ||
+        state.applicationStatements +
+          admission.maximumStatements +
+          (purpose === "cleanup" ? 0 : PILOT_LIMITS.cleanupStatementReserve) >
+          PILOT_LIMITS.applicationStatements ||
+        state.connectionAdmissions >= PILOT_LIMITS.applicationConnections ||
+        state.receivedDatabaseBytesReserved + admission.maximumReceivedDatabaseBytes >
+          PILOT_LIMITS.receivedDatabaseBytes ||
+        state.sentDatabaseBytesReserved + admission.maximumSentDatabaseBytes >
+          PILOT_LIMITS.sentDatabaseBytes ||
+        (admission.method === "POST" && state.comparablePOSTs >= PILOT_LIMITS.comparablePOSTs)
+      )
+        throw new Error("Pilot request admission refused before dispatch");
+      if (admission.method === "POST") state.comparablePOSTs++;
+      state.connectionAdmissions++;
+      // No refunds: a lost outcome retains its entire protocol-transfer/connection reservation.
+      state.receivedDatabaseBytesReserved += admission.maximumReceivedDatabaseBytes;
+      state.sentDatabaseBytesReserved += admission.maximumSentDatabaseBytes;
+      const record: RequestRecord = {
+        id: admission.id,
+        sequence: admission.sequence,
+        method: admission.method,
+        maximumStatements: admission.maximumStatements,
+        maximumReceivedDatabaseBytes: admission.maximumReceivedDatabaseBytes,
+        maximumSentDatabaseBytes: admission.maximumSentDatabaseBytes,
+        maximumWallMs,
+        deadlineAtMs: this.now() + maximumWallMs,
+        purpose,
+        admittedAtUTC: new Date(this.now()).toISOString(),
+        activated: false,
+        ended: false,
+        outcome: "admitted-unknown",
+        applicationStatements: 0,
+      };
+      state.requests.push(record);
+      return structuredClone(record);
+    });
+  }
+
+  /** A shared durable activation prevents replay, including another Worker instance. */
+  activateRequest(id: string): Promise<void> {
+    return this.update((state) => {
+      const request = state.requests.find((entry) => entry.id === id);
+      this.withinTime(state, request?.purpose ?? "work");
+      if (!request || request.activated || request.ended || this.now() >= request.deadlineAtMs)
+        throw new Error("Unadmitted or replayed pilot request");
+      request.activated = true;
+    });
+  }
+
+  finishRequest(id: string, outcome: "complete" | "failed-unknown"): Promise<void> {
+    return this.update((state) => {
+      const request = state.requests.find((entry) => entry.id === id);
+      if (!request) throw new Error("Unknown pilot request");
+      request.ended = true;
+      // Cleanup or a late successful response cannot erase an earlier unknown failure.
+      if (request.outcome !== "failed-unknown") request.outcome = outcome;
+      if (outcome === "failed-unknown") state.stopped = true;
+    });
+  }
+
+  authorizeStatement(intent: StatementIntent): Promise<StatementRecord> {
+    requireId(intent.requestId);
+    requireId(intent.label);
+    positiveInteger(intent.localSequence);
+    if (!["work", "cleanup"].includes(intent.purpose)) throw new Error("Invalid statement scope");
+    if (!/^[a-f0-9]{64}$/.test(intent.sqlSHA256)) throw new Error("Invalid SQL fingerprint");
+    return this.update((state) => {
+      this.withinTime(state, intent.purpose);
+      const id = `${intent.requestId}:s${intent.localSequence}`;
+      const request = state.requests.find((entry) => entry.id === intent.requestId);
+      const maximum =
+        intent.purpose === "cleanup"
+          ? PILOT_LIMITS.applicationStatements
+          : PILOT_LIMITS.applicationStatements - PILOT_LIMITS.cleanupStatementReserve;
+      if (
+        state.statements.some((entry) => entry.id === id) ||
+        state.applicationStatements >= maximum ||
+        !request?.activated ||
+        (intent.purpose !== "cleanup" && this.now() >= request.deadlineAtMs) ||
+        (request.ended && intent.purpose !== "cleanup") ||
+        request.applicationStatements >= request.maximumStatements
+      )
+        throw new Error("Application statement refused before dispatch");
+      state.applicationStatements++;
+      request.applicationStatements++;
+      const record: StatementRecord = {
+        requestId: intent.requestId,
+        localSequence: intent.localSequence,
+        label: intent.label,
+        sqlSHA256: intent.sqlSHA256,
+        purpose: intent.purpose,
+        id,
+        applicationSequence: state.applicationStatements,
+        authorizedAtUTC: new Date(this.now()).toISOString(),
+        completedAtUTC: null,
+        outcome: "authorized-unknown",
+        sqlstate: null,
+      };
+      state.statements.push(record);
+      return structuredClone(record);
+    });
+  }
+
+  completeStatement(
+    id: string,
+    outcome: "succeeded" | "failed",
+    sqlstate: string | null,
+  ): Promise<void> {
+    return this.update((state) => {
+      const record = state.statements.find((entry) => entry.id === id);
+      if (!record || record.outcome !== "authorized-unknown")
+        throw new Error("Statement outcome cannot be overwritten");
+      record.outcome = outcome;
+      record.sqlstate = sqlstate && /^[0-9A-Z]{5}$/.test(sqlstate) ? sqlstate : null;
+      record.completedAtUTC = new Date(this.now()).toISOString();
+    });
+  }
+
+  observeServer(observation: ServerObservation): Promise<void> {
+    requireId(observation.phase);
+    if (
+      typeof observation.observedAtUTC !== "string" ||
+      observation.observedAtUTC.length > 40 ||
+      !["hdb_benchmark_runtime", "neondb_owner"].includes(observation.role) ||
+      (observation.databaseId !== null && !/^\d+$/.test(observation.databaseId)) ||
+      [observation.calls, observation.sqlMs].some(
+        (value) => value !== null && (!Number.isFinite(value) || value < 0),
+      )
+    )
+      throw new Error("Invalid bounded server observation");
+    return this.update((state) => {
+      if (state.serverObservations.length >= 32) throw new Error("Server observation cap");
+      state.serverObservations.push({
+        phase: observation.phase,
+        observedAtUTC: observation.observedAtUTC,
+        role: observation.role,
+        databaseId: observation.databaseId,
+        calls: observation.calls,
+        sqlMs: observation.sqlMs,
+        completeAttemptAccounting: false,
+      });
+    });
+  }
+
+  stop(): Promise<void> {
+    return this.update((state) => {
+      state.stopped = true;
+    });
+  }
+}
diff --git a/scripts/neon-benchmark/pilot/controller.ts b/scripts/neon-benchmark/pilot/controller.ts
new file mode 100644
index 000000000..ac3e58c3a
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/controller.ts
@@ -0,0 +1,127 @@
+import type {
+  PilotAuthority,
+  RequestAdmission,
+  ServerObservation,
+  StatementPurpose,
+} from "./accounting";
+import {
+  capturePilotHttp,
+  PilotAdmissionError,
+  type HttpCaptureOptions,
+  type ReceiptJournal,
+} from "./evidence";
+import { createStatementDispatcher } from "./dispatch";
+
+export type PilotRequest<T> = RequestAdmission & {
+  label: string;
+  fetchResponse: HttpCaptureOptions<T>["fetchResponse"];
+  parse: HttpCaptureOptions<T>["parse"];
+  requestBodyBytes?: number;
+  secrets?: readonly string[];
+  capturePublicSyntheticSnippet?: boolean;
+  measurement?: HttpCaptureOptions<T>["measurement"];
+  signal?: AbortSignal;
+};
+
+/** Dependency-injected only: importing this local review module starts no remote action. */
+export class PilotController {
+  constructor(
+    readonly authority: PilotAuthority,
+    private readonly journal: ReceiptJournal,
+  ) {}
+
+  /** Every control-plane HTTP attempt uses this recorder; bodies remain hidden by default.
+   * No SQL/POST/connection allowance is allocated for provider create/delete requests here.
+   * Importing this method grants no permission or credentials for those actions.
+   */
+  controlRequest<T>(input: Omit<HttpCaptureOptions<T>, "authority" | "journal">): Promise<T> {
+    return capturePilotHttp({
+      ...input,
+      authority: this.authority,
+      journal: this.journal,
+      onFailure: async () => {
+        try {
+          await this.authority.stop();
+        } finally {
+          await input.onFailure?.();
+        }
+      },
+    });
+  }
+
+  async request<T>(input: PilotRequest<T>): Promise<T> {
+    try {
+      return await capturePilotHttp({
+        ...input,
+        timeoutMs:
+          input.maximumWallMs ??
+          (input.method === "POST" ? 35_000 : input.purpose === "cleanup" ? 10_000 : 85_000),
+        fetchResponse: async (signal) => {
+          try {
+            await this.authority.admitRequest(input);
+          } catch {
+            throw new PilotAdmissionError();
+          }
+          signal.throwIfAborted();
+          return input.fetchResponse(signal);
+        },
+        authority: this.authority,
+        journal: this.journal,
+        onFailure: async () => {
+          try {
+            await this.authority.stop();
+          } finally {
+            await this.authority.finishRequest(input.id, "failed-unknown");
+          }
+        },
+      });
+    } finally {
+      // Preserve an earlier unknown outcome even if cleanup or a late response succeeds.
+      await this.authority.finishRequest(input.id, "complete").catch(() => undefined);
+    }
+  }
+
+  /** Owner/setup/final diagnostics use the SAME authority; not an extra 90-command pool. */
+  async ownerStatements<T>(
+    admission: RequestAdmission,
+    action: (dispatch: ReturnType<typeof createStatementDispatcher>) => Promise<T>,
+    purpose: StatementPurpose = "work",
+  ): Promise<T> {
+    await this.authority.admitRequest({ ...admission, purpose });
+    await this.authority.activateRequest(admission.id);
+    const dispatch = createStatementDispatcher({
+      authority: this.authority,
+      requestId: admission.id,
+      defaultPurpose: purpose,
+    });
+    try {
+      return await action(dispatch);
+    } catch (error) {
+      await this.authority.finishRequest(admission.id, "failed-unknown");
+      throw error;
+    } finally {
+      await this.authority.finishRequest(admission.id, "complete");
+    }
+  }
+
+  /** Only an observation. This cannot increment, refund, reset or block the app SQL counter. */
+  observeServer(observation: ServerObservation): Promise<void> {
+    return this.authority.observeServer(observation);
+  }
+
+  /** Resource cleanup failures cannot discard HTTP or statement history. No cleanup I/O supplied. */
+  async cleanup(
+    actions: readonly (() => Promise<void>)[],
+  ): Promise<{ index: number; failed: true }[]> {
+    const failures: { index: number; failed: true }[] = [];
+    await this.authority.stop().catch(() => failures.push({ index: -1, failed: true }));
+    for (const [index, action] of actions.entries()) {
+      try {
+        await action();
+      } catch {
+        failures.push({ index, failed: true });
+      }
+    }
+    return failures;
+  }
+}
diff --git a/scripts/neon-benchmark/pilot/dispatch.ts b/scripts/neon-benchmark/pilot/dispatch.ts
new file mode 100644
index 000000000..05eea10b2
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/dispatch.ts
@@ -0,0 +1,76 @@
+import { createHash } from "node:crypto";
+import type { PilotAuthority, StatementPurpose, StatementRecord } from "./accounting";
+
+export type PilotQuery = <T>(sql: string, parameters: readonly unknown[]) => Promise<T>;
+export type DispatchContext = {
+  requestId: string;
+  authority: PilotAuthority;
+  defaultPurpose?: StatementPurpose;
+  cleanupFingerprints?: ReadonlySet<string>;
+};
+export class PilotDispatchError extends Error {
+  constructor(
+    readonly classification: "AUTHORIZATION" | "DATABASE" | "EVIDENCE",
+    readonly statementId: string | null,
+    readonly sqlstate: string | null = null,
+  ) {
+    super(`Pilot statement stopped: ${classification}`);
+  }
+}
+export const fingerprintSQL = (sql: string) => createHash("sha256").update(sql).digest("hex");
+
+/** Fixed pilot SQL is single-statement text; parameters are never logged or inspected. */
+export function requireSinglePilotStatement(sql: string): void {
+  // Fail closed rather than tokenize arbitrary SQL. All frozen pilot query shapes satisfy this.
+  if (!sql.trim() || sql.includes(";") || sql.includes("\0"))
+    throw new PilotDispatchError("AUTHORIZATION", null);
+}
+
+export function createStatementDispatcher(context: DispatchContext) {
+  let localSequence = 0;
+  return async function dispatch<T>(
+    sql: string,
+    parameters: readonly unknown[],
+    send: (sql: string, parameters: readonly unknown[]) => Promise<T>,
+  ): Promise<T> {
+    requireSinglePilotStatement(sql);
+    const sqlSHA256 = fingerprintSQL(sql);
+    const purpose =
+      /^(COMMIT|ROLLBACK)$/i.test(sql.trim()) || context.cleanupFingerprints?.has(sqlSHA256)
+        ? "cleanup"
+        : (context.defaultPurpose ?? "work");
+    let permit: StatementRecord;
+    try {
+      // Sequence allocated synchronously, then shared authority durably commits before send.
+      permit = await context.authority.authorizeStatement({
+        requestId: context.requestId,
+        localSequence: ++localSequence,
+        label: purpose === "cleanup" ? "finalization-or-diagnostic" : "application-query",
+        sqlSHA256,
+        purpose,
+      });
+    } catch {
+      throw new PilotDispatchError("AUTHORIZATION", null);
+    }
+    let outcome: "succeeded" | "failed" = "failed";
+    let sqlstate: string | null = null;
+    let result: T | undefined;
+    let databaseFailure: PilotDispatchError | undefined;
+    try {
+      result = await send(sql, parameters);
+      outcome = "succeeded";
+    } catch (error) {
+      if (error && typeof error === "object" && "code" in error && typeof error.code === "string")
+        sqlstate = /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null;
+      databaseFailure = new PilotDispatchError("DATABASE", permit.id, sqlstate);
+    }
+    try {
+      await context.authority.completeStatement(permit.id, outcome, sqlstate);
+    } catch {
+      // Never refund the committed permit or retry an ambiguously completed statement.
+      throw new PilotDispatchError("EVIDENCE", permit.id, sqlstate);
+    }
+    if (databaseFailure) throw databaseFailure;
+    return result as T;
+  };
+}
diff --git a/scripts/neon-benchmark/pilot/evidence.ts b/scripts/neon-benchmark/pilot/evidence.ts
new file mode 100644
index 000000000..3811fc15a
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/evidence.ts
@@ -0,0 +1,312 @@
+import { createHash } from "node:crypto";
+import type { PilotAuthority } from "./accounting";
+
+const SNIPPET_BYTES = 512;
+const MAXIMUM_HTTP_BYTES = 2_000_000;
+export type HttpFailureKind =
+  | "none"
+  | "transport"
+  | "admission"
+  | "timeout"
+  | "abort"
+  | "body-limit"
+  | "parse"
+  | "http-status"
+  | "evidence";
+export type HttpStage = "intent" | "transport" | "headers" | "body" | "parse" | "complete";
+export type HttpReceipt = {
+  id: string;
+  sequence: number;
+  method: "GET" | "POST" | "PUT" | "DELETE";
+  label: string;
+  startedAtUTC: string;
+  endedAtUTC: string | null;
+  stage: HttpStage;
+  responseAvailable: boolean;
+  status: number | null;
+  contentType: string | null;
+  applicationStatementsBefore: number | null;
+  applicationAccountingAvailableBefore: boolean;
+  applicationStatementsAfter: number | null;
+  applicationAccountingAvailableAfter: boolean;
+  requestBodyBytes: number;
+  responseBodyBytes: number;
+  responseSHA256: string | null;
+  bodySnippet: string;
+  failure: HttpFailureKind;
+  failureStage: HttpStage | null;
+  errorName: string | null;
+  protocolReceivedBytes: number | null;
+  protocolSentBytes: number | null;
+  providerObservationAvailable: boolean;
+  finalEvidenceWriteFailed: boolean;
+  transportCode: string | null;
+};
+
+export type ReceiptJournal = { persist(receipt: HttpReceipt): Promise<void> };
+export type HttpCaptureOptions<T> = {
+  id: string;
+  sequence: number;
+  method: HttpReceipt["method"];
+  label: string;
+  authority: PilotAuthority;
+  journal: ReceiptJournal;
+  /** Transport must forward this signal to fetch; no controller starts a background retry. */
+  fetchResponse: (signal: AbortSignal) => Promise<Response>;
+  signal?: AbortSignal;
+  timeoutMs?: number;
+  /** Actual HTTP bytes only; authentication headers and request payload are never persisted. */
+  requestBodyBytes?: number;
+  secrets?: readonly string[];
+  capturePublicSyntheticSnippet?: boolean;
+  parse: (body: string, response: Response) => T;
+  measurement?: (parsed: T) => {
+    protocolReceivedBytes: number | null;
+    protocolSentBytes: number | null;
+    providerObservationAvailable: boolean;
+  };
+  onFailure?: () => Promise<void>;
+  now?: () => number;
+};
+
+/** Conservative public-pilot preview. Control-plane/auth payloads must leave capture disabled. */
+export function sanitizePilotSnippet(value: string, secrets: readonly string[] = []): string {
+  let sanitized = value;
+  for (const secret of secrets)
+    if (secret) {
+      sanitized = sanitized.split(secret).join("[REDACTED]");
+      // A stream may abort in the middle of a credential. Redact known prefixes as well.
+      for (let length = secret.length - 1; length >= 3; length--)
+        sanitized = sanitized.split(secret.slice(0, length)).join("[REDACTED]");
+    }
+  sanitized = sanitized
+    .replace(
+      /(["']?(?:authorization|password|api[_-]?key|token|secret)["']?\s*[=:]\s*)(["'])(.*?)\2/gi,
+      '$1"[REDACTED]"',
+    )
+    .replace(
+      /["']?(?:authorization|password|api[_-]?key|token|secret)["']?\s*[=:]\s*["']?[^,}\n]*/gi,
+      "[REDACTED_CREDENTIAL]",
+    )
+    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_CONNECTION]")
+    .replace(
+      /(?:authorization|password|api[_-]?key|token|secret)\s*[=:]\s*["']?[^\s,}\n"']+/gi,
+      "[REDACTED_CREDENTIAL]",
+    )
+    .replace(/bearer\s+\S+/gi, "[REDACTED_AUTHORIZATION]")
+    .replace(/[A-Za-z0-9_-]{24,}(?:\.[A-Za-z0-9_-]+)*/g, "[REDACTED_OPAQUE_VALUE]");
+  let printable = "";
+  for (const character of sanitized) {
+    const code = character.charCodeAt(0);
+    if (code >= 32 || code === 9 || code === 10 || code === 13) printable += character;
+  }
+  // Stream decoding omits a partial trailing UTF-8 code point instead of expanding it.
+  return new TextDecoder().decode(new TextEncoder().encode(printable).slice(0, SNIPPET_BYTES), {
+    stream: true,
+  });
+}
+
+function failureKind(error: unknown, stage: HttpStage): HttpFailureKind {
+  if (error instanceof PilotAdmissionError) return "admission";
+  if (error instanceof PilotHttpError) return error.classification;
+  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
+  if (error instanceof Error && error.name === "AbortError") return "abort";
+  return stage === "parse" ? "parse" : "transport";
+}
+export class PilotAdmissionError extends Error {
+  constructor() {
+    super("Pilot request refused before dispatch");
+  }
+}
+
+export class PilotHttpError extends Error {
+  constructor(
+    readonly classification: HttpFailureKind,
+    readonly receipt: HttpReceipt,
+  ) {
+    super(`Pilot HTTP stopped: ${classification} at ${receipt.failureStage ?? receipt.stage}`);
+  }
+}
+
+export async function capturePilotHttp<T>(options: HttpCaptureOptions<T>): Promise<T> {
+  if (
+    !/^[A-Za-z0-9_-]{1,96}$/.test(options.id) ||
+    !/^[A-Za-z0-9_-]{1,96}$/.test(options.label) ||
+    !Number.isSafeInteger(options.sequence) ||
+    options.sequence < 1 ||
+    !["GET", "POST", "PUT", "DELETE"].includes(options.method) ||
+    !Number.isSafeInteger(options.requestBodyBytes ?? 0) ||
+    (options.requestBodyBytes ?? 0) < 0 ||
+    !Number.isSafeInteger(options.timeoutMs ?? 20_000) ||
+    (options.timeoutMs ?? 20_000) < 1 ||
+    (options.timeoutMs ?? 20_000) > 85_000
+  )
+    throw new Error("Invalid bounded HTTP attribution");
+  const now = options.now ?? Date.now;
+  const receipt: HttpReceipt = {
+    id: options.id,
+    sequence: options.sequence,
+    method: options.method,
+    label: options.label,
+    startedAtUTC: new Date(now()).toISOString(),
+    endedAtUTC: null,
+    stage: "intent",
+    responseAvailable: false,
+    status: null,
+    contentType: null,
+    applicationStatementsBefore: null,
+    applicationAccountingAvailableBefore: false,
+    applicationStatementsAfter: null,
+    applicationAccountingAvailableAfter: false,
+    requestBodyBytes: options.requestBodyBytes ?? 0,
+    responseBodyBytes: 0,
+    responseSHA256: null,
+    bodySnippet: "",
+    failure: "none",
+    failureStage: null,
+    errorName: null,
+    protocolReceivedBytes: null,
+    protocolSentBytes: null,
+    providerObservationAvailable: false,
+    finalEvidenceWriteFailed: false,
+    transportCode: null,
+  };
+  // If durable intent fails, fetch is never invoked. No response parsing precedes persistence.
+  const persist = async () => {
+    try {
+      await options.journal.persist(structuredClone(receipt));
+    } catch {
+      throw new PilotHttpError("evidence", receipt);
+    }
+  };
+  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
+  const digest = createHash("sha256");
+  let retained = "";
+  const decoder = new TextDecoder();
+  let result: { parsed: T } | undefined;
+  let failure: PilotHttpError | undefined;
+  let timer: ReturnType<typeof setTimeout> | undefined;
+  const abort = new AbortController();
+  const signal = options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal;
+  let rejectAbort: (reason: unknown) => void = () => {};
+  const aborted = new Promise<never>((_resolve, reject) => {
+    rejectAbort = reject;
+  });
+  // The cancellation race retains evidence even if a faulty injected transport ignores its signal.
+  const onAbort = () => rejectAbort(signal.reason);
+  signal.addEventListener("abort", onAbort, { once: true });
+  // Keep a handled rejection even if an already-aborted signal prevents transport entirely.
+  void aborted.catch(() => undefined);
+  try {
+    await persist();
+    try {
+      receipt.applicationStatementsBefore = (
+        await options.authority.snapshot()
+      ).applicationStatements;
+      receipt.applicationAccountingAvailableBefore = true;
+    } catch {
+      throw new PilotHttpError("evidence", receipt);
+    }
+    receipt.stage = "transport";
+    await persist();
+    timer = setTimeout(
+      () => abort.abort(new DOMException("Pilot HTTP deadline", "TimeoutError")),
+      options.timeoutMs ?? 20_000,
+    );
+    signal.throwIfAborted();
+    const response = await Promise.race([options.fetchResponse(signal), aborted]);
+    receipt.responseAvailable = true;
+    receipt.status = response.status;
+    const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
+    receipt.contentType = /^(application\/json|text\/plain|text\/html)$/i.test(mime) ? mime : null;
+    receipt.stage = "headers";
+    await persist();
+    receipt.stage = "body";
+    reader = response.body?.getReader();
+    if (reader) {
+      while (true) {
+        const chunk = await Promise.race([reader.read(), aborted]);
+        if (chunk.done) break;
+        receipt.responseBodyBytes += chunk.value.byteLength;
+        digest.update(chunk.value);
+        if (receipt.responseBodyBytes > MAXIMUM_HTTP_BYTES)
+          throw new PilotHttpError("body-limit", receipt);
+        retained += decoder.decode(chunk.value, { stream: true });
+        receipt.bodySnippet = options.capturePublicSyntheticSnippet
+          ? sanitizePilotSnippet(retained, options.secrets)
+          : "[BODY_CAPTURE_DISABLED]";
+        await persist();
+      }
+      retained += decoder.decode();
+    }
+    receipt.responseSHA256 = digest.digest("hex");
+    // This durable update precedes parsing even for non-JSON/non-success responses.
+    receipt.stage = "parse";
+    await persist();
+    if (!response.ok) throw new PilotHttpError("http-status", receipt);
+    const parsed = options.parse(retained, response);
+    if (options.measurement) {
+      const measurement = options.measurement(parsed);
+      for (const bytes of [measurement.protocolReceivedBytes, measurement.protocolSentBytes])
+        if (bytes !== null && (!Number.isSafeInteger(bytes) || bytes < 0))
+          throw new PilotHttpError("parse", receipt);
+      receipt.protocolReceivedBytes = measurement.protocolReceivedBytes;
+      receipt.protocolSentBytes = measurement.protocolSentBytes;
+      receipt.providerObservationAvailable = measurement.providerObservationAvailable === true;
+    }
+    receipt.stage = "complete";
+    result = { parsed };
+  } catch (error) {
+    receipt.failure = failureKind(error, receipt.stage);
+    receipt.failureStage = receipt.stage;
+    receipt.errorName =
+      error instanceof Error &&
+      ["AbortError", "TimeoutError", "SyntaxError", "TypeError"].includes(error.name)
+        ? error.name
+        : "PilotFailure";
+    const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
+    if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string")
+      receipt.transportCode = [
+        "ECONNRESET",
+        "ECONNREFUSED",
+        "ENOTFOUND",
+        "EAI_AGAIN",
+        "ETIMEDOUT",
+        "CERT_HAS_EXPIRED",
+      ].includes(cause.code)
+        ? cause.code
+        : null;
+    await options.onFailure?.().catch(() => undefined);
+    failure = new PilotHttpError(receipt.failure, receipt);
+  } finally {
+    if (timer) clearTimeout(timer);
+    signal.removeEventListener("abort", onAbort);
+    // Do not allow an unresponsive stream's cancellation to prevent durable final evidence.
+    void reader?.cancel().catch(() => undefined);
+    receipt.endedAtUTC = new Date(now()).toISOString();
+    try {
+      receipt.applicationStatementsAfter = (
+        await options.authority.snapshot()
+      ).applicationStatements;
+      receipt.applicationAccountingAvailableAfter = true;
+    } catch {
+      // Unknown is not zero. Prior committed SQL intents remain in the shared authority.
+      receipt.applicationStatementsAfter = null;
+      if (receipt.failure === "none") {
+        receipt.failure = "evidence";
+        receipt.failureStage = receipt.stage;
+      }
+      failure = new PilotHttpError("evidence", receipt);
+    }
+    try {
+      await options.journal.persist(structuredClone(receipt));
+    } catch {
+      receipt.finalEvidenceWriteFailed = true;
+      failure = new PilotHttpError("evidence", receipt);
+    }
+    if (failure) await options.onFailure?.().catch(() => undefined);
+  }
+  if (failure) throw failure;
+  if (!result) throw new PilotHttpError("evidence", receipt);
+  return result.parsed;
+}
diff --git a/scripts/neon-benchmark/pilot/node-journal.ts b/scripts/neon-benchmark/pilot/node-journal.ts
new file mode 100644
index 000000000..704f25c5b
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/node-journal.ts
@@ -0,0 +1,27 @@
+import { open } from "node:fs/promises";
+import { dirname } from "node:path";
+import type { HttpReceipt, ReceiptJournal } from "./evidence";
+
+/** Append-only, fsynced receipts. Cleanup has no API capable of clearing this history. */
+export class FileReceiptJournal implements ReceiptJournal {
+  constructor(private readonly path: string) {}
+
+  async persist(receipt: HttpReceipt): Promise<void> {
+    const bytes = new TextEncoder().encode(`${JSON.stringify(receipt)}\n`);
+    if (bytes.byteLength > 8192) throw new Error("Pilot receipt exceeds bounded journal record");
+    const output = await open(this.path, "a", 0o600);
+    try {
+      const written = await output.write(bytes);
+      if (written.bytesWritten !== bytes.byteLength) throw new Error("Incomplete receipt write");
+      await output.sync();
+    } finally {
+      await output.close();
+    }
+    const directory = await open(dirname(this.path), "r");
+    try {
+      await directory.sync();
+    } finally {
+      await directory.close();
+    }
+  }
+}
diff --git a/scripts/neon-benchmark/pilot/node-store.ts b/scripts/neon-benchmark/pilot/node-store.ts
new file mode 100644
index 000000000..676a3107c
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/node-store.ts
@@ -0,0 +1,60 @@
+import { open, readFile, rename, unlink } from "node:fs/promises";
+import { dirname } from "node:path";
+import type { AtomicPilotStore, PilotState } from "./accounting";
+
+/** Local review/reference authority. One lock also serializes different store instances/processes. */
+export class FilePilotStore implements AtomicPilotStore {
+  constructor(private readonly path: string) {}
+
+  async transact<T>(
+    change: (current: PilotState | null) => { next: PilotState; result: T },
+  ): Promise<T> {
+    const lockPath = `${this.path}.lock`;
+    let lock;
+    // Bounded local lock wait. A stale lock fails closed; it is never deleted as recovery.
+    for (let attempt = 0; attempt < 100; attempt++) {
+      try {
+        lock = await open(lockPath, "wx", 0o600);
+        break;
+      } catch (error) {
+        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
+          throw error;
+        await new Promise((resolve) => setTimeout(resolve, 5));
+      }
+    }
+    if (!lock) throw new Error("Pilot authority lock unavailable");
+    const temporary = `${this.path}.next`;
+    let ownedTemporary = false;
+    try {
+      let current: PilotState | null = null;
+      try {
+        current = JSON.parse(await readFile(this.path, "utf8")) as PilotState;
+      } catch (error) {
+        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
+          throw error;
+      }
+      const { next, result } = change(current);
+      const output = await open(temporary, "wx", 0o600);
+      ownedTemporary = true;
+      try {
+        await output.writeFile(JSON.stringify(next));
+        await output.sync();
+      } finally {
+        await output.close();
+      }
+      await rename(temporary, this.path);
+      const directory = await open(dirname(this.path), "r");
+      try {
+        await directory.sync();
+      } finally {
+        await directory.close();
+      }
+      return result;
+    } finally {
+      // Only remove this transaction's files. Existing receipts/counters are never cleared.
+      if (ownedTemporary) await unlink(temporary).catch(() => undefined);
+      await lock.close();
+      await unlink(lockPath);
+    }
+  }
+}
diff --git a/scripts/neon-benchmark/pilot/pg-instrumentation.ts b/scripts/neon-benchmark/pilot/pg-instrumentation.ts
new file mode 100644
index 000000000..e1fce5d62
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/pg-instrumentation.ts
@@ -0,0 +1,150 @@
+import { AsyncLocalStorage } from "node:async_hooks";
+import type pg from "pg";
+import type { DispatchContext } from "./dispatch";
+import { createStatementDispatcher, PilotDispatchError } from "./dispatch";
+
+type SocketMeter = {
+  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
+  bytesRead?: number;
+  bytesWritten?: number;
+  write?: (...arguments_: unknown[]) => unknown;
+  destroy(error?: Error): unknown;
+};
+export type PgPilotScope = DispatchContext & {
+  maximumReceivedDatabaseBytes: number;
+  maximumSentDatabaseBytes: number;
+  protocolReceivedBytes: number;
+  protocolSentBytes: number;
+  constructedClients: number;
+  protocolMeasurementComplete: boolean;
+  finalDiagnosticSQL?: string;
+  finalDiagnosticRow?: Record<string, unknown>;
+};
+type PgModule = { Client: typeof pg.Client };
+const installedModules = new WeakSet<PgModule>();
+
+/** Temporary harness only. AsyncLocalStorage replaces the former global `active` request. */
+export function installPilotPgInstrumentation(module: PgModule) {
+  if (installedModules.has(module)) throw new PilotDispatchError("AUTHORIZATION", null);
+  installedModules.add(module);
+  const OriginalClient = module.Client;
+  const scopes = new AsyncLocalStorage<PgPilotScope>();
+  class InstrumentedClient extends OriginalClient {
+    constructor(...configuration: ConstructorParameters<typeof pg.Client>) {
+      super(...configuration);
+      const scope = scopes.getStore();
+      if (!scope || ++scope.constructedClients > 1)
+        throw new PilotDispatchError("AUTHORIZATION", null);
+      const dispatch = createStatementDispatcher(scope);
+      const originalQuery = this.query.bind(this);
+      Object.defineProperty(this, "query", {
+        value: async (sql: unknown, parameters?: readonly unknown[]) => {
+          if (typeof sql !== "string" || (parameters !== undefined && !Array.isArray(parameters)))
+            throw new PilotDispatchError("AUTHORIZATION", null);
+          if (!scope.protocolMeasurementComplete) {
+            await scope.authority.stop();
+            throw new PilotDispatchError("EVIDENCE", null);
+          }
+          return dispatch(sql, parameters ?? [], (text, values) =>
+            originalQuery(text, [...values]),
+          );
+        },
+      });
+      const stream = (): SocketMeter | undefined =>
+        (this as pg.Client & { connection?: { stream?: SocketMeter } }).connection?.stream;
+      let observed: SocketMeter | undefined;
+      const observe = () => {
+        const current = stream();
+        if (!current) {
+          scope.protocolMeasurementComplete = false;
+          return;
+        }
+        if (current === observed) return;
+        observed = current;
+        if (typeof current.bytesRead !== "number" || typeof current.bytesWritten !== "number")
+          scope.protocolMeasurementComplete = false;
+        // Capture startup bytes where available; raw protocol payloads are never retained.
+        scope.protocolReceivedBytes += current.bytesRead ?? 0;
+        scope.protocolSentBytes += current.bytesWritten ?? 0;
+        if (
+          scope.protocolReceivedBytes > scope.maximumReceivedDatabaseBytes ||
+          scope.protocolSentBytes > scope.maximumSentDatabaseBytes
+        ) {
+          scope.protocolMeasurementComplete = false;
+          current.destroy(new Error("Pilot protocol allowance exhausted"));
+          throw new PilotDispatchError("AUTHORIZATION", null);
+        }
+        const originalWrite = current.write;
+        if (originalWrite) {
+          current.write = (...arguments_: unknown[]) => {
+            const chunk = arguments_[0];
+            const bytes =
+              typeof chunk === "string"
+                ? new TextEncoder().encode(chunk).byteLength
+                : chunk instanceof Uint8Array
+                  ? chunk.byteLength
+                  : null;
+            if (
+              bytes === null ||
+              scope.protocolSentBytes + bytes > scope.maximumSentDatabaseBytes
+            ) {
+              scope.protocolMeasurementComplete = false;
+              current.destroy(new Error("Pilot protocol allowance exhausted"));
+              throw new PilotDispatchError("AUTHORIZATION", null);
+            }
+            scope.protocolSentBytes += bytes;
+            return originalWrite.apply(current, arguments_);
+          };
+        } else scope.protocolMeasurementComplete = false;
+        current.on("data", (chunk) => {
+          scope.protocolReceivedBytes += chunk.byteLength;
+          if (
+            scope.protocolReceivedBytes > scope.maximumReceivedDatabaseBytes ||
+            scope.protocolSentBytes > scope.maximumSentDatabaseBytes
+          ) {
+            scope.protocolMeasurementComplete = false;
+            current.destroy(new Error("Pilot protocol allowance exhausted"));
+          }
+        });
+      };
+      const originalConnect = this.connect.bind(this);
+      Object.defineProperty(this, "connect", {
+        value: async () => {
+          observe();
+          try {
+            return await originalConnect();
+          } finally {
+            observe();
+          }
+        },
+      });
+      const originalEnd = this.end.bind(this);
+      Object.defineProperty(this, "end", {
+        value: async () => {
+          try {
+            if (scope.finalDiagnosticSQL)
+              scope.finalDiagnosticRow = (await this.query(scope.finalDiagnosticSQL))
+                .rows[0] as Record<string, unknown>;
+          } finally {
+            try {
+              await originalEnd();
+            } finally {
+              scope.protocolSentBytes = Math.max(
+                stream()?.bytesWritten ?? 0,
+                scope.protocolSentBytes,
+              );
+            }
+          }
+        },
+      });
+    }
+  }
+  module.Client = InstrumentedClient;
+  return {
+    run: <T>(scope: PgPilotScope, action: () => Promise<T>) => scopes.run(scope, action),
+    restore: () => {
+      if (module.Client === InstrumentedClient) module.Client = OriginalClient;
+      installedModules.delete(module);
+    },
+  };
+}
diff --git a/scripts/neon-benchmark/pilot/transactional-store.ts b/scripts/neon-benchmark/pilot/transactional-store.ts
new file mode 100644
index 000000000..cdfc2c19f
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/transactional-store.ts
@@ -0,0 +1,23 @@
+import type { AtomicPilotStore, PilotState } from "./accounting";
+
+export type TransactionStorage = {
+  transaction<T>(
+    action: (transaction: {
+      get<TValue>(key: string): Promise<TValue | undefined>;
+      put(key: string, value: unknown): Promise<void>;
+    }) => Promise<T>,
+  ): Promise<T>;
+};
+
+/** Shared durable storage adapter, not a Worker-isolate-local counter or a deployment. */
+export function transactionalPilotStore(storage: TransactionStorage): AtomicPilotStore {
+  return {
+    transact: (change) =>
+      storage.transaction(async (transaction) => {
+        const current = (await transaction.get<PilotState>("pilot")) ?? null;
+        const { next, result } = change(current);
+        await transaction.put("pilot", next);
+        return result;
+      }),
+  };
+}
diff --git a/scripts/neon-benchmark/pilot/worker.ts b/scripts/neon-benchmark/pilot/worker.ts
new file mode 100644
index 000000000..e4aca5d73
--- /dev/null
+++ b/scripts/neon-benchmark/pilot/worker.ts
@@ -0,0 +1,187 @@
+/// <reference types="@cloudflare/workers-types" />
+import "../../../cloudflare-env.d.ts";
+import pg from "pg";
+import { onRequestPost } from "../../../functions/api/comparable-transactions";
+import { createPublicReadScope } from "../../../worker/public-read-backend";
+import { createNeonPublicTransport } from "../../../worker/neon-transport";
+import type { PilotAuthority } from "./accounting";
+import { fingerprintSQL, PilotDispatchError } from "./dispatch";
+import { installPilotPgInstrumentation, type PgPilotScope } from "./pg-instrumentation";
+import type { ServerObservation } from "./accounting";
+
+// Byte-identical diagnostic SQL from the executed harness; aggregate counts remain observational.
+export const PILOT_SERVER_STATS_SQL = `SELECT current_user AS role,current_setting('default_transaction_read_only') AS read_only,current_setting('statement_timeout') AS statement_timeout,(SELECT json->'neonPublication'->>'publicationId' FROM public.manifest WHERE id=1) AS publication_id,(SELECT coalesce(sum(calls),0)::double precision FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS successful_sql_calls,(SELECT coalesce(sum(total_exec_time),0)::double precision FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS successful_sql_ms`;
+export const PILOT_SETTINGS_SQL = `SELECT current_user AS role,current_database() AS database,current_setting('default_transaction_read_only') AS read_only,current_setting('statement_timeout') AS statement_timeout,has_table_privilege(current_user,'public.transactions','SELECT') AS transaction_select,has_table_privilege(current_user,'public.transactions','INSERT,UPDATE,DELETE,TRUNCATE') AS transaction_write,has_table_privilege(current_user,'public.shortlists','SELECT,INSERT,UPDATE,DELETE') AS private_access`;
+
+type Installation = ReturnType<typeof installPilotPgInstrumentation>;
+export type PilotWorkerDependencies = {
+  /** Required shared authority/RPC port. Never construct a per-isolate replacement counter. */
+  authority: PilotAuthority;
+  instrumentation: Installation;
+};
+
+async function attachPilotMeasurements(response: Response, meter: PgPilotScope): Promise<Response> {
+  if (meter.constructedClients > 0 && !meter.protocolMeasurementComplete) {
+    await meter.authority.stop();
+    throw new PilotDispatchError("EVIDENCE", null);
+  }
+  const row = meter.finalDiagnosticRow;
+  const providerObservationAvailable = row?.role === "hdb_benchmark_runtime";
+  if (providerObservationAvailable) {
+    const observation: ServerObservation = {
+      phase: "request-final-diagnostic",
+      observedAtUTC: new Date().toISOString(),
+      role: "hdb_benchmark_runtime",
+      databaseId: null,
+      calls: typeof row.successful_sql_calls === "number" ? row.successful_sql_calls : null,
+      sqlMs: typeof row.successful_sql_ms === "number" ? row.successful_sql_ms : null,
+      completeAttemptAccounting: false,
+    };
+    await meter.authority.observeServer(observation);
+  }
+  const output = new Response(response.body, response);
+  const state = await meter.authority.snapshot();
+  output.headers.set("x-pilot-application-count", String(state.applicationStatements));
+  output.headers.set(
+    "x-pilot-statement-ids",
+    JSON.stringify(
+      state.statements
+        .filter((entry) => entry.requestId === meter.requestId)
+        .map((entry) => entry.id),
+    ),
+  );
+  output.headers.set("x-pilot-protocol-complete", String(meter.protocolMeasurementComplete));
+  output.headers.set("x-pilot-received-bytes", String(meter.protocolReceivedBytes));
+  output.headers.set("x-pilot-sent-bytes", String(meter.protocolSentBytes));
+  output.headers.set("x-pilot-provider-observation", String(providerObservationAvailable));
+  return output;
+}
+
+/** No deployment/exported fetch fallback. Explicit caller supplies an already-admitted request ID. */
+export function createComparablePilotWorker(dependencies: PilotWorkerDependencies) {
+  return async function handle(request: Request, env: Env, requestId: string): Promise<Response> {
+    if (env.PUBLIC_DATA_BACKEND !== "neon" || !env.HDB_PUBLIC_NEON)
+      throw new PilotDispatchError("AUTHORIZATION", null);
+    const state = await dependencies.authority.snapshot();
+    const admission = state.requests.find((entry) => entry.id === requestId);
+    if (!admission || admission.ended) throw new PilotDispatchError("AUTHORIZATION", null);
+    await dependencies.authority.activateRequest(requestId);
+    const meter: PgPilotScope = {
+      requestId,
+      authority: dependencies.authority,
+      cleanupFingerprints: new Set([fingerprintSQL(PILOT_SERVER_STATS_SQL)]),
+      maximumReceivedDatabaseBytes: admission.maximumReceivedDatabaseBytes,
+      maximumSentDatabaseBytes: admission.maximumSentDatabaseBytes,
+      protocolReceivedBytes: 0,
+      protocolSentBytes: 0,
+      constructedClients: 0,
+      protocolMeasurementComplete: true,
+      finalDiagnosticSQL: PILOT_SERVER_STATS_SQL,
+    };
+    return dependencies.instrumentation.run(meter, async () => {
+      const scope = createPublicReadScope(env, createNeonPublicTransport);
+      let response: Response;
+      try {
+        // Original query compiler, transaction transport and handler are unchanged.
+        response = await scope.comparableSnapshot(async () =>
+          onRequestPost({
+            request: request as Parameters<typeof onRequestPost>[0]["request"],
+            env: scope.publicEnv,
+            params: {},
+            data: {},
+            waitUntil: () => {},
+            next: async () => new Response(),
+            functionPath: "/api/comparable-transactions",
+            passThroughOnException: () => {},
+          }),
+        );
+      } finally {
+        await scope.close();
+      }
+      return attachPilotMeasurements(response, meter);
+    });
+  };
+}
+
+/** Actual server timeout stays 60s. The unchanged diagnostic client waits 65s for SQLSTATE 57014. */
+export async function runPilotSafeguards(
+  dependencies: PilotWorkerDependencies,
+  binding: Hyperdrive,
+  requestId: string,
+) {
+  const state = await dependencies.authority.snapshot();
+  const admission = state.requests.find((entry) => entry.id === requestId);
+  if (!admission || admission.ended) throw new PilotDispatchError("AUTHORIZATION", null);
+  await dependencies.authority.activateRequest(requestId);
+  const meter: PgPilotScope = {
+    authority: dependencies.authority,
+    requestId,
+    cleanupFingerprints: new Set([fingerprintSQL(PILOT_SERVER_STATS_SQL)]),
+    maximumReceivedDatabaseBytes: admission.maximumReceivedDatabaseBytes,
+    maximumSentDatabaseBytes: admission.maximumSentDatabaseBytes,
+    protocolReceivedBytes: 0,
+    protocolSentBytes: 0,
+    constructedClients: 0,
+    protocolMeasurementComplete: true,
+    finalDiagnosticSQL: PILOT_SERVER_STATS_SQL,
+  };
+  return dependencies.instrumentation.run(meter, async () => {
+    const client = new pg.Client({
+      connectionString: binding.connectionString,
+      connectionTimeoutMillis: 15_000,
+      query_timeout: 65_000,
+    });
+    const evidence = {
+      writeSQLSTATE: null as string | null,
+      timeoutSQLSTATE: null as string | null,
+      timeoutWallMs: null as number | null,
+      settings: null as Record<string, unknown> | null,
+    };
+    client.on("error", () => {});
+    try {
+      await client.connect();
+      evidence.settings = (await client.query(PILOT_SETTINGS_SQL)).rows[0] as Record<
+        string,
+        unknown
+      >;
+      const settings = evidence.settings;
+      if (
+        settings.role !== "hdb_benchmark_runtime" ||
+        settings.database !== "neondb" ||
+        settings.read_only !== "on" ||
+        settings.statement_timeout !== "1min" ||
+        !settings.transaction_select ||
+        settings.transaction_write ||
+        settings.private_access
+      )
+        throw new Error("Serving safeguards not demonstrated");
+      await client.query("BEGIN TRANSACTION READ ONLY");
+      try {
+        await client.query("UPDATE public.transactions SET resale_price=resale_price WHERE false");
+      } catch (error) {
+        if (error instanceof PilotDispatchError) evidence.writeSQLSTATE = error.sqlstate;
+      } finally {
+        await client.query("ROLLBACK");
+      }
+      if (!["25006", "42501"].includes(evidence.writeSQLSTATE ?? ""))
+        throw new Error("Nonpersisting write rejection not demonstrated");
+      const started = performance.now();
+      try {
+        await client.query("SELECT pg_sleep(61)");
+      } catch (error) {
+        if (error instanceof PilotDispatchError) evidence.timeoutSQLSTATE = error.sqlstate;
+      } finally {
+        evidence.timeoutWallMs = performance.now() - started;
+      }
+      if (
+        evidence.timeoutSQLSTATE !== "57014" ||
+        evidence.timeoutWallMs < 59_000 ||
+        evidence.timeoutWallMs > 65_000
+      )
+        throw new Error("Server cancellation not demonstrated");
+      return evidence;
+    } finally {
+      await client.end();
+    }
+  });
+}
diff --git a/tests/fixtures/neon-pilot.ts b/tests/fixtures/neon-pilot.ts
new file mode 100644
index 000000000..b26f39b8a
--- /dev/null
+++ b/tests/fixtures/neon-pilot.ts
@@ -0,0 +1,37 @@
+import {
+  AtomicPilotAuthority,
+  type AtomicPilotStore,
+  type PilotState,
+  type RequestAdmission,
+} from "../../scripts/neon-benchmark/pilot/accounting";
+export class SerialTestStore implements AtomicPilotStore {
+  private state: PilotState | null = null;
+  private tail: Promise<unknown> = Promise.resolve();
+  transact<T>(change: (state: PilotState | null) => { next: PilotState; result: T }): Promise<T> {
+    const pending = this.tail.then(() => {
+      const { next, result } = change(structuredClone(this.state));
+      this.state = structuredClone(next);
+      return result;
+    });
+    this.tail = pending.catch(() => undefined);
+    return pending;
+  }
+}
+export const admission = (
+  id = "request1",
+  overrides: Partial<RequestAdmission> = {},
+): RequestAdmission => ({
+  id,
+  sequence: 1,
+  method: "POST",
+  maximumStatements: 8,
+  maximumReceivedDatabaseBytes: 2_000_000,
+  maximumSentDatabaseBytes: 30_000,
+  ...overrides,
+});
+export async function authorityFixture() {
+  const store = new SerialTestStore();
+  const authority = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
+  await authority.initialize();
+  return { authority, store };
+}
diff --git a/tests/unit/neon-pilot-accounting.test.ts b/tests/unit/neon-pilot-accounting.test.ts
new file mode 100644
index 000000000..a680e4bb9
--- /dev/null
+++ b/tests/unit/neon-pilot-accounting.test.ts
@@ -0,0 +1,263 @@
+// @vitest-environment node
+import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+import { afterEach, describe, expect, it, vi } from "vite-plus/test";
+import { AtomicPilotAuthority, PILOT_LIMITS } from "../../scripts/neon-benchmark/pilot/accounting";
+import {
+  createStatementDispatcher,
+  fingerprintSQL,
+} from "../../scripts/neon-benchmark/pilot/dispatch";
+import { FilePilotStore } from "../../scripts/neon-benchmark/pilot/node-store";
+
+import { SerialTestStore, admission, authorityFixture } from "../fixtures/neon-pilot";
+
+describe("prospective application SQL authority", () => {
+  const directories: string[] = [];
+  afterEach(async () => {
+    await Promise.all(
+      directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
+    );
+  });
+  it("authorizes exactly 90 and refuses statement 91 before driver dispatch", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(
+      admission("cleanup", { purpose: "cleanup", maximumStatements: 90 }),
+    );
+    await authority.activateRequest("cleanup");
+    const dispatch = createStatementDispatcher({
+      authority,
+      requestId: "cleanup",
+      defaultPurpose: "cleanup",
+    });
+    const send = vi.fn(async () => ({ rows: [] }));
+    for (let index = 0; index < 90; index++) await dispatch("SELECT 1", [], send);
+    await expect(dispatch("SELECT 1", [], send)).rejects.toThrow("AUTHORIZATION");
+    expect(send).toHaveBeenCalledTimes(90);
+    const state = await authority.snapshot();
+    expect(state.applicationStatements).toBe(90);
+    expect(state.statements.map((record) => record.applicationSequence)).toEqual(
+      Array.from({ length: 90 }, (_, i) => i + 1),
+    );
+  });
+  it("serializes independent authorities over the same store without overspending", async () => {
+    const { authority, store } = await authorityFixture();
+    const second = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
+    await authority.admitRequest(
+      admission("cleanup", { purpose: "cleanup", maximumStatements: 90 }),
+    );
+    await authority.activateRequest("cleanup");
+    const outcomes = await Promise.allSettled(
+      Array.from({ length: 100 }, (_, i) =>
+        (i % 2 ? second : authority).authorizeStatement({
+          requestId: "cleanup",
+          localSequence: i + 1,
+          label: "diagnostic",
+          sqlSHA256: fingerprintSQL("SELECT 1"),
+          purpose: "cleanup",
+        }),
+      ),
+    );
+    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(90);
+    expect((await authority.snapshot()).applicationStatements).toBe(90);
+  });
+  it("durably commits attribution before sending, preserves rows and parameter values", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    await authority.activateRequest("request1");
+    const dispatch = createStatementDispatcher({ authority, requestId: "request1" });
+    const parameters = ["legitimate; parameter", 134];
+    const result = { rows: [{ id: 1 }, { id: 2 }] };
+    const received = await dispatch("SELECT $1, $2", parameters, async (sql, values) => {
+      const state = await authority.snapshot();
+      expect(state.applicationStatements).toBe(1);
+      expect(state.statements[0].outcome).toBe("authorized-unknown");
+      expect(state.statements[0].id).toBe("request1:s1");
+      expect(sql).toBe("SELECT $1, $2");
+      expect(values).toBe(parameters);
+      return result;
+    });
+    expect(received).toBe(result);
+    expect((await authority.snapshot()).statements[0].outcome).toBe("succeeded");
+  });
+  it("counts BEGIN, SET, failed SQL, ROLLBACK, diagnostic SELECT and COMMIT", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    await authority.activateRequest("request1");
+    const dispatch = createStatementDispatcher({ authority, requestId: "request1" });
+    const send = vi.fn(async (sql: string) => {
+      if (sql === "SELECT broken") throw Object.assign(Error("secret password"), { code: "57014" });
+      return { rows: [] };
+    });
+    for (const sql of [
+      "BEGIN READ ONLY",
+      "SET application_name='pilot'",
+      "SELECT broken",
+      "ROLLBACK",
+      "SELECT 1",
+      "COMMIT",
+    ])
+      await dispatch(sql, [], send).catch(() => undefined);
+    const state = await authority.snapshot();
+    expect(state.applicationStatements).toBe(6);
+    expect(state.statements[2]).toMatchObject({ outcome: "failed", sqlstate: "57014" });
+    expect(JSON.stringify(state)).not.toContain("secret password");
+  });
+  it("rejects multiple SQL statements and unsupported text before dispatch", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    await authority.activateRequest("request1");
+    const dispatch = createStatementDispatcher({ authority, requestId: "request1" });
+    const send = vi.fn();
+    for (const sql of ["SELECT 1; SELECT 2", "", "SELECT '\0'"])
+      await expect(dispatch(sql, [], send)).rejects.toThrow("AUTHORIZATION");
+    expect(send).not.toHaveBeenCalled();
+    expect((await authority.snapshot()).applicationStatements).toBe(0);
+  });
+  it("provider counters neither inflate/refund application accounting nor affect admission", async () => {
+    const { authority } = await authorityFixture();
+    await authority.observeServer({
+      phase: "before",
+      observedAtUTC: "synthetic",
+      role: "hdb_benchmark_runtime",
+      databaseId: null,
+      calls: 999_999_999,
+      sqlMs: 83,
+      completeAttemptAccounting: false,
+    });
+    await authority.observeServer({
+      phase: "after",
+      observedAtUTC: "synthetic",
+      role: "hdb_benchmark_runtime",
+      databaseId: null,
+      calls: null,
+      sqlMs: null,
+      completeAttemptAccounting: false,
+    });
+    expect((await authority.snapshot()).applicationStatements).toBe(0);
+    await authority.admitRequest(admission());
+    await authority.activateRequest("request1");
+    await createStatementDispatcher({ authority, requestId: "request1" })(
+      "SELECT 1",
+      [],
+      async () => [],
+    );
+    expect((await authority.snapshot()).applicationStatements).toBe(1);
+  });
+  it("refuses replay across authority instances and duplicate statement IDs", async () => {
+    const { authority, store } = await authorityFixture();
+    await authority.admitRequest(admission());
+    await authority.activateRequest("request1");
+    const second = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
+    await expect(second.activateRequest("request1")).rejects.toThrow("replayed");
+    const intent = {
+      requestId: "request1",
+      localSequence: 1,
+      label: "query",
+      sqlSHA256: fingerprintSQL("SELECT 1"),
+      purpose: "work" as const,
+    };
+    await authority.authorizeStatement(intent);
+    await expect(second.authorizeStatement(intent)).rejects.toThrow("before dispatch");
+    expect((await authority.snapshot()).applicationStatements).toBe(1);
+  });
+  it("preserves cleanup allowance and stops before work command 81", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission("all", { maximumStatements: 80 }));
+    await authority.activateRequest("all");
+    const dispatch = createStatementDispatcher({ authority, requestId: "all" });
+    const send = vi.fn(async () => []);
+    for (let i = 0; i < 80; i++) await dispatch("SELECT 1", [], send);
+    await expect(dispatch("SELECT 1", [], send)).rejects.toThrow("AUTHORIZATION");
+    await authority.finishRequest("all", "failed-unknown");
+    await authority.admitRequest(
+      admission("cleanup", {
+        sequence: 2,
+        purpose: "cleanup",
+        maximumStatements: 10,
+        method: "GET",
+      }),
+    );
+    await authority.activateRequest("cleanup");
+    const cleanup = createStatementDispatcher({
+      authority,
+      requestId: "cleanup",
+      defaultPurpose: "cleanup",
+    });
+    for (let i = 0; i < 10; i++) await cleanup("ROLLBACK", [], send);
+    expect(send).toHaveBeenCalledTimes(90);
+  });
+  it("does not refund unknown transfer/connection reservations or clear failed outcomes", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    await authority.finishRequest("request1", "failed-unknown");
+    await authority.finishRequest("request1", "complete");
+    const state = await authority.snapshot();
+    expect(state.requests[0].outcome).toBe("failed-unknown");
+    expect(state.receivedDatabaseBytesReserved).toBe(2_000_000);
+    expect(state.connectionAdmissions).toBe(1);
+    await expect(authority.admitRequest(admission("another", { sequence: 2 }))).rejects.toThrow(
+      "stopped",
+    );
+  });
+  it("enforces one outstanding request, ten POSTs, byte and connection reservations", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    await expect(authority.admitRequest(admission("parallel", { sequence: 2 }))).rejects.toThrow(
+      "admission",
+    );
+    await authority.finishRequest("request1", "complete");
+    for (let i = 2; i <= 10; i++) {
+      const id = `request${i}`;
+      await authority.admitRequest(admission(id, { sequence: i }));
+      await authority.finishRequest(id, "complete");
+    }
+    await expect(authority.admitRequest(admission("request11", { sequence: 11 }))).rejects.toThrow(
+      "admission",
+    );
+    const next = await authorityFixture();
+    await expect(
+      next.authority.admitRequest(admission("large", { maximumReceivedDatabaseBytes: 25_000_001 })),
+    ).rejects.toThrow("admission");
+    expect(PILOT_LIMITS.computeCUHoursProxy).toBe(0.35);
+  });
+  it("enforces duration with a protected cleanup interval", async () => {
+    let now = 0;
+    const authority = new AtomicPilotAuthority(new SerialTestStore(), "timed", () => now);
+    await authority.initialize();
+    now = 255_000;
+    await expect(authority.admitRequest(admission())).rejects.toThrow("duration");
+    await authority.admitRequest(admission("cleanup", { purpose: "cleanup" }));
+    await authority.activateRequest("cleanup");
+    now = 300_000;
+    await expect(
+      authority.authorizeStatement({
+        requestId: "cleanup",
+        localSequence: 1,
+        label: "query",
+        purpose: "cleanup",
+        sqlSHA256: fingerprintSQL("ROLLBACK"),
+      }),
+    ).rejects.toThrow("duration");
+  });
+  it("commits file-backed permits across instances and does not reset persisted evidence", async () => {
+    const directory = await mkdtemp(join(tmpdir(), "hdb-pilot-"));
+    directories.push(directory);
+    const path = join(directory, "state.json");
+    const first = new AtomicPilotAuthority(new FilePilotStore(path), "durable", () => 1000);
+    await first.initialize();
+    await first.admitRequest(admission());
+    await first.activateRequest("request1");
+    const second = new AtomicPilotAuthority(new FilePilotStore(path), "durable", () => 1000);
+    const dispatch = createStatementDispatcher({ authority: second, requestId: "request1" });
+    await dispatch("SELECT 1", [], async () => {
+      expect(JSON.parse(await readFile(path, "utf8")).applicationStatements).toBe(1);
+      return [];
+    });
+    await expect(first.initialize()).rejects.toThrow("cannot be reset");
+    expect((await second.snapshot()).applicationStatements).toBe(1);
+    await writeFile(`${path}.next`, "retained crash evidence");
+    await expect(first.snapshot()).rejects.toThrow();
+    expect(await readFile(`${path}.next`, "utf8")).toBe("retained crash evidence");
+  });
+});
diff --git a/tests/unit/neon-pilot-controller.test.ts b/tests/unit/neon-pilot-controller.test.ts
new file mode 100644
index 000000000..2bf66a885
--- /dev/null
+++ b/tests/unit/neon-pilot-controller.test.ts
@@ -0,0 +1,358 @@
+// @vitest-environment node
+import { describe, expect, it, vi } from "vite-plus/test";
+import {
+  AtomicPilotAuthority,
+  type AtomicPilotStore,
+  type PilotState,
+} from "../../scripts/neon-benchmark/pilot/accounting";
+import { PilotController } from "../../scripts/neon-benchmark/pilot/controller";
+import { createStatementDispatcher } from "../../scripts/neon-benchmark/pilot/dispatch";
+import { capturePilotHttp, type HttpReceipt } from "../../scripts/neon-benchmark/pilot/evidence";
+import {
+  transactionalPilotStore,
+  type TransactionStorage,
+} from "../../scripts/neon-benchmark/pilot/transactional-store";
+import { admission, authorityFixture, SerialTestStore } from "../fixtures/neon-pilot";
+
+function recordingJournal() {
+  const receipts: HttpReceipt[] = [];
+  return {
+    receipts,
+    journal: {
+      persist: async (receipt: HttpReceipt) => {
+        receipts.push(structuredClone(receipt));
+      },
+    },
+  };
+}
+
+describe("controller and Worker share prospective admission", () => {
+  it("counts owner SET and independent Worker dispatch in one monotonically growing pool", async () => {
+    const { authority, store } = await authorityFixture();
+    const { journal, receipts } = recordingJournal();
+    const controller = new PilotController(authority, journal);
+    const workerAuthority = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
+    const send = vi.fn(async () => []);
+    await controller.ownerStatements(
+      admission("owner", { method: "GET", maximumStatements: 1 }),
+      (dispatch) => dispatch("SET application_name='synthetic'", [], send),
+    );
+    await controller.request({
+      ...admission("worker", { sequence: 2, maximumStatements: 3 }),
+      label: "public-synthetic",
+      parse: (body) => JSON.parse(body),
+      fetchResponse: async () => {
+        await workerAuthority.activateRequest("worker");
+        const dispatch = createStatementDispatcher({
+          authority: workerAuthority,
+          requestId: "worker",
+        });
+        await dispatch("BEGIN READ ONLY", [], send);
+        await dispatch("SELECT 1", [], send);
+        await dispatch("COMMIT", [], send);
+        return new Response("{}");
+      },
+    });
+    expect((await authority.snapshot()).applicationStatements).toBe(4);
+    expect(receipts.at(-1)).toMatchObject({
+      applicationStatementsBefore: 1,
+      applicationStatementsAfter: 4,
+    });
+    expect(
+      (await workerAuthority.snapshot()).statements.map((record) => record.applicationSequence),
+    ).toEqual([1, 2, 3, 4]);
+  });
+
+  it("records request intent and admission failure before any HTTP send", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = recordingJournal();
+    const controller = new PilotController(authority, journal);
+    const fetchResponse = vi.fn();
+    await expect(
+      controller.request({
+        ...admission("over", { maximumStatements: 81 }),
+        label: "public-synthetic",
+        fetchResponse,
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("admission");
+    expect(fetchResponse).not.toHaveBeenCalled();
+    expect(receipts[0].stage).toBe("intent");
+    expect(receipts.at(-1)).toMatchObject({
+      failure: "admission",
+      status: null,
+      applicationStatementsAfter: 0,
+    });
+  });
+
+  it("uses the same bounded recorder for control-plane errors and cleanup HTTP", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = recordingJournal();
+    const controller = new PilotController(authority, journal);
+    await expect(
+      controller.controlRequest({
+        id: "control1",
+        sequence: 1,
+        method: "POST",
+        label: "control-create",
+        parse: (body) => JSON.parse(body),
+        fetchResponse: async () =>
+          new Response('{"token":"hidden-synthetic-value"}', { status: 403 }),
+      }),
+    ).rejects.toThrow("http-status");
+    const failures = await controller.cleanup([
+      async () => {
+        await controller.controlRequest({
+          id: "control2",
+          sequence: 2,
+          method: "DELETE",
+          label: "control-delete",
+          parse: (body) => JSON.parse(body),
+          fetchResponse: async () => new Response("not JSON", { status: 502 }),
+        });
+      },
+    ]);
+    expect(failures).toEqual([{ index: 0, failed: true }]);
+    expect(receipts.filter((record) => record.endedAtUTC).map((record) => record.status)).toEqual([
+      403, 502,
+    ]);
+    expect(JSON.stringify(receipts)).not.toContain("hidden-synthetic-value");
+    const state = await authority.snapshot();
+    expect(state.applicationStatements).toBe(0);
+    expect(state.comparablePOSTs).toBe(0);
+    expect(state.stopped).toBe(true);
+  });
+
+  it("refuses connection 14 and sent-byte reservation overflow without refunds", async () => {
+    const { authority } = await authorityFixture();
+    for (let index = 1; index <= 13; index++) {
+      const id = `connection${index}`;
+      await authority.admitRequest(
+        admission(id, {
+          sequence: index,
+          method: "GET",
+          maximumStatements: 1,
+          maximumReceivedDatabaseBytes: 1,
+          maximumSentDatabaseBytes: 1,
+        }),
+      );
+      await authority.finishRequest(id, "complete");
+    }
+    await expect(
+      authority.admitRequest(
+        admission("connection14", {
+          sequence: 14,
+          method: "GET",
+          maximumReceivedDatabaseBytes: 1,
+          maximumSentDatabaseBytes: 1,
+        }),
+      ),
+    ).rejects.toThrow("admission");
+    const next = await authorityFixture();
+    await expect(
+      next.authority.admitRequest(admission("overflow", { maximumSentDatabaseBytes: 1_000_001 })),
+    ).rejects.toThrow("admission");
+    expect((await next.authority.snapshot()).connectionAdmissions).toBe(0);
+  });
+
+  it("reserves full request wall time before admission and expires statement permits", async () => {
+    let now = 0;
+    const authority = new AtomicPilotAuthority(new SerialTestStore(), "clocked", () => now);
+    await authority.initialize();
+    now = 200_000;
+    await expect(authority.admitRequest(admission("slow", { method: "GET" }))).rejects.toThrow(
+      "duration",
+    );
+    await authority.admitRequest(admission("request1", { maximumWallMs: 5000 }));
+    await authority.activateRequest("request1");
+    now += 5000;
+    const send = vi.fn();
+    await expect(
+      createStatementDispatcher({ authority, requestId: "request1" })("SELECT 1", [], send),
+    ).rejects.toThrow("AUTHORIZATION");
+    expect(send).not.toHaveBeenCalled();
+  });
+
+  it.each(["authorization", "completion"])(
+    "fails closed on %s persistence without refund or retry",
+    async (fault) => {
+      const backing = new SerialTestStore();
+      let enabled = false;
+      const store: AtomicPilotStore = {
+        transact: (change) =>
+          backing.transact((current) => {
+            const changeResult = change(current);
+            if (
+              enabled &&
+              current &&
+              (fault === "authorization"
+                ? changeResult.next.applicationStatements > current.applicationStatements
+                : changeResult.next.statements.some(
+                    (record) => record.outcome !== "authorized-unknown",
+                  ))
+            )
+              throw Error("Synthetic disk loss");
+            return changeResult;
+          }),
+      };
+      const authority = new AtomicPilotAuthority(store, "fault", () => 1000);
+      await authority.initialize();
+      await authority.admitRequest(admission());
+      await authority.activateRequest("request1");
+      enabled = true;
+      const send = vi.fn(async () => []);
+      await expect(
+        createStatementDispatcher({ authority, requestId: "request1" })("SELECT 1", [], send),
+      ).rejects.toThrow(fault === "authorization" ? "AUTHORIZATION" : "EVIDENCE");
+      expect(send).toHaveBeenCalledTimes(fault === "authorization" ? 0 : 1);
+      enabled = false;
+      const state = await authority.snapshot();
+      expect(state.applicationStatements).toBe(fault === "authorization" ? 0 : 1);
+      if (fault === "completion") expect(state.statements[0].outcome).toBe("authorized-unknown");
+    },
+  );
+
+  it("rejects a corrupt persisted counter rather than silently reconstructing or resetting it", async () => {
+    const { authority, store } = await authorityFixture();
+    await store.transact((current) => {
+      const state = current!;
+      state.applicationStatements = 1;
+      return { next: state, result: undefined };
+    });
+    await expect(authority.snapshot()).rejects.toThrow("Corrupt");
+    await expect(authority.admitRequest(admission())).rejects.toThrow("Corrupt");
+  });
+
+  it("serializes separate transactional adapters sharing one durable storage authority", async () => {
+    let value: unknown;
+    let tail: Promise<unknown> = Promise.resolve();
+    const storage: TransactionStorage = {
+      transaction: (action) => {
+        const operation = tail.then(async () => {
+          let pending = structuredClone(value);
+          const result = await action({
+            get: async <TValue>() => structuredClone(pending) as TValue | undefined,
+            put: async (_key, next) => {
+              pending = structuredClone(next);
+            },
+          });
+          value = pending;
+          return result;
+        });
+        tail = operation.catch(() => undefined);
+        return operation;
+      },
+    };
+    const first = new AtomicPilotAuthority(transactionalPilotStore(storage), "shared", () => 1000);
+    const second = new AtomicPilotAuthority(transactionalPilotStore(storage), "shared", () => 1000);
+    await first.initialize();
+    await first.admitRequest(admission("cleanup", { purpose: "cleanup", maximumStatements: 90 }));
+    await first.activateRequest("cleanup");
+    const driver = vi.fn(async () => []);
+    const a = createStatementDispatcher({
+      authority: first,
+      requestId: "cleanup",
+      defaultPurpose: "cleanup",
+    });
+    // Different sequence offsets represent distinct clients, not replay of a driver call.
+    await Promise.all(Array.from({ length: 90 }, () => a("SELECT 1", [], driver)));
+    await expect(
+      createStatementDispatcher({
+        authority: second,
+        requestId: "cleanup",
+        defaultPurpose: "cleanup",
+      })("SELECT 1", [], driver),
+    ).rejects.toThrow("AUTHORIZATION");
+    expect(driver).toHaveBeenCalledTimes(90);
+    expect((value as PilotState).applicationStatements).toBe(90);
+  });
+
+  it("retains intent on authority loss before transport and whitelists transport causes", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = recordingJournal();
+    authority.snapshot = async () => {
+      throw Error("Authority secret withheld");
+    };
+    const fetchResponse = vi.fn();
+    await expect(
+      capturePilotHttp({
+        id: "early",
+        sequence: 1,
+        method: "GET",
+        label: "public-synthetic",
+        authority,
+        journal,
+        fetchResponse,
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("evidence");
+    expect(fetchResponse).not.toHaveBeenCalled();
+    expect(receipts[0].stage).toBe("intent");
+    expect(receipts.at(-1)).toMatchObject({
+      applicationStatementsBefore: null,
+      applicationStatementsAfter: null,
+      responseAvailable: false,
+    });
+    const next = await authorityFixture();
+    await expect(
+      capturePilotHttp({
+        id: "network",
+        sequence: 2,
+        method: "GET",
+        label: "public-synthetic",
+        authority: next.authority,
+        journal,
+        fetchResponse: async () => {
+          throw new TypeError("Sensitive URL withheld", {
+            cause: Object.assign(Error("Sensitive host withheld"), { code: "ENOTFOUND" }),
+          });
+        },
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("transport");
+    expect(receipts.at(-1)).toMatchObject({
+      transportCode: "ENOTFOUND",
+      errorName: "TypeError",
+      failureStage: "transport",
+    });
+    expect(JSON.stringify(receipts)).not.toContain("Sensitive");
+  });
+
+  it("enforces HTTP timeout and cancels before dispatch for an already-aborted signal", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = recordingJournal();
+    await expect(
+      capturePilotHttp({
+        id: "timeout",
+        sequence: 1,
+        method: "GET",
+        label: "public-synthetic",
+        authority,
+        journal,
+        timeoutMs: 1,
+        fetchResponse: async () => new Promise<Response>(() => {}),
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("timeout");
+    expect(receipts.at(-1)).toMatchObject({
+      failure: "timeout",
+      status: null,
+      endedAtUTC: expect.any(String),
+    });
+    const fetchResponse = vi.fn();
+    await expect(
+      capturePilotHttp({
+        id: "aborted",
+        sequence: 2,
+        method: "GET",
+        label: "public-synthetic",
+        authority,
+        journal,
+        signal: AbortSignal.abort(),
+        fetchResponse,
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("abort");
+    expect(fetchResponse).not.toHaveBeenCalled();
+  });
+});
diff --git a/tests/unit/neon-pilot-evidence.test.ts b/tests/unit/neon-pilot-evidence.test.ts
new file mode 100644
index 000000000..b396ed59b
--- /dev/null
+++ b/tests/unit/neon-pilot-evidence.test.ts
@@ -0,0 +1,385 @@
+// @vitest-environment node
+import { mkdtemp, readFile, rm } from "node:fs/promises";
+import { tmpdir } from "node:os";
+import { join } from "node:path";
+import { describe, expect, it, vi } from "vite-plus/test";
+import {
+  capturePilotHttp,
+  sanitizePilotSnippet,
+  type HttpReceipt,
+  type ReceiptJournal,
+} from "../../scripts/neon-benchmark/pilot/evidence";
+import { FileReceiptJournal } from "../../scripts/neon-benchmark/pilot/node-journal";
+import { PilotController } from "../../scripts/neon-benchmark/pilot/controller";
+import { createStatementDispatcher } from "../../scripts/neon-benchmark/pilot/dispatch";
+import { admission, authorityFixture } from "../fixtures/neon-pilot";
+
+function journalFixture() {
+  const receipts: HttpReceipt[] = [];
+  const journal: ReceiptJournal = {
+    persist: async (receipt) => {
+      receipts.push(structuredClone(receipt));
+    },
+  };
+  return { journal, receipts };
+}
+describe("durable pilot HTTP evidence", () => {
+  it("persists intent before fetch and status before any parsing", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    const result = await capturePilotHttp({
+      id: "http1",
+      sequence: 1,
+      method: "GET",
+      label: "public-synthetic",
+      authority,
+      journal,
+      capturePublicSyntheticSnippet: true,
+      fetchResponse: async () => {
+        expect(receipts[0]).toMatchObject({ stage: "intent", status: null });
+        return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
+      },
+      parse: (text) => {
+        expect(receipts.at(-1)).toMatchObject({
+          status: 200,
+          stage: "parse",
+          bodySnippet: '{"ok":true}',
+        });
+        return JSON.parse(text);
+      },
+    });
+    expect(result).toEqual({ ok: true });
+    expect(receipts.at(-1)).toMatchObject({
+      stage: "complete",
+      failure: "none",
+      responseAvailable: true,
+      applicationStatementsAfter: 0,
+    });
+    expect(receipts.at(-1)?.endedAtUTC).not.toBeNull();
+  });
+  it.each([403, 502])("retains HTTP %i and a non-JSON body without parsing it", async (status) => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    const parse = vi.fn();
+    await expect(
+      capturePilotHttp({
+        id: "http1",
+        sequence: 1,
+        method: "GET",
+        label: "public-synthetic",
+        authority,
+        journal,
+        capturePublicSyntheticSnippet: true,
+        fetchResponse: async () => new Response("Forbidden: synthetic", { status }),
+        parse,
+      }),
+    ).rejects.toThrow("http-status");
+    expect(parse).not.toHaveBeenCalled();
+    expect(receipts.at(-1)).toMatchObject({
+      status,
+      bodySnippet: "Forbidden: synthetic",
+      failure: "http-status",
+      responseAvailable: true,
+    });
+  });
+  it.each(["malformed {", "<html>synthetic edge error</html>"])(
+    "retains malformed/non-JSON success body %s",
+    async (body) => {
+      const { authority } = await authorityFixture();
+      const { journal, receipts } = journalFixture();
+      await expect(
+        capturePilotHttp({
+          id: "http1",
+          sequence: 1,
+          method: "POST",
+          label: "public-synthetic",
+          authority,
+          journal,
+          capturePublicSyntheticSnippet: true,
+          fetchResponse: async () => new Response(body),
+          parse: (body) => JSON.parse(body),
+        }),
+      ).rejects.toThrow("parse");
+      expect(receipts.at(-1)).toMatchObject({
+        status: 200,
+        bodySnippet: body,
+        failureStage: "parse",
+        errorName: "SyntaxError",
+      });
+    },
+  );
+  it("retains status/body when the metrics header itself is malformed", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    await expect(
+      capturePilotHttp({
+        id: "http1",
+        sequence: 1,
+        method: "GET",
+        label: "public-synthetic",
+        authority,
+        journal,
+        capturePublicSyntheticSnippet: true,
+        fetchResponse: async () =>
+          new Response('{"ok":true}', { headers: { "x-pilot-metrics": "broken{" } }),
+        parse: (text, response) => {
+          JSON.parse(response.headers.get("x-pilot-metrics")!);
+          return JSON.parse(text);
+        },
+      }),
+    ).rejects.toThrow("parse");
+    expect(receipts.at(-1)).toMatchObject({
+      status: 200,
+      bodySnippet: '{"ok":true}',
+      failureStage: "parse",
+    });
+  });
+  it.each(["AbortError", "TimeoutError"])(
+    "retains %s before headers without assuming a response",
+    async (name) => {
+      const { authority } = await authorityFixture();
+      const { journal, receipts } = journalFixture();
+      await expect(
+        capturePilotHttp({
+          id: "http1",
+          sequence: 1,
+          method: "GET",
+          label: "public-synthetic",
+          authority,
+          journal,
+          fetchResponse: async () => {
+            throw Object.assign(Error("sensitive message"), { name });
+          },
+          parse: (body) => JSON.parse(body),
+        }),
+      ).rejects.toThrow();
+      expect(receipts.at(-1)).toMatchObject({
+        status: null,
+        responseAvailable: false,
+        failureStage: "transport",
+        errorName: name,
+      });
+      expect(JSON.stringify(receipts)).not.toContain("sensitive message");
+    },
+  );
+  it("retains an aborted body after headers and partial bytes", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    let pulls = 0;
+    const body = new ReadableStream<Uint8Array>({
+      pull(controller) {
+        if (pulls++ === 0) controller.enqueue(new TextEncoder().encode("public partial"));
+        else controller.error(Object.assign(Error("aborted"), { name: "AbortError" }));
+      },
+    });
+    await expect(
+      capturePilotHttp({
+        id: "http1",
+        sequence: 1,
+        method: "GET",
+        label: "public-synthetic",
+        authority,
+        journal,
+        capturePublicSyntheticSnippet: true,
+        fetchResponse: async () => new Response(body),
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("abort");
+    expect(receipts.at(-1)).toMatchObject({
+      status: 200,
+      responseAvailable: true,
+      failure: "abort",
+      failureStage: "body",
+    });
+    expect(receipts.at(-1)!.responseBodyBytes).toBeGreaterThan(0);
+  });
+  it("bounds snippets/body retention and stops oversized responses", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    await expect(
+      capturePilotHttp({
+        id: "http1",
+        sequence: 1,
+        method: "GET",
+        label: "public-synthetic",
+        authority,
+        journal,
+        capturePublicSyntheticSnippet: true,
+        fetchResponse: async () => new Response("x".repeat(2_000_001)),
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("body-limit");
+    expect(receipts.at(-1)).toMatchObject({ status: 200, failure: "body-limit" });
+    expect(new TextEncoder().encode(receipts.at(-1)!.bodySnippet).byteLength).toBeLessThanOrEqual(
+      512,
+    );
+  });
+  it("disables auth/control bodies and redacts credentials, including partial known values", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    await capturePilotHttp({
+      id: "http1",
+      sequence: 1,
+      method: "GET",
+      label: "control",
+      authority,
+      journal,
+      fetchResponse: async () =>
+        new Response('{"password":"private-password"}', {
+          headers: { "set-cookie": "private-cookie", authorization: "private-header" },
+        }),
+      parse: (body) => JSON.parse(body),
+    });
+    const serialized = JSON.stringify(receipts);
+    for (const secret of ["private-password", "private-cookie", "private-header"])
+      expect(serialized).not.toContain(secret);
+    expect(sanitizePilotSnippet('{"password":"abcd","token":"partial')).not.toContain("abcd");
+    expect(sanitizePilotSnippet("public shortpas", ["shortpassword"])).not.toContain("shortpas");
+    expect(sanitizePilotSnippet("postgresql://user:password@hostname/database")).not.toContain(
+      "password@hostname",
+    );
+    expect(
+      new TextEncoder().encode(sanitizePilotSnippet("🌟".repeat(300))).byteLength,
+    ).toBeLessThanOrEqual(512);
+  });
+  it("does not dispatch if intent persistence fails", async () => {
+    const { authority } = await authorityFixture();
+    const fetchResponse = vi.fn();
+    await expect(
+      capturePilotHttp({
+        id: "http1",
+        sequence: 1,
+        method: "GET",
+        label: "public",
+        authority,
+        journal: {
+          persist: async () => {
+            throw Error("unavailable");
+          },
+        },
+        fetchResponse,
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("evidence");
+    expect(fetchResponse).not.toHaveBeenCalled();
+  });
+  it("keeps a missing after-count unknown and retains earlier receipts if final writes fail", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    let called = 0;
+    const snapshot = authority.snapshot.bind(authority);
+    authority.snapshot = async () => {
+      if (called++ > 0) throw Error("lost authority");
+      return snapshot();
+    };
+    await expect(
+      capturePilotHttp({
+        id: "http1",
+        sequence: 1,
+        method: "GET",
+        label: "public",
+        authority,
+        journal,
+        fetchResponse: async () => new Response("{}"),
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("evidence");
+    expect(receipts.at(-1)).toMatchObject({
+      applicationStatementsAfter: null,
+      applicationAccountingAvailableAfter: false,
+    });
+    const next = await authorityFixture();
+    const saved: HttpReceipt[] = [];
+    await expect(
+      capturePilotHttp({
+        id: "http2",
+        sequence: 2,
+        method: "GET",
+        label: "public",
+        authority: next.authority,
+        journal: {
+          persist: async (record) => {
+            if (record.endedAtUTC) throw Error("final write failed");
+            saved.push(structuredClone(record));
+          },
+        },
+        fetchResponse: async () => new Response("{}"),
+        parse: (body) => JSON.parse(body),
+      }),
+    ).rejects.toThrow("evidence");
+    expect(saved[0].stage).toBe("intent");
+    expect(saved.at(-1)?.status).toBe(200);
+  });
+  it("unknown accepted outcomes retain SQL permits and full transfer leases through cleanup", async () => {
+    const { authority } = await authorityFixture();
+    const { journal, receipts } = journalFixture();
+    const controller = new PilotController(authority, journal);
+    const send = vi.fn(async () => []);
+    await expect(
+      controller.request({
+        ...admission(),
+        label: "synthetic-accepted-response-lost",
+        parse: (body) => JSON.parse(body),
+        fetchResponse: async () => {
+          await authority.activateRequest("request1");
+          await createStatementDispatcher({ authority, requestId: "request1" })(
+            "SELECT 1",
+            [],
+            send,
+          );
+          throw Object.assign(Error("response lost"), { name: "AbortError" });
+        },
+      }),
+    ).rejects.toThrow("abort");
+    const cleanup = await controller.cleanup([
+      async () => {
+        throw Error("private cleanup error");
+      },
+      async () => {},
+    ]);
+    expect(cleanup).toEqual([{ index: 0, failed: true }]);
+    expect(send).toHaveBeenCalledTimes(1);
+    expect(receipts.at(-1)).toMatchObject({ failure: "abort", applicationStatementsAfter: 1 });
+    const state = await authority.snapshot();
+    expect(state.applicationStatements).toBe(1);
+    expect(state.receivedDatabaseBytesReserved).toBe(2_000_000);
+    expect(state.requests[0].outcome).toBe("failed-unknown");
+    expect(state.stopped).toBe(true);
+  });
+  it("append-only fsynced receipts survive failed cleanup and can be replayed locally", async () => {
+    const directory = await mkdtemp(join(tmpdir(), "hdb-pilot-journal-"));
+    try {
+      const path = join(directory, "receipts.jsonl");
+      const { authority } = await authorityFixture();
+      const controller = new PilotController(authority, new FileReceiptJournal(path));
+      await expect(
+        controller.request({
+          ...admission(),
+          label: "synthetic",
+          capturePublicSyntheticSnippet: true,
+          fetchResponse: async () => new Response("not JSON"),
+          parse: (body) => JSON.parse(body),
+        }),
+      ).rejects.toThrow("parse");
+      const before = await readFile(path, "utf8");
+      await controller.cleanup([
+        async () => {
+          throw Error("cleanup failed");
+        },
+      ]);
+      expect(await readFile(path, "utf8")).toBe(before);
+      const history = before
+        .trim()
+        .split("\n")
+        .map((line) => JSON.parse(line) as HttpReceipt);
+      expect(history[0].stage).toBe("intent");
+      expect(history.at(-1)).toMatchObject({
+        status: 200,
+        failure: "parse",
+        bodySnippet: "not JSON",
+      });
+    } finally {
+      await rm(directory, { recursive: true, force: true });
+    }
+  });
+});
diff --git a/tests/unit/neon-pilot-worker.test.ts b/tests/unit/neon-pilot-worker.test.ts
new file mode 100644
index 000000000..001b4fe61
--- /dev/null
+++ b/tests/unit/neon-pilot-worker.test.ts
@@ -0,0 +1,281 @@
+// @vitest-environment node
+import { EventEmitter } from "node:events";
+import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
+const mock = vi.hoisted(() => ({
+  query: vi.fn(),
+  connect: vi.fn(),
+  end: vi.fn(),
+  constructed: vi.fn(),
+  streamWrite: vi.fn(),
+  sockets: [] as EventEmitter[],
+}));
+vi.mock("pg", () => ({
+  default: {
+    Client: class {
+      connection = {
+        stream: Object.assign(new EventEmitter(), {
+          bytesRead: 0,
+          bytesWritten: 0,
+          write: mock.streamWrite,
+          destroy: vi.fn(),
+        }),
+      };
+      constructor(configuration: unknown) {
+        mock.constructed(configuration);
+        mock.sockets.push(this.connection.stream);
+      }
+      connect = mock.connect;
+      end = mock.end;
+      on() {}
+      query = mock.query;
+    },
+  },
+}));
+import pg from "pg";
+import { installPilotPgInstrumentation } from "../../scripts/neon-benchmark/pilot/pg-instrumentation";
+import {
+  createComparablePilotWorker,
+  PILOT_SERVER_STATS_SQL,
+} from "../../scripts/neon-benchmark/pilot/worker";
+import { admission, authorityFixture } from "../fixtures/neon-pilot";
+
+const binding = {
+  connectionString: "synthetic-test-only",
+  host: "synthetic",
+  port: 5432,
+  user: "synthetic",
+  password: "synthetic",
+  database: "synthetic",
+} as Hyperdrive;
+const environment = {
+  DB: {
+    prepare: () => {
+      throw Error("D1 must not be called");
+    },
+    batch: () => {
+      throw Error("D1 must not be called");
+    },
+    exec: () => {
+      throw Error("D1 must not be called");
+    },
+    withSession: () => {
+      throw Error("D1 must not be called");
+    },
+    dump: () => {
+      throw Error("D1 must not be called");
+    },
+  } satisfies D1Database,
+  HDB_PUBLIC_NEON: binding,
+  PUBLIC_DATA_BACKEND: "neon",
+  NEON_PUBLIC_CACHE_EPOCH: "synthetic-pilot",
+  ASSETS: {
+    fetch: async () => new Response(),
+    connect: () => {
+      throw Error("Asset socket must not be called");
+    },
+  } satisfies Fetcher,
+  SHORTLIST_WRITE_LIMITER: { limit: async () => ({ success: true }) },
+} satisfies Env;
+const candidate = {
+  town: "JURONG WEST",
+  block: "211",
+  streetName: "BOON LAY PL",
+  flatType: "3 ROOM",
+  floorAreaSqm: 93,
+  storeyRange: "07 TO 09",
+  leaseCommenceYear: 1990,
+  referenceMonth: "2026-09",
+};
+const transaction = {
+  town: candidate.town,
+  block: candidate.block,
+  street_name: candidate.streetName,
+  flat_type: candidate.flatType,
+  floor_area_sqm: 93,
+  storey_range: candidate.storeyRange,
+  lease_commence_date: 1990,
+  resale_price: 400_000,
+  flat_model: "Improved",
+  month: "2026-09",
+};
+
+describe("frozen comparable handler with prospective pilot dispatch", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mock.sockets.splice(0);
+    mock.streamWrite.mockReturnValue(true);
+    mock.connect.mockResolvedValue(undefined);
+    mock.end.mockResolvedValue(undefined);
+    mock.query.mockImplementation(async (sql: string) => {
+      if (sql === PILOT_SERVER_STATS_SQL)
+        return {
+          rows: [
+            {
+              role: "hdb_benchmark_runtime",
+              successful_sql_calls: 999_999,
+              successful_sql_ms: 100,
+            },
+          ],
+        };
+      if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ cnt: 30 }] };
+      if (/^SELECT/i.test(sql.trim()))
+        return {
+          rows: [
+            { ...transaction, id: 280851 },
+            { ...transaction, id: 280852 },
+          ],
+        };
+      return { rows: [] };
+    });
+  });
+  it("counts snapshot, counts, rows, COMMIT and diagnostic before sending; preserves duplicates", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    const instrumentation = installPilotPgInstrumentation(pg);
+    try {
+      const handler = createComparablePilotWorker({ authority, instrumentation });
+      const response = await handler(
+        new Request("https://synthetic.test/api/comparable-transactions", {
+          method: "POST",
+          body: JSON.stringify(candidate),
+          headers: {
+            "content-type": "application/json",
+            "content-length": String(
+              new TextEncoder().encode(JSON.stringify(candidate)).byteLength,
+            ),
+          },
+        }),
+        environment,
+        "request1",
+      );
+      expect(response.status).toBe(200);
+      const body = (await response.json()) as { comparables: { transactionId: string }[] };
+      expect(body.comparables.map((row) => row.transactionId)).toEqual(
+        expect.arrayContaining(["280851", "280852"]),
+      );
+      const sql = mock.query.mock.calls.map((call) => call[0] as string);
+      expect(sql[0]).toBe("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
+      expect(sql.at(-2)).toBe("COMMIT");
+      expect(sql.at(-1)).toBe(PILOT_SERVER_STATS_SQL);
+      const state = await authority.snapshot();
+      expect(state.applicationStatements).toBe(sql.length);
+      expect(state.serverObservations[0].calls).toBe(999_999);
+      expect(response.headers.get("cache-control")).toContain("no-store");
+      expect(JSON.parse(response.headers.get("x-pilot-statement-ids")!)).toEqual(
+        state.statements.map((entry) => entry.id),
+      );
+    } finally {
+      instrumentation.restore();
+    }
+  });
+  it("refuses replay in a different handler sharing the authority", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    await authority.activateRequest("request1");
+    const instrumentation = installPilotPgInstrumentation(pg);
+    try {
+      const handler = createComparablePilotWorker({ authority, instrumentation });
+      await expect(
+        handler(
+          new Request("https://synthetic.test/api/comparable-transactions"),
+          environment,
+          "request1",
+        ),
+      ).rejects.toThrow("replayed");
+      expect(mock.query).not.toHaveBeenCalled();
+    } finally {
+      instrumentation.restore();
+    }
+  });
+  it("fails closed with a missing shared authority or D1 selector and never queries", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    const instrumentation = installPilotPgInstrumentation(pg);
+    try {
+      const handler = createComparablePilotWorker({ authority, instrumentation });
+      await expect(
+        handler(
+          new Request("https://synthetic.test/api/comparable-transactions"),
+          { ...environment, PUBLIC_DATA_BACKEND: "d1" },
+          "request1",
+        ),
+      ).rejects.toThrow("AUTHORIZATION");
+      expect(mock.query).not.toHaveBeenCalled();
+      expect(() => new pg.Client()).toThrow("AUTHORIZATION");
+    } finally {
+      instrumentation.restore();
+    }
+  });
+  it("records rollback when the original query fails without D1 fallback", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    mock.query.mockImplementation(async (sql: string) => {
+      if (sql === PILOT_SERVER_STATS_SQL)
+        return {
+          rows: [
+            { role: "hdb_benchmark_runtime", successful_sql_calls: 83, successful_sql_ms: 0.7 },
+          ],
+        };
+      if (/COUNT/i.test(sql))
+        throw Object.assign(Error("origin password withheld"), { code: "57014" });
+      return { rows: [] };
+    });
+    const instrumentation = installPilotPgInstrumentation(pg);
+    try {
+      const handler = createComparablePilotWorker({ authority, instrumentation });
+      const request = new Request("https://synthetic.test/api/comparable-transactions", {
+        method: "POST",
+        body: JSON.stringify(candidate),
+        headers: {
+          "content-type": "application/json",
+          "content-length": String(new TextEncoder().encode(JSON.stringify(candidate)).byteLength),
+        },
+      });
+      await handler(request, environment, "request1").catch(() => undefined);
+      const state = await authority.snapshot();
+      expect(mock.query.mock.calls.map((call) => call[0])).toContain("ROLLBACK");
+      expect(state.applicationStatements).toBe(mock.query.mock.calls.length);
+      expect(JSON.stringify(state)).not.toContain("origin password");
+    } finally {
+      instrumentation.restore();
+    }
+  });
+  it("stops the shared pilot after protocol overflow, retaining SQL permits and reservations", async () => {
+    const { authority } = await authorityFixture();
+    await authority.admitRequest(admission());
+    const originalQuery = mock.query.getMockImplementation()!;
+    let injected = false;
+    mock.query.mockImplementation(async (sql: string) => {
+      if (!injected) {
+        injected = true;
+        mock.sockets[0].emit("data", new Uint8Array(2_000_001));
+      }
+      return originalQuery(sql);
+    });
+    const instrumentation = installPilotPgInstrumentation(pg);
+    try {
+      const handler = createComparablePilotWorker({ authority, instrumentation });
+      const body = JSON.stringify(candidate);
+      await expect(
+        handler(
+          new Request("https://synthetic.test/api/comparable-transactions", {
+            method: "POST",
+            body,
+            headers: {
+              "content-type": "application/json",
+              "content-length": String(new TextEncoder().encode(body).byteLength),
+            },
+          }),
+          environment,
+          "request1",
+        ),
+      ).rejects.toThrow("EVIDENCE");
+      const state = await authority.snapshot();
+      expect(state.stopped).toBe(true);
+      expect(state.applicationStatements).toBe(mock.query.mock.calls.length);
+      expect(state.receivedDatabaseBytesReserved).toBe(2_000_000);
+    } finally {
+      instrumentation.restore();
+    }
+  });
+});
```
