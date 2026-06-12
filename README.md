> **Note for AI Agents:** Please read `AGENTS.md` before proposing or making any changes to this repository to ensure architecture and data pipeline invariants are strictly preserved.

# HDB Resale Visualizer

Map-first Singapore HDB resale explorer built for real buying decisions, not price prediction. The app uses official public datasets, persists them in Cloudflare D1, and serves a fast React UI through Cloudflare Pages Functions.

## Stack

- Vite + React 19 + TypeScript (frontend)
- Cloudflare Pages Functions (`functions/api/*`) backed by Cloudflare D1 (runtime API)
- MapLibre GL JS with OneMap GreyLite tiles
- Shadcn-style card and list primitives for block results and shortlist comparison
- ECharts for block-level trend charts
- Node.js 26 + pnpm for package management, scripts, and CI

## Kiro workflow and repository docs

This repo uses Kiro steering, specs, and skills. The canonical project intelligence lives in `.kiro/`:

- [`.kiro/steering/`](.kiro/steering/) — persistent product, architecture, and review rules (always loaded by Kiro)
- [`.kiro/specs/`](.kiro/specs/) — feature and bugfix specifications following the Design → Requirements → Tasks workflow
- [`.kiro/skills/`](.kiro/skills/) — reusable agent skill packs (shadcn, React patterns, view transitions)
- [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json) — workspace MCP server configuration

Top-level Markdown keeps one canonical instruction source ([`AGENTS.md`](AGENTS.md)) and optional model-specific entrypoints ([`CLAUDE.md`](CLAUDE.md), [`GEMINI.md`](GEMINI.md)) that redirect to the same Kiro guidance.

## Screenshots

| Overview                                      | Filtered by town                                      |
| --------------------------------------------- | ----------------------------------------------------- |
| ![Overview](docs/screenshots/01-overview.png) | ![Filter panel](docs/screenshots/02-filter-panel.png) |

| Mobile view                               | Results list                                     |
| ----------------------------------------- | ------------------------------------------------ |
| ![Mobile](docs/screenshots/03-mobile.png) | ![Results](docs/screenshots/04-results-pane.png) |

| Block detail                                          | Shortlist                                   |
| ----------------------------------------------------- | ------------------------------------------- |
| ![Block detail](docs/screenshots/05-block-detail.png) | ![Shortlist](docs/screenshots/06-saved.png) |

## User guide

A full user guide is available in [docs/guide/user-guide.md](docs/guide/user-guide.md). The same content is rendered in-app via the help button (?) in the navigation bar.

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

