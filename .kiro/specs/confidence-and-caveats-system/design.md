# Design: Confidence & Caveats System

> Status: Draft. Replace the ad-hoc confidence/caveat implementations with
> a unified, evidence-based system that produces consistent output across
> listing checks, comparable tables, shortlist rows, and block detail views.

## Problem

Confidence and caveat logic is spread across three modules with
overlapping but incompatible designs:

1. **`src/lib/listing-confidence.ts`** — uses only comparable count
   (12/5 thresholds) and a binary recency downgrade (>12 months).
   Returns a single `reason` string with no structure.

2. **`src/lib/listing-caveats.ts`** — generates free-text `Caveat[]`
   with severity but no machine-readable codes. Duplicates recency
   logic from confidence. Uses `Date.now()` as a fallback (breaks
   determinism).

3. **`src/lib/confidence.ts`** — block-level data confidence using
   only `recentTransactionCount` (8/4 thresholds). Completely
   independent from listing confidence.

4. **`shared/comparable-engine.ts`** — produces `caveats: string[]`
   (plain strings) for widening events, disconnected from the
   listing caveat system.

This creates several problems:

- **Weak signal**: confidence is driven almost entirely by count.
  A set of 12 town-wide comparables from 11 months ago in a
  different flat type scores "high", while 7 same-block, same-type,
  last-month transactions score "medium".

- **Inconsistent language**: the block detail drawer says "Medium
  confidence" based on 4+ transactions; the listing check says
  "Medium" based on 5–11 transactions. Users see different labels
  for the same block.

- **No machine-readable codes**: UI components format caveat strings
  inline. Caveat text cannot be filtered, deduplicated across
  sources, or used for conditional rendering without string matching.

- **No match-quality signal**: the comparable engine computes
  `sameBlockCount`, `sameStreetCount`, `widenedSearch`, similarity
  scores, and match reasons — none of which feed into confidence.

## Goals

- One confidence engine that every surface calls with the same inputs.
- Confidence driven by evidence quality: sample size, recency, scope
  proximity, and match quality — not just count.
- Machine-readable caveat codes alongside human-readable text.
- Deterministic: no `Date.now()`, no side effects.
- Pure TypeScript in `shared/` so it runs in Workers, browser, and
  tests without platform dependencies.
- Backward-compatible output shape: existing consumers get the same
  `ConfidenceLevel` and `Caveat[]` they expect, just with richer data.

## Non-goals

- Changing the comparable engine's selection/scoring algorithm.
- Adding new API endpoints.
- Modifying the similarity weights or widening thresholds.
- AI, prediction models, or external services.

## Architecture

### 1. New Module: `shared/confidence-system.ts`

Pure TypeScript. No imports from `src/` or `functions/`. Exports the
confidence engine and caveat generator as separate functions that share
a common input type.

#### Input Type

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
  widenedSearch: boolean;
  timeAdjustmentApplied: boolean;
  trendSampleSize: number | null;
};
```

These map directly to data already available from the comparable
engine result (`ListingComparableSet`) and the similarity scoring
output. The caller assembles the input from existing data — the
confidence module does not query or compute comparables itself.

`flatTypeMatchCount`, `floorAreaMatchCount`, and `storeyMatchCount`
count comparables where the corresponding similarity component scored
above `MATCH_REASON_THRESHOLD` (0.9). The comparable engine already
computes `matchReasons` per transaction; the caller counts occurrences
of "Same flat type", "Similar floor area", and "Similar storey"
respectively. For the block-level caller (which has
`AddressDetailTransaction[]` without similarity scores), these are
derived from direct property comparison: exact flat type match,
floor area within ±10 sqm, and storey range overlap.

#### Confidence Scoring

The engine computes a weighted evidence score from normalized
sub-signals, then maps it to a tier:

```
evidenceScore =
    w_sample   * sampleSignal
  + w_recency  * recencySignal
  + w_scope    * scopeSignal
  + w_match    * matchSignal
```

| Signal | Weight | Formula |
|--------|--------|---------|
| `sampleSignal` | 0.35 | `clamp(count / 12, 0, 1)` — saturates at 12 |
| `recencySignal` | 0.25 | `1 - clamp(ageMonths / 24, 0, 1)` — decays over 24 months; 1.0 when null (no data = assume current) |
| `scopeSignal` | 0.25 | `(sameBlock / max(count, 1)) * 0.5 + (sameStreet / max(count, 1)) * 0.3 + (sameTown / max(count, 1)) * 0.2` — fraction of comparables from tight scopes |
| `matchSignal` | 0.15 | `(flatTypeMatches + floorAreaMatches + storeyMatches) / (3 * max(count, 1))` — fraction of strong matches |

Note: `recencySignal` uses a wider 24-month decay (vs the old 12-month
binary cutoff) so confidence degrades gradually rather than cliff-edging.
When `newestComparableAgeMonths` is null (no comparables), recency
defaults to 1.0 — it is the sample signal (which will be 0) that
drives the "no data" case, not a recency penalty.

**Tier thresholds:**

| Tier | Evidence Score |
|------|---------------|
| `high` | ≥ 0.70 |
| `medium` | ≥ 0.40 |
| `low` | < 0.40 |

**Override rules** (hard constraints that cap the tier regardless of
score):

- `comparableCount < 3` → cap at `low`
- `newestComparableAgeMonths > 18` → cap at `medium`
- `sameBlockCount === 0 && sameStreetCount === 0` → cap at `medium`

These overrides express minimum evidence standards that a weighted
score alone cannot guarantee.

#### Output Type

```ts
type ConfidenceLevel = "high" | "medium" | "low";

