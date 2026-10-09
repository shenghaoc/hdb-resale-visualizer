# Cloudflare-only routing probe — passed and deleted

**The trivial Worker returned HTTP 200 with the exact JSON and unique header.** One public request was sent to the advertised URL with redirects disabled. The Worker was then deleted and its absence verified. No Neon, Hyperdrive, SQL or D1 call occurred.

This proves that this account's `workers.dev` routing could reach the fresh minimal Worker in SIN at the recorded time. It does **not** establish why the earlier pilot returned Cloudflare's platform 404. No database pilot was rerun.

## Deployment and actual routing state

| Evidence                           | Result                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Worker                             | `hdb-routing-probe-20261006-044406`                                                             |
| Account                            | `059214b3bd95f4adf743d960c23936dc`                                                              |
| Wrangler                           | `4.99.0`, existing OAuth via normal CLI refresh                                                 |
| Deployment                         | `c7de576c-faf1-4ea6-bf20-88ca6e6a1eec`                                                          |
| Version                            | `dde1ea35-e233-4827-8a07-de9ab5227a29`, active at **100%**                                      |
| Advertised URL                     | `https://hdb-routing-probe-20261006-044406.shenghaoc.workers.dev`                               |
| `workers_dev`                      | Configuration `true`; script and production service subdomain APIs both returned `enabled=true` |
| Account subdomain                  | `shenghaoc`; matches the exact advertised URL                                                   |
| Routes / custom domains / bindings | **Empty arrays** from control-plane APIs                                                        |
| Compatibility                      | `2026-10-05`, `nodejs_compat`                                                                   |
| Artifact                           | **391 B**, SHA-256 `637d2d8aebadc4f87ece62bbb4724d1ca168cc86c763aa38e3435ef56ca1a18c`           |

Deployment stdout, exact configuration, version/deployment metadata, account/script/service subdomain settings, bindings, routes and domains were retained **before** the public fetch. The executor required the advertised version to be the sole active version at 100%, both subdomain APIs to be enabled, the advertised hostname to match the account, and bindings/routes to be empty. Metadata completed at **04:54:43.367 UTC**; the single public request began at **04:54:43.368 UTC**.

Entire handler:

```typescript
export default {
  fetch(request: Request): Response {
    return Response.json(
      {
        probe: "cloudflare-routing-20261006",
        method: request.method,
        path: new URL(request.url).pathname,
      },
      { headers: { "x-hdb-routing-probe": "hdb-routing-probe-20261006-044406" } },
    );
  },
};
```

Exact deployment stdout:

```text
 ⛅️ wrangler 4.99.0
───────────────────
Total Upload: 0.38 KiB / gzip: 0.25 KiB
Worker Startup Time: 1 ms
Uploaded hdb-routing-probe-20261006-044406 (4.16 sec)
Deployed hdb-routing-probe-20261006-044406 triggers (3.55 sec)
  https://hdb-routing-probe-20261006-044406.shenghaoc.workers.dev
Current Version ID: dde1ea35-e233-4827-8a07-de9ab5227a29
```

## Exactly one public request

| Evidence          | Result                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Method / path     | GET `/`                                                            |
| Start/end UTC     | 2026-10-06 04:54:43.368 → 04:54:43.754                             |
| Duration          | **386.176 ms** end to end                                          |
| HTTP              | **200**, `application/json`                                        |
| Body              | **65 B**, entire body fits the bounded excerpt                     |
| SHA-256           | `623632e5a12f384d40a13f54c307138525888fdbaa8d50f02b5d5ee1c8fb69c3` |
| CF-Ray            | `a46211db1dde3bdd-SIN`                                             |
| Unique header     | `x-hdb-routing-probe: hdb-routing-probe-20261006-044406`           |
| Final URL         | `https://hdb-routing-probe-20261006-044406.shenghaoc.workers.dev/` |
| Redirect handling | `manual`; `redirected=false`; trailing slash is URL normalization  |

```json
{ "probe": "cloudflare-routing-20261006", "method": "GET", "path": "/" }
```

