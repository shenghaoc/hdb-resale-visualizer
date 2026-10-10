# Evaluation: precomputing the nearest MRT exits per block at publish time

**Status: evaluation only. Nothing in this document is built, and it needs the owner's decision.** It answers one
question: should the block panel's "nearest MRT exits" list be computed once per block when the data is published,
instead of by a spatial query on every cache miss? The runtime endpoint it would replace for that one caller is
described in [postgis-nearby.md](./postgis-nearby.md).

## What the UI path actually asks

The only caller of `GET /api/nearby-places` is the opt-in exit list in the block-detail drawer
(`src/features/block-detail/NearbyMrtExits.tsx`). It sends **the selected block's own coordinates**, radius
**1,500 m**, **exits only**, and shows at most five stations. Its answer is therefore a pure function of one block and
the exits table: one fixed question per block, 9,730 blocks (9,728 distinct snapped centres). It is not the open-ended
"anything near any point" question the runtime endpoint is built for, and that is what makes precomputation possible.

## Measurements

Taken on 2026-10-10, read-only, on the disposable fork `postgis-realpath-20261010` (a copy of the serving branch with the
spatial migration applied), using the same rule as the shipped query (nearest exit per source `STATION_NA` label within
1,500 m), from each block's exact coordinates.

| Quantity                                          | Value                                                         |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Blocks / stations / exits in the data             | 9,730 / 190 / 613                                             |
| Result rows over all blocks (one per station)     | 41,172                                                        |
| Rows per block                                    | mean 4.23, median 3, p95 13, maximum 21                       |
| Blocks with no exit within 1,500 m                | 272 (2.8%)                                                    |
| Size of all answers as JSON                       | 10,594,956 bytes (10.1 MiB)                                   |
| Size of one answer (the Worker's JSON)            | mean 1,259 B, median 953 B, p95 3,446 B, maximum 5,510 B      |
| Manifest the shared cache reads twice per miss    | 10,618 bytes                                                  |
| Publish-time cost of computing every block's list | 802 ms, one set-based statement (`EXPLAIN ANALYZE`, parallel) |

The normalised alternative (one row per block and station) was not measured; at 41,172 rows of a few dozen bytes it
would be a few megabytes plus an index. That figure is an estimate, the JSON size above is measured.

## What the runtime path costs after this change, and what precomputing would cost

| Path                                             | Statements per cold request          | Bytes from Neon per cold request          | Needs                                                    |
| ------------------------------------------------ | ------------------------------------ | ----------------------------------------- | -------------------------------------------------------- |
| Runtime query through the shared cache, before   | 3                                    | about 21.2 KB manifest + 1.3 KB answer    | PostGIS, flag, both limiters                             |
| Runtime query, single labelled statement (now)   | 1                                    | about 1.3 KB + a header of about 0.1 KB   | PostGIS, flag, both limiters, the daily ceiling (1 draw) |
| Precomputed, carried inside a per-block document | 0 extra                              | +1.3 KB inside a document already fetched | the publisher only                                       |
| Precomputed, its own endpoint through the cache  | 3 today (1 if made single-statement) | 1.3 KB (+ 21.2 KB while it costs 3)       | the publisher, one route                                 |

## What precomputing buys

1. **The block panel stops depending on the spatial stack.** No PostGIS query, no `NEON_SPATIAL_ENABLED`, no rate
   limiters, no D1 counter, no daily ceiling for the only UI path. It also works on the D1 rollback backend, where the
   runtime endpoint is deliberately unavailable and the panel simply disappears today.
2. **A bounded, cacheable key space and no per-request statements** when the list rides inside a document the drawer
   already fetches (for example the block's comparison document).
3. **Exact distances.** The runtime endpoint measures from a centre snapped to 0.0001 degrees (up to about 8 m away
   from the block); a precomputed list uses the block's own coordinates. The displayed distances can differ by a few
   metres, in the more accurate direction.
4. **A strong test.** Every block's precomputed list can be compared with the runtime endpoint's answer for the same
   block (9,730 comparisons) before the panel is switched.
5. **The architecture rule already says so.** Distance calculations belong to the build/publish step; the runtime
   endpoint is the documented exception for arbitrary centres, not for a fixed per-block fact.

## What it costs and risks

1. **It is publisher work.** The list must be produced, reconciled and promoted by the same machinery as the rest of
   the data (see `.kiro/specs/serving-data-refresh/`). The publisher's schema admission rejects triggers, so it would be
   an explicit refresh step after the base tables are loaded, not a trigger like `block_locations` today.
2. **The change guard.** The publisher's guard (at most 1,000 changed rows per publication) exists to catch bad source
   data and is sized for about 2,100 changed transaction rows a month. A naive full rewrite of a derived table touches
   9,730 rows each refresh, so it needs a diff-aware write, or to be kept outside that count, or it would trip a guard
   that is working as designed.
3. **Storage.** About 10 to 11 MB as JSON, roughly 1% of the Free plan's 1 GiB, on every branch that holds a copy
   (benchmark, serving, forks).
4. **It does not replace the endpoint.** A future "what is near this point" map feature, or any non-block centre, still
   needs the runtime query and the controls around it. The endpoint stays, behind its flag.
5. **Contract and docs.** A new field or route means schema, contract tests and `docs/guide/` updates.
6. **Unmeasured:** the production site's current Hyperdrive usage, so how much headroom the controls actually protect
   is not known from here.

## Recommendation

**Adopt it for the block panel, as part of the serving-refresh work, and not in the controls PR.** The runtime controls
(one statement per miss, the origin limiter that fails closed, the daily ceiling) are still needed for any
arbitrary-centre use and are what make it safe to switch the endpoint on at all. But for the one caller that exists,
a per-block fact should not cost a spatial query, a rate limiter and a slice of a shared daily budget on every cache
miss. Suggested order:

1. Keep `NEON_SPATIAL_ENABLED` at `"false"`; ship the controls.
2. Specify the derived per-block list in `serving-data-refresh` (its own table, diff-aware write, differential test
   against the runtime endpoint for all blocks, guard accounting).
3. Switch the panel to the precomputed list and stop calling the capability probe from it.
4. Decide separately whether the runtime endpoint is wanted at all once nothing in the UI calls it.

If the owner would rather keep one mechanism, the cost of the runtime path is now low and bounded (1 statement, about
1.4 KB, at most 10,000 a day), so not precomputing is a defensible choice. It trades a permanent spatial dependency
for less publisher work.
