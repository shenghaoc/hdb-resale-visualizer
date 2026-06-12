# Design: In-App User Guide

> Status: Implemented. Replaces the single-file `GuideDialog` modal with a
> full in-app docs view rendered from bundled markdown, navigable at `/docs`
> and six subsection routes.

## Problem

The previous user guide was a modal dialog (`GuideDialog`) that loaded a single
markdown file. It had no navigation, no search, no deep-linking, and no
contextual help from within the app. Users who needed help with a specific
feature (e.g. price comparisons or shortlisting) had to scroll through the
entire document.

## Goals

- Full-page docs view at `/docs` with sidebar navigation and six subsections.
- Local Fuse.js search over heading-level chunks with ranked results.
- Contextual help links from empty results, listing-check panel, lease warnings,
  and data-load error states.
- Lightweight pushState/popstate router that preserves the app's query-string
  state (filters, selection).
- Vitest coverage for the manifest, routing helpers, and `DocsPage` component.

## Non-goals

- Server-side docs rendering or CMS integration.
- Full-text search across all markdown content (heading-level chunks only).
- User authentication or personalised bookmarks.

## Architecture

### Routing

`docsRouter.ts` implements a minimal path-aware router using
`useSyncExternalStore`. It registers a single `popstate` listener on `window`
that notifies all active subscribers in a `Set`. The `navigate()` function
uses `pushState`/`replaceState` and manually notifies listeners. All docs
navigation preserves `location.search` so the user's filter/selection state
is untouched.

### Content pipeline

`docsManifest.ts` exports `DOCS_SECTIONS` (bundled via Vite's `?raw` import)
and `buildDocsSearchEntries()` which splits each page on `##` headings into
searchable chunks. A module-level cache (`cachedSearchEntries`) avoids
re-parsing on every mount. Table separators and horizontal rules are filtered
out to keep the index clean.

### Search

`DocsSearch.tsx` wraps a Fuse.js index over the search entries. The dropdown
closes on click-outside (via a `useEffect` + `mousedown` listener on
`document`) and on Escape. `isOpen` is managed as explicit state rather than
derived from query, so the click-outside listener can dismiss it independently.

### Link handling

`DocsArticle.tsx` renders markdown via `react-markdown` + `remark-gfm`. The
custom `MarkdownLink` component routes `/docs/*` links client-side, opens
`https?://` links in new tabs, renders `#hash` links as standard anchors, and
falls back to `<span>` for anything unexpected. Click handlers check
`event.defaultPrevented` and `event.button !== 0` before intercepting.

`DocsNav.tsx` applies the same robust click-handling pattern.

### Contextual links

- Empty results pane → link to `/docs/troubleshooting`
- `AskingPriceCheck` → link to `/docs/understanding-price-comparisons`
- `LeaseWarningPanel` → link to `/docs/getting-started`
- Data-load error state → link to `/docs/troubleshooting`
