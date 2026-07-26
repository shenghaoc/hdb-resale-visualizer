# Design: UX Docs, Accessibility, and Locale Coherence

## Localized Presentation Boundary

Shared confidence, caveat, and comparable engines continue to emit stable
machine-readable codes/values and English fallback identifiers.
`listingCheckPresentation.ts` translates confidence summaries, structured
caveats, known API fallbacks, and match-reason badges at render time. Analysis
counts the original reason identifiers before presentation so switching locale
cannot change confidence.

Locale-aware formatters receive the selected locale in Listing Check, map
popups, shortlist charts, and the block-history chart axis/tooltip. Filter
range copy uses the translation catalog.

## Accessible Interaction

Buyer setup associates translated labels with budget and lease inputs and uses
the same names in regression tests. The Chinese lease label describes the
lease commencement year.

The two heatmap modes form one radiogroup with a roving tab stop. All four
arrow keys wrap between the options; Home and End move to deterministic
endpoints. Keyboard input uses the same mode-change callback as pointer input.

## Repository Truth

The base workflow calls the package full gate (`vp run check`). The separate
E2E workflow still owns path-filtered Playwright smoke and Chromium Browser
Mode jobs. README, AGENTS, steering, architecture docs, and affected historical
specs name the current Worker/D1, migration, command, and browser contracts.
Completion boxes move only where current code or tests provide evidence;
exact-head CI and deployed-preview checks remain final handoff gates.
