# Tasks: Buyer-First Homepage

> Execution checklist. Order reflects UI delivery, performance hardening, and validation.

## Phase 1 — Homepage structure and action hierarchy
- [ ] **T1.1** Rework/create the top-level homepage entry section so it renders the buyer action cluster first:
  - Check a listing price (primary)
  - Find candidate blocks
  - Compare my shortlist
  - Verification: all three are visible in initial viewport on desktop and mobile. (R2.1, R2.2, R1.1)

- [ ] **T1.2** Add the primary purpose statement directly in the first section:
  "Check whether an asking price is fair using historical HDB resale transactions."
  - Verification: visible without interacting with map filters. (R1.1)

- [ ] **T1.3** Add trust copy near primary action:
  "Deterministic historical comparisons. No AI valuation API."
  - Verification: present and visible in first fold. (R4.1)

## Phase 2 — Buyer flow entry and honest listing facts
- [x] **T2.1** Wire the `Check a listing price` action to jump directly to listing-check workflow.
  - Verification: user can start a check without map clicks. (R2.3, R1.3)

- [x] **T2.2** Keep the no-input state free of sample/demo listings and
  synthetic defaults.
  - Verification: the empty Check state has no sample CTA and does not populate
    asking price, floor area, flat type, or storey range. (R5.1)

- [x] **T2.3** Add concise empty-state guidance for selecting a real block and
  entering the required listing facts without forcing map interaction.
  - Verification: the submit action remains disabled until block, asking price,
    floor area, flat type, and storey range are present; lease year is optional.
    (R5.2, R5.3)

## Phase 3 — Map support role and retention
- [ ] **T3.1** Keep map explorer mounted/available with unchanged existing functionality.
  - Verification: existing map interactions still work from same controls. (R3.1, R3.3, R8.1)

- [ ] **T3.2** Reframe map section copy and placement so it is clearly secondary to buyer action cluster on first screen.
  - Verification: map is discoverable but not required for first action. (R3.2)

## Phase 4 — Mobile-first usability
- [ ] **T4.1** Convert any desktop-first hero spacing into stacked mobile layout with full-width primary actions.
  - Verification: all actions and trust/purpose copy usable with one thumb and no horizontal scroll. (R6.1, R6.3)

- [ ] **T4.2** Ensure touch targets for the three actions meet current app accessibility size expectations.
  - Verification: no tiny/ambiguous controls in primary cluster. (R6.2)

## Phase 5 — Performance and lazy loading
- [ ] **T5.1** Wrap heavy analysis components/pages with lazy loading boundaries.
  - Verification: homepage shell renders without waiting for full analysis bundle. (R7.1)

- [ ] **T5.2** Confirm bundle changes stay within established thresholds and document resulting deltas in PR notes.
  - Verification: no major regressions in initial bundle impact. (R7.2)

## Phase 6 — Validation and non-regression checks
- [ ] **T6.1** Add/update unit tests for homepage state default and action rendering branches.
- [ ] **T6.2** Add/update E2E tests for:
  - first-run clarity,
  - direct price check start (no map),
  - no sample/demo CTA or synthetic listing defaults,
  - explicit entry of every required listing fact,
  - map preserved and functional for candidate search.
  - Verification: `Check a listing price`, `Find candidate blocks`, `Compare my shortlist` all usable from first screen. (R1.1, R1.2, R3.3)

- [ ] **T6.3** Run app validation commands before handoff:
  - `vp run typecheck`
  - `vp run lint`
  - `vp run test`
  - `vp run test:e2e`
  - `vp run build`

- [ ] **T6.4** Manual smoke checklist:
  - First-time path starts with price check without map,
  - map explorer remains usable from existing entry,
  - no AI valuation API endpoint or third-party valuation call in listing-check flow. (R8.1, R8.2)
