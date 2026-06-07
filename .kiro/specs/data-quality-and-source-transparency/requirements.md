# Requirements: Data Quality and Source Transparency

## R1 — Reuse existing pipeline metadata, add only minimal additions

- **R1.1** Use existing `/api/manifest` payload as the primary source of freshness,
  sync timestamp, and dataset identifiers.
- **R1.2** If required metadata is absent, the UI remains functional and never
  hard-fails due to schema assumptions.
- **R1.3** Add a static metadata source or a small metadata endpoint only if
  `/api/manifest` lacks required fields at runtime.

## R2 — Data freshness and source display

- **R2.1** Listing check results display the latest month used by the comparable set.
- **R2.2** UI shows when source data was last built/synced when available:
  `manifest.generatedAt` and (when available) `manifest.sources.lastUpdatedAt`.
- **R2.3** App surfaces optionally show source attribution (resale collection/dataset IDs)
  using best-effort values from manifest metadata.
- **R2.4** Missing source metadata displays explicit fallback copy and does not hide core
  result output.

## R3 — Comparable-set trust status

- **R3.1** Users can see whether the comparable set is:
  - `strong`
  - `weak`
  - `widened`
  - `stale`
- **R3.2** Trust status derives from shared confidence/caveat inputs and is
  consistent across listing check and comparison surfaces.
- **R3.3** Widening events are surfaced explicitly when block/street expansion happens.
- **R3.4** Staleness is surfaced explicitly when newest comparable is older than 12
  months.

## R4 — Caveat consistency and coverage

- **R4.1** Low-sample caveats are shown when comparable counts are low for listing check,
  block-level summaries, shortlist rows, and comparison tables.
- **R4.2** Widened-search caveats are surfaced consistently using the same message
  source across surfaces.
- **R4.3** Time-adjustment caveats include:
  - "applied" when available, and
  - "cannot be applied" when request context prevents adjustment.
- **R4.4** Language for caveat cases is shared and not copy-pasted per component.

## R5 — Robustness for stale / missing / partial states

- **R5.1** Missing metadata does not crash loading or rendering.
- **R5.2** Partial metadata does not block listing check or block-detail rendering.
- **R5.3** Stale data states are clearly labelled with warning-level caveats.
- **R5.4** Empty comparable states remain deterministic and actionable.

## R6 — Scope and quality gates

- **R6.1** All changes remain within local-first runtime rules and do not fetch
  external runtime data.
- **R6.2** D1 write paths remain unchanged.
- **R6.3** `npm run lint`, `npm run typecheck`, `npm run test`, and existing E2E smoke
  remain green after implementation.

## Acceptance criteria

- The listing check result displays the latest data month used in that check.
- The app clearly indicates whether comparable data is strong, weak, widened, or stale.
- Missing metadata does not crash the app or prevent interactions.
- Caveat messages for low sample, widened comparables, and time-adjustment failure are
  consistent in:
  - listing check,
  - block detail,
  - shortlist,
  - comparison table.
