---
inclusion: always
---

# Technology Stack And Constraints

## Core Stack
- **Runtime and package manager**: Node.js 26 or newer, npm only, `package-lock.json` as the lockfile. Do not add `bun.lock`, `yarn.lock`, or `pnpm-lock.yaml`.
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, shadcn-style components with Radix primitives, and Lucide icons.
- **Deployment runtime**: Cloudflare Worker declared in `wrangler.jsonc` (`worker/index.ts`) serving static assets from `dist` and routing API, SEO, sitemap, and OG image requests.
- **Runtime API modules**: `functions/api/*` and `functions/_lib/*` contain Pages Functions-style handlers and D1 helpers reused by the Worker router.
- **Database**: Cloudflare D1 binding named `DB`.
- **Validation**: Zod schemas for external data, API payloads, localStorage, and test fixtures.
- **Mapping**: MapLibre GL JS with OneMap GreyLite tiles and required attribution.
- **Charts**: Recharts is the current charting library. Keep chart-heavy UI lazy-loaded where practical.
- **Search**: Local/browser fuzzy search may use deterministic libraries such as Fuse.js. Server-side suggest/search endpoints must stay deterministic D1-backed logic.
- **PWA**: `vite-plugin-pwa` generates the service worker. `public/temporal-polyfill.js` is prepared by `npm run prepare:temporal-polyfill` and loaded from HTML before app code.

## Runtime Architecture
- The browser reads application data from same-origin `/api/*` endpoints. It must not fetch upstream official datasets directly.
- `functions/api/*` reads D1 through the `DB` binding. The only runtime D1 write path is opt-in shortlist sync under `functions/api/shortlist/*`.
- `worker/index.ts` owns Worker routing, static asset fallback, API dispatch, SEO rewrites, sitemap, OG images, and background cleanup via `ctx.waitUntil`.
- `scripts/sync-data.ts` is the build-time ingestion entry point. It fetches official datasets and OneMap data, normalizes artifacts, and writes D1 through the Cloudflare API.
- Persistent geocode and walking-time caches live in D1 tables and are upserted by the sync pipeline. Browsers and runtime API handlers never geocode or compute new OneMap routes.

## Hard Constraints
1. **No hosted AI runtime APIs**: Follow `no-ai-runtime.md`. Do not call OpenAI, Anthropic, Gemini, Groq, Mistral, Together, Perplexity, hosted embedding APIs, hosted reranking APIs, or any hosted model API from `src/`, `functions/`, `worker/`, service workers, API routes, or client-side code.
2. **Runtime data source boundary**: No runtime `fetch()` to data.gov.sg, OneMap data APIs, LTA dataset APIs, or other upstream data sources from `src/`, `functions/`, or `worker/`. Upstream data ingestion belongs in `scripts/sync-data.ts`.
3. **D1 schema discipline**: Add new numbered migrations in `migrations/*.sql`. Do not retroactively edit existing migrations. Schema changes must update D1 helpers, shared types, Zod schemas, sync storage, and tests together.
4. **Script/runtime import boundary**: Node-executed scripts must not import from `src/` or use Vite-only aliases. Shared cross-runtime code belongs in `shared/`.
5. **Temporal loading**: Do not read `Temporal` at module load in `src/`. The boundary check enforces lazy access so Safari can load the HTML polyfill first.
6. **Privacy**: Browser-local storage is the default. Cloud shortlist sync uses anonymous high-entropy sync codes; store only hashes server-side and never introduce account or PII requirements without a product spec.

## Standard Scripts
- `npm run dev`: prepare the Temporal polyfill and start Vite on `localhost:5173` for UI-only iteration.
- `npm run dev:functions`: prepare the polyfill, build, and run `wrangler dev` for the Worker/API/D1 stack.
- `npm run check:boundaries`: enforce script/runtime and Temporal boundaries.
- `npm run typecheck`: TypeScript verification.
- `npm run lint` / `npm run lint:fast`: typed ESLint or faster syntax-focused lint.
- `npm run test`: Vitest unit and integration tests with `NODE_OPTIONS=--no-experimental-webstorage`.
- `npm run test:e2e`: Playwright WebKit E2E against a production build and fixture API.
- `npm run build`: production build with boundary check, TypeScript build, Vite build, and bundle check.
- `npm run build:deploy`: Cloudflare deployment build path.
- `npm run build:full`: maintainer-only path that includes remote `npm run sync-data`.
- `npm run db:migrate:local` / `npm run db:migrate:remote`: D1 migrations.
- `npm run sync-data`: official dataset refresh into remote D1, requiring Cloudflare and upstream credentials.

## CI Reality
GitHub CI uses Node 26 and npm. The `quality` job runs `npm ci`, `npm run typecheck`, `npm run lint`, and `npm run test`. Conditional jobs run `npm run test:e2e` and `npm run build:deploy` when relevant paths change. Local validation should mirror this instead of inventing substitute commands.
