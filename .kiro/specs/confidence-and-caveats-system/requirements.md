# Requirements: Confidence & Caveats System

## R1 — Unified confidence engine

- **R1.1** A single `computeConfidence` function in `shared/` produces
  the confidence level for all surfaces: listing checks, comparable
  tables, shortlist rows, and block detail views.

- **R1.2** The function accepts a `ConfidenceInput` struct with:
  comparable count, same-block count, same-street count, same-town
  count, newest comparable age in months, flat type match count,
  floor area match count, storey match count, whether the search
  widened, whether time-adjustment was applied, and trend sample size.

- **R1.3** The function returns a `ConfidenceAssessment` containing:
  tier (`high | medium | low`), raw 0–1 evidence score, per-signal
  breakdown (sample, recency, scope, match), a human-readable
  summary, and the echoed input.

## R2 — Evidence-based scoring

- **R2.1** Confidence is computed as a weighted sum of four normalized
  sub-signals: sample size (0.35), recency (0.25), scope proximity
  (0.25), and match quality (0.15). All signals are [0, 1].

- **R2.2** Tier thresholds: `high` at ≥ 0.70, `medium` at ≥ 0.40,
  `low` below 0.40.

- **R2.3** Hard override rules cap the tier regardless of score:
  - `comparableCount < 3` → cap at `low`
  - `newestComparableAgeMonths > 18` → cap at `medium`
  - `sameBlockCount === 0 && sameStreetCount === 0` → cap at `medium`

- **R2.4** Overrides only cap (lower) the tier — they never raise it.

## R3 — Machine-readable caveats

- **R3.1** Every caveat carries a `code` (string literal from a fixed
  union type), a `severity` (`info | warning | critical`), and a
  human-readable `message`.

- **R3.2** The caveat code union covers at minimum: `NO_COMPARABLES`,
  `VERY_LOW_SAMPLE`, `LOW_SAMPLE`, `STALE_DATA`, `NO_SAME_BLOCK`,
  `NO_SAME_STREET`, `WIDENED_TO_STREET`, `WIDENED_TO_TOWN`,
  `FLAT_TYPE_MISMATCH`, `FLOOR_AREA_MISMATCH`, `STOREY_MISMATCH`,
  `LEASE_MISMATCH`, `EXTREME_OUTLIER_LOW`, `EXTREME_OUTLIER_HIGH`,
  `TIME_ADJUSTMENT_APPLIED`, `SMALL_TREND_SAMPLE`.

- **R3.3** Caveats are deduplicated by code — no duplicate codes in a
  single result.

- **R3.4** `critical` severity is reserved for conditions that
  fundamentally undermine the verdict (e.g. zero comparables).

## R4 — Backward compatibility

- **R4.1** `src/lib/listing-confidence.ts` continues to export
  `computeConfidence` with the existing `ConfidenceResult` shape.
  It delegates to the shared engine internally.

- **R4.2** `src/lib/listing-caveats.ts` continues to export
  `generateCaveats` with the existing `{ severity, message }` shape.
  The `critical` severity is mapped to `warning` in the v1 adapter.

- **R4.3** `src/lib/confidence.ts` continues to export
  `getDataConfidenceLevel` and `getDataConfidenceLabelKey` with the
  same signatures. Block-level confidence is routed through the
  shared engine.

- **R4.4** `listing-verdict.ts` (`performListingCheck`) continues to
  work without changes via the adapter layer.

## R5 — Consistency

- **R5.1** All surfaces that display confidence use the same tier
  labels: "High confidence", "Medium confidence", "Low confidence".

- **R5.2** All surfaces that display caveats use the same message
  text for the same code — text is defined once in the caveat module,
  not in UI components.

- **R5.3** The confidence summary string is built by the shared
  engine, not by individual components.

## R6 — Architecture constraints

- **R6.1** The shared modules (`shared/confidence-system.ts`,
  `shared/caveat-codes.ts`) are pure TypeScript with no imports from
  `src/`, `functions/`, or Node/browser APIs. They run in Workers,
  browser, and Vitest.

- **R6.2** No `Date.now()` or `new Date()` in confidence or caveat
  code. All time references use explicit `referenceMonth` or
  `newestComparableAgeMonths` parameters.

- **R6.3** No AI, prediction models, or external API calls.

- **R6.4** Confidence inputs are assembled by callers from existing
  data structures — the engine does not query or compute comparables.

## R7 — Tests

- **R7.1** Vitest covers each sub-signal at boundary values (0, 1,
  and the saturation point).

- **R7.2** Vitest covers tier thresholds at exact boundaries (score
  = 0.3999 → low, 0.40 → medium, 0.6999 → medium, 0.70 → high).

- **R7.3** Vitest covers all three override rules and verifies they
  only cap (never raise) the tier.

- **R7.4** Vitest covers every caveat code: each triggers at its
  documented threshold and does not trigger below it.

- **R7.5** Vitest covers caveat deduplication: no duplicate codes.

- **R7.6** Vitest covers the adapter layers: output shape matches
  the legacy `ConfidenceResult` and `Caveat` types.

- **R7.7** Existing tests in `listing-confidence.test.ts` and
  `listing-caveats.test.ts` pass (with threshold updates where the
  multi-signal engine shifts an edge case).
