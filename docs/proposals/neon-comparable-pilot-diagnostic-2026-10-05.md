# Isolated Neon comparable pilot: offline diagnostic and correction proposal

The pilot did not demonstrate the serving safeguards or comparable semantics. **83 is a role-wide statistics delta whose statement attribution is unknown. The observed total of 87 is not a certified upper bound under the 90-command ceiling.** The request controller lost the first safeguard request's outcome before persisting it. This report uses saved receipts and code only; no new Cloudflare/Neon API request, SQL call, resource, permission change or retry was made. Original evidence and executable source remain unchanged.

## What the 83 actually measures

The candidate owner snapshot executes:

```sql
SELECT coalesce(sum(calls), 0)
FROM pg_stat_statements
WHERE userid = (
  SELECT oid FROM pg_roles WHERE rolname = 'hdb_benchmark_runtime'
);
```

The baseline is **0**, final counter **83**, and summed `total_exec_time` rises from **0 to 0.705694 ms**. The baseline SELECT ran from **10:16:14.792 to approximately 10:16:16.440651 UTC**; the final SELECT ran from **10:16:39.724 to approximately 10:16:39.839037 UTC**. The exact subquery sampling instants inside these SELECTs were not recorded. The counter covers entries visible in the **candidate endpoint's PostgreSQL statistics**, filtered only by runtime-role OID. It has **no `dbid`, `queryid`, `toplevel`, request, connection or phase filter**. It is not an account-wide sum across independent Neon branches. Other databases on that endpoint using the same role could contribute; no such contribution was demonstrated. Tracking settings, counter resets and entry deallocation were not captured.

The interval spans Hyperdrive creation/validation, Worker deployment, the attempted safeguard GET, resource deletion and absence checks. No snapshot separates those phases, and no per-statement rows/text were retained. Consequently, **the exact 83 statements and their application/provider split cannot be recovered from these files**. Connection/session initialization, validation, health checks, resets, the safeguard path or unrelated same-role activity are possible contributors, not established assignments. Do not label all 83 as Hyperdrive setup or health probes.

| Recorded activity                                 | Saved evidence                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Comparable POSTs / comparable handler invocations | 0 / 0                                                                                      |
| Safeguard GET                                     | Controller initiated its first probe; HTTP status and returned SQL trace absent            |
| Owner SQL                                         | Two public state/statistics SELECTs and two candidate-only role-default ALTERs: 4 commands |
| Runtime statistics                                | `sum(calls)` delta 83, statement breakdown unknown                                         |
| Other active clients                              | 0 at the two snapshots, filtered to the current database and active client backends        |
| Concurrent or idle activity between snapshots     | Not continuously excluded                                                                  |
| Runtime/Worker reported SQL attempts              | Field 0 means no metrics returned, not zero proven execution                               |

The four owner commands run as `neondb_owner`, separate from the runtime-role entries. **4 + 83 does not numerically double-count those owner commands.** The general `Math.max(client attempts, owner + role delta + reported failures)` formula also avoids simply adding Worker successes twice. This run never received an intermediate server snapshot, so its speculative `+1` adjustment for the sampling query was **not applied**. Nested/top-level statistics and normalized statement entries were not captured; 83 cannot be equated to 83 unique driver calls or 83 completed HTTP operations. The field name `role_successful_calls` is a harness label for extension `calls`, not proof of complete successful/failed-attempt accounting.

An earlier saved GET pilot on the **different benchmark branch** reported runtime counter **82 at its initial diagnostic** and 190 at its final diagnostic. That is a useful clue that significant role-counter activity can precede ordinary public GETs. It is not a trace of this candidate's 83 calls and cannot calibrate a strict setup upper bound.

## Why the first response was lost

