# Candidate shared-counter verification — authentication blocked

Captured 2026-10-05T12:38:47.164843+00:00. Branch `feat/d1-free-incremental-refresh`, HEAD `482be1eba9ff2091c1580f5757d7b33e20b26515`. All earlier uncommitted work is preserved.

**The remote diagnostic did not run.** The existing Cloudflare authentication returned HTTP 401 on the first read-only Hyperdrive-list preflight. No Worker, Hyperdrive or durable-object namespace was created, no database connection was opened, and no comparable POST was sent. This is a provider authentication response; automatic approval review did not reject the action.

## Exact attempt

The intended isolated target was Neon project `wispy-mouse-67963002`, branch `production-candidate-20261005` / `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, Singapore. The existing SELECT-only role was `hdb_benchmark_runtime`; no credentials, grants or role defaults were changed.

Neon endpoint metadata succeeded and showed `idle`, maximum 1 CU, suspended since `2026-10-05T10:22:02Z`. This control-plane lookup is not a PostgreSQL query and does not establish provider billing.

The failed request was `GET /accounts/059214b3bd95f4adf743d960c23936dc/hyperdrive/configs`, started `2026-10-05T12:27:12.232Z`, completed `2026-10-05T12:27:13.899Z`. It returned HTTP 401 and 105 HTTP response bytes. A durable HTTP receipt preserves status, time, response hash and accounting state. Raw control-plane body capture was deliberately disabled. The cause of the credential rejection is therefore UNKNOWN; no expiry claim is made. No alternate token, connector path, refresh, login or automatic retry was attempted.

| Measurement                                 | Result                                  |
| ------------------------------------------- | --------------------------------------- |
| Sequential diagnostic application SQL       | 0; not run                              |
| Concurrent diagnostic application SQL       | 0; not run                              |
| Comparable POSTs / application SQL          | 0 / 0; not run                          |
| Database protocol received / sent bytes     | 0 / 0; no PostgreSQL connection reached |
| Control-plane HTTP response bytes           | 105; separate from database traffic     |
| Provider SQL / compute / network billing    | UNKNOWN                                 |
| New Worker / Hyperdrive / counter namespace | None                                    |
| Cleanup required                            | None                                    |

The HTTP receipt's PostgreSQL byte fields remain null because that recorder did not measure a PostgreSQL stream. The zero database-transfer conclusion comes from the failed preflight stopping execution before any PostgreSQL path. The existing candidate branch remains intact.

## Local harness work completed

One durable-object identity owns the activation cohort. Lower caps are checked inside its storage transaction. The planned sequential phase permits `A:s1`, `A:s2`, `B:s1` and refuses `B:s2` before pg/Hyperdrive. The separate simultaneous-request phase has cap 1. Neither phase consumes or resets the later 90-command comparable pool. Authorized identifiers and sequence receipts are persisted before driver sends. This design is tested locally; its actual cross-isolate remote behavior is **not demonstrated**.

| File                                            | Authorized local change                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/neon-benchmark/pilot/bounded-store.ts` | New lower-cap wrapper checks 3/1 SQL diagnostic caps inside the durable transaction; cannot widen the 90 application-command cap.        |
| `scripts/neon-benchmark/pilot/dispatch.ts`      | Optional durable driver-intent hook runs after global authorization and before sending SQL; failed receipt persistence refuses the send. |
| `scripts/neon-benchmark/pilot/evidence.ts`      | HTTP recorder accepts only an observation snapshot interface, keeping remote authorization separate from Node observation.               |
| `scripts/neon-benchmark/pilot/worker.ts`        | Wires the optional intent hook into the existing instrumented driver; frozen SQL diagnostics and product adapters remain unchanged.      |
| `tests/unit/neon-pilot-bounded.test.ts`         | Three tests cover cross-request fourth-command refusal, concurrent lower cap, and failed pre-send receipt persistence.                   |

The deployable wrapper, control script, generated bindings, dry-run bundle, configuration and receipts live in the ignored `.neon-benchmark/shared-counter-candidate-pilot-20261005/` directory. They are investigation state, not repository application configuration. No secret file contents are included in this report. The terminal `lifecycle.json` prevents reusing this failed attempt as an automatic retry. The accepted earlier repair report remains a historical snapshot; its original code patch predates these separately authorized additions.

## Independent byte gate remains unresolved

