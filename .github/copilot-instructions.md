# GitHub Copilot Instructions

Use `AGENTS.md` as the authoritative policy for this repository.

## Implementation rules

- Use Bun only (`bun install`, `bun run ...`).
- Do not add backend mutation routes or server-side write paths.
- Keep core domain processing in `scripts/sync-data.ts`.
- Frontend core data must come from precomputed artifacts in `public/data/`.
- Do not add runtime core-domain fetching from data.gov.sg or OneMap.
- Keep OneMap attribution visible whenever the map is rendered.
- This is not a price prediction product; do not add forecasting features.

## Code Review Standards

When reviewing pull requests:
- Check for functional correctness and logical bugs
- Verify code quality, maintainability, and unnecessary complexity
- Review React performance (state/effect/lifecycle mistakes, unnecessary rerenders)
- Validate data pipeline contract violations (precomputed artifacts in `public/data/`)
- Enforce Bun-only package manager (no npm/yarn/pnpm lockfiles)
- Prevent runtime fetching or runtime geocoding (use precomputed build artifacts)
- Verify tests for non-trivial logic changes
- Check TypeScript types and type safety

Do not approve PRs that:
- Introduce backend routes or runtime server-side logic
- Fetch core domain data from external APIs at runtime
- Break existing deployment assumptions or map attribution
- Include generated files under `public/data/` (owned by `scripts/sync-data.ts`)

## Completion checks

Run before submitting changes:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run test:e2e` for UI-impacting changes.

If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.
