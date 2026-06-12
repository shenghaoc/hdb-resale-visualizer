# Requirements: In-App User Guide

## R1 — Full-page docs view
- **R1.1** A `/docs` route renders a full-page user guide with sidebar navigation
  and content area.
- **R1.2** Six subsections are available: Overview, Getting started, Price
  comparisons, Filters & map, Shortlisting, FAQ, Troubleshooting.
- **R1.3** The sidebar highlights the active section and allows navigation
  between sections via pushState.

## R2 — Lightweight router
- **R2.1** Docs navigation uses pushState/popstate, not full page reloads.
- **R2.2** The app's query-string state (filters, selection) is preserved when
  navigating to/from docs.
- **R2.3** A single `popstate` listener on `window` notifies all active
  subscribers (no duplicate listeners per component).

## R3 — Local search
- **R3.1** A search input at the top of the docs view provides ranked results
  over heading-level chunks.
- **R3.2** The search index is built from bundled markdown, split on `##`
  headings, with table separators and horizontal rules filtered out.
- **R3.3** The search index is cached at module level to avoid re-parsing on
  every component mount.
- **R3.4** The search dropdown closes on click-outside and on Escape.
- **R3.5** Keyboard navigation (ArrowUp/ArrowDown/Enter) works within search
  results.

## R4 — Contextual help links
- **R4.1** Empty results pane links to the Troubleshooting section.
- **R4.2** `AskingPriceCheck` links to the Price comparisons section.
- **R4.3** `LeaseWarningPanel` links to the Getting started section.
- **R4.4** Data-load error state links to the Troubleshooting section.

## R5 — Link handling
- **R5.1** Internal `/docs/*` links navigate client-side.
- **R5.2** External `https?://` links open in new tabs with `noopener noreferrer`.
- **R5.3** `#hash` links render as standard anchors for in-page navigation.
- **R5.4** Click handlers check `event.defaultPrevented` and
  `event.button !== 0` before intercepting navigation.

## R6 — Testing
- **R6.1** Vitest coverage for the docs manifest (slugs, search entries, section
  structure).
- **R6.2** Vitest coverage for routing helpers (path recognition, slug
  round-tripping, trailing-slash normalisation).
- **R6.3** Vitest coverage for `DocsPage` (rendering, navigation, deep-linking,
  search).

## R7 — Documentation
- **R7.1** `docs/guide/user-guide.md` is updated to reference the in-app guide.
