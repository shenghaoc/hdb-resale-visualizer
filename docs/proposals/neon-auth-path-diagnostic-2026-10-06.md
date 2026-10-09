# Neon authentication-path diagnostic — 2026-10-06

**Wrangler refreshed the existing OAuth login successfully, and the repaired authentication-only Hyperdrive-list request returned HTTP 200. The full pilot was not retried.** The prior 401 remains preserved as a failed admission, with its authorization fenced.

Authorization: `Sentinel_0a546bc90224819191afb3d89cb7a23b`. Scope: read-only authentication diagnosis and local repair only. Branch/HEAD remain `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`.

## Authentication difference

The old harness read `oauth_token` directly from Wrangler's TOML file and passed it to Node `fetch`. It never invoked Wrangler's expiry check or refresh flow. That cached token expired at **03:22:51.502 UTC**, before the original **03:50:54.176 UTC** 401. A refresh token was present.

Wrangler 4.99.0's normal Hyperdrive command calls `requireAuth` → `loginOrRefreshIfRequired` before listing. Its OAuth flow refreshes an expired access token and updates the existing login state. The diagnostic ran that unmodified CLI path with the retained isolated config and explicit expected account. OAuth refresh returned 200; the Hyperdrive-list request then returned 200. Both access and refresh tokens changed, and expiry advanced to **05:05:29.523 UTC**. Browser sign-in was unnecessary.

| Possible difference     | Finding                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invocation              | Old harness: direct REST + cached token. Normal command: Wrangler CLI + expiry/refresh.                                                                                                                       |
| Environment credentials | No current or legacy API token/key/email overrides in parent or observed Wrangler subprocess. Values were never captured.                                                                                     |
| Dotenv                  | Root `.env.local` exists but has no Cloudflare/Wrangler credential keys. No candidate-directory dotenv credential file exists.                                                                                |
| Subprocess inheritance  | Harness inherits `process.env`; normal diagnostic preserved credential selection. CI mode disabled interactive fallback, telemetry/disk logs were disabled, and the preload captured safe HTTP metadata only. |
| Account                 | Explicit isolated config and ordinary cached account agree. Root config omits account ID; diagnostic pins the existing expected account. No account override was present.                                     |
| Config/CWD              | Same checkout CWD and retained isolated candidate `wrangler.jsonc`; config SHA unchanged.                                                                                                                     |
| Login store             | Legacy `~/.wrangler` absent; both select `Library/Preferences/.wrangler/config/default.toml`. Same existing refreshable OAuth state.                                                                          |

The evidence supports expired cached OAuth plus bypassed refresh as the admission problem. No credential environment/account/config/CWD mismatch was found. The original 03:50 process environment was not separately archived; current environment observations do not reconstruct every historical environment value. Cloudflare documents the supported credential overrides in its [Wrangler environment reference](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/); the exact refresh behavior was traced in the installed, tested CLI source.

## Local repair and remote authentication-only proof

New benchmark helper `scripts/neon-benchmark/pilot/wrangler-auth.ts` runs **`wrangler auth token --json --config <same config>`** through Wrangler's normal OAuth expiry/refresh path. Token output stays in subprocess/process memory, with `WRANGLER_WRITE_LOGS=false`; error objects containing stdout/stderr are never logged or propagated. Unexpected credential types, malformed output and refresh failures stop without fallback or retry. The shared private executor now uses this helper instead of reading credentials from TOML. The actual prior admission executor and its stop marker were deliberately preserved.

The repaired verification used that same authentication helper, account, REST URL, GET/Bearer mechanism, manual redirect policy and existing HTTP receipt capture. It exercised **only** the authentication/Hyperdrive-list portion; the full Neon preflight and SQL pilot were never entered.

