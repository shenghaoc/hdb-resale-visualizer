# Requirements: Geospatial Programme

The standing rules for every geospatial pull request: PostGIS, nearby search,
points of interest, planning data, address search, benchmarks and the data
refresh that feeds them. Each feature spec cites these instead of restating them.

## R1 — Coordinate systems are explicit

- **R1.1** Stored and exchanged coordinates are WGS84 (EPSG:4326) in longitude,
  latitude order. Anything that builds a point from two numbers names the order.
- **R1.2** Distances that users see or that decide a result are geodesic, on the
  `geography` type (spheroid), never a degree difference.
- **R1.3** Planar, metre-based work (blocking, clustering, buffers) happens in
  SVY21 (EPSG:3414) only, reached with `ST_Transform`. `ST_SetSRID` is never used
  to convert between systems.
- **R1.4** A metres-versus-degrees mistake and a longitude/latitude swap are
  caught by a test, not by review.
- **R1.5** Spherical shortcuts (haversine at 6,371 km, the `geography` `<->`
  operator) are labelled as approximations wherever they appear, with the measured
  error in the contract.

## R2 — Provenance before aggregation

- **R2.1** Every spatial row keeps its source, source identifier and source
  properties. A derived row never replaces its observations.
- **R2.2** Two sources are combined only through an explicit, deterministic rule
  that yields one of `verified`, `rule-supported`, `ambiguous`, `unmatched` or
  `rejected`. Uncertainty is stored and shown, not resolved silently.
- **R2.3** A source is admitted only after its licence, access method, coverage and
  update cadence are recorded from the primary source.

## R3 — Deterministic publication

- **R3.1** The same inputs produce the same rows, identifiers and hashes. Ordering
  and tie-breaks are fixed by data, not by plan.
- **R3.2** A publication is atomic and leaves the previous one intact on failure.
- **R3.3** Data freshness is a first-class concern: how the served data is
  refreshed, verified and rolled back is specified (`serving-data-refresh`).

## R4 — Measured, reproducible performance

- **R4.1** A performance claim names the method, data size, hardware, sample count
  and percentile, and carries the command that reproduces it.
- **R4.2** Optimisation follows a measurement and keeps an exact baseline to compare
  against. Approximate fast paths (KNN, grids, caches) report their disagreement
  with the exact answer.
- **R4.3** Large synthetic benchmarks run on local PostgreSQL/PostGIS, never on the
  free Neon project. Quotas are taken from the provider's current documentation.

## R5 — Safe by default

- **R5.1** Nothing changes production Neon, D1, Hyperdrive, a Worker or a feature
  flag without the owner's explicit approval of that action.
- **R5.2** `NEON_SPATIAL_ENABLED` stays `"false"` until the production gates in
  `nearby-search-production-gates` pass and the owner approves.
- **R5.3** D1 stays the rollback target; the public-read boundary is not widened.
- **R5.4** Every cache and query is bounded; unbounded input is rejected, not
  truncated silently.

## R6 — Constraints that do not move

- **R6.1** No hosted AI APIs. No new runtime call to OneMap, data.gov.sg or any
  upstream. No new OneMap token is requested.
- **R6.2** Straight-line distance is never presented as walking distance.
- **R6.3** No map tiles are redistributed; required attributions stay visible.
- **R6.4** Nothing under `public/data/` is read or indexed by tooling.

## R7 — Honest evidence

- **R7.1** Accuracy figures (precision, recall, agreement) are reported only
  against labels the owner has approved. Agent-proposed labels are marked
  `unapproved` and produce no metric.
- **R7.2** What was not verified is stated next to what was.
- **R7.3** A discrepancy found between documents and behaviour is recorded in the
  register (`design.md`) and fixed in a scoped pull request.

## R8 — Maintainable delivery

- **R8.1** Work arrives as small pull requests, each with a Kiro spec or a task in
  one, tests for non-trivial logic, and the documented gate result.
- **R8.2** Experiments that may never ship (a standalone service, a prototype
  index) live outside the website repository's runtime and are not a dependency.
- **R8.3** User-visible changes update `docs/guide/` in the same pull request.
