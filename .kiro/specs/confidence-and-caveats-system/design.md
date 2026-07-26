# Design: Confidence & Caveats System

> Status: Implemented product contract. Listing Check derives confidence and
> caveats from structured evidence, keeps stable cross-runtime identifiers, and
> localizes only at the UI boundary.

## Problem addressed

The earlier implementation split count-based confidence, free-text caveats,
and comparable match quality across unrelated modules. That made confidence
tiers inconsistent, prevented reliable caveat deduplication, and encouraged UI
code to inspect English prose.

The implemented system has two explicit boundaries:

1. shared engines produce deterministic scores, codes, values, and stable
   English fallback text;
2. Listing Check presentation translates structured output without changing
   the identifiers used by analysis.

## Goals

- Derive confidence from sample size, recency, geographic scope, and match
  quality.
- Represent caveats with a fixed code union and structured interpolation
  values.
- Keep all evidence logic deterministic and cross-runtime.
- Preserve compatibility entry points while frontend ownership moves to
  `src/entities/transaction/` and `src/features/listing-check/`.
- Keep the comparable engine's English match-reason identifiers stable for
  scoring and API compatibility.
- Translate confidence summaries, caveats, and match-reason badges only when
  they render.

## Non-goals

- Changing comparable selection or similarity weights.
- Adding runtime geocoding, upstream data fetching, AI, or prediction.
- Adding endpoints or changing D1 schema.
- Translating shared-engine identifiers or fallback messages in place.

## Architecture

### 1. Shared confidence engine

`shared/confidence-system.ts` is pure TypeScript and exports:

```ts
type ConfidenceInput = {
  comparableCount: number;
  sameBlockCount: number;
  sameStreetCount: number;
  sameTownCount: number;
  newestComparableAgeMonths: number | null;
  flatTypeMatchCount: number;
  floorAreaMatchCount: number;
  storeyMatchCount: number;
  timeAdjustmentApplied: boolean;
  trendSampleSize: number | null;
};

type ConfidenceAssessment = {
  level: "high" | "medium" | "low";
  score: number;
  signals: {
    sample: number;
    recency: number;
    scope: number;
    match: number;
  };
  summary: string;
  input: ConfidenceInput;
};
```

The evidence score is:

```text
0.35 * sample + 0.25 * recency + 0.25 * scope + 0.15 * match
```

| Signal | Implemented formula |
| --- | --- |
| Sample | `clamp(comparableCount / 12, 0, 1)` |
| Recency | `1 - clamp(ageMonths / 24, 0, 1)`; `null` maps to `1` |
| Scope | Weighted cumulative same-block, same-street, and same-town ratios |
| Match | Flat-type, floor-area, and storey match counts divided by `3 * count` |

Scores map to `high` at `>= 0.70`, `medium` at `>= 0.40`, and `low`
otherwise. Three caps then apply without ever raising a tier:

- fewer than three comparables caps the result at `low`;
- newest evidence older than 18 months caps it at `medium`;
- no same-block and no same-street evidence caps it at `medium`.

The engine also emits a stable English summary for logs, compatibility
consumers, and non-UI runtimes. UI localization does not read or parse that
summary.

### 2. Structured caveats

`shared/caveat-codes.ts` defines 17 codes:

```text
NO_COMPARABLES
VERY_LOW_SAMPLE
LOW_SAMPLE
STALE_DATA
NO_SAME_BLOCK
NO_SAME_STREET
WIDENED_TO_STREET
WIDENED_TO_TOWN
FLAT_TYPE_MISMATCH
FLOOR_AREA_MISMATCH
STOREY_MISMATCH
LEASE_MISMATCH
EXTREME_OUTLIER_LOW
EXTREME_OUTLIER_HIGH
TIME_ADJUSTMENT_APPLIED
TIME_ADJUSTMENT_UNAVAILABLE
SMALL_TREND_SAMPLE
```

