# Requirements: Buyer-First Homepage

## R1 — First screen communicates buyer value in <=10 seconds
- **R1.1** On first load, the top-level interface shows a clear buyer purpose with the sentence:
  "Check whether an asking price is fair using historical HDB resale transactions."
- **R1.2** The first screen contains three distinct actions:
  1. Check a listing price
  2. Find candidate blocks
  3. Compare my shortlist
- **R1.3** A first-time user can identify and activate a primary action in the first 10 seconds without reading long help text.

## R2 — Primary action is `Check a listing price`
- **R2.1** `Check a listing price` is visually emphasized above the other two actions.
- **R2.2** The primary action is available at the default view and can be activated as the first interaction on desktop and mobile.
- **R2.3** Clicking the primary action opens or scrolls to the listing-check flow directly.

## R3 — Map as a supporting explorer
- **R3.1** The map explorer remains in the product and functional.
- **R3.2** Map is positioned as an exploration/support surface, not the sole or required entry path for value discovery.
- **R3.3** Existing map behavior (selection, navigation, and map-based filtering context where already implemented) is preserved.

## R4 — Trust and transparency copy
- **R4.1** The homepage includes trust text:
  "Deterministic historical comparisons. No AI valuation API."
- **R4.2** No text should imply AI-based valuation, prediction, or black-box scoring.

## R5 — Sample/demo check when no data entered
- **R5.1** A sample or demo listing check CTA is visible when no check inputs are present.
- **R5.2** Activating sample/demo pre-fills listing-check state with deterministic sample values and produces the same flow/outputs as normal user-driven checks.

## R6 — Mobile-first first-run usability
- **R6.1** On mobile, the three actions and key copy appear in a top-first order before map-heavy content.
- **R6.2** All three actions are usable with touch in one screen height where possible.
- **R6.3** Core CTAs and copy remain readable without horizontal scrolling.

## R7 — Bundle impact and lazy loading
- **R7.1** Heavy analysis views are lazy-loaded and do not block initial paint of the homepage hero.
- **R7.2** Bundle-size deltas from this change are tracked and remain within existing repo/performance expectations.
- **R7.3** Non-critical analysis code is code-split from immediate render path.

## R8 — Functional integrity
- **R8.1** Existing map functionality still works for users who rely on it.
- **R8.2** No runtime external valuation API or AI valuation service is added.
- **R8.3** No new external API calls are used for listing checks that violate existing runtime data boundaries.
