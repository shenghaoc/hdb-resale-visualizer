# Design: Data Quality and Source Transparency

> Status: Draft. Surface data freshness, source provenance, and comparable-set
> trustworthiness across all user-facing views without changing the data pipeline
> or comparable engine semantics.

## Problem

Users rely on historical resale transactions to evaluate asking prices, but the
app surfaces trust signals inconsistently:

1. **Freshness is hidden.** The manifest carries `dataWindow.maxMonth`,
   `generatedAt`, and `sources.lastUpdatedAt`, but no user-facing view shows
   when the data was last synced or which transaction month is latest.
2. **Source attribution is absent.** Dataset IDs flow through the pipeline
   (`scripts/sync-data.ts` collects `resaleCollectionId`, `resaleDatasetIds`,
   `propertyDatasetId`, etc.) but never reach the UI — users cannot verify
   where numbers originate.
3. **Comparable quality is implicit.** The confidence system
   (`shared/confidence-system.ts`) scores evidence strength and
   `shared/caveat-codes.ts` emits machine-readable codes (`LOW_SAMPLE`,
   `WIDENED_TO_TOWN`, `STALE_DATA`, etc.), but no single label tells the user
   whether their comparable set is strong, weak, widened, or stale.
4. **Caveat language diverges.** `ListingCheckPanel`, `ComparableEvidenceTable`,
   `DetailDrawer`, and `ShortlistDrawer` each compose caveat strings
   independently, producing inconsistent phrasing for identical conditions.
5. **Missing metadata is fragile.** Partial or null manifest fields can produce
   blank UI slots or runtime errors instead of explicit fallback labels.

## Goals

- Expose data freshness at point of use: latest transaction month and
  sync/build timestamp.
- Surface source attribution where appropriate (dataset provenance from
  manifest).
- Derive a canonical comparable-set quality tag (`strong | weak | widened |
  stale`) from existing confidence and caveat data.
- Unify caveat language across listing check, block detail, shortlist, and
  comparison views through a shared message adapter.
- Guarantee graceful rendering when metadata is stale, missing, or partial.

## Non-goals

- Runtime external data ingestion (all fetches stay in `scripts/sync-data.ts`).
- Replacing the comparable selection engine (`shared/comparable-engine.ts`).
- Changing the confidence scoring formula (`shared/confidence-system.ts`).
- Adding new D1 tables or migration files.
- New API endpoints (reuse `/api/manifest` unless proven insufficient).

## Architecture

### 1. Existing metadata inventory

The manifest (served by `GET /api/manifest`, schema in `shared/data-types.ts`)
already carries:

```typescript
type Manifest = {
  schemaVersion: string;
  generatedAt: string;                 // ISO timestamp of sync run
  dataWindow: {
    minMonth: string;                  // e.g. "2012-01"
    maxMonth: string;                  // e.g. "2025-03"
  };
  sources: {
    resaleCollectionId: string;
    resaleDatasetIds: string[];
    propertyDatasetId: string;
    mrtDatasetId: string;
    lastUpdatedAt: string;             // upstream collection timestamp
    moeSchoolDatasetId?: string;
    neaHawkerDatasetId?: string;
    sfaSupermarketDatasetId?: string;
    nparksParksDatasetId?: string;
  };
  counts: { blocks: number; transactions: number; towns: number; mrtStations: number; comparisons?: number };
  filterOptions: FilterOptions;
};
```

The confidence system (`shared/confidence-system.ts`) produces:

```typescript
type ConfidenceAssessment = {
  level: "high" | "medium" | "low";
  score: number;                       // 0–1 raw evidence score
  signals: { sample: number; recency: number; scope: number; match: number };
  summary: string;
  input: ConfidenceInput;
};
```

Machine-readable caveats (`shared/caveat-codes.ts`) include: `LOW_SAMPLE`,
`VERY_LOW_SAMPLE`, `NO_COMPARABLES`, `STALE_DATA`, `WIDENED_TO_STREET`,
`WIDENED_TO_TOWN`, `TIME_ADJUSTMENT_APPLIED`, `SMALL_TREND_SAMPLE`,
`FLAT_TYPE_MISMATCH`, `FLOOR_AREA_MISMATCH`, `STOREY_MISMATCH`,
`LEASE_MISMATCH`, `NO_SAME_BLOCK`, `NO_SAME_STREET`, `EXTREME_OUTLIER_LOW`,
`EXTREME_OUTLIER_HIGH`.

The D1 `manifest` table (`migrations/0001_initial.sql`) stores a single JSON
blob with an `updated_at` column tracking sync completion. The frontend fetches
this via `src/hooks/useManifestData.ts`.

No new data source is needed. The task is to normalize, derive, and display.

### 2. Data-quality facade — `src/lib/dataQuality.ts`

A small browser-safe layer consumed by all UI surfaces:

```typescript
type SyncState = "fresh" | "stale" | "missing" | "partial";

type DataQualityState = {
  latestMonth: string | null;           // manifest.dataWindow.maxMonth
  generatedAt: string | null;           // manifest.generatedAt (ISO)
  lastUpdatedAt: string | null;         // manifest.sources.lastUpdatedAt (ISO)
  syncState: SyncState;
  syncMessage: string;                  // human-readable fallback label
  sourceAttribution: {
    resaleCollectionId: string | null;
    datasetCount: number;
  };
};

function deriveDataQualityState(
  manifest: Partial<Manifest> | null
): DataQualityState;

function formatRelativeTime(iso: string | null): string; // "3 days ago" | "unavailable"
```

