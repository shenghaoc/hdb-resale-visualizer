# Requirements: Global Search Typeahead

## R1 — Single search affordance
- **R1.1** The application presents exactly one primary search affordance,
  located in the header (desktop inline + mobile overlay).
- **R1.2** The duplicate text-search input in `FilterPanel` is removed; the
  active search remains visible and clearable via the filter chips bar.
- **R1.3** Header desktop and mobile-overlay inputs share the same search state
  and behaviour.

## R2 — Ranked, grouped suggestions
- **R2.1** Typing (after a minimum query length and debounce) shows a dropdown
  of suggestions grouped by: Town, Street, Block, MRT, Postal.
- **R2.2** Within and across groups, results are ordered exact → prefix →
  substring. Total suggestions are capped (~10) with per-group caps.
- **R2.3** Each suggestion shows a human label and a group/category indicator so
  the user understands what they are selecting.
- **R2.4** Empty/whitespace query shows no dropdown and triggers no fetch.

## R3 — Structured selection
- **R3.1** Selecting a suggestion sets a structured intent, not raw text:
  town→`town` filter; block→`selectedAddressKey`; street→scoped search;
  MRT→station geographic intent; postal→scoped search.
- **R3.2** Pressing Enter with no active suggestion selection falls back to the
  existing free-text matcher (no regression for power users).

## R4 — Accessibility & input
- **R4.1** Combobox exposes correct ARIA roles (combobox/listbox/option,
  `aria-activedescendant`) and full keyboard nav (↑/↓/Enter/Esc).
- **R4.2** IME composition continues to work (built on `LocationSearchInput` /
  `useIMEComposition`); no callback fires mid-composition.

## R5 — Architecture & safety
- **R5.1** Suggestions are served by a new D1-backed `/api/suggest` endpoint;
  no external fetch occurs in `src/` or `functions/`.
- **R5.2** The endpoint enforces a maximum `q` length (client-side DoS guard)
  and a minimum length before substring scans.
- **R5.3** Any new index/schema is added as a new numbered migration and
  mirrored in `scripts/lib/sync/store.ts` and `functions/_lib/d1.ts`.
- **R5.4** `shared/data-types.ts` and `src/lib/dataSchemas.ts` are updated
  together (type ↔ Zod schema parity).

## R6 — Performance
- **R6.1** Client fetches are debounced and use a latest-wins sequence guard
  plus a bounded Map cache of in-flight/completed promises keyed by normalised
  query (not a single-entry cache), so backspacing reuses prior results.
- **R6.2** Server queries are index-backed; prefix-anchored where an index
  applies.

## R7 — Tests
- **R7.1** Vitest covers suggest ranking, per-group caps, size guard, and
  numeric→postal routing.
- **R7.2** Vitest covers `fetchSuggestions` caching + sequence guard with a
  `resetSuggestCacheForTests()` teardown.
- **R7.3** Playwright covers typeahead keyboard flow, grouped rendering,
  structured-select outcomes, and asserts a single search affordance exists.
