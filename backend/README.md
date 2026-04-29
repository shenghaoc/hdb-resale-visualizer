# Backend (optional)

This folder is the backend counterpart for this Kiro project (frontend + backend coexisting).

## Why it exists

- Keep privileged secrets (e.g. `SUPABASE_SERVICE_ROLE_KEY`) off the frontend.
- Provide a place for authenticated write APIs, admin jobs, and server-side validations.

## Runtime

- Cloudflare Worker style handler in `src/index.ts`.
- Worker config lives in `backend/wrangler.toml`.

## Required secrets (server-only)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Never expose these via `VITE_*` variables.

## Current endpoints

- `GET /api/health`
- `GET /api/config`

These are scaffolding endpoints to establish the backend boundary. The next step is to route shortlist sync through this API.

## Run / Deploy

From repo root:

```bash
bun run backend:dev
bun run backend:deploy
```

Set runtime secrets/vars on Cloudflare Worker:

- `SUPABASE_URL` (secret or plain var)
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `APP_ORIGIN` (plain var, e.g. your Pages domain)