type ConfidenceAssessment = {
  level: ConfidenceLevel;
  score: number;                    // 0–1 raw evidence score
  signals: {
    sample: number;                 // 0–1
    recency: number;                // 0–1
    scope: number;                  // 0–1
    match: number;                  // 0–1
  };
  summary: string;                  // human-readable one-liner
  input: ConfidenceInput;           // echo for debugging/display
};
```

The `summary` is a short sentence built from the dominant signal,
e.g. "High confidence — 15 comparables, 3 same-block, newest 2 months
ago" or "Low confidence — only 2 comparables found". It replaces the
old `reason` string with consistent language.

### 2. Caveat System: `shared/caveat-codes.ts`

Machine-readable caveat codes plus human-readable text. Each code is a
string literal union so consumers can switch on it.

```ts
type CaveatCode =
  | "LOW_SAMPLE"
  | "VERY_LOW_SAMPLE"
  | "NO_COMPARABLES"
  | "STALE_DATA"
  | "NO_SAME_BLOCK"
  | "NO_SAME_STREET"
  | "WIDENED_TO_STREET"
  | "WIDENED_TO_TOWN"
  | "FLAT_TYPE_MISMATCH"
  | "FLOOR_AREA_MISMATCH"
  | "STOREY_MISMATCH"
  | "LEASE_MISMATCH"
  | "EXTREME_OUTLIER_LOW"
  | "EXTREME_OUTLIER_HIGH"
  | "TIME_ADJUSTMENT_APPLIED"
  | "SMALL_TREND_SAMPLE";

type CaveatSeverity = "info" | "warning" | "critical";

type Caveat = {
  code: CaveatCode;
  severity: CaveatSeverity;
  message: string;
};
```

Adding `critical` severity for cases that fundamentally undermine the
verdict (zero comparables, extreme staleness). The old `info | warning`
union stays as a subset.

#### Caveat Generator

```ts
function generateCaveats(params: {
  confidence: ConfidenceAssessment;
  assessment?: AskingPriceAssessment;
  leaseCommenceYear?: number;
  comparableLeaseYears: number[];
  apiCaveats?: string[];
}): Caveat[]
```

Caveat triggers with their codes:

| Condition | Code | Severity |
|-----------|------|----------|
| `count === 0` | `NO_COMPARABLES` | critical |
| `count < 3` | `VERY_LOW_SAMPLE` | warning |
| `3 ≤ count < 5` | `LOW_SAMPLE` | warning |
| `newestAge > 12` | `STALE_DATA` | warning |
| `sameBlockCount === 0` | `NO_SAME_BLOCK` | info |
| `sameBlockCount === 0 && sameStreetCount === 0` | `NO_SAME_STREET` | warning |
| widened to street (from `apiCaveats`) | `WIDENED_TO_STREET` | info |
| widened to town (from `apiCaveats`) | `WIDENED_TO_TOWN` | warning |
| `flatTypeMatchCount / count < 0.5` | `FLAT_TYPE_MISMATCH` | warning |
| `floorAreaMatchCount / count < 0.5` | `FLOOR_AREA_MISMATCH` | info |
| `storeyMatchCount / count < 0.5` | `STOREY_MISMATCH` | info |
| lease year diff > 10 from median | `LEASE_MISMATCH` | warning |
| percentile === 0 | `EXTREME_OUTLIER_LOW` | info |
| percentile === 100 | `EXTREME_OUTLIER_HIGH` | info |
| `timeAdjustmentApplied` | `TIME_ADJUSTMENT_APPLIED` | info |
| `trendSampleSize != null && < 6` | `SMALL_TREND_SAMPLE` | warning |

The generator deduplicates by code. `apiCaveats` (the raw string array
from `ListingComparableSet.caveats`) is mapped to codes by substring
matching, then the matched strings are dropped so they are not also
rendered as free-text.

### 3. Adapter Layer: `src/lib/listing-confidence.ts` (updated)

The existing module becomes a thin adapter:

```ts
import { computeConfidence as computeConfidenceV2 } from "shared/confidence-system";

export function computeConfidence(
  comparables: ReadonlyArray<AddressDetailTransaction>,
  referenceMonth?: string,
): ConfidenceResult {
  const input = buildConfidenceInput(comparables, referenceMonth);
  const assessment = computeConfidenceV2(input);
  return {
    level: assessment.level,
    comparableCount: input.comparableCount,
    newestComparableMonth: /* derived from comparables */,
    reason: assessment.summary,
  };
}
```

This preserves the existing `ConfidenceResult` shape so
`listing-verdict.ts` and `ListingCheckPanel` continue working without
changes in Phase 1. The v2-enriched path (`ConfidenceAssessment`) is
available for callers that opt in.

### 4. Adapter Layer: `src/lib/listing-caveats.ts` (updated)

Same thin-adapter pattern:

```ts
import { generateCaveats as generateCaveatsV2 } from "shared/caveat-codes";

