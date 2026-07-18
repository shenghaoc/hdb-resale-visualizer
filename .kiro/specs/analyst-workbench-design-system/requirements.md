# Requirements: Analyst's Workbench Design System

## R1 — Product and visual direction

- **R1.1** The interface reads as a precise, buyer-first analysis workbench,
  not a marketplace or decorative dashboard.
- **R1.2** Deep cyan is the primary UI accent. Semantic and multi-series chart
  colors remain reserved for meanings that need independent discrimination.
- **R1.3** Map chrome, panels, cards, buttons, inputs, and badges follow the
  documented opaque, mostly square visual language without changing the
  map-first information architecture.

## R2 — Typography

- **R2.1** IBM Plex Sans is the primary interface font, loaded from local,
  Latin-subset assets with system fallbacks and no runtime font request.
- **R2.2** Repeated label, heading, and data sizes use shared CSS variables or
  utilities rather than proliferating ad hoc values.
- **R2.3** Tailwind arbitrary font-size values that reference CSS variables use
  an explicit `length:` hint so production CSS is generated deterministically.
- **R2.4** Auxiliary interface labels are no smaller than 11px.

## R3 — Reusable surfaces and controls

- **R3.1** Shared workbench surfaces (`v2-chrome`, `v2-panel`, `v2-card` or
  equivalent) provide the common border, opaque fill, square geometry, and
  restrained elevation.
- **R3.2** Repeated micro-label patterns use focused shared classes such as
  `v2-section-title`, `v2-field-label`, and `v2-kicker`.
- **R3.3** Search-profile step illustrations use the existing Lucide icon
  library rather than handcrafted inline SVG assets.
- **R3.4** Conventional switches retain a recognisable pill track and circular
  thumb inside a separately sized hit-area button.

## R4 — Responsive interaction and accessibility

- **R4.1** Coarse-pointer hit areas are at least 44 by 44 CSS pixels for shared
  buttons and explicitly tagged custom controls without distorting their
  visual tracks.
- **R4.2** Explicit compact sizing remains intact on fine-pointer devices.
- **R4.3** Tablet panels clear the active-filter chip row and remain usable in
  portrait and landscape layouts.
- **R4.4** Icon-only destructive controls have specific accessible names;
  loading, disabled, empty, and error states remain understandable.
- **R4.5** Motion changes use targeted properties and respect the existing
  reduced-motion fallback.

## R5 — Shortlist recovery

- **R5.1** Removing a shortlist entry presents a five-second Undo action.
- **R5.2** Undo restores the complete original item, including all offer-board
  data and notes, at the original list position through the real persistence
  path.

## R6 — Architecture and behavior preservation

- **R6.1** The design-system pass does not introduce runtime external API
  requests, runtime geocoding, new D1 writes, or a second component system.
- **R6.2** Transient removal-recovery state is kept in a focused hook rather
  than adding timer responsibilities to `App.tsx` or the shortlist model.
- **R6.3** Existing search, filter, listing-check, map, shortlist, export, sync,
  and documentation flows remain reachable and behaviorally coherent.

## R7 — Documentation and verification

- **R7.1** `PRODUCT.md` and `DESIGN.md` describe the implemented product and
  design rules without placeholders or rules contradicted by the UI.
- **R7.2** Both the public user guide and in-app shortlisting guide explain
  safe removal and exact Undo restoration.
- **R7.3** Focused tests cover restoration and custom switch hit-area behavior;
  the repository pre-PR gate and formatting check pass.
