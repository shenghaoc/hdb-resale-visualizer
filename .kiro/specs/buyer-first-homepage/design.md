# Design: Buyer-First Homepage

> Status: Partially implemented. The app now provides an honest, map-free
> listing-check entry and preserves the map explorer, but the proposed
> three-action homepage cluster, first-fold trust copy, and associated lazy
> homepage composition are not implemented.

## Problem

The current top-level experience can still feel map-centric and opaque for first-time buyers. Users may not immediately see what to do first because the map dominates entry flow, while key actions are hidden behind tabs and panels.

This spec prioritises the buyer journey in the first screen so users can start a listing analysis immediately, while retaining map explorer capabilities as a support surface.

## Goals

1. Present the three key buyer actions immediately on first load:
   - Check a listing price
   - Find candidate blocks
   - Compare my shortlist
2. Make "Check a listing price" visually and behaviorally primary.
3. Keep the map explorer in the product as a supporting exploration tool.
4. Add explicit deterministic trust copy about the analysis source.
5. Ensure first-run works clearly on mobile without invented listing facts.
6. Preserve performance by lazy-loading heavy analysis views.

## Non-goals

- Remove or replace the map explorer.
- Add any AI valuation engine, prediction model, or external valuation API.
- Expand filter complexity beyond existing buyer workflows.
- Add a sample listing, synthetic unit facts, or automatic listing-detail
  defaults.

## Product Architecture

### 1. Homepage as Buyer On-ramp

Introduce/keep a top-level `HomeDashboard` (or equivalent entry section) that renders above the map area as the primary user surface.

It should include:

1. A large primary action card/button for **Check a listing price**.
2. Two supporting action links/cards for:
   - Find candidate blocks
   - Compare my shortlist
3. Concise educational value statement:
   - "Check whether an asking price is fair using historical HDB resale transactions."
4. Trust statement near the primary action:
   - "Deterministic historical comparisons. No AI valuation API."

The action density and visual hierarchy should make the first card dominant on the first viewport at all widths.

### 2. Primary vs supporting action hierarchy

- **Primary**: `Check a listing price`
  - Positioned first and visually accentuated (strong button style, high contrast, prominent iconography if any).
- **Secondary**: `Find candidate blocks`, `Compare my shortlist`
  - Rendered as compact but visible controls in the same panel or immediate next row.

### 3. Map role as supporting explorer

The map remains mounted and reachable, but becomes discoverable as a context aid rather than the first action. The homepage layout should not require map literacy to start value delivery.

Recommended pattern:

1. Keep map explorer present in its own panel/section.
2. Keep existing map controls and result-highlighting behavior unchanged.
3. Gate map-only pathways from the buyer actions (e.g., “Find candidate blocks” can open or focus map filters/listing cards before map interaction becomes central).
4. Keep any map-first shortcuts available for returning users.

### 4. Honest listing-check entry

The empty price-check flow should explain what the buyer needs without
inventing a listing:

1. Let the buyer select a real HDB block.
2. Require the listing's asking price, floor area, flat type, and storey range.
3. Keep lease commencement year optional.
4. If the buyer arrives from Results or block detail, carry over the selected
   block only; never infer unit facts from another transaction or the first
   available option.
5. Keep the submit action disabled until every required fact is present.

### 5. Mobile-first usability

- Stack primary action panel vertically with full-width CTAs.
- Keep headline, trust copy, and action row above map content on mobile.
- Ensure zero-friction entry for primary action with no map-dependent interactions.
- Use resilient touch targets and avoid hidden gestures for critical actions.

### 6. Performance and loading strategy

Keep bundle impact controlled by separating heavy analysis surfaces:

1. Split buyer check/analysis view code behind lazy boundaries (`React.lazy`/dynamic import).
2. Keep map and layout shells in the initial bundle.
3. Preload secondary non-blocking assets only after interactive if possible.
4. Add lightweight route-level code-splitting boundaries if homepage tabs/sections are implemented.

### 7. Analytics and behavior consistency

No AI APIs are introduced. Existing deterministic pipeline remains as the source of truth.

### Testing approach

- Unit coverage for action routing and homepage state defaults.
- E2E coverage for:
  - first screen visibility of all three actions,
  - direct listing check flow without map interaction,
  - an honest empty Check state with no sample CTA or synthetic defaults,
  - explicit entry of every required listing fact,
  - map still opens and behaves for explorer flow,
  - no AI valuation endpoint is called.
