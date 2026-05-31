# Tasks: Global Search Typeahead

> Execution checklist. Order respects dependencies: schema/types → backend →
> client → component → wiring → tests. Each task names its acceptance check.

## Phase 1 — Schema & contracts
- [x] **T1.1** Add migration `0005_suggest_indexes.sql`: `COLLATE NOCASE`
  indexes on `blocks(street_name)` and `blocks(postal_code)` (prefix lookups).
  → `npm run db:migrate:local` applies cleanly. (R5.3)
- [x] **T1.2** Mirror any schema assumptions in `scripts/lib/sync/store.ts` and
  `functions/_lib/d1.ts`. (R5.3)
- [x] **T1.3** Add `Suggestion` + group union to `shared/data-types.ts` and
  matching `suggestResponseSchema` to `src/lib/dataSchemas.ts`. → `typecheck`
  passes; schema/type parity. (R5.4)

## Phase 2 — Backend
- [x] **T2.1** Add `functions/_lib/suggest.ts`: query normalisation, `q`-length
  guard, grouped SQL builders, ranking (exact→prefix→substring), caps. (R2.2, R5.2)
- [x] **T2.2** Add `functions/api/suggest.ts` mirroring `search.ts`
  (`onRequestGet`, `jsonResponse`/`serverError`, 400 on bad input). (R5.1)
- [x] **T2.3** Vitest for the suggest lib: ranking, caps, size guard,
  numeric→postal routing. (R7.1)

## Phase 3 — Client data layer
- [x] **T3.1** Add `fetchSuggestions(q)` to `src/lib/data.ts` with promise
  cache + sequence guard + `resetSuggestCacheForTests()`. (R6.1)
- [x] **T3.2** Vitest for cache/sequence-guard behaviour. (R7.2)

## Phase 4 — Component
- [x] **T4.1** Build `src/components/SearchCombobox.tsx` on top of
  `LocationSearchInput` (Radix popover + listbox): debounce, grouped sections,
  keyboard nav, ARIA, mode-hint placeholder. (R2.1, R2.3, R4.1, R4.2)
- [x] **T4.2** Implement structured-select dispatch + Enter free-text fallback
  via callback props (no direct coupling to filters). (R3.1, R3.2)

## Phase 5 — Wiring (header-only)
- [x] **T5.1** Replace the three raw inputs: `SearchCombobox` in the
  `AppHeader` desktop inline + mobile overlay slots. (R1.1, R1.3)
- [x] **T5.2** Remove `LocationSearchInput` from `FilterPanel`; verify chips bar
  still shows/clears active search. (R1.2)
- [x] **T5.3** Map select actions through existing `patchFilters` /
  geographic-intent paths in `App.tsx`. (R3.1)

## Phase 6 — Verification
- [x] **T6.1** Playwright: keyboard flow, grouped rendering, structured-select
  outcomes, single-affordance assertion. (R7.3)
- [x] **T6.2** `npm run check` (boundaries + typecheck + lint + test) green;
  `npm run build` within bundle budget (`check:bundle`).
- [x] **T6.3** Manual smoke via `npm run dev:functions` against local D1 seed.

## Open questions (resolved)
- Block-suggestion label format: `{block} {Title Case street}` (e.g. "123 Ang Mo Kio Ave 3"); street suggestions use street name only (no dominant town).
- MRT suggestions use canonical `mrt_geojson` station names (`loadStationNames` in `functions/_lib/suggest.ts`).
