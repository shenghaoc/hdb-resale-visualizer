# Tasks: Global Search Typeahead

> Execution checklist. Order respects dependencies: schema/types → backend →
> client → component → wiring → tests. Each task names its acceptance check.

## Phase 1 — Schema & contracts
- [ ] **T1.1** Add migration `0005_suggest_indexes.sql`: `COLLATE NOCASE`
  indexes on `blocks(street_name)` and `blocks(postal_code)` (prefix lookups).
  → `npm run db:migrate:local` applies cleanly. (R5.3)
- [ ] **T1.2** Mirror any schema assumptions in `scripts/lib/sync/store.ts` and
  `functions/_lib/d1.ts`. (R5.3)
- [ ] **T1.3** Add `Suggestion` + group union to `shared/data-types.ts` and
  matching `suggestResponseSchema` to `src/lib/dataSchemas.ts`. → `typecheck`
  passes; schema/type parity. (R5.4)

## Phase 2 — Backend
- [ ] **T2.1** Add `functions/_lib/suggest.ts`: query normalisation, `q`-length
  guard, grouped SQL builders, ranking (exact→prefix→substring), caps. (R2.2, R5.2)
- [ ] **T2.2** Add `functions/api/suggest.ts` mirroring `search.ts`
  (`onRequestGet`, `jsonResponse`/`serverError`, 400 on bad input). (R5.1)
- [ ] **T2.3** Vitest for the suggest lib: ranking, caps, size guard,
  numeric→postal routing. (R7.1)

## Phase 3 — Client data layer
- [ ] **T3.1** Add `fetchSuggestions(q)` to `src/lib/data.ts` with promise
  cache + sequence guard + `resetSuggestCacheForTests()`. (R6.1)
- [ ] **T3.2** Vitest for cache/sequence-guard behaviour. (R7.2)

## Phase 4 — Component
- [ ] **T4.1** Build `src/components/SearchCombobox.tsx` on top of
  `LocationSearchInput` (Radix popover + listbox): debounce, grouped sections,
  keyboard nav, ARIA, mode-hint placeholder. (R2.1, R2.3, R4.1, R4.2)
- [ ] **T4.2** Implement structured-select dispatch + Enter free-text fallback
  via callback props (no direct coupling to filters). (R3.1, R3.2)

## Phase 5 — Wiring (header-only)
- [ ] **T5.1** Replace the three raw inputs: `SearchCombobox` in the
  `AppHeader` desktop inline + mobile overlay slots. (R1.1, R1.3)
- [ ] **T5.2** Remove `LocationSearchInput` from `FilterPanel`; verify chips bar
  still shows/clears active search. (R1.2)
- [ ] **T5.3** Map select actions through existing `patchFilters` /
  geographic-intent paths in `App.tsx`. (R3.1)

## Phase 6 — Verification
- [ ] **T6.1** Playwright: keyboard flow, grouped rendering, structured-select
  outcomes, single-affordance assertion. (R7.3)
- [ ] **T6.2** `npm run check` (boundaries + typecheck + lint + test) green;
  `npm run build` within bundle budget (`check:bundle`).
- [ ] **T6.3** Manual smoke via `npm run dev:functions` against local D1 seed.

## Open questions (resolve before/within Phase 2)
- Block-suggestion label format (e.g. "123 Ang Mo Kio Ave 3") and whether
  street suggestions should also carry the dominant town.
- Whether MRT suggestions come from `mrt_geojson` station names or from
  `nearest_mrt_json` aggregation (former is canonical; latter avoids a parse).
