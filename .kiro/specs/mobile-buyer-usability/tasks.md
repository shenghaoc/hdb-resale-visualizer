# Tasks: Mobile Buyer Usability

## Phase 1 — Mobile baseline and responsive hooks

- [x] **T1.1** Audit current mobile rendering for `ListingCheckPanel`, verdict output, comparable evidence, shortlist list, and shortlist compare components to identify width/overflow breakpoints and interaction blockers.
  - Deliverable: short implementation note of current branches and touch risks. (R1.2, R2.2, R3.1, R5.1, R5.3)

- [x] **T1.2** Add or consolidate responsive feature flags/helpers for viewport checks used by these components so mobile/card branches are deterministic and testable.
  - Deliverable: reusable `sm`/mobile predicate or CSS breakpoints used consistently by buyer workflow UI. (R6.3)

## Phase 2 — Listing-check flow usability on phone

- [x] **T2.1** Rework mobile `ListingCheckPanel` layout into one-column flow:
  - block selection,
  - input stack,
  - primary check action,
  - results section.
  - Ensure block can be selected and check submitted without map panel interaction. (R1.1, R1.2, R5.2)

- [x] **T2.2** Replace hover-based behaviors in the check flow with explicit touch controls (buttons/toggles/expanders) for all collapsible sections and action reveals.
  - Deliverable: no reliance on hover in core check/shortlist interactions. (R1.3, R6.1, R6.2)

- [x] **T2.3** Verify/adjust input controls for mobile ergonomics:
  - numeric fields are `type="number"` and include `inputMode="numeric"`,
  - selects have clear labels and spacing,
  - one-handed flow remains intact with no hidden required fields.
  - Deliverable: validated in component snapshots/tests. (R6.1)

## Phase 3 — Verdict before chart + confidence prominence

- [x] **T3.1** Reorder mobile result stack so verdict and confidence are rendered before chart components and before expanded evidence.
  - Deliverable: mobile viewport displays verdict/confidence in first fold when available. (R2.1, R2.4)

- [x] **T3.2** Add mobile confidence detail text and stronger semantics:
  - color-coded confidence badge,
  - reason text within same block,
  - clear low-confidence warning state.
  - Deliverable: no horizontal scroll required for reading verdict/confidence. (R2.2, R2.3)

## Phase 4 — Comparable cards on small screens

- [x] **T4.1** Add mobile-only comparable evidence card renderer replacing table display below `sm`.
  - Fields: month, price, `$ / sqm`, block, street, flat type, storey, lease, similarity, match reasons.
  - Ensure same sorting order as desktop comparator. (R3.1, R3.2, R3.3)

- [x] **T4.2** Add a compact mobile comparator section layout and spacing tuned for 320px+ widths.
  - Deliverable: each card uses readable typography and touch targets. (R3.4)

- [x] **T4.3** Ensure table visibility remains for wider screens and does not introduce horizontal scrolling at mobile breakpoints.
  - Deliverable: container-level overflow assertions and style guards. (R2.2, R7.3)

## Phase 5 — Shortlist save/edit/compare on mobile

- [x] **T5.1** Ensure "Save to Shortlist" is visible and reachable from mobile listing results after submission.
  - Deliverable: save action in primary result flow and local state update confirmed. (R4.1)

- [x] **T5.2** Rework shortlist item card/edit form to permit:
  - reopen saved item,
  - edit notes,
  - update offer ceiling/target price.
  - All actions must work with touch controls and no desktop-only dependency. (R4.2)

- [x] **T5.3** Rework shortlist compare screen for mobile:
  - support selecting and comparing at least two items,
  - avoid table-only layouts,
  - render as stacked comparison cards.
  - Deliverable: comparison result is readable and operable on phone. (R4.3)

## Phase 6 — Map interaction boundaries

- [x] **T6.1** Audit touch layering around map panel/map controls and listing-check controls.
  - Deliverable: map overlays remain non-blocking; check workflow remains usable when map panel is visible. (R5.1, R5.2, R5.3)

- [x] **T6.2** Add placeholder/skeleton handling for map and dynamic panels to avoid reflowing the mobile form during data arrival.
  - Deliverable: reduced layout jump when comparables load and/or map mounts. (R6.3)

## Phase 7 — Testing and hardening

- [x] **T7.1** Add responsive component/unit tests for:
  - verdict-first order,
  - no-hover controls,
  - mobile input types and target visibility,
  - shortlist edit/save actions.
  - Deliverable: targeted test coverage for responsive branches. (R7.1)

- [x] **T7.2** Add Playwright viewport test(s) for `390x844` and `360x640`:
  - complete listing-check flow,
  - observe verdict + confidence visible first,
  - assert comparable cards render and table does not,
  - save shortlist item and reopen to update notes/offer ceiling,
  - compare at least two shortlist items.
  - Deliverable: pass on phone viewport; include assertions for no horizontal overflow.

- [x] **T7.3** Add end-to-end smoke run checklist for mobile:
  - check listing no map,
  - shortlist save/update,
  - compare two shortlisted flats,
  - no blocked form submit due to map overlays.
  - Deliverable: smoke script and pass notes. (R7.2, R7.3)

## Phase 8 — Verification

- [x] **T8.1** Run `npm run typecheck`.
- [x] **T8.2** Run `npm run lint`.
- [x] **T8.3** Run `npm run test`.
- [x] **T8.4** Run focused Playwright specs with phone viewport coverage.
- [x] **T8.5** Run manual 1h sanity pass in UI with map visible/hidden and both shortlist-save/edit and compare workflows.
