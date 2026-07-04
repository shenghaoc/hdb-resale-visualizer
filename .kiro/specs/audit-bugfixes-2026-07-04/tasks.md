# Implementation Plan

## Original Audit Findings

- [x] Fix ComparableEvidenceTable adjusted-price column (wrong property name timeAdjustedPrice).
- [x] Fix API error message leakage in worker and all 9 API endpoints.
- [x] Fix user input reflection in error responses (details, comparisons, comparable-transactions).
- [x] Fix ZodError schema path leakage in comparable-transactions.
- [x] Fix rowToBlockSummary type safety (unknown to NearestMrt).
- [x] Fix useChecklist unnecessary localStorage write on mount.
- [x] Remove dead exports (WEIGHTS_WITHOUT_LEASE, MRT_LINE_CODES).

## Code Review Findings

- [x] Rename "Adj. Price" column header to "Orig. Price" (semantic inversion).
- [x] Fix search.ts/suggest.ts error message inconsistency.
- [x] Carry raw price metadata for all comparables when adjustment active.

## Gap Sweep Findings

- [x] Add cache-control: no-store to worker 500 error handler.
- [x] Extract shared readBodyWithLimit helper (deduplicated from 2 files).
- [x] Replace dead useState(true) with const adjustmentEnabled.
- [x] Remove unsafe as TimeAdjustedComparable casts.
- [x] Add input sanitization to handleLeaseYearChange.

## .jules Coverage

- [x] Wrap 12 icon-only buttons with accessible Tooltip component (palette.md).
- [x] Replace sort()[0] with single-pass min scan in App.tsx (bolt.md).

## Deep Sweep Findings

- [x] Add shared badRequest() helper to functions/_lib/d1.ts.
- [x] Add shared parseSlugParam() helper to functions/_lib/d1.ts.
- [x] Replace inline 400 Response constructors in search.ts, suggest.ts, blocks/[town].ts.
- [x] Replace inline slug parsing in details, comparisons, blocks endpoints.
- [x] Fix nearestMrt null check (!== null to truthiness) in filtering.ts.
- [x] Modernize .replace() to .replaceAll() in export.ts and listingPortalLinks.ts.
- [x] Simplify verbose null checks in data.ts and ResultsPane.tsx.
- [x] Fix interface to type convention in month-picker.tsx and field.tsx.

## Deferred (Pre-existing, Not in This PR Scope)

- [ ] Bare `as` cast on API responses in cloudSync.ts and ListingCheckPanel.tsx (needs Zod schema definition).
- [ ] Duplicated fetch chains in useAmenityGeoSync.ts (extract shared async helper).
- [ ] withErrorHandling HOF for all 10 API endpoints (larger refactor).
- [ ] Mobile parity gap for adjusted price column (feature addition, not a bug).
- [ ] NaN display from floorAreaRange tuple access (pre-existing, needs defensive guards).
