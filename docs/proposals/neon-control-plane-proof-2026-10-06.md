# Neon pilot control-plane repair and built-artifact proof — 2026-10-06

The isolated pilot control plane is repaired and proven locally using the actual Wrangler upload artifact, the retained deployment configuration, workerd and real SQLite Durable Objects. This investigation made zero Neon, D1 or Cloudflare resource calls. It does not explain the historical remote HTML 404 or authorize another remote attempt. The accepted Neon Free budget assessment remains unchanged; remote serving acceptance remains incomplete.

## Findings and confidence

| Finding                                                              | Evidence                                                                                                                   | Confidence                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Wrong methods on known control routes fell through to public routing | The pre-change upload artifact returned 400 without public identity and 404 with identity for GET `/control/begin`         | Demonstrated locally           |
| Unknown `/control/*` paths fell through to public routing            | The same artifact returned 400/404 for `/control/missing`                                                                  | Demonstrated locally           |
| Correct POST `/control/begin` exists in the intended build           | The pre-change artifact returned JSON 409 for an invalid certificate; repaired artifact accepts exactly one valid import   | Demonstrated locally           |
| Pilot byte instrumentation rejected the actual Cloudflare socket     | `pg-cloudflare` creates a `CloudflareSocket` without Node byte counters; built safeguards stopped with EVIDENCE before SQL | Demonstrated locally           |
| Historical remote 19,984-byte HTML 404 origin                        | Correct source route, method and configuration cannot produce that response through their normal handler                   | UNKNOWN; no remote attribution |

The pilot configuration resolves directly to `.neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts`. Its default exported fetch handler owns these routes. The uploaded module exports both the handler and `PilotCounter`; bundling retains `/control/begin`. There is no asset binding, SPA fallback, production D1 binding, scheduled trigger or custom route in this configuration. The synthetic ASSETS object inside comparable execution is unrelated to control routing.

The historical dry-run directory retained only a README. The fresh build retained the serialized upload envelope with Wrangler `--outfile`, extracted its actual `worker.js`, and saved the metadata and build metafile. No historical deployed bundle was recovered; these are fresh local artifacts.

## Minimal changes

