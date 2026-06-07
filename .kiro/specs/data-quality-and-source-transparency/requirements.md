# Requirements: Data Quality and Source Transparency

## R1 — Reuse existing pipeline metadata

- **R1.1** All freshness, timestamp, and source-provenance fields are derived
  from the existing `/api/manifest` payload — no new API endpoint is added
  unless the manifest proves insufficient at implementation time.
- **R1.2** WHEN any metadata field is absent or unparseable THEN the UI shows
  an explicit fallback label (e.g., "unavailable") and does not hide, crash,
  or block the surrounding view.
- **R1.3** The data pipeline (`scripts/sync-data.ts`) and D1 write paths remain
  unchanged.

## R2 — Data freshness display

- **R2.1** The listing check result displays the latest transaction month used
  in that specific check (from the comparable set, falling back to manifest
  `dataWindow.maxMonth`).
- **R2.2** The UI shows when the dataset was last built or synced
  (`manifest.generatedAt`) and when the upstream source was last updated
  (`manifest.sources.lastUpdatedAt`), when available.
- **R2.3** WHEN both timestamps are available THEN both are shown; WHEN only
  one is available THEN only that one is shown; WHEN neither is available THEN
  a fallback label is shown.

## R3 — Source attribution

- **R3.1** Source attribution (resale collection ID, dataset count) is displayed
  in an appropriate info surface (e.g., header, footer, or detail panel).
- **R3.2** WHEN source metadata is partial or missing THEN fallback copy is
  shown and the rest of the UI remains functional.

## R4 — Comparable-set quality status

- **R4.1** Users can see whether the comparable set is `strong`, `weak`,
  `widened`, or `stale` via a visible quality badge or tag.
- **R4.2** Quality status derives deterministically from existing confidence
  scores and caveat codes and is consistent across listing check and
  comparison surfaces.
- **R4.3** WHEN the comparable search was widened from block to street or town
  THEN the widening is surfaced explicitly.
- **R4.4** WHEN the newest comparable transaction is older than 12 months THEN
  the set is marked `stale`.
- **R4.5** WHEN the comparable count is low for a given town/flat type THEN a
  low-sample caveat (`LOW_SAMPLE` or `VERY_LOW_SAMPLE`) is shown.

## R5 — Caveat consistency and coverage

- **R5.1** Low-sample caveats are shown consistently across listing check,
  block-level summaries, shortlist rows, and comparison tables.
- **R5.2** Widened-search caveats use the same message source across all
  surfaces — no per-component copy.
- **R5.3** Time-adjustment caveats include both the "applied" and "cannot be
  applied" states.
- **R5.4** All user-facing caveat messages are derived from a shared adapter
  (not copy-pasted per component).

## R6 — Robustness for stale / missing / partial states

- **R6.1** Missing manifest metadata does not crash any view's loading or
  rendering.
- **R6.2** Partial metadata (e.g., `generatedAt` present but `sources` absent)
  does not block listing check or block detail rendering.
- **R6.3** Stale data states are clearly labelled with warning-level caveats.
- **R6.4** Empty comparable states show an explicit "no comparable transactions"
  message with whatever freshness context is available.

## R7 — Quality gates

- **R7.1** All changes remain within local-first runtime rules — no runtime
  `fetch()` to external domains.
- **R7.2** D1 write paths remain unchanged.
- **R7.3** `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run
  build` pass after implementation.
- **R7.4** Existing E2E smoke tests remain green.

## Acceptance criteria

1. The listing check result displays the latest data month used in that check.
2. The app clearly indicates whether comparable data is strong, weak, widened,
   or stale.
3. Missing metadata does not crash the app or prevent interactions.
4. Caveat messages for low sample size, widened comparables, and
   time-adjustment failure are consistent across listing check, block detail,
   shortlist, and comparison views.
