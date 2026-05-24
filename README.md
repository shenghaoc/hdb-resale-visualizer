> **Note for AI Agents:** Please read `AGENTS.md` before proposing or making any changes to this repository to ensure architecture and data pipeline invariants are strictly preserved.

# HDB Resale Visualizer

Map-first Singapore HDB resale explorer built for real buying decisions, not price prediction. The app uses official public datasets, persists them in Cloudflare D1, and serves a fast React UI through Cloudflare Pages Functions.

## Stack

- Vite + React 19 + TypeScript (frontend)
- Cloudflare Pages Functions (`functions/api/*`) backed by Cloudflare D1 (runtime API)
- MapLibre GL JS with OneMap GreyLite tiles
- Shadcn-style card and list primitives for block results and shortlist comparison
- ECharts for block-level trend charts
- Node.js 26 + npm for package management, scripts, and CI

## Kiro workflow and repository docs

This repo uses Kiro-style steering and specs. The canonical project intelligence lives in `.kiro/`:

- [`.kiro/steering/`](.kiro/steering/) — persistent product + architectural rules
- [`.kiro/powers/`](.kiro/powers/) — tool capability and workflow bundles
- [`.kiro/specs/`](.kiro/specs/) — active or historical feature/bug workstreams

Historical working notes are kept in [`docs/archive/`](docs/archive/) (non-canonical).

Top-level Markdown keeps one canonical instruction source ([`AGENTS.md`](AGENTS.md)) and optional model-specific entrypoints ([`CLAUDE.md`](CLAUDE.md), [`GEMINI.md`](GEMINI.md)) that redirect to the same Kiro guidance.

## Screenshots

| Overview | Filtered by town |
|---|---|
| ![Overview](docs/screenshots/01-overview.png) | ![Filter panel](docs/screenshots/02-filter-panel.png) |

| Mobile view | Results list |
|---|---|
| ![Mobile](docs/screenshots/03-mobile.png) | ![Results](docs/screenshots/04-results-pane.png) |

| Block detail | Shortlist |
|---|---|
| ![Block detail](docs/screenshots/05-block-detail.png) | ![Shortlist](docs/screenshots/06-saved.png) |

## What it does

- Visualizes resale blocks as address points on a Singapore map
- Filters by town, flat type, flat model, budget, floor area, lease year, date window, and MRT distance
- Shows block-level median pricing, recent transactions, and 12–24 month price trends
- Overlays MRT stations, MRT exits, schools, hawker centres, supermarkets, and parks as toggleable amenity layers
- Price heatmap mode colors the map by median $/sqm for at-a-glance comparisons
- Budget match badges highlight blocks within your target range
- Block detail drawer shows lease remaining, floor area range, transaction history, and a trend chart
- Stores a browser-local shortlist with per-block notes and target prices
- Reads all live data through Cloudflare Pages Functions over Cloudflare D1; the frontend never touches data.gov.sg or OneMap at runtime

## Official data sources