| File                                                                  | Change                                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/neon-benchmark/pilot/control-contract.ts`                    | Explicit method table; known control routes reject wrong methods with 405/Allow, unknown control routes return JSON 404 before public routing                    |
| `.neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts`   | Real Durable Object readiness RPC; atomic certificate import plus root initialization; explicit route guard; observed control method/path/protocol headers       |
| `.neon-benchmark/shared-counter-candidate-pilot-20261005/execute.mts` | Verify deployed protocol/session/vacant ledger before transferring direct custody; manual redirect policy and deployment attribution for future control requests |
| `scripts/neon-benchmark/pilot/evidence.ts`                            | Bounded sanitized error excerpts, safe header allowlist, redacted request/final URLs, redirect state and source/config/version attribution                       |
| `scripts/neon-benchmark/pilot/pg-instrumentation.ts`                  | Count CloudflareSocket application-visible bytes from hooks installed before startup; unknown or already-connected unmetered sockets still fail closed           |
| `scripts/neon-benchmark/pilot/local-pg-wire.ts`                       | Bounded loopback diagnostic protocol fixture; no external database, no corpus, no successful arbitrary SQL                                                       |
| `scripts/neon-benchmark/pilot/control-plane-proof.mts`                | Build/extract/run actual upload module under the retained configuration with real durable storage                                                                |
| `tests/unit/neon-pilot-entrypoint.test.ts`                            | Readiness failure/redirect/identity mismatch restoration tests                                                                                                   |
| `tests/unit/neon-pilot-evidence.test.ts`                              | Sanitized error/header/deployment capture; success-body exclusion; redirect refusal                                                                              |
| `tests/unit/neon-pilot-cloudflare-meter.test.ts`                      | Startup/query byte accounting; rejection of unknown and preconnected unmetered sockets                                                                           |
| `tests/unit/neon-pilot-import-recovery.test.ts`                       | Pin the frozen historical Worker snapshot instead of treating later local repairs as historical evidence                                                         |

Application adapters, comparable SQL, publisher, timeout constants and budget constants were not changed. The raw-response excerpt is at most 512 UTF-8 bytes after sanitization; full response length and SHA-256 are retained within the existing 2 MB body bound. Cookies and authorization headers are excluded; URL user info, queries and fragments are excluded. Successful control/auth bodies remain capture-disabled. Manual redirects retain the first response and sanitized Location without replaying the control mutation to another destination. A redirect chain is not inferred. Historical missing headers/body remain missing. Future receipts identify config/source hashes and the deployed version when CLI output exposes it; upload SHA remains unknown until separately retained.

## Actual built-artifact proof

The repository dependency workerd 1.20260609.1 rejected compatibility date 2026-10-05. A public workerd 1.20261006.1 binary was downloaded into `/tmp`, leaving project dependencies and the retained configuration unchanged. The fresh binary ran that exact date. Local Hyperdrive points solely to a loopback protocol fixture; outbound service networking is denied. The real `pg` and `pg-cloudflare` implementations execute inside the built artifact. Only authentication and the database destination are replaced with local synthetic values; the Durable Object class, SQLite storage and RPC path are real.

| Local proof                                                       | Result                                                                                                            | Database effect                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Missing/wrong authentication                                      | 403                                                                                                               | No SQL                                          |
| Eleven known control routes, wrong methods                        | 405 and correct Allow                                                                                             | No SQL                                          |
| Unknown/control-directory/trailing-slash/asset-like control paths | JSON 404                                                                                                          | No SQL; no asset fallback                       |
| Malformed JSON, absent/null certificate, bad digest               | Deterministic JSON 409; later valid import still succeeds                                                         | No SQL; no stranded import                      |
| Two concurrent valid begins                                       | One 200, one 409                                                                                                  | One import; counters and setup charge preserved |
| Repeated begin/readiness after import                             | 409; ledger unchanged                                                                                             | No SQL; no reset                                |
| Safeguards                                                        | 200; fixture cancellation 57014 at approximately 2 seconds                                                        | Five loopback queries                           |
| Sequential diagnostic A then B                                    | 200 after two queries; 409 after B's first query, second permit refused                                           | Three loopback queries                          |
| Concurrent diagnostics                                            | One 200 and one 409                                                                                               | One loopback query                              |
| Accept diagnostic, inspect status                                 | 200; authoritative traces and counts match                                                                        | No additional SQL                               |
| Cleanup observations                                              | 200                                                                                                               | Two loopback queries                            |
| Retire, retrieve handoff, repeat retire                           | 200, matching handoff, 409                                                                                        | No additional SQL                               |
| Accepted begin with intentionally discarded response              | Status inspection identifies committed ledger; duplicate cannot reset it; stop/retire yields terminal certificate | Zero SQL in second local cohort                 |

The response-loss case deliberately cancels the local response body after workerd acceptance. It is a controlled client-path simulation, not evidence of a remote TCP abort. It exercises status-based reconciliation and one-way retirement, not a successful blind retry.

Four additional native-fetch captures exercise an isolated loopback HTTP redirect server (six server requests), with zero database activity:

| Policy/status | Response                  | Actual method received at target        | Retained evidence                                                      |
| ------------- | ------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Follow 303    | 200 from `/target`        | GET, although requested method was POST | Final URL, redirected=true, instrumented GET header                    |
| Follow 307    | 200 from `/target`        | POST                                    | Final URL, redirected=true, instrumented POST header                   |
| Manual 303    | 303; target never reached | UNKNOWN/no target request               | First response URL, redirected=false, sanitized Location, bounded body |
| Manual 307    | 307; target never reached | UNKNOWN/no target request               | First response URL, redirected=false, sanitized Location, bounded body |

Fetch does not expose a full redirect chain; receipts retain `redirectChain=null` instead of inventing one. The local server trace records each actual method. Future control responses identify the handler-observed method/path/protocol; an edge response without those headers leaves final method UNKNOWN. The old executor used native fetch's default follow policy. Because its final URL, redirected flag, chain and handler-observed method were not retained, the requested `/control/begin` path/method does not prove which remote handler received that request. Redirects remain a possible explanation, not a demonstrated historical cause.

Total: **54 local HTTP requests, 11 loopback SQL commands, five local connections, zero comparable POSTs, zero provider calls and zero provider quota consumption**. PostgreSQL server enforcement and provider behavior are not inferred from the protocol fixture. The full sequence is begin → safeguards/permits → diagnostics → status → cleanup observations → terminal retirement, followed by a separate response-loss cleanup case.

| Artifact                   | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| Retained deployment config | `000f9f4fb679247bc250392c939ade24cbce820cbc27a09db9f0bf9dcbbc95a4` |
| Repaired entrypoint        | `4867742a4ea1ca44098575fca236554c25166952baea12ae638a1f80bd1aa114` |
| Actual built module        | `f79d2a8b0b6f7037dab00f729a76fa5b254f3d11e71601b259c982bd6edffcf9` |
| Serialized upload envelope | `361d4f9a02796eab19a7e672925fddeac16ae6f32e3a19d04470a853326296cb` |
| Build metafile             | `f99e2f263d8625427c4af73b0886b965b636d227403a2d5dc9698c55849fc162` |
| Local runtime binary       | `ddafaa2a1c1f68ffad60f843c8ddaf46fa855a7da3391ce9fea0702ac14c5ef8` |

Tool versions: Node 24.15.0, Wrangler 4.99.0, Miniflare 4.20260609.0, workerd 2026-10-06. The runtime's nodejs_compat-default notice is informational; the configuration flag was preserved.

Commands:

```sh
WRANGLER_SEND_METRICS=false wrangler deploy --dry-run \
  --config .neon-benchmark/session-owner-pilot-20261006/wrangler.jsonc \
  --outdir .neon-benchmark/control-plane-local-20261006/fixed-build \
  --outfile .neon-benchmark/control-plane-local-20261006/fixed-build/upload.multipart \
  --metafile
