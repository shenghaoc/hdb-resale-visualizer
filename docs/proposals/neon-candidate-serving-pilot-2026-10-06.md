# One candidate-serving pilot — failed readiness, safely restored

**The single authorized attempt stopped at `/control/ready` HTTP 404. Mandatory cleanup/restoration passed, but serving acceptance remains incomplete. No retry occurred and this authorization is consumed.**

Authorization: `Sentinel_e8029ad93eec81918acd8cc6a4cca82e`. Branch/HEAD remain `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`. Candidate only: project `wispy-mouse-67963002`, branch `br-rough-frost-b3e2ks1b`, endpoint `ep-steep-water-b300tebo`, database `neondb`.

The fresh private executor differs from the accepted shared executor only in directory, authorization, session and temporary resource identities. The authentication diagnostic was not repeated. Execution used the repaired normal Wrangler OAuth path, then performed the ordinary resource-absence/endpoint preflight. No alternate credential source or credential environment override was introduced.

## Readiness failure

The admitted plan remained **0.399722222 CU-hours**, planned ceiling **0.45**, separate initially unused contingency **0.05 / 180 seconds**, max **1 CU**, **3 POSTs**, **90 application SQL**, **25 MB application-visible database receive**, and Hyperdrive query cache disabled.

Before creating resources, counted direct sessions verified original runtime **60 seconds + read-only**, owner explicit `SET statement_timeout='2s'` with server readback/source=`session`, temporary candidate runtime **2 seconds + read-only**, and the pinned publication. Hyperdrive identity/cache settings passed. The isolated Worker deployed as version **`f3536246-0906-4636-845d-7f35e85ba40d`**.

The first readiness request then failed:

| Evidence                       | Result                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Method / path                  | GET `/control/ready`                                                                                      |
| Start/end UTC                  | 2026-10-06 04:26:09.946 → 04:26:10.419                                                                    |
| HTTP                           | **404**, `text/html; charset=UTF-8`                                                                       |
| Body                           | **19,984 B**; first 512 B captured safely; HTML title `Page not found`                                    |
| Body SHA-256                   | `2000e6b28a1517ba1268e1649cd3163326ef839492edfdba31e8959830580976`                                        |
| CF-Ray                         | `a461e8065ad61f6e-SIN`                                                                                    |
| Redirect behavior              | Manual/no-follow; `redirected=false`; final method UNKNOWN because no instrumented Worker header returned |
| Readiness reservation / actual | 35 seconds planned / **477 ms** actual; zero contingency charge for readiness                             |
| Requested/deployed URL         | Both `https://hdb-neon-serving-pilot-20261006.shenghaoc.workers.dev`                                      |

The digest matches the previous platform HTML 404. Unlike the prior sparse receipt, this attempt retained safe headers, body length/digest/snippet, redirect policy and deployment/source/config correlation. Those local deployment identifiers do **not** establish that the response executed that version or its handler: no Worker protocol response/header arrived.

**Root cause remains UNKNOWN.** An address mismatch was not found. Platform routing, deployment propagation or configuration hypotheses were not experimentally established. The completed local artifact proof does not prove public reachability. No later Worker request was sent to “wait out” or retry this failure.

Safeguards, sequential/concurrent diagnostics and comparable requests were never entered. **Comparable POSTs = 0**; no logical HDB data publication occurred.

## Cleanup and restoration

The failed readiness request preceded Worker custody import. The executor stopped the direct ledger, obtained its direct terminal recovery certificate, deleted the temporary Worker and Hyperdrive, and verified that Worker, Hyperdrive and counter namespace were absent. The temporary counter namespace was removed with the Worker. Only afterward did it use a dedicated owner session to restore the candidate runtime default to **60 seconds**.

Native connection **#5**, opened fresh after restoration, returned at **04:26:17.955 UTC**:

