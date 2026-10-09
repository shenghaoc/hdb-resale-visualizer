# Real-Worker Neon acceptance — 2026-10-07

**Passed. Every production-handler query succeeded against Neon through Hyperdrive, cold and warm, and all temporary resources were removed.** The integration was then committed locally on `main` (D1 selected) but **could not be pushed**: the repository ruleset requires pull requests. Production still serves the pre-integration version.

[Evidence JSON](../evidence/real-worker-acceptance-2026-10-07.json) · private receipts in `.neon-benchmark/real-worker-acceptance-20261007/`

## What was tested

The ported integration (the cached public-data layer from `f69e8586d` plus the reviewed selector, rebased onto `origin/main` at `89965c510`) was built once. Its Worker bundle is byte-identical (SHA-256 `883820b1…`, 1,124,201 B) to the bundle the production configuration produces, and was deployed with production's compatibility date and `nodejs_compat` as a backend Worker with **no public route**. A separate gate Worker held the workers.dev URL and refused every request without a token, forwarding authorized ones over a service binding. Neon was selected with a temporary Hyperdrive config (query cache disabled, origin connection limit 5, direct endpoint, the SELECT-only runtime role) and a temporary D1 that held only the shortlist schema.

The candidate compute was confirmed suspended before the first POST. 98 checks ran; 92 passed as written and the other 6 are explained below.

## Results

| Area                  | Result                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comparable POST, cold | First request after suspension: **2.36 s** (wake, cold buffers, Hyperdrive, full snapshot). The other five scenarios: 0.71–0.97 s. Warm repeats: 0.86–1.00 s, byte-identical to the cold responses. Production D1 answers the same requests in 0.18–0.49 s.                                                          |
| Comparable POST, data | 5 of 6 scenarios reproduce the earlier offline oracle hash exactly. `street-raw` is the one that merges quiet-block rows under the current handler, so it differs from that older oracle by design; the SQLite equivalence tests cover the merge.                                                                    |
| Public GETs           | 14 routes, all 200. Cache `MISS` then `HIT` on every API route, identical bytes. Examples (first / repeat): manifest 583 / 255 ms, blocks 1,364 / 320, trends 2,416 / 893, block-summaries 4,256 / 1,936 (11.5 MB).                                                                                                  |
| SEO and OG            | Sitemap (9,758 URLs, same set as D1), robots.txt, block OG and compare OG images are valid and cached.                                                                                                                                                                                                               |
| Cache bypass          | `HEAD` and `Cookie` requests are served and never cached.                                                                                                                                                                                                                                                            |
| Errors                | 9 client-error cases return the same status and body as production D1.                                                                                                                                                                                                                                               |
| Private shortlist     | Create, read, unknown code 404 and invalid body 400 all work, and the row sits in D1 as a 64-character hash. The runtime role cannot read the shortlist table.                                                                                                                                                       |
| Read-only role        | `default_transaction_read_only=on`, `statement_timeout=1min`, no privileged attributes, SELECT on exactly 7 of 10 public tables. A write in a default transaction fails with **25006**; INSERT, UPDATE and DELETE with the read-only default bypassed fail with **42501**.                                           |
| Hyperdrive            | Query cache disabled, origin connection limit 5, direct endpoint and runtime user, verified at creation and again after the run.                                                                                                                                                                                     |
| Neon outage           | With the config deleted under the running Worker: new public reads and POST return a fast (~270 ms) `500 {"error":"Internal server error"}`, never cached, with no fallback to D1. Shortlist reads keep working. Cached public routes stop being served once the 60 s version pointer expires (same as a D1 outage). |
| Worker startup        | 27 ms with `pg` bundled. Upload 3,915.88 KiB, 1,307.61 KiB gzipped.                                                                                                                                                                                                                                                  |

## The six checks that did not pass as written

1. **Gate refuses without token (404, not 403).** Transient: the new route had not reached every data center. Re-tested from MXP, HKG and SIN: 403 without the token, 200 with it. Reachability took 10.3 s after deploy with nine platform 404s, the same pattern that explains the earlier pilot 404s.
2. **Manifest shape.** The Neon manifest has three extra top-level keys from the publisher (`syncBuildState`, `neonPublication`, `neonReconciliation`), so `/api/manifest` grows from 1,624 B to 10,169 B and publishes reconciliation entries. The frontend schema ignores unknown keys. This is the one change to the public contract; see decisions.
3. **`details` and 4. `comparisons` differ from D1.** The Neon publication is newer and its summary window moved (this block's 3 ROOM count is 21 versus 22). On unchanged data the response is identical: 3 of 3 sampled blocks whose summaries match in both publications return deep-equal details (5,321 of 9,730 blocks qualify).
4. **`suggest` differs from D1.** The ported dictionary-based suggest ranks all candidates globally; the pre-integration code ranked only the first 20 `LIKE` matches in storage order. For "jurong" the 6th–8th suggestions become 101–103 Jurong East St 13 instead of 201, 216 and 287A Jurong East St 21. This comes from the cached-data commit and applies on D1 too.
5. **Block-summary counts.** My expectation that `transactionCount` only grows was wrong; it is windowed (1,386 up, 2,544 down, 5,800 unchanged). Same 9,730 blocks, no key or type differences.

JSON object key order inside stored-JSON columns follows JSONB (shorter keys first) instead of D1's insertion order. Nothing in `src/`, `shared/`, `functions/` or `worker/` iterates those objects by key order.

## Pre-existing items recorded, not changed

`assets.binding` is missing from `wrangler.jsonc`, so unmatched `/api/*` paths fall into asset handling and return 500 (identical on the Neon Worker and on production), and the SEO HTML rewrite does not run in production. HTML requests receive the generic page.

## State left behind

Local `main` in `.claude/worktrees/neon-selector` holds three verified commits on top of `origin/main`: `7ab276e86` (cached public data), `57fd589e4` (selector and Neon transport) and `5b7ee098a` (explicit D1 default, config guard test, docs). `vp run check` passes on that tree (205 files, 2,051 tests). The production configuration selects D1 (`PUBLIC_DATA_BACKEND="d1"`), has no Hyperdrive binding, and produces the accepted bundle. `git push origin main` was rejected by rule GH013 ("Changes must be made through a pull request"); the ruleset has no bypass actors and only allows squash merges. Production is unchanged at version `b698b588` (deployment `3394cb72`).

## Decisions needed

1. **How to land it.** Open pull requests and squash-merge them (one per commit keeps three small commits on `main`), or you adjust the ruleset yourself. I did not touch repository settings.
2. **Manifest.** Keep the three extra keys, or project the manifest to its contract keys in `functions/api/manifest.ts` before the switch (a small public-contract-preserving change).
3. **Suggest.** Accept the deterministic ranking now that it ships with the integration.