MINIFLARE_WORKERD_PATH=/tmp/hdb-control-workerd-20261006/package/bin/workerd \
  vp exec tsx scripts/neon-benchmark/pilot/control-plane-proof.mts
vp run test neon-pilot-entrypoint neon-pilot-evidence neon-pilot-import-recovery \
  neon-pilot-cloudflare-meter neon-pilot-worker
vp exec tsc -p .neon-benchmark/control-plane-local-20261006/tsconfig.json
vp run check
```

The final `vp run check` passed: format, typed lint, TypeScript, 2,197 tests in 213 files, architectural boundaries, production build and bundle budgets. The five focused pilot files contribute 58 passing tests in that final gate. There are 18 pre-existing lint warnings and no new warnings/errors. The separate strict pilot/build-harness TypeScript check passed. Final diff, patch and preservation checks are recorded in the companion evidence.

## Historical failed attempt remains charged

Worker `hdb-neon-session-pilot-20261006`, version `c3596070-c9f3-4a55-8ef0-e57869f4615a`, and Hyperdrive `504042a1e3fd4fffb1c61e7ac2e0c44a` were created in the earlier admitted attempt and then deleted. The retained deploy stdout reports upload 6.31 seconds, trigger deployment 3.58 seconds and startup 36 ms. No control serving SQL ran. Its three controller calls returned HTTP 404, text/html, 19,984 bytes, common digest `2000e6b28a1517ba1268e1649cd3163326ef839492edfdba31e8959830580976`. Raw body, CF-Ray, server/Location and redirect/final-URL evidence were not retained and are unrecoverable here.

That attempt plus mandatory recovery remains **11 SQL commands, five native connections, zero comparable POSTs**, query-visible native protocol 1,781 B received / 3,005 B sent, 249,860 ms full observed lifecycle and 249,069 ms charged contingency. The contingency exceeded its 180,000 ms envelope by 69,069 ms; the ordinary pilot stopped. No reset, refund, uncharging or fabricated remote retirement certificate was introduced. The through-recovery plus fixed-tail model was 0.319405556 CU-hours at 1 CU, explicitly not billed usage. Provider internal SQL, compute and network usage remain unknown.

The nested historical `restoration.pilotPassed=true` describes terminal recovery success only; the serving pilot failed. Generic HTTP receipts reporting application counter 0 reflect the unparsed/unsynchronized observational ledger-response proxy, not a measured global SQL count of zero. The 11 SQL count comes from native authoritative receipts and the final recovery ledger. Controller reconciliation after proven resource absence was explicitly a terminal-only certificate, not a normal returned remote-ledger handoff; normal remote retirement/handoff was not demonstrated in that failed attempt.

The previous recovery had already demonstrated resource absence before owner-session restoration, and then fresh runtime state 60 seconds/read-only with SELECT-only/no private access. This local investigation made no changes to those settings or resources. Forty-eight frozen source/evidence/config/deployment files still match their initial hashes.

## Next remote reservation — proposal only

The immutable SQL reservation remains **61 commands (49 work + 12 cleanup), 13 application connections and three comparable POSTs**. Result-message expectation 465,600 B, receive reservation 6,917,504 B and send reservation 319,376 B remain under the fixed 25 MB receive / 1 MB send application-visible bounds. The 90-command hard cap, ten-command cleanup reserve, 1 CU maximum, fixed comparable/query limits and timeouts are unchanged.

The corrected model reserves 234,000 ms server execution, 30,000 ms for two client-only initial owner SET windows, 195,000 ms acquisition, 45,000 ms cleanup and **35,000 ms planned no-SQL readiness work**, totaling 539,000 ms active plus 900,000 ms fixed tails: **0.399722222 CU-hours**. The readiness reservation belongs wholly to the **0.45 planned ceiling**. It is excluded from resourceSetup contingency charges. The separate **0.05 CU-hour / 180,000 ms contingency is initially unconsumed**; provisioning and cleanup overhead still require actual accounting. The fixed total remains 0.50 CU-hours. This bookkeeping correction follows authorization Sentinel_918a53e1c58081919184721732c05d42; the original local proof capture itself made no remote attempt.

Conditional arithmetic admission assumes fresh acknowledged 2-second candidate settings and a proven dedicated owner session; it is not current authorization or proof of a provider hard bound. Initial SET server duration remains unproved before acknowledgement, and opaque Hyperdrive-origin work/billing remains unknown. Any future attempt must preserve SESSION SET/readback, use temporary candidate-scoped 2 seconds only under later admission, delete temporary Worker/Hyperdrive before restore/verification, and leave the runtime 60 seconds/read-only outside that attempt. The failed attempt is separately accounted and cannot be subtracted from a fresh reservation. Current allowance-period compute/network totals and update time remain unavailable; monitoring screenshots are not cumulative usage evidence.

## Decision

**LOCAL CONTROL-PLANE PROOF COMPLETE; REMOTE SERVING ACCEPTANCE STILL INCOMPLETE.** The historical 404 origin is unknown. Future deployment propagation/edge routing, provider overhead and live allowance headroom require new admission and evidence. No remote retry was made or authorized; no database/provider resources/settings, D1 production, cron, application deployment, push, PR or merge were changed. The local report, patch and private artifact directory preserve the evidence for review.

Git branch: `feat/d1-free-incremental-refresh`. HEAD before/after: `482be1eba9ff2091c1580f5757d7b33e20b26515`. The 13 pre-existing tracked modifications and all prior untracked work were preserved. Full start/end status is retained in `.neon-benchmark/control-plane-local-20261006/git-status-{before,end}.txt`.

## Subsequent accounting correction and admission

Authorization `Sentinel_918a53e1c58081919184721732c05d42` classified readiness as planned work and permitted one fresh bounded attempt after validation. The corrected active model above supersedes the originally captured 0.39-only reservation and removes readiness from contingency. Subsequent affected tests, built-artifact proof and the full gate passed (2,198 tests). The fresh read-only admission preflight then stopped on Cloudflare HTTP 401 before SQL, role changes, resource creation or serving. That authorization was fenced; no retry or restoration was performed. See `neon-control-ready-pilot-2026-10-06.md` for the subsequent receipt. Original local proof captures remain unchanged.
