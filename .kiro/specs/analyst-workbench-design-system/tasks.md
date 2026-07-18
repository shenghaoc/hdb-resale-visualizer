# Tasks: Analyst's Workbench Design System

## Phase 1 — Foundation and documentation

- [x] **T1.1** Add the product brief and implemented design-system reference,
  including palette, typography, surface, component, accessibility, and
  responsive rules. (R1, R2, R7.1)
- [x] **T1.2** Load the local Latin-subset IBM Plex Sans family and consolidate
  the shared color, type, tracking, surface, and label utilities. (R2, R3.1,
  R3.2)

## Phase 2 — Component adoption

- [x] **T2.1** Apply workbench surfaces and tokenized typography to the existing
  header, map controls, panels, result/detail views, listing check, shortlist,
  town analysis, documentation, and shared Shadcn primitives. (R1, R3, R6.3)
- [x] **T2.2** Replace search-profile inline SVG illustrations with Lucide icons
  and align the wizard's controls with the documented visual language. (R3.3)
- [x] **T2.3** Add explicit `length:` hints to CSS-variable font-size utilities
  and remove unreadably small auxiliary labels. (R2.3, R2.4)

## Phase 3 — Responsive and accessible interaction

- [x] **T3.1** Scope coarse-pointer hit-area sizing to shared buttons and tagged
  custom controls; keep custom switch tracks visually stable. (R3.4, R4.1,
  R4.2)
- [x] **T3.2** Preserve active-chip clearance for the tablet panel and verify
  portrait/landscape responsive behavior. (R4.3)
- [x] **T3.3** Add specific accessible names for icon-only destructive controls,
  live-status feedback for Undo, and targeted motion transitions. (R4.4, R4.5)

## Phase 4 — Exact shortlist recovery

- [x] **T4.1** Add deterministic exact-item restoration to shortlist state and
  persistence wiring. (R5.1, R5.2, R6.2)
- [x] **T4.2** Extract the removal timer and pending state into a focused hook,
  then wire the drawer to explicit restore behavior. (R5.1, R5.2, R6.2)
- [x] **T4.3** Document Undo in both user-facing guides and align the existing
  shortlist-offer-board spec. (R7.2)

## Phase 5 — Verification

- [x] **T5.1** Add focused restoration and switch hit-area tests. (R7.3)
- [x] **T5.2** Run formatting, diff checks, focused tests, the full repository
  check, and the pre-PR E2E gate; correct every in-scope failure. (R7.3)
- [x] **T5.3** Verify the final user flow and responsive layout in the deployed
  branch preview, then confirm the exact pushed head is green. (R4, R5, R7.3)
