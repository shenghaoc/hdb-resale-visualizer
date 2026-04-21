# GitHub Copilot Instructions

For this repository, `AGENTS.md` is the canonical instruction file.

## Mandatory constraints

- Bun-only workflows and scripts.
- No backend mutation routes.
- Keep data pipeline heavy lifting in `scripts/sync-data.ts`.
- Frontend must consume precomputed artifacts from `public/data/`.
- No runtime core-domain fetches from data.gov.sg or OneMap.
- Keep OneMap attribution visible.

## Validation expectations

Run and pass:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run test:e2e` when relevant.
