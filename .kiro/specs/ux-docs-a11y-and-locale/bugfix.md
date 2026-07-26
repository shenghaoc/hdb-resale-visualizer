# Bugfix Requirements: UX Docs, Accessibility, and Locale Coherence

## Introduction

This bugfix closes user-facing trust gaps without adding another workflow or
control. It makes the existing buyer journey say the same truthful thing in
both locales, keeps form and keyboard controls operable without visual cues,
and aligns contributor documentation with the package scripts and Worker/D1
architecture the repository actually runs.

## Current Behavior and Root Causes

1. Listing Check rendered engine-generated English summaries, caveats, and
   match reasons directly. Translating those engine strings in place would
   silently break confidence counts that intentionally match stable reason
   identifiers.
2. Several compact currency call sites omitted the active locale, including
   the block-history chart axis/tooltip, while the Buyer setup review chip
   hand-built a fixed `S$` string and one filter range separator remained
   hardcoded English.
3. Buyer setup numeric inputs lacked programmatic names and the Chinese lease
   label described a build year instead of the lease commencement year.
4. The heatmap radiogroup did not provide complete wrapping arrow-key
   navigation.
5. The lazy map fallback kept an English-only loading label in zh-SG.
6. Primary buttons diluted their background on hover while keeping white
   11px labels, dropping the light-mode contrast ratio below WCAG AA. Buyer
   setup also animated its action from the disabled surface to primary,
   exposing another failing intermediate color.
7. CI invoked a bare Vite+ command instead of the package-defined `check`
   script. README, AGENTS, architecture docs, and older Kiro specs repeated
   stale package-manager, browser, local-server, migration, and interaction
   claims.

## Expected Behavior

1. Shared engines SHALL keep stable cross-runtime identifiers and English
   fallback messages. Listing Check SHALL translate only at the UI
   presentation boundary using structured codes and interpolation values.
2. Currency and range presentation SHALL follow the selected locale everywhere
   touched by this bugfix, including Buyer setup presets/review, chart axes,
   and tooltips.
3. Buyer setup inputs SHALL have translated accessible names and accurate lease
   terminology in both locales.
4. The heatmap mode radiogroup SHALL support wrapping ArrowLeft/ArrowRight and
   ArrowUp/ArrowDown navigation, with Home/End selecting the first/last option.
5. The map loading fallback SHALL use the active locale.
6. Primary-button hover states SHALL preserve at least WCAG AA text contrast
   in both color schemes, including shared buttons, the buyer wizard, and the
   selected month control. Enabled/disabled state changes SHALL NOT animate
   through a failing intermediate foreground/background pair.
7. Base CI SHALL run `vp install` then `vp run check`. Documentation SHALL
   describe Node 24, pnpm/Vite+, Chromium, `wrangler dev`, forward-only
   migrations, Worker-routed APIs, and per-flat-type cohort readiness
   accurately.

## Preserved Behavior

- Comparable selection and confidence calculations keep their deterministic
  identifiers and thresholds.
- No locale changes API payloads or persisted data.
- No new runtime external fetch, geocoding, D1 write path, product toggle, or
  onboarding question is introduced.
- `ListingCheckPanel` remains the sole listing-check workflow and
  `ComparableEvidenceTable` remains its sole evidence surface.