In `execute.mts:46–47`, the controller awaits `fetch`, parses `x-pilot-metrics`, reads the body, applies the body-size guard and parses body JSON **before** it creates/pushes a request record containing the HTTP status. An error at any of those stages leaves `records=[]`. The outer catch at line 82 replaces the original exception with a generic message and retains only `e.code`, `e.status` and provider codes; all are null for this outcome. Error name, sanitized message/cause and fetch stage were not retained. The fallback charge at line 48 is reached only after parsing and therefore was bypassed by this earlier failure.

The last success milestone at elapsed **18,460.889750 ms** and stop milestone at **18,844.036833 ms** bound that entire probe/failure segment to **383.147083 ms**. This was not the controller's 85-second HTTP timeout or 255-second active-work deadline. It does not show that the server's 60-second `pg_sleep` cancellation completed; an ambiguous request could still have begun work without returning its evidence. The actual cause could be fetch rejection, metrics-header parsing, body reading, the size guard or JSON parsing. None is proven. No HTTP status was persisted, so **do not invent a 403, 404, 500, DNS, TLS or PostgreSQL cause**.

No original executor stdout/stderr file was saved. The execution tool retained only the generic stopped milestone, null error code and terminal cleanup summary. `deploy.stdout`/`deploy.log` show successful deployment and the hidden `BENCHMARK_TOKEN` binding, with the expected Worker URL. The local token is exactly reused and has the expected string/ASCII shape; the deployed value was not read back. These deployment files have no safeguard HTTP status, body or runtime exception. The `fetch failed` lines in `dry-run.log` concern **Wrangler's metrics dispatcher**, not this request. Authentication refresh succeeded earlier; the old direct-token 401 is a separate resolved preflight event.

## Was the 90-command hard stop enforceable?

**Not for all server-side database commands.** The wrapper bounds instrumented Worker `query()` calls with a lease and checks known owner/returned counters. Autonomous Hyperdrive/session SQL is invisible until a returned statistics query or the final owner SELECT. At first dispatch the controller still knew three owner commands and zero runtime delta; there was no post-Hyperdrive/pre-request server admission snapshot. The 83 delta arrived only in cleanup. Its phase attribution and failed/opaque attempts are unknown.

A lost outcome left Worker attempts, bytes and connections at zero instead of consuming the full reserved lease. Failed statements not represented in the retained extension counter, other-role work, nested tracking, resets/deallocation and activity after the final sample are also unmeasured. The ten-command cleanup reserve was an arbitrary reservation, not a measured upper bound on provider cleanup/tail work. The final `observedUpper()>90` check is retrospective and uses incomplete inputs; it cannot stop opaque work before it executes. Neither exact compliance nor an exact breach is established. With 87 observed, the three-command observed margin cannot admit the safeguard and comparable suite. **Do not retry or certify safety from `87 < 90`.**

Likewise, 1,945 received / 2,765 sent PG proxy bytes and one connection measure the owner only. Zero Worker fields mean missing telemetry. Hyperdrive-origin traffic/connections and ambiguous-request transfer remain unknown; these values cannot certify the whole 25-MB/1-MB/13-connection bounds. Actual provider compute/network billing remains unknown. The active wall of 25,882.605 ms plus the reserved ten-minute Hyperdrive and five-minute Neon tails gives the existing **0.257190-CUh policy proxy**, not a billing receipt.

## Minimal correction proposal — unapplied

