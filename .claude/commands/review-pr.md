---
description: Review a pull request
allowed-tools: mcp__github__pull_request_read, mcp__github__add_issue_comment, mcp__github__pull_request_review_write, mcp__github__add_reply_to_pull_request_comment
---

You conduct thorough pull request reviews as a single agent. Do not spawn subagents.

## Process

1. **Read ALL changed files** in full — never comment on a diff excerpt in isolation.
2. **Cross-reference existing automated reviews** (Gemini, Codex, other bots): confirm which flagged issues are already fixed in the latest commit and which remain open. Acknowledge both explicitly.
3. **Trace semantic dependencies**: when a refactor splits or merges state (e.g. one `panelOpen` becomes `leftOpen + rightOpen`), find every consumer of the old shape and verify each condition is correctly updated.
4. **Inspect CSS against the real DOM hierarchy**: descendant selectors require the target to be *inside* the ancestor in the rendered JSX — not merely a sibling. Compound selectors (`.a.b`) are needed when the class is applied conditionally to the same element.
5. **Scan for dead code**: computed values, compat shims, or returned properties that no consumer destructures or reads.
6. **Audit edge cases**: independent-state combinations (e.g. both panels open simultaneously), keyboard interactions, mobile vs desktop branches, empty inputs, boundary values.

## What to Check

**Code quality & React correctness**
- Semantic bugs in derived/composed state
- Missing or incorrect `useEffect` dependency arrays; unnecessary re-renders from unstable references
- Prefer `type` over `interface`; avoid `any`
- Magic numbers/strings that should be named constants

**Performance (hot paths run against 10 000+ blocks)**
- Per-iteration allocations: `new RegExp(...)`, `.trim().toUpperCase()`, inline object literals inside filter/search loops
- Short-circuit opportunities on empty queries or empty filter sets
- Memoisation gaps: values recomputed every render that could be cached
- MapLibre: source data mutations that force full re-renders instead of `setFilter`/`setPaintProperty`
- Unbounded caches — verify eviction logic

**Security**
- URL parameter payloads parsed without size guard (client-side DoS)
- CSV export: formula injection sanitisation must use both `g` and `m` regex flags to cover multi-line cell values
- `dangerouslySetInnerHTML` or dynamic `href`/`src` built from user input
- `localStorage` reads cast without Zod validation

**Test coverage**
- Non-trivial new logic without a Vitest unit test
- Missing edge-case tests: empty input, oversized payload, invalid data
- Module-level cache mutations without `resetFilteringCachesForTests()` in teardown
- Brittle E2E assertions on computed CSS values — prefer visible text, aria roles, `data-testid`

**Architecture (hard constraints)**
- Any `fetch()` in `src/` targeting external domains (OneMap, data.gov.sg) — critical violation
- Geocoding or MRT distance calculations in `src/` — critical violation
- `public/data/` files manually edited — owned by `scripts/sync-data.ts`
- `scripts/lib/schemas.ts` changed without matching update to `src/types/data.ts` (or vice-versa)
- `bun.lock`, `yarn.lock`, or `pnpm-lock.yaml` present — Node 26 + npm only

## Output Format

Post a single top-level comment structured as:

**Overview** — one paragraph on the architectural approach and whether it is sound.

**Automated Review Status** — explicitly state which bot-flagged issues are already fixed in the latest commit and which (if any) are still open.

**Issues Found** — for each issue:
- Severity: **Critical** / **High** / **Medium** / **Low**
- Exact `file:line` reference
- Before/after code snippet where applicable
- Concise impact explanation
- Concrete suggested fix

**Positives** — bullet list of what the PR does well.

**Summary** — two to three sentences: real bugs found, what is already correct, overall quality.

Use inline review comments only for highly localised, line-specific concerns. Keep all comments brief — explain *why* an issue matters, not just what it is.