Restoring Cloudflare authentication would not admit comparable requests. A 25 MB receive reservation and destroying a stream after an overflowing chunk do not prove a hard physical database-transfer limit. The unchanged adapter caps transaction fetches at 150 rows and trend pair count at 30, but requests full matching trend history. The pinned corpus has 988,128 transactions and 45,028 trend rows. Text widths and complete PostgreSQL startup/notices/framing plus opaque provider-origin traffic have not been bounded. Returned API result count is not a bound on database protocol traffic.

No comparable POST may be sent until full result and protocol/connection overhead bounds are defensible, or the operator explicitly authorizes a narrower quota definition. Product semantics, SQL adapters, diagnostics, publisher and budgets remain frozen. There was no attempt to reduce semantics, raise the allowance or substitute credentials.

## Time and compute admission model

At maximum 1 CU, the modeled 300-second active window plus 600-second Hyperdrive idle tail plus 300-second Neon suspension tail totals 0.333333 CU-hours, within the 0.35 allowance. The 45-second cleanup reserve is inside the active window, and every action must fit its entire timeout plus cleanup before admission. This is a time proxy, not measured provider billing. No activation cohort started during this attempt.

The 60-second server timeout remains unchanged. A client response timeout or abort does not prove server termination; ambiguous outcomes retain reservations and never authorize automatic SQL retry. Cloudflare documents Hyperdrive connection lifecycle and query-duration limits, but those documents do not prove this workload's complete database-byte envelope. [Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/), [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/).

## Validation and preservation

`vp run test neon-pilot`: 46 tests in 5 files passed. `vp run check`: format, lint, strict types, boundaries, 2,108 tests in 206 files, build and bundle passed. Lint retained 18 earlier warnings. The full test log starts at Singapore local `20:26:19`, which is `2026-10-05T12:26:19Z`. A separate private-harness TypeScript check passed. Wrangler 4.99.0 dry-run passed: 1,011.30 KiB / 170.38 KiB gzip; **no deployment occurred**.

All 19 pinned publisher/runtime/test hashes and all 6 original failed-pilot artifact hashes match. This attempt made no D1 calls, production mutation, application deployment, workflow enablement, credential/grant change, commit, push, PR or merge. Pre-existing tracked changes and untracked prototypes remain untouched except the explicitly authorized harness additions and evidence updates.

The accepted repair report's timestamp is corrected from erroneously marked `19:44Z` to **2026-10-05T11:44:48Z**. Its saved Vitest log uses Asia/Singapore local `19:44:48`; the +08:00 zone and log mtime `11:45:10.808636Z` corroborate the conversion. No gate was rerun solely to repair the timestamp.

## Outcome and remaining blocker

**AUTHENTICATION BLOCKED; REMOTE DIAGNOSTIC NOT RUN.** The existing Cloudflare authorization must be restored by the operator and a fresh bounded attempt approved. The independent physical-byte bound must also be resolved before any comparable POST. Local validation is complete; it does not certify remote counter behavior or migration viability.

## Machine-readable evidence

