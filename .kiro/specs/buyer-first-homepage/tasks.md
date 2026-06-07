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

## Phase 2 — Buyer flow entry and sample/demo path
- [ ] **T2.1** Wire the `Check a listing price` action to jump directly to listing-check workflow.
  - Verification: user can start a check without map clicks. (R2.3, R1.3)

- [ ] **T2.2** Add a sample/demo listing-check CTA in the no-input state of the check entry view.
  - Verification: activating it pre-fills deterministic inputs and shows expected sample analysis output path. (R5.1, R5.2)

- [ ] **T2.3** Add fallback messaging for unsupported/no-input states without forcing map interaction.
  - Verification: empty state still encourages action and sample/demo usage. (R5.1)

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
  - sample/demo CTA,
  - map preserved and functional for candidate search.
  - Verification: `Check a listing price`, `Find candidate blocks`, `Compare my shortlist` all usable from first screen. (R1.1, R1.2, R3.3)

- [ ] **T6.3** Run app validation commands before handoff:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run test:e2e`
  - `npm run build`

- [ ] **T6.4** Manual smoke checklist:
  - First-time path starts with price check without map,
  - map explorer remains usable from existing entry,
  - no AI valuation API endpoint or third-party valuation call in listing-check flow. (R8.1, R8.2)
