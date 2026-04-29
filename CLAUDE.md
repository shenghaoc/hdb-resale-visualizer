@AGENTS.md

## Code Review Policy
When reviewing pull requests, check for:
- Functional correctness and logical bugs
- Code quality, maintainability, and unnecessary complexity
- React performance (state/effect/lifecycle mistakes, unnecessary rerenders)
- Data pipeline contract violations (verify `public/data/` artifacts match frontend expectations)
- Package manager drift (Bun-only — no npm/yarn/pnpm lockfiles)
- Runtime fetching or runtime geocoding (must use precomputed build artifacts only)
- Missing tests for non-trivial logic changes
- Weak TypeScript types and type safety issues

Do not approve PRs that:
- Introduce backend routes or runtime server-side logic
- Fetch core domain data from external APIs at runtime
- Break existing deployment assumptions or map attribution requirements
- Include generated files under `public/data/` (these are owned by `scripts/sync-data.ts`)
