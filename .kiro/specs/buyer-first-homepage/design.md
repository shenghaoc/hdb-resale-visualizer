# Design: Buyer-First Homepage

> Status: Draft. Reframes the homepage around buyer tasks before map exploration and makes price checking the fastest path for first-time users.

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
5. Ensure first-run works clearly on mobile, including a sample/demo check entrypoint.
6. Preserve performance by lazy-loading heavy analysis views.

## Non-goals

- Remove or replace the map explorer.
- Add any AI valuation engine, prediction model, or external valuation API.
- Expand filter complexity beyond existing buyer workflows.

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

### 4. Sample / demo listing check CTA

When no data is entered in the price-check flow, render a deterministic, one-click example CTA in the primary section:

- Label and intent: “Try sample listing check” (or equivalent short callout)
- Expected behavior:
  1. Preload a known public sample block context.
  2. Prefill price and key comparability inputs.
  3. Execute the same local deterministic analysis path used by normal usage.
  4. Make the sample clearly labeled as sample/demo to avoid confusion.

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
  - sample/demo CTA path,
  - map still opens and behaves for explorer flow,
  - no AI valuation endpoint is called.
