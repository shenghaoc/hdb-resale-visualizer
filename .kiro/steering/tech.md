# Technology Stack & Constraints

## Core Stack
- **Runtime**: Node.js 26 (Strictly use `npm` for installs and scripts).
- **Frontend**: React 19, served by Cloudflare Pages.
- **Runtime API**: Cloudflare Pages Functions under `functions/api/*`, backed by Cloudflare D1.
- **Language**: TypeScript (Strictly enforced type-checking).
- **Bundler**: Vite.
- **Styling**: Tailwind CSS v4 + Shadcn UI.
- **Mapping**: MapLibre GL JS (OneMap GreyLite tiles).
- **Charts**: Apache ECharts.
- **Validation**: Zod.

## Constraints
1. **Single Data Source at Runtime**: The browser reads all application data from `/api/*` Pages Functions. Do NOT fetch upstream APIs (OneMap, data.gov.sg) directly from the browser — those remain build-time only via `scripts/sync-data.ts`.
2. **D1 is Source of Truth**: All blocks, transactions, trends, comparisons, and persistent geocode/walking-time caches live in D1. Pages Functions read from the `DB` binding; the sync pipeline writes via the D1 HTTP API.
3. **Geocoding is One-Time**: Geocoded coordinates and OneMap walking times never change for an address/pair. They are upserted into `geocode_cache` and `walking_time_cache` tables and re-used across every sync run. Browsers never geocode.
4. **Schema Migrations**: D1 schema lives in `migrations/*.sql` and is applied via `npm run db:migrate:remote` (prod) and `npm run db:migrate:local` (Wrangler local emulator).
5. **Browser Storage**: Use `localStorage` exclusively for persistent user state.
