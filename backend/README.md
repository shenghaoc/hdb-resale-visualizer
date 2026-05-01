# Backend (optional)

This folder is the backend counterpart for this Kiro project (frontend + backend coexisting).

## Why it exists

- Keep privileged secrets (e.g. `JWT_SECRET`) off the frontend.
- Provide a place for authenticated write APIs, persistent data (Cloudflare D1), and server-side validations.

## Runtime

- Cloudflare Worker style handler in `src/index.ts`.
- Worker config lives in `backend/wrangler.toml`.

## Required secrets (server-only)

- `JWT_SECRET`: Used to sign and verify authentication tokens.
- `DB`: The Cloudflare D1 database binding (configured in `wrangler.toml`).

Never expose these via `VITE_*` variables.

## Current endpoints

- `GET /api/health`
- `POST /api/auth/login`: Authenticate and obtain a JWT (supports auto-signup).
- `GET /api/shortlist`: Retrieve the user's saved shortlist (Protected).
- `PUT /api/shortlist`: Update the user's saved shortlist (Protected).

## Run / Deploy

From repo root:

```bash
bun run backend:dev
bun run backend:deploy
```

Set runtime secrets/vars on Cloudflare Worker:

- `JWT_SECRET` (secret)
- `APP_ORIGIN` (plain var, e.g. your Pages domain)
- `DB` (D1 database binding)