export function generateCaveats(params: GenerateCaveatsParams): Caveat[] {
  const v2Caveats = generateCaveatsV2({ ... });
  return v2Caveats.map(c => ({
    severity: c.severity === "critical" ? "warning" : c.severity,
    message: c.message,
  }));
}
```

Existing consumers see the same `{ severity, message }` shape. The
`critical` severity is downgraded to `warning` in the v1 adapter since
old components don't handle it. New components import from
`shared/caveat-codes.ts` directly.

### 5. Block-Level Confidence: `src/lib/confidence.ts` (updated)

Replace the independent 4/8 thresholds with the shared engine:

```ts
import { computeConfidence } from "shared/confidence-system";

export function getDataConfidenceLevel(
  recentTransactionCount: number,
): DataConfidenceLevel {
  const input: ConfidenceInput = {
    comparableCount: recentTransactionCount,
    sameBlockCount: recentTransactionCount, // all are same-block
    sameStreetCount: 0,
    sameTownCount: 0,
    newestComparableAgeMonths: null,        // unknown at block level
    flatTypeMatchCount: 0,                  // unknown
    floorAreaMatchCount: 0,
    storeyMatchCount: 0,
    widenedSearch: false,
    timeAdjustmentApplied: false,
    trendSampleSize: null,
  };
  return computeConfidence(input).level;
}
```

Because `sameBlockCount === comparableCount`, the scope signal is
maximized, and the output aligns with the old behavior at similar
counts — preserving backward compatibility for block detail and
shortlist views.

### 6. Full-Signal Path: `ListingCheckPanel` (updated)

When the comparable engine API response is available, the panel builds
a full `ConfidenceInput` from the `ListingComparableSet`:

```ts
const input: ConfidenceInput = {
  comparableCount: comparableSet.comparables.length,
  sameBlockCount: comparableSet.sameBlockCount,
  sameStreetCount: comparableSet.sameStreetCount,
  sameTownCount: comparableSet.sameTownCount,
  newestComparableAgeMonths: comparableSet.newestComparableAgeMonths,
  flatTypeMatchCount: comparableSet.comparables
    .filter(c => c.matchReasons.includes("Same flat type")).length,
  floorAreaMatchCount: comparableSet.comparables
    .filter(c => c.matchReasons.includes("Similar floor area")).length,
  storeyMatchCount: comparableSet.comparables
    .filter(c => c.matchReasons.includes("Similar storey")).length,
  widenedSearch: comparableSet.widenedSearch,
  timeAdjustmentApplied: !!adjustedResult,
  trendSampleSize: adjustedResult?.trendSampleSize ?? null,
};
```

This is the richest signal path. It uses all the data the comparable
engine already computes.

## Testing

### Vitest Unit Tests

1. `tests/unit/confidence-system.test.ts`
   - Each sub-signal produces correct 0–1 values at boundaries
   - Tier thresholds at exact boundaries (0.40, 0.70)
   - Override rules: `count < 3` caps at low; `age > 18` caps at
     medium; no same-block/street caps at medium
   - Override does not *raise* tier (only caps)
   - Full-signal integration: same-block heavy set scores high;
     town-wide stale set scores low
   - Summary string is non-empty and matches level

2. `tests/unit/caveat-codes.test.ts`
   - Each caveat code triggers at its threshold
   - No duplicate codes in output
   - `apiCaveats` string mapping produces correct codes
   - `critical` severity only for `NO_COMPARABLES`
   - Clean high-confidence input produces no caveats
   - All codes in the union are exercised

3. `tests/unit/listing-confidence-adapter.test.ts`
   - Adapter output matches `ConfidenceResult` shape
   - Level matches the shared engine for same inputs
   - `reason` field is populated from `summary`

### Existing Tests

- `tests/unit/listing-confidence.test.ts` — existing tests continue
  to pass via the adapter layer. Thresholds may shift slightly (the
  new engine considers more signals), so boundary tests are updated.
- `tests/unit/listing-caveats.test.ts` — same adapter pass-through.
- `tests/unit/comparable-engine.test.ts` — no changes.

## Risks / Trade-offs

- **Threshold shift**: the multi-signal engine may classify some
  edge cases differently than the old count-only system. The override
  rules are designed to keep the most impactful cases (very few
  comparables, very stale data) aligned with user expectations.

- **Two module locations**: `shared/confidence-system.ts` (engine)
  and `shared/caveat-codes.ts` (caveats) live in `shared/` while
  the adapters stay in `src/lib/`. This is the standard split for
  this repo (shared = platform-agnostic, src/lib = browser-layer).

- **Match count derivation**: counting `matchReasons` strings is
  fragile if reason labels change. An alternative is to add numeric
  match component scores to `ComparableTransaction`, but that
  enlarges the API response. The string approach is acceptable for
  now since both the reason labels and the consumer live in the same
  repo and change together.