- [Resale Flat Prices collection 189](<https://data.gov.sg/datasets?agencies=Housing+%26+Development+Board+(HDB)&resultId=189>)
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
pnpm install
```

For pure UI iteration that does not require live data, start Vite:

```bash
pnpm dev
```

This serves the SPA on `http://localhost:5173`. `/api/*` requests will 404 because no Pages Functions are running — wire mock data per spec or use the full local stack below.

For a full local stack (UI + Pages Functions + local D1 emulator):

```bash
pnpm db:migrate:local     # one-time: create the local D1 schema
pnpm dev:functions        # runs `wrangler pages dev` against the local D1
```

You can seed the local D1 from `tests/fixtures/public-data/` using `wrangler d1 execute hdb-resale --local --file=<sql>` if needed.

Run `pnpm sync-data` to refresh live data from data.gov.sg and OneMap into **remote** D1 (requires Cloudflare credentials — normally only CI runs this).

## Scripts

```bash
pnpm ci                # clean install from the lockfile (what CI runs)
pnpm dev               # Vite dev server (UI-only)
pnpm dev:functions     # Wrangler Pages dev (UI + /api/* + local D1)
pnpm check:boundaries  # script/runtime import boundary check
pnpm run build         # production build (no D1 dependency)
pnpm build:full        # build + remote D1 sync (maintainers only)
pnpm preview           # vite preview of the built bundle
pnpm run format        # write formatting fixes (vp fmt)
pnpm run format:check  # check formatting only
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm test:listing-check  # targeted: listing verdict/confidence/caveats/portal + AskingPriceCheck
pnpm test:comparables    # targeted: comparable engine, time-adjustment, transaction analysis
pnpm test:buyer-workflow # targeted: shortlist + buyer-first homepage flows
pnpm test:browser        # Vitest Browser Mode — real-browser component/integration tests
pnpm test:browser:watch  # Browser Mode in watch mode (opens Chromium)
pnpm test:e2e
pnpm run check           # full quality gate: format check + lint + typecheck + unit tests + build
pnpm check:pr            # pre-PR gate: everything in `check` plus the Playwright E2E suite
pnpm sync-data           # remote D1 sync (requires CF credentials)
pnpm db:migrate:local
pnpm db:migrate:remote
```

The targeted `test:*` scripts reuse the existing Vitest config and filter by
filename — they are fast feedback loops for buyer-critical listing-check and
comparable-engine work. Run `pnpm check:pr` once before opening a pull
request; it is a plain package script with no Kiro-specific behaviour. Base CI
runs `pnpm ci` followed by `pnpm run check`, so the local gate matches the
per-PR CI checks exactly (plus the Playwright suite).

The repo has three testing tiers:

- **`pnpm run test`** — fast Vitest unit/component tests running in jsdom (no real browser).
- **`pnpm run test:browser`** — Vitest Browser Mode tests running in a real Chromium browser via Playwright. Use for component/integration behavior that benefits from real browser APIs.
- **`pnpm run test:e2e`** — Playwright end-to-end tests covering full user flows across multiple pages.

Browser Mode tests live in `tests/browser/` and are excluded from the default
`pnpm run test` run. They are not part of the `pnpm run check` quality gate —
run them explicitly or via CI.

## Build and runtime guardrails

- `pnpm check:boundaries` validates that any Node-executed code in `scripts/` stays isolated from runtime `src/` modules and does not use runtime-only aliases like `@/` and `@shared/`.
- `pnpm build` is the default production build (`check:boundaries` + typecheck + compile + bundle budget check). It has no dependency on D1 — the static UI bundle is rebuilt from source only.
- `pnpm build:full` is the live-refresh path for maintainers intentionally pulling fresh upstream data (`check:boundaries` + `sync-data` + typecheck + compile + bundle budget check).

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

- **Application deploy**: Cloudflare Workers Builds deploys from the connected Git repository (`wrangler.jsonc` declares the D1 binding `DB` and runs `pnpm build:deploy` via the `build.command`). GitHub Actions does not run `wrangler deploy`. PR previews share the production D1 binding — there is no per-PR sync.
- **CI** (`.github/workflows/ci.yml`): `pnpm ci` then `pnpm run check` (format check, typed lint, typecheck, unit/integration tests, production build) on every PR. E2E smoke (`.github/workflows/e2e.yml`) runs separately when UI-affecting paths change, staging fixtures to `public/api/` for preview only. No data artifact caching — runtime reads from D1.
- **Data refresh** (`.github/workflows/refresh-data.yml`): nightly sync into D1 via `pnpm sync-data`. The Worker picks up new data on the next request — no app redeploy needed for data-only changes.

## Notes

- This is not a prediction product.
- Coordinates are resolved during the build-time sync and persisted in D1; the browser never geocodes.
- OneMap attribution must remain visible when the map is rendered.

## Troubleshooting

### `pnpm build` fails on the boundary check

Run `pnpm check:boundaries` to see script/runtime import violations. Common fix: move shared utilities to `shared/` and import from there instead of `src/`.

### `/api/*` returns 404 locally

You are running `pnpm dev` (Vite only). Switch to `pnpm dev:functions` to bring up Wrangler Pages dev with the D1 binding, or run the unit tests against fixtures instead.
