# GitHub Copilot Instructions

Use `AGENTS.md` as the authoritative policy for this repository.

## Implementation rules

- Use Node.js 26 + npm only (`npm install`, `npm run ...`).
- Do not add backend mutation routes or server-side write paths.
- Keep core domain processing in `scripts/sync-data.ts`.
- Frontend core data must come from the `/api/*` Pages Functions backed by Cloudflare D1.
- Do not add runtime core-domain fetching from data.gov.sg or OneMap.
- Keep OneMap attribution visible whenever the map is rendered.
- This is not a price prediction product; do not add forecasting features.

## Completion checks

Run before submitting changes:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:e2e` for UI-impacting changes.

If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.
