@AGENTS.md

## Code Review Policy
When reviewing pull requests, check for:
- Functional correctness and logical bugs
- Code quality, maintainability, and unnecessary complexity
- React performance (state/effect/lifecycle mistakes, unnecessary rerenders)
- Data pipeline contract violations (ensure `scripts/lib/schemas.ts` and `src/types/data.ts` are synchronized)
- Package manager drift (Bun-only — no npm/yarn/pnpm lockfiles)
- Runtime geocoding violations (all coordinates must be precomputed in `scripts/`)
- Runtime fetching of core domain data from external APIs (must use precomputed `public/data/` artifacts)
- Missing tests for non-trivial logic changes
- Weak TypeScript types and type safety issues

Do not approve PRs that:
- Introduce backend routes or runtime server-side logic
- Fetch core domain data from external APIs at runtime
- Break existing deployment assumptions or map attribution requirements
- Manually edit generated files under `public/data/` (these are owned by `scripts/sync-data.ts`)
- Include `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` (Bun-only project)
