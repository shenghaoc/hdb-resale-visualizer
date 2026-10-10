# Evaluation: precompute nearest MRT exits for known HDB blocks

**Decision (2026-10-10):** Compute the block-detail panel's results **at publish time**, not via the anonymous runtime PostGIS endpoint. The implementation is in [draft PR #432](https://github.com/shenghaoc/hdb-resale-visualizer/pull/432), while the required blue/green publication ordering is in the [serving refresh specification (#422)](https://github.com/shenghaoc/hdb-resale-visualizer/pull/422).

## Why this is practical

The UI always asks one deterministic question: the five nearest source-recorded MRT exit labels within a **1,500 m spheroidal straight-line radius** of the selected HDB block. Its coordinate is snapped to the same **0.0001° grid** as `NEARBY_SPATIAL_SQL`. With 9,730 blocks and 613 MRT exits, every answer can be generated once during the publication of a new serving child.

## Measured document size (disposable Neon PostGIS fork, read-only SQL)

The measurement uses the same `ST_DWithin`, spheroidal `ST_Distance`, grouping by source/kind/`STATION_NA` **before limiting**, deterministic tie-breaking and radius as the live endpoint, and stores only the closest five entries.

| Quantity | Measured |
| --- | ---: |
| Published block-detail documents | 9,730 |
| Stored exit results | 29,602 |
| Verified empty arrays | 268 |
| Added JSON text, total | 4,032,907 bytes |
| Mean delta / document | 414.48 bytes |
| Median delta | 414 bytes |
| 95th percentile delta | 674 bytes |
| Maximum delta | 685 bytes |
| Minimum delta (empty) | 22 bytes |
| Mean full document before | 14,941.2 bytes |
| Mean full document after | 15,355.7 bytes |

The original untrimmed, unsnapped experiment returned 41,172 rows and about 10.6 MB of JSON. That is **not** the published contract. The current top-five, snapped-centre values above are the ones used by #432. These sizes are logical `jsonb::text` differences, **not** measurements of WAL, TOAST storage or physical billed bytes.

## Effect on the refresh design

The October source stage used **89,758,647 / 90,000,000 bytes** of its allowed COPY input. Naively appending 4 MB of MRT exits to it would exceed the limit. The approved design instead publishes the existing core tables and verifies benchmark digests, forks the candidate, applies PostGIS migration 001 and executes the **child-only** MRT-exit materialization in one transaction with the private manifest identity updated last. It then verifies every block's stored values, derived delta, cache-generation identity, no-op replay and storage headroom before approving the Hyperdrive origin change.

This is a new, separately bounded serving-child step, **not** a relaxation of the transaction change-count guard or COPY ceiling.

## Consequences

The block-detail UI reads `nearbyMrtExits` from the existing `/api/details/{addressKey}` document; it does not send a new request when the panel expands. Older D1/Neon documents without the field remain valid and simply hide the new control. A published empty array means no exits; a missing field means the older publication did not include this evidence.

The general `/api/nearby-places` endpoint and its tests remain available behind **`NEON_SPATIAL_ENABLED="false"`** in production. **Do not publicly enable arbitrary-coordinate search without a separately approved global budget control.** The two fail-closed Workers rate-limiters are only local, approximate protections and cannot guarantee account-wide Hyperdrive cost bounds.