1. Persist a request intent/attempt record and permanently reserve SQL, byte, connection and time leases before dispatch. Record the active phase. Stop on an unmetered outcome and retain its full worst-case reservation; never interpret missing telemetry as zero or reset the ledger.
2. Persist status, content type, bounded allowlisted headers and timing as soon as headers arrive, before parsing either metrics or body. Stream a strictly bounded private body capture, retaining byte count/hash even if JSON parsing fails. Preserve sanitized exception name/code/cause and stage. Keep tokens, passwords, connection strings, unfiltered request headers and private data out of logs/Library. Persist the request record in `finally`.
3. Keep instrumented client attempts and observed server-stat deltas as separate units. Replace misleading `observedUpper`/zero claims with `observedCount` and explicit completeness flags. For any separately approved diagnostics, capture per-entry `userid`, `dbid`, `queryid`, `toplevel`, calls and SQL time, plus reset/deallocation state, at phase boundaries. Compare known application fingerprints with the residual provider/session entries; do not blindly subtract or add overlapping successes. Charge all diagnostic commands themselves.
4. Admit setup, deployment, safeguards, requests, cleanup and the idle tail together. Phase snapshots help attribution but **cannot enforce a strict all-server ceiling against autonomous opaque work with no proven bound**. Keep remote execution stopped until that bound is established or the user explicitly clarifies the budget's counting scope. Do not silently redefine the cap as client round trips, exclude provider work or raise it.
5. Before any future execution, test the corrected temporary harness offline with fetch rejection, plain-text/non-JSON error, malformed metrics, oversized/truncated body and an accepted request with a lost response. Each must retain stage/status where available, charge the full lease and stop without retry. These are proposed tests; no code or runtime change was applied here.

**Next approval:** none of this report authorizes remote work. If the operator finds it useful, separately approve **one candidate-only read-only statistics/catalog SQL statement**, one existing owner connection, at most 100 statement entries and **131,072 received bytes**, with a 5-second server limit, 15-second active limit and explicit compute reserve for one natural five-minute idle tail at pinned max 1 CU. Retain/compare the counter/reset state and safely redact SQL fragments. A later catalog read may describe only the current instance; it cannot retroactively reconstruct this interval if suspension/reset discarded its statistics. This is not approval for a Worker, Hyperdrive, role/grant change or a retry. A full corrected pilot requires new reviewed admission under the unchanged 0.35-CUh / 10-POST / 90-command / 25-MB limits and a provable command-count scope. If that scope cannot be bounded, stop.

## Retained outcome and scope

The candidate-only runtime defaults remain `default_transaction_read_only=on` and `statement_timeout=60s`, catalog verified. Actual serving write rejection, SQLSTATE `57014` cancellation and all six remote comparable semantic cases remain **NOT DEMONSTRATED**. The temporary Worker and Hyperdrive were deleted and their absence verified. Public counts, max transaction ID and manifest were unchanged. Candidate, benchmark, Neon default production and D1 are retained; there was no production routing, schedule, push, PR or merge change. The 83-call uncertainty is a measurement/admission failure, not a measured reason to reject Neon Free or a PostgreSQL semantic failure.

## Machine-readable diagnostic receipt

The following sanitized receipt records the exact evidence hashes, scope, missing fields and unapplied proposal. Original raw receipts and executable sources were not modified.

