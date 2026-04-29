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

## Completion checks

Run before submitting changes:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run test:e2e` for UI-impacting changes.

If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.