Each caveat contains a stable `code`, a severity of
`info | warning | critical`, a stable English fallback `message`, and optional
structured `values`. Dynamic values include sample count, listing lease year,
median comparable lease year, and trend sample count.

The generator:

- deduplicates by code;
- reserves `critical` for `NO_COMPARABLES`;
- maps recognized widening and time-adjustment API messages to codes;
- emits `TIME_ADJUSTMENT_UNAVAILABLE` when trend evidence is missing and
  suppresses the contradictory `TIME_ADJUSTMENT_APPLIED` message;
- never parses localized prose.

### 3. Compatibility and feature ownership

The current compatibility path is:

- `shared/product/listing-check.ts` implements
  `computeListingConfidence`, `generateListingCaveats`, and
  `performListingCheck`;
- `src/entities/transaction/listing-confidence.ts` and
  `src/entities/transaction/listing-caveats.ts` expose the frontend entity
  adapters;
- `src/features/listing-check/listing-verdict.ts` re-exports the shared product
  contract;
- `src/features/listing-check/confidence.ts` provides the count-only
  block-confidence compatibility helper and stable locale keys.

Compatibility caveats preserve their codes and values but map `critical` to
`warning` because the legacy shape supports only `info | warning`.

### 4. Full-signal Listing Check path

`src/features/listing-check/listingCheckAnalysis.ts` assembles
`ConfidenceInput` from the comparable response and selected listing facts.
It counts the stable identifiers `"Same flat type"`, `"Similar floor area …"`,
and `"Similar storey"` before any presentation formatting occurs. It then
passes the resulting `ConfidenceAssessment`, percentile, lease years, API
caveats, and adjustment caveats to `generateCaveats`.

`src/features/listing-check/ListingCheckPanel.tsx` renders the derived
assessment. `src/features/listing-check/ComparableEvidenceTable.tsx` renders
the same structured caveats beside the evidence rows.

### 5. Localized presentation boundary

`src/features/listing-check/listingCheckPresentation.ts` owns UI formatting:

- `formatListingConfidenceSummary` rebuilds localized summary text from
  `ConfidenceAssessment.level` and `.input`;
- `formatListingCaveat` translates a structured code and interpolates values;
- `formatEvidenceCaveat` localizes known raw API fallbacks and preserves
  unknown text rather than hiding it;
- `formatListingMatchReason` translates seven fixed identifiers plus the
  parameterized `"Similar floor area (±N sqm)"` identifier.

The engine continues to emit eight stable English match-reason identifiers.
Changing locale therefore cannot change match counts or confidence scores.

## Testing

- `tests/unit/confidence-system.test.ts` covers signal boundaries, tier
  behavior, caps, integration examples, output shape, and summaries.
- `tests/unit/caveat-codes.test.ts` covers all 17 caveat codes, thresholds,
  API mapping, structured values, deduplication, and severity.
- `tests/unit/listing-confidence-adapter.test.ts`,
  `tests/unit/listing-confidence.test.ts`,
  `tests/unit/listing-caveats.test.ts`, and
  `tests/unit/listing-verdict.test.ts` cover compatibility contracts.
- `tests/unit/listingCheckAnalysis.test.ts` covers stable identifier counting,
  adjustment metadata, and structured caveat derivation.
- `tests/unit/listingCheckPresentation.test.ts` covers both locales, all
  17 caveat codes, all eight match reasons, summary branches, interpolation,
  and truthful unknown fallbacks.
- Listing Check component tests cover the integrated localized presentation.

## Risks and invariants

- Match reasons are data identifiers despite their readable English form.
  Translation must remain in `listingCheckPresentation.ts`.
- `TIME_ADJUSTMENT_UNAVAILABLE` must win over
  `TIME_ADJUSTMENT_APPLIED` when adjustment evidence is incomplete.
- The compatibility helpers intentionally use reduced inputs. The canonical
  Listing Check result must continue to use the full signal assembly in
  `listingCheckAnalysis.ts`.