```json
{
  "capturedAtUTC": "2026-10-05T12:38:47.164843+00:00",
  "scope": "Candidate-only shared-counter verification: terminal authentication failure during metadata preflight; remote diagnostic and comparable pilot NOT RUN.",
  "status": "AUTHENTICATION_BLOCKED_NO_RESOURCES_OR_SQL",
  "git": {
    "branch": "feat/d1-free-incremental-refresh",
    "HEAD": "482be1eba9ff2091c1580f5757d7b33e20b26515",
    "preExistingChangesPreserved": true,
    "finalStatus": " M .gitignore\n M README.md\n M cloudflare-env.d.ts\n M docs/d1-free-sustainability.md\n M package.json\n M pnpm-lock.yaml\n M scripts/lib/sync/fetchers.ts\n M scripts/lib/sync/source-version.ts\n M scripts/sync-data.ts\n M tests/unit/fetchers.test.ts\n M tests/unit/source-version.test.ts\n M worker/index.ts\n M worker/og.ts\n?? .github/workflows/refresh-neon.yml\n?? docs/evidence/neon-benchmark-2026-10-04.json\n?? docs/evidence/neon-cache-only-stage-2026-10-04.json\n?? docs/evidence/neon-comparable-candidate-pilot-2026-10-05.json\n?? docs/evidence/neon-comparable-local-2026-10-05.json\n?? docs/evidence/neon-comparable-pilot-diagnostic-2026-10-05.json\n?? docs/evidence/neon-comparable-pilot-repair-2026-10-05.json\n?? docs/evidence/neon-comparable-pilot-repair-2026-10-05.patch\n?? docs/evidence/neon-console-usage-2026-10-04.json\n?? docs/evidence/neon-context-provenance-forecast-2026-10-04.json\n?? docs/evidence/neon-cow-candidate-2026-10-05.json\n?? docs/evidence/neon-genuine-after-state-2026-10-04.json\n?? docs/evidence/neon-genuine-refresh-2026-10-04.json\n?? docs/evidence/neon-manual-cache-before-2026-10-04.json\n?? docs/evidence/neon-manual-recovery-2026-10-04.json\n?? docs/evidence/neon-manual-refresh-observability-2026-10-04.json\n?? docs/evidence/neon-manual-run-summary-2026-10-04.json\n?? docs/evidence/neon-materialized-detail-local-2026-10-04.json\n?? docs/evidence/neon-monthly-refresh-budget-2026-10-04.json\n?? docs/evidence/neon-monthly-refresh-policy-2026-10-04.patch\n?? docs/evidence/neon-official-context-capture-2026-10-04.json\n?? docs/evidence/neon-pg18-formal-verification-2026-10-04.json\n?? docs/evidence/neon-portability-proof-2026-10-05.json\n?? docs/evidence/neon-production-cutover-config-2026-10-05.patch\n?? docs/evidence/neon-production-cutover-plan-2026-10-05.json\n?? docs/evidence/neon-reconciliation-approval-2026-10-04.json\n?? docs/evidence/neon-reconciliation-policy-analysis-2026-10-04.json\n?? docs/evidence/neon-reconciliation-review-2026-10-04.json\n?? docs/evidence/neon-runtime-aggregate-bound-2026-10-05.json\n?? docs/evidence/neon-runtime-read-replay-2026-10-05.json\n?? docs/evidence/neon-shared-counter-verification-2026-10-05.json\n?? docs/evidence/neon-source-discrepancy-2026-10-04.json\n?? docs/evidence/neon-source-offline-capture-2026-10-04.json\n?? docs/evidence/neon-staged-execution-2026-10-04.json\n?? docs/evidence/neon-staged-publication-proposal-2026-10-04.json\n?? docs/evidence/neon-staged-remote-admission-2026-10-04.json\n?? docs/evidence/neon-storage-proof-2026-10-04.json\n?? docs/neon-benchmark-2026-10-04.md\n?? docs/neon-manual-publication-2026-10-04.md\n?? docs/neon-monthly-refresh-policy.md\n?? docs/neon-reconciliation-proposal-2026-10-04.md\n?? docs/proposals/\n?? neon.ts\n?? scripts/lib/sync/neon-reconciliation.ts\n?? scripts/lib/sync/neon-usage.ts\n?? scripts/lib/sync/neon.ts\n?? scripts/lib/sync/refresh-policy.ts\n?? scripts/neon-benchmark/\n?? scripts/report-neon-refresh-budget.ts\n?? scripts/restore-neon-benchmark.ts\n?? scripts/sync-neon.ts\n?? tests/fixtures/neon-pilot.ts\n?? tests/neon-benchmark.test.ts\n?? tests/unit/neon-cache-only-context.test.ts\n?? tests/unit/neon-comparable-read.test.ts\n?? tests/unit/neon-context-forecast.test.ts\n?? tests/unit/neon-materialized-details.test.ts\n?? tests/unit/neon-pilot-accounting.test.ts\n?? tests/unit/neon-pilot-bounded.test.ts\n?? tests/unit/neon-pilot-controller.test.ts\n?? tests/unit/neon-pilot-evidence.test.ts\n?? tests/unit/neon-pilot-worker.test.ts\n?? tests/unit/neon-public-routing.test.ts\n?? tests/unit/neon-reconciliation.test.ts\n?? tests/unit/neon-refresh.test.ts\n?? tests/unit/neon-runtime-read.test.ts\n?? tests/unit/neon-stage-artifacts.test.ts\n?? tests/unit/neon-staged-plan.test.ts\n?? tests/unit/neon-staged-publisher.test.ts\n?? tests/unit/neon-transport.test.ts\n?? tests/unit/refresh-policy.test.ts\n?? tests/unit/source-diagnostic.test.ts\n?? worker/neon-public-read-sql.ts\n?? worker/neon-read-db.ts\n?? worker/neon-transport.ts\n?? worker/public-read-backend.ts\n"
  },
  "target": {
    "project": "wispy-mouse-67963002",
    "branchName": "production-candidate-20261005",
    "branchId": "br-rough-frost-b3e2ks1b",
    "endpointId": "ep-steep-water-b300tebo",
    "region": "aws-ap-southeast-1",
    "role": "hdb_benchmark_runtime"
  },
  "endpointMetadata": {
    "id": "ep-steep-water-b300tebo",
    "branch": "br-rough-frost-b3e2ks1b",
    "maxCU": 1,
    "currentState": "idle",
    "suspendedAt": "2026-10-05T10:22:02Z"
  },
  "cloudflareFailure": {
    "method": "GET",
    "path": "/accounts/059214b3bd95f4adf743d960c23936dc/hyperdrive/configs",
    "authentication": "Existing stored Wrangler OAuth; no refresh or alternate credential/path attempted.",
    "credentialFailureCause": "UNKNOWN; raw response body intentionally not retained.",
    "receipt": {
      "id": "control1",
      "sequence": 1,
      "method": "GET",
      "label": "control-hyperdrive",
      "startedAtUTC": "2026-10-05T12:27:12.232Z",
      "endedAtUTC": "2026-10-05T12:27:13.899Z",
      "stage": "parse",
      "responseAvailable": true,
      "status": 401,
      "contentType": "application/json",
      "applicationStatementsBefore": 0,
      "applicationAccountingAvailableBefore": true,
      "applicationStatementsAfter": 0,
      "applicationAccountingAvailableAfter": true,
      "requestBodyBytes": 0,
      "responseBodyBytes": 105,
      "responseSHA256": "6979949596e21188252f2394e828a8d535daec89ca894ea4aa85179c83e27e00",
      "bodySnippet": "[BODY_CAPTURE_DISABLED]",
      "failure": "http-status",
      "failureStage": "parse",
      "errorName": "PilotFailure",
      "protocolReceivedBytes": null,
      "protocolSentBytes": null,
      "providerObservationAvailable": false,
      "finalEvidenceWriteFailed": false,
      "transportCode": null
    },
    "journalSnapshots": 6,
    "distinctHTTPRequests": 1,
    "journalSHA256": "66fd0301c233c54b5f9977f66f5892407eb98c24dc93102c536f7274eb036092"
  },
  "remoteCounts": {
    "applicationSQL": 0,
    "sequentialDiagnosticSQL": 0,
    "concurrentDiagnosticSQL": 0,
    "comparablePOSTs": 0,
    "databaseProtocolReceivedBytes": 0,
    "databaseProtocolSentBytes": 0,
    "zeroEvidence": "No Worker deployment, diagnostic request or PostgreSQL connection code path was reached; HTTP receipt protocol fields remain null rather than fabricated measurements.",
    "cloudflareControlHTTPResponseBytes": 105,
    "computeActivationCohortStarted": false,
    "providerSQL": "UNKNOWN",
    "providerComputeBilling": "UNKNOWN",
    "providerNetworkBilling": "UNKNOWN"
  },
  "resources": {
    "created": [],
    "workerDeployed": false,
    "hyperdriveCreated": false,
    "durableObjectNamespaceCreated": false,
    "cleanupRequired": false,
    "preserved": [],
    "candidatePreExistingAndPreserved": true
  },
  "safety": {
    "noCredentialOrGrantChanges": true,
    "noProductionMutations": true,
    "noD1Queries": true,
    "noApplicationDeployment": true,
    "noScheduleChanges": true,
    "noPushOrCommit": true,
    "terminalReceiptPreventsRetry": true,
    "freshAuthorizationRequiredBeforeRetry": true
  },
  "localHarnessChanges": {
    "scripts/neon-benchmark/pilot/bounded-store.ts": "New lower-cap wrapper checks 3/1 SQL diagnostic caps inside the durable transaction; cannot widen the 90 application-command cap.",
    "scripts/neon-benchmark/pilot/dispatch.ts": "Optional durable driver-intent hook runs after global authorization and before sending SQL; failed receipt persistence refuses the send.",
    "scripts/neon-benchmark/pilot/evidence.ts": "HTTP recorder accepts only an observation snapshot interface, keeping remote authorization separate from Node observation.",
    "scripts/neon-benchmark/pilot/worker.ts": "Wires the optional intent hook into the existing instrumented driver; frozen SQL diagnostics and product adapters remain unchanged.",
    "tests/unit/neon-pilot-bounded.test.ts": "Three tests cover cross-request fourth-command refusal, concurrent lower cap, and failed pre-send receipt persistence."
  },
  "privateHarness": {
    "directory": ".neon-benchmark/shared-counter-candidate-pilot-20261005",
    "worker": "worker.ts",
    "controller": "execute.mts",
    "preflight": "preflight.json",
    "terminalLifecycle": "lifecycle.json",
    "deployModeExecuted": false,
    "sourceSHA256": {
      "scripts/neon-benchmark/pilot/bounded-store.ts": "3474f342be5ec4f84aa539b287348e2e8bccba1e6ca038d83ffffa413ceb2ac5",
      "scripts/neon-benchmark/pilot/dispatch.ts": "133f9dfac115baa8c4ffee97a05cc6461aa8d6963ae3834f4a01d2bf4cccaa8e",
      "scripts/neon-benchmark/pilot/evidence.ts": "39b4d99481731ad63c52edb5c4094c5bf09d7ee918d758fbf414265a7fa2d8da",
      "scripts/neon-benchmark/pilot/worker.ts": "001b32284f9dc85e99d8b6b772ec3736e5b570dab85a9de931289a680d789041",
      "tests/unit/neon-pilot-bounded.test.ts": "ffb72f230bcc16a55b0378bb3ecfad195036b266158e7a630e83377539e5cd51",
      ".neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts": "1c37ca61750d3a70b8439c3963748ea6e5df8f9bbb12570734df8c0f80660132",
      ".neon-benchmark/shared-counter-candidate-pilot-20261005/execute.mts": "7ed3786e2f22ac844449e81bb89a0157797fa2ecd930dfc934ef6c8c66e27744",
      ".neon-benchmark/shared-counter-candidate-pilot-20261005/wrangler.jsonc": "67ee282449c01a2440f19ab261a49e6ca962594749f7764313ea5312ab349854",
      ".neon-benchmark/shared-counter-candidate-pilot-20261005/tsconfig.json": "f50fef73c0bd4819d6d3c105190c5a85f6b0e5fe48423e923d8444831b73430e"
    }
  },
  "globalAuthorityDesign": {
    "authority": "One durable-object identity for the activation cohort; all phase counters use durable storage transactions.",
    "sequentialDiagnosticCap": 3,
    "concurrentDiagnosticCap": 1,
    "comparableCap": 90,
    "plannedSequentialTrace": ["A:s1", "A:s2", "B:s1"],
    "plannedFourthOutcome": "B:s2 rejected before pg/Hyperdrive dispatch.",
    "concurrentDiagnostic": "Two requests share one independent cap-1 diagnostic phase; at most one driver send.",
    "preSendEvidence": "Persist authorized command identifier/sequence before driver invocation; no raw SQL parameters or credentials.",
    "remoteProof": "NOT RUN; local tests and deployment dry-run do not establish cross-isolate remote behavior."
  },
  "admission": {
    "capturedAtUTC": "2026-10-05T12:02:40.298895+00:00",
    "targetBranch": "br-rough-frost-b3e2ks1b",
    "targetEndpoint": "ep-steep-water-b300tebo",
    "sequentialDiagnosticApplicationCap": 3,
    "concurrentDiagnosticApplicationCap": 1,
    "comparableApplicationCap": 90,
    "comparablePOSTCap": 10,
    "maximumReceivedDatabaseBytes": 25000000,
    "maximumSentDatabaseBytes": 1000000,
    "maximumClientConnections": 13,
    "maximumHyperdriveOriginConnections": 5,
    "maximumConcurrentComparableRequests": 1,
    "maxCU": 1,
    "activeHardWindowMs": 300000,
    "protectedCleanupMs": 45000,
    "hyperdriveIdleTailMs": 600000,
    "neonIdleTailMs": 300000,
    "modeledWorstCUHours": 0.3333333333333333,
    "approvedCUHours": 0.35,
    "remainingProxyGraceMs": 60000,
    "diagnosticAndComparableShareOneActivationCohort": true,
    "recreationBetweenDiagnosticAndComparable": false,
    "noIdleWaitBetweenPhases": true,
    "conditionalAdmission": "Each action requires full timeout within remaining active window plus cleanup reserve; stop before any bound is exhausted",
    "providerBilling": "UNKNOWN",
    "oracleCounts": {
      "transactions": 988128,
      "trends": 45028
    }
  },
  "admissionLimitations": {
    "computeProxy": "At max 1 CU: 300-second active window + 600-second Hyperdrive idle tail + 300-second Neon idle tail = 0.333333 CU-hours. This is a conservative time model, not provider billing.",
    "cleanup": "45 seconds reserved within the active window; each action requires its full server/transport timeout plus cleanup before admission.",
    "timeout": "60-second server statement_timeout remains unchanged. Client response abort does not prove server cancellation and never authorizes an automatic SQL retry or reservation refund.",
    "bytes": "25,000,000 received / 1,000,000 sent byte reservations with instrumented stream destruction are not a demonstrated physical bound."
  },
  "independentComparableGate": {
    "status": "NOT PROVEN \u2014 STOP BEFORE COMPARABLE POST",
    "reason": "Bounded transaction row counts do not bound full trend history, unconstrained text widths, PostgreSQL startup/notices/protocol framing, or opaque Hyperdrive-origin overhead. Post-chunk stream destruction may overshoot.",
    "unchangedQueryFacts": {
      "transactionFetchLimit": 150,
      "maximumTrendPairs": 30,
      "trendHistoryQueryLimit": null,
      "pinnedCorpusTransactions": 988128,
      "pinnedCorpusTrends": 45028
    },
    "requiredBeforeExecution": "A defensible end-to-end bound for complete results plus connection/protocol overhead, or an explicitly authorized narrower quota scope. Current credentials restored alone do not resolve this gate.",
    "notAttempted": [
      "Changed product SQL",
      "Reduced comparable semantics",
      "Raised byte cap",
      "Blind retry",
      "Alternate provider credentials"
    ]
  },
  "validation": {
    "targeted": {
      "command": "vp run test neon-pilot",
      "testsPassed": 46,
      "filesPassed": 5
    },
    "fullGate": {
      "command": "vp run check",
      "exitCode": 0,
      "testsPassed": 2108,
      "filesPassed": 206,
      "vitestDurationSeconds": 18.07,
      "startedAtUTC": "2026-10-05T12:26:19Z",
      "rawVitestStart": "20:26:19",
      "rawLogTimezone": "Asia/Singapore +08:00",
      "format": "PASS",
      "lint": "PASS (18 pre-existing no-base-to-string warnings)",
      "typecheck": "PASS",
      "boundaries": "PASS",
      "build": "PASS",
      "bundle": "PASS",
      "logSHA256": "93d3f2cce4b4f8b62e0c6249697af3b4785cdbc7cfa7072c4fd3e1dc2395f0f2"
    },
    "privateHarnessTypecheck": "PASS; separate tsc includes temporary Worker, controller and generated bindings.",
    "wranglerDryRun": {
      "result": "PASS",
      "version": "4.99.0",
      "bundleKiB": 1011.3,
      "gzipKiB": 170.38,
      "deployed": false,
      "logSHA256": "e5cbe8bd9973e79b73ee01e67beb81784c95a5f53769d90e9c991cbde22e45a5"
    }
  },
  "historicalTimestampCorrection": {
    "rawVitestStart": "2026-10-05 19:44:48",
    "rawLogTimezone": "Asia/Singapore",
    "offset": "+08:00",
    "correctedUTC": "2026-10-05T11:44:48Z",
    "checkLogMtimeUTC": "2026-10-05T11:45:10.808636+00:00",
    "verification": "Node Intl default Asia/Singapore; macOS date offset +0800; log mtime and 18.81-second test duration agree. Original incorrectly appended Z to local test time."
  },
  "frozenVerification": {
    "count": 19,
    "allMatch": true,
    "checks": {
      "scripts/neon-benchmark/materialized-details.ts": {
        "expected": "0989dc960c0063d3aa6de3a758db187e7beb10e9911cc1c222425f0044f89025",
        "actual": "0989dc960c0063d3aa6de3a758db187e7beb10e9911cc1c222425f0044f89025",
        "matches": true
      },
      "scripts/neon-benchmark/staged-plan.ts": {
        "expected": "d0280b4e4f6538bd9b9a67e1c63e17fd29c3d60400b4733a4d04a19a715bdbd0",
        "actual": "d0280b4e4f6538bd9b9a67e1c63e17fd29c3d60400b4733a4d04a19a715bdbd0",
        "matches": true
      },
      "scripts/neon-benchmark/staged-execution.ts": {
        "expected": "a20c3e7030660b6d6ab0260412b536e03b9f62e785bded24091183fbf37bfef0",
        "actual": "a20c3e7030660b6d6ab0260412b536e03b9f62e785bded24091183fbf37bfef0",
        "matches": true
      },
      "scripts/neon-benchmark/staged-validation.ts": {
        "expected": "78c106a34b2dd79e0f7d9ad16f8c771ba34bbe89463d3812d28b9297cacdf5a8",
        "actual": "78c106a34b2dd79e0f7d9ad16f8c771ba34bbe89463d3812d28b9297cacdf5a8",
        "matches": true
      },
      "scripts/neon-benchmark/staged-publisher.ts": {
        "expected": "39301b135ca6e4cfad7249bd271c5f62c31ea1571d221fa649d0ed672d61d586",
        "actual": "39301b135ca6e4cfad7249bd271c5f62c31ea1571d221fa649d0ed672d61d586",
        "matches": true
      },
      "scripts/neon-benchmark/local-pg18.mts": {
        "expected": "0d33cde83a745bfffe106bde966f1e09615130dd7dbc638f7de872f6c28c981e",
        "actual": "0d33cde83a745bfffe106bde966f1e09615130dd7dbc638f7de872f6c28c981e",
        "matches": true
      },
      "scripts/neon-benchmark/verify-pg18.mts": {
        "expected": "6a1a5d2224e797cf525360486caf4d5677ea710add86e45bf49c9fa6ecc1828e",
        "actual": "6a1a5d2224e797cf525360486caf4d5677ea710add86e45bf49c9fa6ecc1828e",
        "matches": true
      },
      "scripts/neon-benchmark/verify-pg18-edges.mts": {
        "expected": "2f1cb6ac1253f9365a84809c53c27322dc1b18e7f68dd8d29acb190564732630",
        "actual": "2f1cb6ac1253f9365a84809c53c27322dc1b18e7f68dd8d29acb190564732630",
        "matches": true
      },
      "scripts/neon-benchmark/verify-materialized-local.mts": {
        "expected": "e90faa58efbbb101b2fd60b67c80ea8677bfb1cacadf1b9bdf9ec0bfa3f97d67",
        "actual": "e90faa58efbbb101b2fd60b67c80ea8677bfb1cacadf1b9bdf9ec0bfa3f97d67",
        "matches": true
      },
      "worker/neon-read-db.ts": {
        "expected": "f31704dc96c2ab0a2b552806e1ac574f02d21263f31fd5efd3d625bbe131601c",
        "actual": "f31704dc96c2ab0a2b552806e1ac574f02d21263f31fd5efd3d625bbe131601c",
        "matches": true
      },
      "worker/neon-transport.ts": {
        "expected": "d353851961910986fcad1e78d4139c64517188a0986b3fa11ea051caf85889f8",
        "actual": "d353851961910986fcad1e78d4139c64517188a0986b3fa11ea051caf85889f8",
        "matches": true
      },
      "worker/public-read-backend.ts": {
        "expected": "6a09d438a5be715a70caf5ed350e354ee9bf50c2a0b57d2efc4f46bb83d9f3c8",
        "actual": "6a09d438a5be715a70caf5ed350e354ee9bf50c2a0b57d2efc4f46bb83d9f3c8",
        "matches": true
      },
      "worker/neon-public-read-sql.ts": {
        "expected": "bd9eb6651a19e6d6d45426a0f58e14113138d99363b580eeceb269d7305c154e",
        "actual": "bd9eb6651a19e6d6d45426a0f58e14113138d99363b580eeceb269d7305c154e",
        "matches": true
      },
      "worker/index.ts": {
        "expected": "2268c5a0b2bf7e99b94115d05a6e6e4a77acd7eabbdf65869f0ca622d651a8ff",
        "actual": "2268c5a0b2bf7e99b94115d05a6e6e4a77acd7eabbdf65869f0ca622d651a8ff",
        "matches": true
      },
      "worker/og.ts": {
        "expected": "b402ebe23cb3477d1d9792dd9610e2283b0fafb1794f6cda0e59d9200316da83",
        "actual": "b402ebe23cb3477d1d9792dd9610e2283b0fafb1794f6cda0e59d9200316da83",
        "matches": true
      },
      "cloudflare-env.d.ts": {
        "expected": "121a83543641ecbeb86efa25969a8c178d0876f8ef78e5f436bb18fd86a2317a",
        "actual": "121a83543641ecbeb86efa25969a8c178d0876f8ef78e5f436bb18fd86a2317a",
        "matches": true
      },
      "tests/unit/neon-comparable-read.test.ts": {
        "expected": "484fd52a06c63f176d4d3d9805e28798ab63b163988e757cc0e337e0a2d856cd",
        "actual": "484fd52a06c63f176d4d3d9805e28798ab63b163988e757cc0e337e0a2d856cd",
        "matches": true
      },
      "tests/unit/neon-transport.test.ts": {
        "expected": "4c4b710dd4cb289109d7eeaafa89e9356d5696d95564593aecda52cb556e05d8",
        "actual": "4c4b710dd4cb289109d7eeaafa89e9356d5696d95564593aecda52cb556e05d8",
        "matches": true
      },
      "tests/unit/neon-public-routing.test.ts": {
        "expected": "6f414ae8d99e0a4232707d2b9298eabec0e82788193fb1870423cf52ebb0ffb8",
        "actual": "6f414ae8d99e0a4232707d2b9298eabec0e82788193fb1870423cf52ebb0ffb8",
        "matches": true
      }
    }
  },
  "originalFailedPilotVerification": {
    "count": 6,
    "allMatch": true,
    "checks": {
      ".neon-benchmark/comparable-candidate-pilot/lifecycle.json": {
        "expected": "c66cbb7d662cd0320a9796b51509cc41ba559606fedfd8fe2731f528dbf134f8",
        "actual": "c66cbb7d662cd0320a9796b51509cc41ba559606fedfd8fe2731f528dbf134f8",
        "matches": true
      },
      ".neon-benchmark/comparable-candidate-pilot/execute.mts": {
        "expected": "f328b4b6c8863e2598b9a840ab8384cc74c2cb88500edb696841dedd2799b163",
        "actual": "f328b4b6c8863e2598b9a840ab8384cc74c2cb88500edb696841dedd2799b163",
        "matches": true
      },
      ".neon-benchmark/comparable-candidate-pilot/worker.mts": {
        "expected": "0c781b7adb09565d49bd1c56104ae547afce4b3317ce41fbca5d8863f095c6dd",
        "actual": "0c781b7adb09565d49bd1c56104ae547afce4b3317ce41fbca5d8863f095c6dd",
        "matches": true
      },
      ".neon-benchmark/comparable-candidate-pilot/deploy.log": {
        "expected": "2d86518815858971e4c0a56a323df150c840ab687f35693c6e1a2ccbf9768e8a",
        "actual": "2d86518815858971e4c0a56a323df150c840ab687f35693c6e1a2ccbf9768e8a",
        "matches": true
      },
      ".neon-benchmark/comparable-candidate-pilot/deploy.stdout": {
        "expected": "d4566852360ce8f292240e26dbefd8ef51fb5ff6cc303bae962a1783edf5b64d",
        "actual": "d4566852360ce8f292240e26dbefd8ef51fb5ff6cc303bae962a1783edf5b64d",
        "matches": true
      },
      "docs/evidence/neon-comparable-candidate-pilot-2026-10-05.json": {
        "expected": "80cd38d645572e123c93f163ab7a120897895abed2738e8e62a62d648aaba794",
        "actual": "80cd38d645572e123c93f163ab7a120897895abed2738e8e62a62d648aaba794",
        "matches": true
      }
    }
  },
  "verdict": "REMOTE SHARED-COUNTER VERIFICATION BLOCKED; COMPARABLE PILOT NOT AUTHORIZED TO SEND UNDER UNPROVEN BYTE GATE.",
  "nextAction": "Stop remote execution. Operator must restore the existing Cloudflare authorization and grant a fresh bounded retry; resolve the physical-byte gate before comparable dispatch. Do not obtain or paste secrets in chat."
}
```
