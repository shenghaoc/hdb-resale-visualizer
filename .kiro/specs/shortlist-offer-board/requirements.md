# Requirements: shortlist-offer-board

## R1 — Offer-board data model

- **R1.1** The shortlist item supports all requested buyer fields, including:
  asking price, fair range low/median/high, suggested offer ceiling, buyer opening
  offer, valuation received, estimated COV, viewing date, decision status, pros,
  cons, renovation notes, noise notes, transport notes, agent remarks, and buyer notes.
- **R1.2** Decision status accepts only:
  `considering`, `viewing booked`, `offered`, `rejected`, `kiv`, `dropped`.
- **R1.3** Existing persisted fields and existing UI expectations for `notes`,
  `targetPrice`, and current comparison/sort behavior remain valid after rollout.

## R2 — Migration and persistence compatibility

- **R2.1** Shortlist entries from prior formats load without data loss.
- **R2.2** Old entries without new fields are normalized to valid current items.
- **R2.3** New and old formats round-trip through local share URLs.
- **R2.4** Legacy payloads never break sync queue processing.

## R3 — Side-by-side comparison behavior

- **R3.1** Compare view displays all saved flats and includes the comparison
  metrics requested by the feature goal.
- **R3.2** `delta vs fair median` is computed consistently for valid numeric inputs
  and rendered as an explicit delta value.
- **R3.3** Price per sqm, lease situation, MRT/walking context, confidence,
  and caveats are included when source data supports them.
- **R3.4** If monthly payment estimate is already supported in the product,
  it is surfaced in compare mode when it can be computed; otherwise it degrades
  gracefully to a non-blocking placeholder.

## R4 — Editability and workflow

- **R4.1** Every new field is editable at shortlist item granularity.
- **R4.2** Decision status is editable and visibly reflected in list/compare views.
- **R4.3** Existing notes/targets update path remains local-first and debuggable
  via the current `onUpdate` flow and existing sync queue.

## R5 — Preservation of existing behavior

- **R5.1** Current shortlist capacity cap, add/remove semantics, share payload
  encoding rules, and sync cadence remain intact.
- **R5.2** No new external APIs are introduced.
- **R5.3** No runtime geocoding or data ingestion is moved into `src/` or `functions/`.

## R6 — Mobile usability

- **R6.1** Compare and edit views are usable on mobile screen widths without
  horizontal overflow in critical controls.
- **R6.2** Mobile compare allows scanning all items and all required metrics in
  context.

## R7 — Testing requirements

- **R7.1** Add unit tests covering migration from old shortlist payloads to the
  new offer-board schema.
- **R7.2** Add unit tests for `parse` / `decode` / `encode` persistence behavior
  with mixed old/new items.
- **R7.3** Add unit tests for comparison row derivation with the new metrics
  (`delta vs fair median`, confidence display, caveats mapping).
- **R7.4** Add integration tests (or Playwright scenarios) proving mobile
  usability of the updated compare view.
- **R7.5** Ensure sync payload validation tests cover both legacy and upgraded
  fields.
