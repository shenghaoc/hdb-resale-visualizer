# `/api/v2/manifest` — API fallback bug, not database unavailability

**The unsupported v2 route falls into asset handling in both HEAD and the current checkout. Missing `ASSETS` then reproduces the exact JSON 500 with zero database calls.** Production exhibits the same error signature while the legacy manifest responds successfully. The local cause is proven; the deployed exception and exact code revision remain unverified. No implementation or production change was made.

## Paired production evidence

Both requests targeted `https://hdb-resale-visualizer.shenghaoc.workers.dev` with GET, `Accept: application/json`, no authorization/cookies, no redirect following and no retry. They completed within **754 ms** on the same production host and SIN POP. Deployment/version ID was not exposed, so exact deployed-revision equality cannot be asserted without administrative evidence.

| Field         | `/api/v2/manifest`                                                 | `/api/manifest`                                                    |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Start/end UTC | 05:09:31.070 → 05:09:31.625                                        | 05:09:31.627 → 05:09:31.824                                        |
| Status        | **500**                                                            | **200**                                                            |
| Content type  | `application/json; charset=utf-8`                                  | Same                                                               |
| Cache control | `no-store`                                                         | `public, max-age=60, s-maxage=3600`                                |
| Body bytes    | **33**                                                             | **1,624**                                                          |
| Body SHA-256  | `f26dcd3580f26f3b494c17bd81ff4eb958401b104fc84698cb36495101190e44` | `99561f9282b03e329ffae47201ecc5a7a1b0fea0d1ac06dda587054f0fb5eae9` |
| CF-Ray        | `a46227877a34a07a-SIN`                                             | `a4622788be11a07a-SIN`                                             |
| Final URL     | Exact requested URL; no redirect                                   | Exact requested URL; no redirect                                   |

The v2 body is exactly `{"error":"Internal server error"}`. The legacy body has `schemaVersion="2.0.0"`, `generatedAt="2026-08-29T01:37:16.797Z"`, window **1990-01 → 2026-08**, and counts **985,533 transactions / 9,730 blocks / 9,730 comparisons / 190 MRT stations**. Its exact raw body is retained in evidence. The earlier Qt observation at 04:47:04 GMT showed the same status split and byte count.

The successful legacy response establishes that the existing D1-backed public service is serving its stored publication. The v2 failure is not evidence of generic D1 unavailability. Public responses expose no D1 billing metadata or cache-hit indicator; no billed-read count or fresh database lookup is inferred.

## Route, provider and serialization trace

| Stage                        | Legacy manifest                                                                          | Unsupported v2 path                         |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| Registration                 | `manifest` route at `/api/manifest{/}?`                                                  | `no_match`; no v2 route/module              |
| Handler dispatch             | Existing `functions/api/manifest.ts`                                                     | Not entered                                 |
| Provider                     | HEAD uses `env.DB`; checkout lazily selects default D1 or explicit optional Neon binding | Selector/adapter not entered                |
| Cache wrapper                | Known public path, conditional version-pointer cache                                     | Not entered                                 |
| Data                         | `SELECT json FROM manifest WHERE id = 1`                                                 | Zero DB calls in reproduction               |
| Serialization                | `JSON.parse(row.json)` then `jsonResponse`                                               | No manifest parsing/transformation          |
| Optional Neon prototype      | Same SELECT allowlisted as JSONB `json::text`                                            | Not entered                                 |
| Asset fallback               | Not needed                                                                               | Calls `env.ASSETS.fetch(request)`           |
| Local missing-binding result | Still returns manifest JSON                                                              | TypeError → outer catch → 500 JSON/no-store |

References: [route registration](../../worker/api-route-match.ts), [Worker dispatch/fallback](../../worker/index.ts), [handler](../../functions/api/manifest.ts), [provider selector](../../worker/public-read-backend.ts), [adapter](../../worker/neon-read-db.ts), [manifest SQL compiler](../../worker/neon-public-read-sql.ts), [cache wrapper](../../worker/public-data-cache.ts).