The exact response headers and bounded body are retained in the private `public-response.json`. The repository evidence includes the safe headers; its public NEL reporting URL is referenced through the exact private receipt and hash. There was no follow-up request, alternate URL, propagation retry or comparable POST.

## Comparison with the failed pilot

| Dimension                                 | Failed serving pilot                                                                    | Successful routing probe                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Account / `workers.dev` subdomain         | Same account / `shenghaoc`                                                              | Same                                            |
| Wrangler / compatibility                  | 4.99.0 / 2026-10-05 / `nodejs_compat`                                                   | Same                                            |
| Declared `workers_dev` / routes / domains | `true` / none declared                                                                  | Same                                            |
| Actual state captured before fetch        | Subdomain enablement, attached routes/domains and active-version percentage **unknown** | Enabled; no routes/domains; one version at 100% |
| Worker identity                           | `hdb-neon-serving-pilot-20261006`                                                       | `hdb-routing-probe-20261006-044406`             |
| Bundle                                    | 1,096,357 B; DB/control dependencies                                                    | 391 B; no imports                               |
| Bindings                                  | Durable Object, Hyperdrive, session variable, benchmark secret                          | None                                            |
| GET path / handler dependency             | Authenticated `/control/ready`; Durable Object RPC                                      | `/`; direct fixed response                      |
| Result                                    | Platform HTML 404; no Worker protocol header                                            | JSON 200; exact unique header                   |

The smallest concrete implementation difference on the tested path is **the Durable Object dependency**: the failed readiness handler calls `PILOT_COUNTER.getByName(SESSION_ID).ready()`, while this probe returns directly. Worker identity, artifact and request path also changed, so this experiment cannot attribute the previous failure to that dependency alone. The retained failed handler would attach its control headers to a returned authentication or Durable Object error; the platform HTML 404 carried none. That supports the earlier pre-handler classification, without identifying its cause.

**No shared routing configuration difference was found.** Current account-wide `workers.dev` unreachability is not supported by this successful request. A problem specific to the deleted pilot's service/deployment, or a transient propagation problem, remains possible but unproven. Its actual pre-request routing state was never retained and cannot be reconstructed now. The minimum remaining diagnostic gap is that service's actual subdomain/active-deployment state correlated with handler entry. This probe does not justify changing Neon roles, limits or connection code, or rerunning the database pilot.

## Cleanup, authorization and preserved work

DELETE of this exact Worker succeeded with HTTP 200. A fresh account Worker inventory returned no matching Worker at **04:54:46.180 UTC**. Before and after inventory counts were both seven; only target presence/absence was retained. No other resource was created. The explicit management journal contains **10 GETs and one DELETE**, all successful; Wrangler's internal deployment/auth control-plane calls were not separately instrumented.

The first remote command was rejected before execution because automatic review could not verify authorization from the then-available user messages. The main thread supplied the verbatim user message `Sentinel_401ce577d67c8191b2c0f1e7a105937c` from **04:42:23 UTC**, and instructed one retry of the same command. That retry was approved and ran once. The earlier pending question is resolved by this supplied existing authorization; no additional approval is needed for this completed probe. The rejected command created no resource and made no public request.

Local source and actual bundle validation, strict TypeScript, formatting, whitespace, patch and credential-pattern checks passed. All **74 frozen hashes** match. Branch/HEAD remain `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`. Existing implementation, receipts, 13 tracked modifications and other untracked work were retained. Repository additions are this report, JSON evidence and patch; all executable probe material stays git-ignored under `.neon-benchmark/cloudflare-routing-probe-20261006/`.

The prior complete `vp run check` remains applicable to unchanged implementation: **2,206 tests in 214 files**, 18 existing lint warnings, no errors. No production routing, runtime, database, role/default, secret, workflow or schedule changed. No push, PR, merge or application deployment occurred. **Library upload remains unapproved and was not attempted.**

Evidence: [JSON](../evidence/cloudflare-routing-probe-2026-10-06.json). Earlier result: [failed serving pilot](neon-candidate-serving-pilot-2026-10-06.md). The routing probe passed; **Neon serving acceptance remains incomplete and the prior 404's cause remains unknown**.