- [Resale Flat Prices collection 189](https://data.gov.sg/datasets?agencies=Housing+%26+Development+Board+(HDB)&resultId=189)
- [HDB Property Information](https://data.gov.sg/datasets/d_17f5382f26140b1fdae0ba2ef6239d2f/view)
- [LTA MRT Station Exit (GEOJSON)](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view)
- [MOE School Directory](https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view)
- [NEA Hawker Centre Directory](https://data.gov.sg/datasets/d_4a086da0a5553be1d89383cd90d07ecd/view)
- [SFA Licensed Supermarkets](https://data.gov.sg/datasets/d_11edd0117280c5776651d7891114c88c/view)
- [NParks Parks and Nature Reserves](https://data.gov.sg/datasets/d_0542d48f0991541706b58059381a6eca/view)
- [data.gov.sg API docs](https://guide.data.gov.sg/developer-guide/api-overview)
- [OneMap basemap docs](https://www.onemap.gov.sg/docs/maps/greylite.html)

## Local development

Install dependencies:

```bash
npm install
```

For pure UI iteration that does not require live data, start Vite:

```bash
npm run dev
```

This serves the SPA on `http://localhost:5173`. `/api/*` requests will 404 because no Pages Functions are running — wire mock data per spec or use the full local stack below.

For a full local stack (UI + Pages Functions + local D1 emulator):

```bash
npm run db:migrate:local     # one-time: create the local D1 schema
npm run dev:functions        # runs `wrangler pages dev` against the local D1
```

You can seed the local D1 from `tests/fixtures/public-data/` using `wrangler d1 execute hdb-resale --local --file=<sql>` if needed.

Run `npm run sync-data` to refresh live data from data.gov.sg and OneMap into **remote** D1 (requires Cloudflare credentials — normally only CI runs this).

## Scripts

```bash
npm run dev               # Vite dev server (UI-only)
npm run dev:functions     # Wrangler Pages dev (UI + /api/* + local D1)
npm run check:boundaries  # script/runtime import boundary check
npm run build             # production build (no D1 dependency)
npm run build:full        # build + remote D1 sync (maintainers only)
npm run preview           # vite preview of the built bundle
npm run typecheck
npm run lint
npm run lint:fast
npm run test
npm run test:e2e
npm run sync-data         # remote D1 sync (requires CF credentials)
npm run db:migrate:local
npm run db:migrate:remote
```


## Build and runtime guardrails

- `npm run check:boundaries` validates that any Node-executed code in `scripts/` stays isolated from runtime `src/` modules and does not use runtime-only aliases like `@/` and `@shared/`.
- `npm run build` is the default production build (`check:boundaries` + typecheck + compile + bundle budget check). It has no dependency on D1 — the static UI bundle is rebuilt from source only.
- `npm run build:full` is the live-refresh path for maintainers intentionally pulling fresh upstream data (`check:boundaries` + `sync-data` + typecheck + compile + bundle budget check).

## Data pipeline

`scripts/sync-data.ts` does the following:

1. Reads the HDB resale collection metadata from data.gov.sg.
2. Downloads CSV and GEOJSON source files for resale prices, properties, MRT stations, schools, hawker centres, supermarkets, and parks through the official dataset download API.
3. Validates raw rows with `zod`.
4. Normalizes addresses, prices, lease values, and monthly aggregates.
5. Loads existing geocodes from the `geocode_cache` D1 table; only addresses missing a cached row are sent to OneMap. New rows are upserted back to D1 in batches of 250.
6. Same one-time pattern for OneMap walking-time routes via the `walking_time_cache` table.
7. Computes block-level summaries, address details, comparisons, and town × flat-type trend aggregates.
8. Writes generated artifacts back to D1 (`manifest`, `blocks`, `block_details`, `comparisons`, `town_flat_type_trends`, `mrt_geojson`).

Pages Functions under `functions/api/*` then serve those tables on every request. Schema for both halves lives in `migrations/0001_initial.sql`.

## Environment

```bash
# Build-time / sync-data
DATA_GOV_API_KEY=...
ONEMAP_EMAIL=...
ONEMAP_PASSWORD=...
ONEMAP_TOKEN=...
GEOCODE_CONCURRENCY=10

# Cloudflare D1 (sync-data writes via the HTTP API)
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_D1_DATABASE_ID=...
```

`DATA_GOV_API_KEY` is recommended for production refresh jobs because unauthenticated data.gov.sg rate limits are low.

## Deployment

- **Application deploy**: Cloudflare Workers Builds deploys from the connected Git repository (`wrangler.jsonc` declares the D1 binding `DB` and runs `npm run build:deploy` via the `build.command`). GitHub Actions does not run `wrangler deploy`. PR previews share the production D1 binding — there is no per-PR sync.
- **CI** (`.github/workflows/ci.yml`): typecheck, typed lint, unit/integration tests, e2e smoke (fixtures staged to `public/api/` for preview only), and production build verification. No data artifact caching — runtime reads from D1.
- **Data refresh** (`.github/workflows/refresh-data.yml`): nightly sync into D1 via `npm run sync-data`. The Worker picks up new data on the next request — no app redeploy needed for data-only changes.

## Notes

- This is not a prediction product.
- Coordinates are resolved during the build-time sync and persisted in D1; the browser never geocodes.
- OneMap attribution must remain visible when the map is rendered.

## Troubleshooting

### `npm run build` fails on the boundary check

Run `npm run check:boundaries` to see script/runtime import violations. Common fix: move shared utilities to `shared/` and import from there instead of `src/`.

### `/api/*` returns 404 locally

You are running `npm run dev` (Vite only). Switch to `npm run dev:functions` to bring up Wrangler Pages dev with the D1 binding, or run the unit tests against fixtures instead.