```json
{
  "schemaVersion": 1,
  "recordedAtUTC": "2026-10-05T10:33:51.785834+00:00",
  "result": "INCOMPLETE_TELEMETRY_AND_UNENFORCEABLE_ALL_SERVER_COMMAND_CAP",
  "scope": "Saved local receipts and code only; zero new Cloudflare/Neon requests, SQL calls, resource or permission changes",
  "target": {
    "projectId": "wispy-mouse-67963002",
    "branchId": "br-rough-frost-b3e2ks1b",
    "endpointId": "ep-steep-water-b300tebo"
  },
  "originalEvidenceSHA256": {
    ".neon-benchmark/comparable-candidate-pilot/lifecycle.json": "c66cbb7d662cd0320a9796b51509cc41ba559606fedfd8fe2731f528dbf134f8",
    ".neon-benchmark/comparable-candidate-pilot/execute.mts": "f328b4b6c8863e2598b9a840ab8384cc74c2cb88500edb696841dedd2799b163",
    ".neon-benchmark/comparable-candidate-pilot/worker.mts": "0c781b7adb09565d49bd1c56104ae547afce4b3317ce41fbca5d8863f095c6dd",
    ".neon-benchmark/comparable-candidate-pilot/deploy.log": "2d86518815858971e4c0a56a323df150c840ab687f35693c6e1a2ccbf9768e8a",
    ".neon-benchmark/comparable-candidate-pilot/deploy.stdout": "d4566852360ce8f292240e26dbefd8ef51fb5ff6cc303bae962a1783edf5b64d",
    "docs/evidence/neon-comparable-candidate-pilot-2026-10-05.json": "80cd38d645572e123c93f163ab7a120897895abed2738e8e62a62d648aaba794"
  },
  "countSource": {
    "view": "pg_stat_statements",
    "expression": "sum(calls) WHERE userid=(SELECT oid FROM pg_roles WHERE rolname='hdb_benchmark_runtime')",
    "counterBefore": 0,
    "counterAfter": 83,
    "delta": 83,
    "summedTotalExecTimeDeltaMs": 0.705694,
    "databaseFilterPresent": false,
    "queryIdOrStatementTextCaptured": false,
    "toplevelFilterPresent": false,
    "trackOrResetOrDeallocationCaptured": false,
    "baselineSamplingWindowUTC": {
      "start": "2026-10-05T10:16:14.792Z",
      "endApproximately": "2026-10-05T10:16:16.440651Z"
    },
    "finalSamplingWindowUTC": {
      "start": "2026-10-05T10:16:39.724Z",
      "endApproximately": "2026-10-05T10:16:39.839037Z"
    },
    "countScope": "Runtime-role entries visible to the candidate Postgres endpoint, across databases and statement entries; not per request/connection/phase or account-wide across isolated Neon branches",
    "isCompleteAttemptCount": false,
    "perStatementAttribution": "UNKNOWN"
  },
  "applicationAndConcurrency": {
    "comparablePOSTsDispatched": 0,
    "originalComparableHandlerCalls": 0,
    "safeguardGETProbeInitiated": true,
    "safeguardHTTPStatus": null,
    "safeguardApplicationSQLAttempts": "UNKNOWN",
    "candidateOtherActiveClientSnapshotBefore": 0,
    "candidateOtherActiveClientSnapshotAfter": 0,
    "snapshotFilter": "current database, active client backends only",
    "continuousExclusionOfOtherActivity": false,
    "ownerCommands": 4,
    "ownerCommandsOverlapWithRuntimeRoleCounter": false,
    "plusOneSelfSampleCorrectionUsedThisRun": false,
    "intermediateServerDeltaCaptures": 0
  },
  "priorSavedClue": {
    "file": ".neon-benchmark/runtime-canary/aggregate-runtime-pilot.json",
    "priorDifferentBranchInitialRuntimeCounter": 82,
    "priorDifferentBranchFinalRuntimeCounter": 190,
    "interpretation": "Similar counter magnitude existed before the earlier public GET suite; a clue for provider/session overhead, not attribution or calibration of these 83 calls"
  },
  "lostEvidence": {
    "defectLocations": {
      "HTTPRecordCreatedAfterParsing": ".neon-benchmark/comparable-candidate-pilot/execute.mts:47",
      "GenericErrorReplacesOriginal": ".neon-benchmark/comparable-candidate-pilot/execute.mts:82",
      "FallbackReservationBypassedByEarlierFailure": ".neon-benchmark/comparable-candidate-pilot/execute.mts:48",
      "RetrospectiveServerSampling": ".neon-benchmark/comparable-candidate-pilot/execute.mts:91"
    },
    "recordsPersisted": 0,
    "fetchToFailureUpperWallMs": 383.147083,
    "originalExecutorStdoutFile": false,
    "originalExecutorStderrFile": false,
    "toolStdoutOnly": "Generic pilot-stopped milestone, null errorCode, then cleanup summary",
    "sanitizedOriginalExceptionTypeOrCause": "NOT_RETAINED",
    "dryRunFetchFailedMessages": "Wrangler metrics dispatcher only; not the safeguard request",
    "deploymentLog": "Successful deployment, hidden BENCHMARK_TOKEN binding; no safeguard request status/body/runtime exception",
    "possibleFailureLocations": [
      "fetch rejection before response",
      "invalid metrics header JSON",
      "body read failure",
      "HTTP result size guard",
      "body JSON parsing"
    ],
    "exactTransportOrProviderCause": "UNKNOWN"
  },
  "hardCapAssessment": {
    "unchangedLimits": {
      "maxPOSTs": 10,
      "chosenPOSTs": 6,
      "maxSQLAttempts": 90,
      "maxReceivedDatabaseBytes": 25000000,
      "maxSentDatabaseBytes": 1000000,
      "maxClientConnections": 13,
      "maxActiveWallMs": 300000,
      "maxCUHours": 0.35,
      "maxCU": 1,
      "modeledHyperdriveTailMs": 600000,
      "modeledNeonTailMs": 300000,
      "cleanupWallReserveMs": 45000,
      "opaqueSQLCleanupReserve": 10
    },
    "knownOwnerPlusRecordedRoleCounter": 87,
    "is87AnUpperBound": false,
    "remainingObservedMargin": 3,
    "allServer90CommandCapWasEnforceable": false,
    "why": "Opaque provider SQL was sampled only after setup/probe/cleanup; in-flight reservations were not permanently charged on lost evidence; failed/other-role/nested/reset/tail activity was not fully observable. No complete all-server counter or provider-side stop existed.",
    "workerSQLAttemptsZeroMeans": "No returned metrics, not proof of zero runtime attempts",
    "bytesAndConnectionsZeroMeaning": "No returned Worker/Hyperdrive measurement, not proof of zero traffic/connections",
    "didCountDoubleAddClientSuccessAndRuntimeSuccess": false,
    "didDuplicateOwnerAndRuntimeCounts": false,
    "strictServerCapCompliance": "NOT_CERTIFIED; neither exact excess nor exact compliance is established"
  },
  "retainedOutcome": {
    "roleDefaults": ["default_transaction_read_only=on", "statement_timeout=60s"],
    "countsManifestMaxIdUnchanged": true,
    "WorkerDeletedAndAbsenceVerified": true,
    "HyperdriveDeletedAndAbsenceVerified": true,
    "candidatePreserved": true,
    "activeWallMs": 25882.605375,
    "modeledCUHoursIncludingTails": 0.2571896126041667,
    "providerComputeAndEgressBilling": "UNKNOWN",
    "writeRejection": "NOT_DEMONSTRATED",
    "serverCancellationSQLSTATE57014": "NOT_DEMONSTRATED",
    "remoteComparableSemanticCases": 0
  },
  "proposalOnly": {
    "codeOrRuntimeEditsApplied": false,
    "budgetRaised": false,
    "steps": [
      "Persist an intent/attempt record and reserve full lease before fetch; retain status/content type/allowlisted headers immediately before parsing.",
      "Stream bounded body into private raw evidence, recording byte count/hash and stage-specific sanitized error cause; never log tokens/passwords/connection strings.",
      "Permanently charge worst-case leased SQL/bytes/connections on unmetered outcomes and stop; never reset counters or blindly retry.",
      "Keep client-attempt and server-stat ledgers separate; capture role+dbid+queryid+toplevel per-statement deltas and stats-reset/deallocation state at approved phase boundaries.",
      "Include setup, deployment, provider/session activity, safeguards, cleanup and idle tail in admission.",
      "Keep remote execution blocked if opaque provider work has no provable upper bound under strict all-server 90; request explicit clarification of counting scope before changing it."
    ],
    "nextApprovalNeeded": "No remote work approved here. If useful, separately approve one candidate-only bounded read-only stats-catalog query (one connection, one SQL statement, at most 100 entries, at most 131072 received bytes, 5s server/15s active limits, compute reserve including one natural five-minute idle tail). This may reveal only current entries, not reconstruct the old interval after reset/suspension. Any corrected full pilot needs fresh reviewed admission under unchanged limits and a provable statement-count scope; no resources/grants/password changes by default."
  }
}
```
