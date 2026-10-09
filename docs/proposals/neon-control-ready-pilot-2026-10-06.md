# Neon control-ready pilot — admission stopped, 2026-10-06

**The accounting correction and validation passed. The single authorized admission stopped at Cloudflare HTTP 401 before database or resource work.** No retry occurred. No restoration or resource deletion was required because this run opened no SQL connection, changed no role and created no resource. This authentication failure does not change the accepted Neon Free assessment or establish a database, query or budget failure.

## Corrected accounting

The 35-second `/control/ready` reservation is **planned work**, included once in **0.399722222 CU-hours** at 1 CU. The planned ceiling stays **0.45 CU-hours**; the separate contingency stays **0.05 CU-hours / 180,000 ms and starts unconsumed**. Readiness elapsed time is excluded from the resourceSetup contingency interval. The active evidence now records `chargedWithinExistingSetupContingency=false`; the former 145-second remaining-contingency statement was removed.

The SQL plan remains byte/row-identical: **61 commands, 13 application connections and three comparable POSTs**, with 49 work / 12 cleanup commands, 234,000 ms SQL reservation, 30,000 ms client-only initial SET reservation, 195,000 ms acquisition, 45,000 ms cleanup and 900,000 ms fixed tails. Adding 35,000 ms planned control work yields 539,000 ms active / 1,439,000 ms total, or 1,439 / 3,600 CU-hours. Result-message, receive and send reservations remain 465,600 / 6,917,504 / 319,376 bytes. The 90-SQL, 25 MB application-visible receive, 1 MB send, 1 CU and 0.50 total envelope limits are unchanged. Owner explicit SESSION SET/readback and temporary runtime 2 seconds plus final 60 seconds/read-only verification remain the required execution scope.

Changed accounting files: `scripts/neon-benchmark/pilot/plan.ts`, `session-plan.ts`, the shared isolated executor, its accounting tests and the current control-proof report/evidence. Frozen Worker routing, byte meter, SQL, publisher and application read adapter were unchanged. A fresh private executor differs from the corrected shared executor only by authorized directory, session, resource name and authorization identifiers. Old ledgers and receipts were never reused/reset or refunded.

## Validation before admission

| Check                              | Result                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Affected tests                     | 47 passed across three files                                                                                   |
| Delayed readiness failure test     | 10 seconds planned elapsed; zero contingency charge; safe owned-ledger restoration in local simulation         |
| Actual fresh would-deploy artifact | 54 local workerd requests passed; four native redirect cases passed; 11 loopback queries / zero remote queries |
| SQL phase comparison               | Exact equality with the approved prior phase array                                                             |
| Strict private TypeScript          | Passed                                                                                                         |
| `vp run check`                     | Passed: 2,198 tests in 213 files; format/lint/typecheck/boundaries/build/bundle budgets                        |
| Lint                               | 18 pre-existing warnings; zero new warnings/errors                                                             |
| Frozen files                       | 57 source/evidence/artifact hashes preserved                                                                   |

The retained compatibility date, nodejs_compat flag and real SQLite Durable Object/RPC path were exercised in workerd 2026-10-06 using a loopback PostgreSQL protocol fixture and outbound denial. No provider behavior was inferred from that fixture. Local artifacts live under `.neon-benchmark/control-ready-pilot-20261006/local-proof/`.

Commands used:

```sh
vp run test neon-pilot-entrypoint neon-pilot-cohort neon-pilot-import-recovery
MINIFLARE_WORKERD_PATH=/tmp/hdb-control-workerd-20261006/package/bin/workerd \
  vp exec tsx .neon-benchmark/control-ready-pilot-20261006/local-proof.mts
vp exec tsc -p .neon-benchmark/control-ready-pilot-20261006/tsconfig.json
vp run check
node --import tsx .neon-benchmark/control-ready-pilot-20261006/execute.mts PREFLIGHT_NO_DATABASE
```

The execution mode `EXECUTE_APPROVED_SCOPED_PILOT` was never run.

## Read-only admission failure

Authorization: `Sentinel_918a53e1c58081919184721732c05d42`.

Target remained the isolated candidate: project `wispy-mouse-67963002`, branch `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, database `neondb`. Proposed fresh session/resource identities were `candidate-control-ready-20261006` / `hdb-neon-control-ready-20261006`; no Worker or Hyperdrive with those identities was created.

The Neon endpoint inspection passed the executor's identity/region/idle/max-1-CU/native-endpoint guards before control reached the Cloudflare request. This conclusion follows the exact control flow; a successful complete preflight result was not produced.

| Captured request   | Evidence                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Operation          | GET Cloudflare account Hyperdrive configuration list; read-only                                     |
| Start/end UTC      | 2026-10-06 03:50:53.169 → 03:50:54.176                                                              |
| HTTP               | **401**                                                                                             |
| Content type/bytes | application/json / 105 B                                                                            |
| Response SHA-256   | `6979949596e21188252f2394e828a8d535daec89ca894ea4aa85179c83e27e00`                                  |
| CF-Ray             | `a461b45869c69c98-SIN`                                                                              |
| Server             | cloudflare                                                                                          |
| Capture            | Body capture disabled for provider/auth responses; credential-free safe headers and digest retained |
| Redirect policy    | Manual/no-follow                                                                                    |

The existing Cloudflare API credential was not accepted. Expiration versus another credential validity problem was not established. Network connectivity worked; the failure is not evidence that the Mac was disconnected. No credential refresh, token rotation, fallback account, repeated request or alternate remote attempt was made.

After that guard failed, a local one-shot stop marker fenced this authorization. It explicitly records that execution was never entered and that no SQL/resource operation occurred. The original no-marker state immediately after the failure is retained in the report evidence; the later stop marker prevents accidental execution after this rejected admission.

## Final state and decision

| Metric/action                             | This admission                                           |
| ----------------------------------------- | -------------------------------------------------------- |
| Application SQL / native connections      | **0 / 0**                                                |
| Comparable POSTs                          | **0**                                                    |
| Role/config changes                       | **0**                                                    |
| Worker / Hyperdrive / counter creation    | **0 / 0 / 0**                                            |
| Cleanup / restoration required            | **No**                                                   |
| Direct/recovery SQL ledger                | Not created                                              |
| Blind retries / budget increases          | **0 / 0**                                                |
| Planned contingency actually consumed     | **0 ms**; no cohort started                              |
| Provider internal compute/network billing | UNKNOWN; metadata requests are not a billing measurement |

Zero application SQL is established by the explicit PREFLIGHT_NO_DATABASE code path and absence of a SQL connection/ledger/execution entry, not by interpreting HTTP observational counter 0 as proof. No fresh SQL restoration verification was attempted after a guard failure when no role had changed. The prior separately recorded 60-second/read-only runtime verification remains historical evidence; this admission did not alter that state. The previous failed attempt remains fully charged, with no refund or reset.

**ADMISSION BLOCKED — Cloudflare authentication must be restored before a newly admitted attempt.** Remote serving acceptance remains incomplete. No further attempt is authorized by this stopped run. Production routing, D1, Neon `production`, scheduling, push, PR and merge remain unchanged.

Branch/HEAD before and after: `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`. The 13 pre-existing tracked modifications remain preserved. Full status is retained in the private task directory and companion evidence. No secrets or connection strings are included in this report or patch.
