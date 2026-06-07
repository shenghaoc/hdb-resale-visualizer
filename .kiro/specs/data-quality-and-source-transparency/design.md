# Design: Data Quality and Source Transparency

> Status: Draft. Make historical signal quality explicit and consistent across
> listing check, block detail, shortlist, and comparison views without changing the
> existing data pipeline semantics.

## Problem

Users rely on historical resale data, but the UI surfaces freshness and trust signals
in disconnected places and with inconsistent wording. The app already has:

- manifest metadata in `manifest` (`generatedAt`, `dataWindow`, `sources`),
- comparable-match metadata from the comparable engine (`widenedSearch`, age,
  caveats),
- caveat codes and confidence outputs in `shared/caveat-codes.ts`.

What is missing is a coherent, user-facing trust layer that stays stable when metadata
is stale, partially missing, or partially available.

## Goals

- Expose data freshness at the point of use (latest month and sync/build timestamp).
- Surface source attribution where available (dataset IDs / upstream source provenance).
- Make comparable quality explicit: strong / weak / widened / stale.
- Provide consistent caveat language for all surfaces.
- Keep the app safe when metadata is stale, missing, or partial.

## Non-goals

- Adding any runtime external data ingestion at app runtime.
- Replacing the comparable selection engine.
- Changing core pricing math.

## Architecture

### 1) Shared data-quality façade

Introduce a small, browser-safe layer used by UI components:

`src/lib/dataQuality.ts`

- `deriveDataQualityState(manifest: Partial<Manifest> | null)` returns a normalized object:
  - `latestMonthUsed` (from `manifest.dataWindow.maxMonth` when available, else `null`)
  - `generatedAt` (from `manifest.generatedAt` when parseable, else `null`)
  - `sources` (best-effort object with optional source IDs)
  - `syncState` (`fresh`, `stale`, `missing`, `partial`)
  - `syncMessage` (single human-readable label)
- `formatDataQualityState(...)` to avoid copy/paste message logic.

The layer must:

- Be defensive: partial or missing fields never throw; all outputs are nullable or
  defaulted and always rendered gracefully.
- Reuse existing manifest fields only; no new metadata fetch path is introduced unless
  runtime needs exceed what `/api/manifest` already carries.

### 2) Reuse metadata contract first

Primary data source remains:

- `GET /api/manifest` (existing runtime path).

No new endpoint is added initially.

Only if this endpoint lacks required user-facing fields in production runs, we add one
of:

- optional `/public/data/metadata.json` static file generated at sync time, or
- minimal `/api/data-quality-metadata` endpoint returning the same schema.

Selection is guided by current sync artifact behavior and will be decided in implementation.

### 3) Unified comparable quality status

Create a canonical helper:

`src/lib/listing-quality.ts`

- `deriveComparableSetQuality(set, reference)` returns:
  - `qualityTag`: `strong | weak | widened | stale`
  - `reasonCodes`: ordered `CaveatCode[]` values
  - `latestComparableMonth`

Mapping:

- `weak` when sample is low or reliability signals are weak.
- `widened` when widened matching was required.
- `stale` when `newestComparableAgeMonths > 12`.
- `strong` when none of the above apply and confidence is high.

Use existing `ConfidenceInput` + `Caveat` data as inputs where possible to avoid
duplicate heuristics.

### 4) Shared caveat language + render surface

Add/use a shared translation-ready dictionary:

- Keep canonical language definitions in `shared/caveat-codes.ts` messages.
- Add a single UI adapter to map `(code, severity)` to labels used in:
  - `ListingCheckPanel`
  - `ComparableEvidenceTable`
  - `DetailDrawer`
  - `ShortlistDrawer`
  - `ResultsPane`
  - comparison tiles and cards that show transaction confidence

This removes divergent strings like "assessment is directional only", "few comparables",
and equivalent meanings rendered as multiple phrasings.

### 5) Surface-level behavior

- `ListingCheckPanel`
  - Display latest month used by the current check.
  - Show quality badge (`strong`/`weak`/`widened`/`stale`) beside existing confidence.
  - Show time-adjustment caveat when adjustment could not be applied.
- `AppHeader` (or equivalent global info surface)
  - Keep current `dataThrough` display but include source metadata and sync timestamp
    with graceful fallback when unavailable.
- `DetailDrawer`, `ShortlistDrawer`, `ResultsPane`
  - Keep existing confidence badge labels but append/replace caveat summary text
    from the same shared source.
- `ComparableEvidenceTable`
  - Keep existing reason table, but ensure widened/stale/low-sample messages use shared
    caveat text/ordering where possible.

### 6) Graceful failure modes

- If manifest fetch succeeds but metadata fields are missing:
  - show `"Data source: unavailable"` or equivalent fallback, not a hard error.
- If comparables are stale and low-quality:
  - show explicit caveat tags and do not crash rendering.
- If comparison set is empty:
  - keep explicit "no comparable transactions" state and still show latest known
    freshness source context where available.

## Testing Plan

- Add unit tests for:
  - stale (`maxMonth` beyond freshness window),
  - missing metadata (null/malformed timestamp/source IDs),
  - partial metadata (only core manifest fields present).
- Add component tests covering list/check/overview surfaces using shared caveat labels.
- Ensure existing confidence and caveat tests continue to pass and remain source-of-truth
  oriented.

## Open question

- Do we use `manifest.sources.lastUpdatedAt` as the trust baseline for "latest sync"
  globally, or is `manifest.generatedAt` preferred for "build timestamp" in all views?
  Recommendation: show both when both exist.