`schemaVersion="2.0.0"` describes the payload. Neither the route matcher, manifest handler, schema validator nor cache wrapper transforms it into `/api/v2/*`. There is no separately registered v2 manifest handler in either known source version.

The checked-in `wrangler.jsonc` supplies `assets.directory` and SPA fallback but omits `assets.binding`. The ambient `Env` declares `ASSETS`, which does not create a runtime binding. Cloudflare requires an explicit binding name to expose the asset fetcher to Worker code. The installed Wrangler source also only adds that binding when configured. [Cloudflare asset binding documentation](https://developers.cloudflare.com/workers/static-assets/binding/).

Static navigation can still work through Cloudflare's asset gateway: with this compatibility date, SPA navigation may bypass Worker code, whereas client API fetches are a separate routing case. Thus a working frontend or legacy handler is compatible with a failing unmatched-API fallback. The local reproduction directly invoked Worker control flow; it did not claim to reproduce the gateway. [Cloudflare SPA routing documentation](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).

## Local reproduction and confidence limits

An ignored offline harness bundled the HEAD and checkout entry points, using unchanged local route/handler/helper modules. Only the unused OG module was stubbed; remote fetch was forbidden. **16 cases passed** across both versions, with assets absent/present and legacy/v2/unknown-API/non-API paths.

Both missing-assets v2 cases produced:

```text
Worker error: Cannot read properties of undefined (reading 'fetch')
HTTP 500; cache-control: no-store
{"error":"Internal server error"}
Database calls: 0
```

Their body hash exactly matches the fresh production error. With a synthetic assets binding, the same unsupported v2 route returned **200 SPA HTML**, still with zero database calls. Legacy manifest continued to return the unchanged fixture contract with one fake manifest lookup. This establishes a checkout routing/config defect independent of the optional Neon prototype.

No production source, binding metadata or correlated exception log was retrieved. No broad tail/traffic capture, authentication access, administrative API or D1 query occurred. Consequently the production missing-binding explanation is a **supported inference**, not a captured deployed exception. No unrelated visitor requests, cookies, sync codes or IPs were persisted.

## Smallest proposed fix — not implemented

1. After known API dispatch and method handling, return **JSON 404 with `no-store`** for exact `/api` or prefix `/api/` when unmatched, before static fallback. Do not call DB or assets for unknown API routes.
2. Declare `assets.binding="ASSETS"` to satisfy the existing Worker fallback contract. This is a separate config correction; adding it alone would turn the unsupported API into HTML rather than a valid API response.
3. Preserve `/api/manifest` and its contract. Do not silently alias `/api/v2/manifest` or invent a versioned snapshot manifest without a separately approved contract.

Proposed tests cover unknown API GET/HEAD/trailing-slash behavior with both missing and present assets, zero DB/assets calls, JSON/no-store status, unchanged legacy GET/HEAD, existing POST 405/Allow behavior, and non-API SPA fallback with a real local assets binding. Existing `vp run test worker-routing` passed **8 tests**; its current matcher coverage does not test this Worker fallback defect.

## Scope and deliverables

Only **two ordinary public GETs / 1,657 response bytes** were added. Administrative D1 queries, full scans, Neon/Hyperdrive calls, resources, production mutations, implementation changes and deployments: **zero**. No schedule, secret, push, PR or merge changed. No Library upload occurred.

Branch/HEAD remain `feat/d1-free-incremental-refresh` / `482be1eba9ff2091c1580f5757d7b33e20b26515`. Existing tracked/untracked work and frozen publisher/comparable evidence were preserved. Validation and final status are recorded in [JSON evidence](../evidence/api-v2-manifest-diagnostic-2026-10-06.json). Private exact receipts/harness live under `.neon-benchmark/v2-manifest-diagnostic-20261006/`.

The separate [canonical publication input audit](provider-neutral-publication-input-audit-2026-10-06.md) identifies what can be reused for the snapshot design and what cannot be recovered from persisted D1/Neon facts. No desktop design or importer implementation was duplicated.