```json
{
  "role": "hdb_benchmark_runtime",
  "database": "neondb",
  "read_only": "on",
  "statement_timeout": "1min",
  "transaction_select": true,
  "transaction_write": false,
  "private_access": false
}
```

All five native connections closed. A separate cleanup check cross-referenced that counted fresh runtime receipt and made new read-only Cloudflare inventory calls, independently proving the Worker, Hyperdrive and counter namespace absent. It opened **no additional SQL connection**.

The candidate has auto-suspension disabled in the accepted test setup. To keep this investigation bounded, after restoration and absence verification the isolated compute was suspended once and observed **idle at 04:30:11.705 UTC**. No settings/data were changed by suspension. No production branch/compute was touched.

The nested `restoration.pilotPassed=true` means **recovery succeeded only**. Overall `pilotPassed=false` / `SCOPED_REMOTE_PILOT_FAILED` remains the verdict; no serving result is claimed.

## Measured cost and budget qualification

| Metric                                             |                                                     Actual |
| -------------------------------------------------- | ---------------------------------------------------------: |
| Application SQL, including recovery                |                                                **11 / 90** |
| Native connections / closed                        |                                                  **5 / 5** |
| Summed query wall time                             |                                                 **490 ms** |
| Query-visible receive / send                       |                                        **1,867 / 3,005 B** |
| Comparable POSTs                                   |                                                  **0 / 3** |
| Executor wall time                                 |                                              **29,022 ms** |
| Contingency charged                                |                                    **27,469 / 180,000 ms** |
| Remaining contingency for this consumed attempt    | **152,531 ms**; not transferable authorization or a refund |
| Executor proxy including reserved 900-second tails |                                   **0.258061667 CU-hours** |
| Cohort start → verified compute idle               |                                             **262,710 ms** |
| Maximum-1-CU elapsed proxy through idle            |                                      **0.072975 CU-hours** |

The observed shutdown fits within the existing 900-second tail reservation; no plan/ceiling increase was needed. Both CU-hour figures are conservative time proxies, **not Neon billed compute**. Query-visible stream bytes exclude startup/TLS and Hyperdrive/provider internal activity and are **not provider egress billing**. Provider internal SQL/network and account allowance totals remain UNKNOWN. An HTTP observer counter of zero is not the global SQL count; the native receipts and final shared ledger establish the 11 commands.

Prior failed attempts and this attempt remain separately charged. No ledger reset, blind retry or budget refund occurred.

## Preserved evidence and verification

Local validation passed **55 affected tests**, strict private TypeScript, and **54 workerd requests against the actual fresh would-deploy artifact**, with 11 loopback queries and zero remote queries in that proof. Bundle SHA-256 stayed `e2bf1ca931eca932b74a9444330bc14e26832d39b1d24025b7ce705f6a835fb1`. The prior complete **2,206-test/214-file** repository gate was reused because this task made no repository source change; fresh changes are ignored harness identities and evidence only. All **67 frozen hashes** match. Format, whitespace, reverse-patch and secret audits passed.

Evidence is retained in `.neon-benchmark/candidate-serving-pilot-20261006/`: one-shot authorization, actual executor/config/build, direct/recovery ledgers, native safe receipts, HTTP journal, lifecycle/deploy receipts, independent cleanup proof and final git status. Public companions are `docs/evidence/neon-candidate-serving-pilot-2026-10-06.json` and `.patch`. Existing implementation, prior receipts and the 13 pre-existing tracked modifications were preserved.

No D1 or Neon `production` mutation, production routing/secret change, scheduled refresh, application deployment, push, PR or merge occurred. Only the isolated test Worker was deployed and deleted. **Library upload remains unapproved; no upload was attempted.**

**Serving gate: FAILED / INCOMPLETE.** The accepted Neon Free assessment is unchanged; this run obtained no comparable latency, semantics or serving-safeguard result. The next useful investigation is a separately authorized SQL-free deployed-route/control reachability diagnosis before another serving pilot. This consumed authorization does not permit such a retry or new experiment.