| Request                                     | UTC response time |    HTTP | Evidence                                                              |
| ------------------------------------------- | ----------------- | ------: | --------------------------------------------------------------------- |
| Wrangler auxiliary auth-domain probe        | 04:05:28.988      |     403 | Normal CLI probe; refresh/list proceeded successfully.                |
| Normal Wrangler OAuth refresh               | 04:05:30.519      | **200** | CF-Ray `a461c9b8eea4fdf0-SIN`; existing login state updated normally. |
| Normal Wrangler Hyperdrive list             | 04:05:32.213      | **200** | Expected account; CF-Ray `a461c9c38a4dfd2e-SIN`.                      |
| Repaired helper + exact Hyperdrive REST GET | 04:11:46.772      | **200** | 135 B response; complete safe receipt; zero configurations returned.  |

The repaired REST receipt began **04:11:45.005 UTC**, returned `application/json`, and has SHA-256 **`4586f280c6e3d75ba7aa35cb8278c7c102c551ada9ad8742409346fb08de2d40`**, CF-Ray **`a461d2e86c844496-SIN`**. Provider/auth bodies and credential values were not captured. Safe HTTP status/timestamps/headers, response length and digest were retained. The CLI's stdout/stderr were captured temporarily by `execFile` in memory and were not persisted; the earlier receipt's capture wording is clarified explicitly in the evidence.

Normal diagnostic wall time: **4,098 ms**. Repaired authentication-only wall time: **2,590 ms**. No further Cloudflare/Neon request followed these scoped checks.

## Validation and timing

**55 affected tests passed**, including eight new tests for normal CLI invocation, config/CWD/environment inheritance, disabled disk logging, rejected credential-source changes, sanitized failures and no retry. Strict harness/probe TypeScript passed. **`vp run check` passed: 2,206 tests in 214 files**, formatting, lint, typecheck, boundaries, build and bundle checks. Eighteen existing lint warnings remain; no new warnings/errors. An initial generated `ProcessEnv` fixture mismatch was corrected locally. The sandbox blocked the build checker's tsx IPC after tests; the same prescribed gate passed with approved local IPC access.

All **61 frozen hashes** match, including SQL plan/reservation files, prior executor, stop marker, prior ledgers/receipts, serving adapter, Worker and publication code. The only existing source edit is credential acquisition in the shared ignored harness. New repository files are the authentication helper, focused tests and this report/evidence/patch. Private diagnostics, snapshots and receipts remain ignored.

**No CU-hour recalculation is needed.** Credential resolution occurs before candidate Neon preflight, SQL, resource setup and cohort activation. No resource behavior, SQL phase, readiness reservation or contingency interval changed. Planned reservation remains **0.399722222 CU-hours**, planned ceiling **0.45**, separate contingency **0.05**, and readiness **35 seconds planned work**. This task started no pilot ledger and consumed none of that pilot reservation. It made no Neon API/SQL call; this is not a provider billing measurement.

## Final state

- SQL connections/statements: **0 / 0**.
- Role/default changes, resource creation/deletion, application deployment: **0**.
- Full pilot retry or retired authorization reuse: **none**.
- D1/Neon production, routing/secrets, scheduling, push/PR/merge: unchanged.
- Credentials: only Wrangler's authorized normal refresh of existing local OAuth state; no alternate credentials, sign-in or credentials in deliverables.

**Authentication repair is proven; remote serving acceptance remains incomplete.** Present this evidence before any fresh explicitly authorized pilot/cohort. The previous single-attempt authorization remains fenced and cannot be silently reused.

The preceding stopped-admission report/patch remain in Library at versions 0, IDs `libfile_fbbd5caea1e4819187f68f823526b63d` / `libfile_0c6b2fe2ec588191ba7a8daacbb2d9b2`. This report is a separate follow-up and preserves those receipts and versions.

The new authentication report/evidence/patch have **not** been uploaded to Library. Automatic approval review rejected the upload because the account/resource metadata would be disclosed to a destination whose ownership and audience were not established. Explicit approval is pending. No alternate upload route or workaround was attempted; the complete deliverables remain local.
