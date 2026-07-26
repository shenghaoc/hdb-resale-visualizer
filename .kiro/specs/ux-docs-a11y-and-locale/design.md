# Design: UX Docs, Accessibility, and Locale Coherence

## Localized Presentation Boundary

Shared confidence, caveat, and comparable engines continue to emit stable
machine-readable codes/values and English fallback identifiers.
`listingCheckPresentation.ts` translates confidence summaries, structured
caveats, known API fallbacks, and match-reason badges at render time. Analysis
counts the original reason identifiers before presentation so switching locale
cannot change confidence.

Locale-aware formatters receive the selected locale in Listing Check, map
popups, Buyer setup presets/review, shortlist charts, and the block-history
chart axis/tooltip. Filter range copy and the lazy map fallback use the
translation catalog. `I18nProvider` also synchronizes the root document
`lang` attribute and browser title with the active BCP 47 locale so assistive
technology and browser chrome use the same language as the rendered UI.

## Accessible Interaction

Buyer setup associates translated labels with budget and lease inputs and uses
the same names in regression tests. The Chinese lease label describes the
lease commencement year.

The two heatmap modes form one radiogroup with a roving tab stop. All four
arrow keys wrap between the options; Home and End move to deterministic
endpoints. Keyboard input uses the same mode-change callback as pointer input.

Primary actions retain the existing cyan surface and foreground pair on hover
without diluting the surface below the small-text WCAG AA threshold. The same
opaque-enough hover treatment applies to shared primary buttons, the buyer
wizard action, and the selected month control. Buyer setup limits its action
transition to the focus shadow so the disabled-to-enabled change cannot animate
through a low-contrast intermediate surface. The Buyer setup axe path explicitly
hovers the persistent action before each post-navigation scan.

## Repository Truth

The base workflow calls the package full gate (`vp run check`). The separate
E2E workflow still owns path-filtered Playwright smoke and Chromium Browser
Mode jobs. README, AGENTS, steering, architecture docs, and affected historical
specs name the current Worker/D1, migration, command, and browser contracts.
Completion boxes move only where current code or tests provide evidence;
exact-head CI and deployed-preview checks remain final handoff gates.
