# Code Review Policy

This policy applies to **all review agents** (Claude, Gemini, Kiro, Codex). Platform-specific tooling is configured separately per agent (see below).

## Review Process

1. **Read ALL changed files** in full — never comment on a diff excerpt in isolation.
2. **Cross-reference existing automated reviews** — confirm which flagged issues are already fixed in the latest commit and which remain open. Acknowledge both explicitly.
3. **Trace semantic dependencies** — when a refactor splits or merges state, find every consumer of the old shape and verify each condition is correctly updated.
4. **Inspect CSS against the real DOM hierarchy** — descendant selectors require the target to be _inside_ the ancestor in JSX; a conditionally applied class needs a compound selector (`.a.b`), not a descendant one.
5. **Scan for dead code** — computed values, compat shims, or returned properties that no consumer uses.
6. **Audit edge cases** — independent-state combinations, keyboard interactions, mobile vs desktop branches, empty inputs, boundary values.

## What to Check

**Code quality & React correctness**

- Semantic bugs in derived/composed state (e.g. `!panelOpen` that should now be `!leftOpen && !rightOpen`)
- Missing or incorrect `useEffect` dependency arrays; unnecessary re-renders from unstable references
- `type` over `interface`; no `any`; named constants instead of magic values
- Dead backwards-compat code with no remaining consumers

**Performance** (hot paths run against 10 000+ block records)

- Per-iteration allocations: `new RegExp(...)`, `.trim().toUpperCase()`, inline object literals inside filter/search loops
- Short-circuit opportunities on empty query or empty filter set
- Memoisation gaps; unbounded caches without eviction
- MapLibre: source mutations that force full re-renders instead of `setFilter`/`setPaintProperty`

**Security**

- URL parameter payloads parsed without a size guard (client-side DoS)
- CSV export formula injection — sanitisation must target the start of the field; avoid the `m` flag to prevent over-sanitising multi-line cell values
- `dangerouslySetInnerHTML` or dynamic `href`/`src` from user input
- `localStorage` reads without Zod validation

**Test coverage**

- Non-trivial new logic without a Vitest unit test
- Missing edge-case tests: empty input, oversized payload, invalid data
- Module-level cache mutations without `resetFilteringCachesForTests()` in teardown
- Brittle E2E assertions on computed CSS values — prefer visible text, aria roles, `data-testid`

**Architecture** (hard constraints — any violation blocks merge)

- `fetch()` in `src/` or `functions/` targeting external domains (OneMap, data.gov.sg) — critical (those calls belong only in `scripts/sync-data.ts`)
- Geocoding or MRT distance calculations in `src/` or `functions/` — critical (build-time only)
- D1 schema changes in `migrations/*.sql` without matching updates to `scripts/lib/sync/store.ts`, `functions/_lib/d1.ts`, `shared/data-types.ts`, and `scripts/lib/schemas.ts`
- `scripts/lib/schemas.ts` changed without matching update to the corresponding TypeScript types in `shared/data-types.ts` (or vice versa)
- `bun.lock`, `yarn.lock`, or `package-lock.json` present — Node 24 + pnpm

## Output Format

The following structured format applies to the overall PR review summary comment, not individual inline line-level comments:

- **Overview** — one paragraph on the approach and whether it is sound.
- **Automated Review Status** — which bot-flagged issues are resolved vs. still open.
- **Issues Found** — severity (**Critical/High/Medium/Low**), `file:line`, before/after snippet (where applicable), impact, concrete fix.
- **Positives** — what the PR does well.
- **Summary** — two to three sentences on real bugs found, correctness, and overall quality.

## Do Not Approve PRs That

- Fetch data from external APIs (OneMap, data.gov.sg) at runtime — those calls belong in `scripts/sync-data.ts` only
- Bypass D1 by hand-editing static data files or hosting JSON elsewhere
- Modify `migrations/*.sql` files retroactively — add a new numbered migration instead
- Break existing deployment assumptions or map attribution requirements
- Include `bun.lock`, `yarn.lock`, or `package-lock.json` (Node 24 + pnpm project)

## Platform-Specific Review Tooling

- **Claude**: triggered via `@claude review` PR comment.
- **Kiro**: review hooks configured in `.kiro/`.
- **Gemini / Codex**: triggered via PR comments (`/gemini review`, `@codex review`).