State derivation rules:
- `missing` — manifest is `null` or empty object.
- `partial` — `generatedAt` or `dataWindow` is absent but other fields exist.
- `stale` — `maxMonth` is more than 3 months behind the current month.
- `fresh` — none of the above.

Every field is nullable. Missing values produce fallback copy, never throw.

### 3. Comparable quality status — `src/lib/listing-quality.ts`

Derives a single trust label from existing confidence + caveat outputs:

```typescript
type QualityTag = "strong" | "weak" | "widened" | "stale";

type ComparableSetQuality = {
  tag: QualityTag;
  reasonCodes: CaveatCode[];
  latestComparableMonth: string | null;
};

function deriveComparableSetQuality(input: {
  confidence: ConfidenceAssessment;
  caveats: CaveatCode[];
  newestComparableAgeMonths: number | null;
}): ComparableSetQuality;
```

Mapping priority (first match wins):
1. **stale** — `newestComparableAgeMonths > 12` or `STALE_DATA` in caveats.
2. **widened** — `WIDENED_TO_STREET` or `WIDENED_TO_TOWN` in caveats.
3. **weak** — `LOW_SAMPLE` or `VERY_LOW_SAMPLE` in caveats, or
   `confidence.level === "low"`.
4. **strong** — none of the above and `confidence.level` is `"high"` or
   `"medium"`.

This consumes the same `ConfidenceInput` and `CaveatCode` data already produced
by the confidence-and-caveats system — no duplicate heuristics.

### 4. Shared caveat language adapter

Canonical user-facing messages stay in `shared/caveat-codes.ts` (which already
has `getCaveatMessage(code)` and severity mappings). A thin UI adapter maps
`(code, severity)` to display props consumed by all surfaces:

```typescript
function getCaveatDisplayProps(code: CaveatCode): {
  label: string;              // e.g. "Low sample size"
  severity: "info" | "warning" | "critical";
  icon: string;               // Lucide icon name
};
```

All surfaces import this adapter instead of composing inline strings. This
eliminates divergent copy like "assessment is directional only" vs "few
comparables" vs "limited comparable transactions" for the same condition.

### 5. Surface-level integration

| Surface | What to show | Source |
|---------|-------------|--------|
| `ListingCheckPanel` | Latest month used, quality badge, time-adjustment caveat | `deriveComparableSetQuality` + manifest |
| `ComparableEvidenceTable` | Widened/low-sample notes using shared language | caveat adapter |
| `AppHeader` / global info | "Data through {month}", sync timestamp | `deriveDataQualityState` |
| `DetailDrawer` | Compact quality tag + caveat summary | caveat adapter |
| `ShortlistDrawer` | Per-row quality indicator | `deriveComparableSetQuality` |
| `ResultsPane` | Confidence label + caveat micro-copy | caveat adapter |

### 6. Graceful failure modes

| Scenario | Behavior |
|----------|----------|
| Manifest fetch fails | Show "Data freshness: unavailable"; all other features work |
| `dataWindow.maxMonth` missing | Show "Latest month: unavailable"; listing check still runs |
| `sources` object partial | Show "Source: unavailable"; no crash |
| Empty comparable set | Show "No comparable transactions found"; no quality badge |
| Stale + low quality | Show both caveat tags; highest severity wins for badge color |
| Town/flat type has few transactions | Show `LOW_SAMPLE` caveat with town/flat-type context |

## Testing plan

- **Unit tests** (`tests/unit/dataQuality.test.ts`):
  - Stale state when `maxMonth` is >3 months old.
  - Missing manifest (`null` input).
  - Partial manifest (missing `generatedAt`, missing `sources`, missing
    `dataWindow`).
  - `formatRelativeTime` with valid ISO, invalid string, `null`.
- **Unit tests** (`tests/unit/listing-quality.test.ts`):
  - Each quality tag path (strong, weak, widened, stale).
  - Priority ordering: stale overrides widened overrides weak.
  - Edge cases: empty caveats + high confidence → strong; no comparables →
    no badge.
- **Component tests**:
  - `ListingCheckPanel` renders latest month and quality badge.
  - `ComparableEvidenceTable` uses shared caveat language (no inline strings).
  - `DetailDrawer` / `ShortlistDrawer` show fallback on missing metadata.
- **E2E** (existing Playwright mocks):
  - Listing check flow with full metadata → quality badge visible.
  - Partial metadata fixture → no render crash, fallback labels shown.

## Risks and trade-offs

- **Manifest-only freshness**: Sync timestamp reflects when the pipeline last
  ran, not necessarily when upstream data changed. Mitigation: show both
  `generatedAt` (our sync) and `lastUpdatedAt` (upstream) when both exist.
- **3-month staleness threshold**: Somewhat arbitrary. May need tuning after
  observing real data publication cadence. Mitigated by making the threshold a
  named constant.
- **No per-source staleness**: All data sources are treated as a single
  freshness unit. If amenity data goes stale while resale transactions are
  fresh, the UI will not distinguish. Acceptable for v1; per-source tracking
  is a future enhancement.
- **Quality tag is a simplification**: Collapsing multi-dimensional confidence
  into a single `strong/weak/widened/stale` tag loses nuance. Mitigated by
  also showing the individual caveat codes alongside the badge.
