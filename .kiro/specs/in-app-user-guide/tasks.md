# Tasks: In-App User Guide

> Execution checklist. Order respects dependencies: router → manifest →
> components → contextual links → tests → docs.

## Phase 1 — Router
- [x] **T1.1** Add `src/features/docs/docsRouter.ts` with `usePathname`,
  `navigate`, `isDocsPath`, `docsPath`, `slugFromPath`. Single `popstate`
  listener shared across subscribers. (R2.1, R2.2, R2.3)

## Phase 2 — Content manifest
- [x] **T2.1** Add `src/features/docs/docsManifest.ts` with `DOCS_SECTIONS`,
  `getDocsSection`, `buildDocsSearchEntries`. Cache search entries at module
  level; filter table separators. (R3.2, R3.3)
- [x] **T2.2** Add markdown content files in `src/features/docs/content/` for
  all seven sections. (R1.2)

## Phase 3 — Components
- [x] **T3.1** Add `DocsPage.tsx` with sidebar nav + content area layout. (R1.1, R1.3)
- [x] **T3.2** Add `DocsNav.tsx` with active-section highlighting and robust
  click handling. (R5.4)
- [x] **T3.3** Add `DocsArticle.tsx` with react-markdown + remark-gfm, custom
  `MarkdownLink` for internal/external/hash links. (R5.1, R5.2, R5.3, R5.4)
- [x] **T3.4** Add `DocsSearch.tsx` with Fuse.js index, click-outside close,
  keyboard nav, `isOpen` state management. (R3.1, R3.4, R3.5)
- [x] **T3.5** Add `DocsLink.tsx` for contextual help link styling.

## Phase 4 — Contextual links
- [x] **T4.1** Add troubleshooting link to empty results in `ResultsPane`. (R4.1)
- [x] **T4.2** Add price-comparisons link in `AskingPriceCheck`. (R4.2)
- [x] **T4.3** Add getting-started link in `LeaseWarningPanel`. (R4.3)
- [x] **T4.4** Add troubleshooting link in data-load error state. (R4.4)

## Phase 5 — App wiring
- [x] **T5.1** Add `/docs` and `/docs/:slug` routes in `App.tsx`. (R1.1)
- [x] **T5.2** Remove `GuideDialog` and wire docs link into header. (R1.1)

## Phase 6 — Tests
- [x] **T6.1** Add `tests/unit/docs-manifest.test.ts` for manifest structure,
  search entries, routing helpers. (R6.1, R6.2)
- [x] **T6.2** Add `tests/components/DocsPage.test.tsx` for rendering,
  navigation, deep-linking, search. (R6.3)

## Phase 7 — Documentation
- [x] **T7.1** Update `docs/guide/user-guide.md` to reference the in-app
  guide. (R7.1)

## Phase 8 — Review feedback
- [x] **T8.1** Add click-outside listener to close search dropdown. (R3.4)
- [x] **T8.2** Register single shared `popstate` listener in router. (R2.3)
- [x] **T8.3** Cache search entries and filter markdown noise. (R3.2, R3.3)
- [x] **T8.4** Support `#hash` links in `DocsArticle`. (R5.3)
- [x] **T8.5** Add `defaultPrevented` and `button` checks to click handlers. (R5.4)
