# Design: Global Search Typeahead

> Status: Implemented. Documents the current ranked, grouped typeahead backed
> by the D1 suggest endpoint.

## Problem

Before this work, search was one free-text field (`filters.search`) rendered in **three**
places — the desktop header inline input, the mobile header overlay input, and
the `FilterPanel` input — all bound to the same state via `onChange({ search })`.
On desktop the header field and the filter-panel field are visible at once, so it
reads as competing search boxes even though it is one piece of state.

The matcher (`shared/product/filtering.ts`) silently overloads that single box with at
least five modes with **no feedback about which fired**:

1. token substring (`candidate.includes(token)`)
2. **reverse** substring (`token.includes(candidate)`) — primary source of
   surprising matches
3. Damerau-style ≤1-edit typo tolerance (`isNearMatch`) — silent "correction"
4. postal-code prefix matching
5. MRT station intent (`near X mrt`) with radius filtering
6. raw `lat,lng` coordinates

It is all-or-nothing and invisible: results appear/disappear with no ranking, no
"did you mean", no grouping, no autocomplete. Users cannot see what is
searchable (town? street? MRT? postal?), so they guess and hit the noisy fuzzy
behaviour.

## Goals

- One primary search affordance (header), with a ranked, grouped typeahead.
- Suggestions reveal what is searchable: Town / Street / Block / MRT / Postal.
- Selecting a suggestion sets a **structured intent** instead of dumping raw
  text into the fuzzy matcher.
- Nationwide coverage without shipping a large client index.
- Honour architecture boundaries: no external fetch in `src/`/`functions/`;
  build-time ingest, runtime read-only D1; URL/payload size guards.

## Non-goals

- Replacing the existing coarse `/api/search` filter endpoint.
- Removing the fuzzy matcher — it stays as the free-text (Enter, no selection)
  fallback, moved *behind* explicit suggestions.

## Architecture

### 1. Backend — `functions/api/suggest.ts`

D1-backed, mirrors `functions/api/search.ts` conventions (`getDb`,
`jsonResponse`/`errorResponse`). Query `?q=`:

- Guard: reject/clamp `q` longer than a max length (client-side DoS rule).
- Normalise `q` (lowercase, strip non-alphanumeric) consistently with
  `filtering.ts`.
- Run grouped lookups against the `blocks` table and persisted station data:
  - **Town** — distinct towns prefix/substring match (also serveable from
    `manifest.filterOptions.towns`, but kept server-side for one ranking pass).
  - **Street** — distinct `street_name` matches.
  - **Block** — `block + street_name` matches, returning `address_key`.
  - **MRT station** — distinct station names.
  - **Postal** — `postal_code` prefix when `q` is numeric.
- Rank: exact > prefix > substring; cap total (~10) with per-group caps.
- Return `{ suggestions: Suggestion[] }`.

Migration `0005_suggest_indexes.sql` added `COLLATE NOCASE` indexes for
`street_name` and `postal_code`; existing migrations remain immutable. SQLite
uses those indexes for prefix-anchored lookups. Substring fallback scans remain
bounded by the query-length floor and per-group caps.

### 2. Types & validation

- `shared/data-types.ts`: add `Suggestion` + `SuggestionGroup` union
  (`town | street | block | mrt | postal`), each carrying the label and a
  structured payload (e.g. `{ town }`, `{ addressKey }`,
  `{ stationName }`, `{ search }`).
- `src/shared/lib/dataSchemas.ts`: add `suggestResponseSchema` matching the type
  exactly (steering requires the schema/type pair to move together).

### 3. Data client — `src/shared/lib/data.ts`

`fetchSuggestions(q)` with a **Map-based promise cache** keyed by normalised
query (same eviction pattern as `tokenizationCache` in `filtering.ts`, cap
at 32 entries). Callers may abort their own wrapper without cancelling the
shared cached request. This avoids redundant `/api/suggest` round-trips when
users backspace while typing (e.g. `Ang` → `An` → `Ang`). Debouncing and
latest-wins display ownership stay at the component layer.

### 4. Component — `src/components/SearchCombobox.tsx`

Radix popover + listbox built on the existing `LocationSearchInput` (keeps IME
composition handling). Features:

- Debounced fetch; grouped sections with headers; keyboard nav
  (↑/↓/Enter/Esc); aria roles for combobox/listbox/option.
- Optional allowed-group constraints are applied before suggestions enter
  component state or decide whether the popover opens. This lets Listing Check
  accept block selections without showing an empty popover for postal-only
  responses.
- Each response is associated with its request query. Suggestions can render or
  participate in keyboard selection only while the immediate controlled value
  still matches that query, so a response arriving inside the debounce window
  cannot expose stale options.
- Selecting an option invalidates in-flight work and suppresses reopening while
  the focused input receives its controlled selected label. Suppression clears
  only on the next user edit.
- Placeholder advertises modes: e.g. "town, street, postal, or 'near Bedok MRT'".
- On select, dispatch a **structured** action:
  - town → `patchFilters({ town })`
  - block → `patchFilters({ selectedAddressKey })`
  - street → scoped `search`
  - mrt → station intent (existing `geographicIntent` path)
  - postal → scoped `search`
- On Enter with no selection → existing free-text path (fuzzy matcher) intact.

### 5. Wiring — header only

- `AppHeader` desktop inline slot and mobile overlay slot use `SearchCombobox`.
- **Remove** the `LocationSearchInput` from `FilterPanel` (the chips bar and
  filters drawer still display and clear the active search). This resolves the
  "multiple bars" problem; one canonical search surface remains.

## Testing

- Vitest: `suggest` ranking (exact/prefix/substring order, per-group caps),
  size guard, numeric→postal routing; constrained-consumer filtering;
  `fetchSuggestions` cache with `resetSuggestCacheForTests()` teardown; and
  deterministic deferred-response plus post-selection debounce regressions in
  `SearchCombobox.groups.test.tsx`.
- Playwright: typeahead keyboard flow, grouped rendering, structured-select
  outcomes, and an assertion that only one search affordance is present.

## Risks / trade-offs

- The endpoint + migration were the largest slice of work, but provide
  nationwide typeahead within the build-time-ingest boundary.
- Keeping the fuzzy fallback avoids regressing power-user queries while removing
  its surprise factor from the default path.
