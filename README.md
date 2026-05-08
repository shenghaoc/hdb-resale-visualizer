> **Note for AI Agents:** Please read `AGENTS.md` before proposing or making any changes to this repository to ensure architecture and data pipeline invariants are strictly preserved.

# HDB Resale Visualizer

Map-first Singapore HDB resale explorer built for real buying decisions, not price prediction. The app uses official public datasets, precomputes static artifacts, and serves a fast client-only UI on Cloudflare Pages.

## Stack

- Vite + React 19 + TypeScript
- MapLibre GL JS with OneMap GreyLite tiles
- TanStack Table for results and shortlist comparison
- ECharts for block-level trend charts
- Node.js 26 + npm for package management, scripts, and CI

## Kiro workflow and repository docs

This repo uses Kiro-style steering and specs. The canonical project intelligence lives in `.kiro/`:

- [`.kiro/steering/`](.kiro/steering/) — persistent product + architectural rules
- [`.kiro/powers/`](.kiro/powers/) — tool capability and workflow bundles
- [`.kiro/specs/`](.kiro/specs/) — active or historical feature/bug workstreams

Historical working notes are kept in [`docs/archive/`](docs/archive/) (non-canonical).

Top-level Markdown keeps one canonical instruction source ([`AGENTS.md`](AGENTS.md)) and optional model-specific entrypoints ([`CLAUDE.md`](CLAUDE.md), [`GEMINI.md`](GEMINI.md)) that redirect to the same Kiro guidance.

## What it does

- Visualizes resale blocks as address points on a Singapore map
- Filters by town, flat type, flat model, budget, floor area, lease year, date window, and MRT distance
- Shows block-level median pricing, recent transactions, and 12 to 24 month trends
- Stores a local browser shortlist with notes and target prices
- Keeps the frontend static by generating JSON artifacts ahead of time

## Official data sources

- [Resale Flat Prices collection 189](https://data.gov.sg/datasets?agencies=Housing+%26+Development+Board+(HDB)&resultId=189)
- [HDB Property Information](https://data.gov.sg/datasets/d_17f5382f26140b1fdae0ba2ef6239d2f/view)
- [LTA MRT Station Exit (GEOJSON)](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view)
- [data.gov.sg API docs](https://guide.data.gov.sg/developer-guide/api-overview)
- [OneMap basemap docs](https://www.onemap.gov.sg/docs/maps/greylite.html)

## Local development

Install dependencies:

```bash
npm install
```

Generate or refresh the static data artifacts:

```bash
npm run sync-data
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run sync-data
```

## Data pipeline

`scripts/sync-data.ts` does the following:

1. Reads the HDB resale collection metadata from data.gov.sg.
2. Downloads the CSV and GEOJSON source files through the official dataset download API.
3. Validates raw rows with `zod`.
4. Normalizes addresses, prices, lease values, and monthly aggregates.
5. Resolves block coordinates through OneMap and caches them in `data/cache/geocodes.json` (preserved across CI runs via GitHub Actions cache; not tracked by git).
6. Computes nearest MRT distance from LTA station exit points.
7. Emits:
   - `public/data/manifest.json`
   - `public/data/block-summaries.json`
   - `public/data/trends/town-flat-type.json`
   - `public/data/mrt-exits.geojson`
   - `public/data/details/`

## Environment

Optional environment variables:

```bash
DATA_GOV_API_KEY=...
ONEMAP_SEARCH_ENDPOINT=https://www.onemap.gov.sg/api/common/elastic/search
GEOCODE_CONCURRENCY=10
```

`DATA_GOV_API_KEY` is recommended for production refresh jobs because unauthenticated data.gov.sg rate limits are low.

## Deployment

- `wrangler.toml` is configured for Cloudflare Pages static output.
- `.github/workflows/ci.yml` runs typecheck, lint, unit/integration tests, e2e smoke, and production build.
- `.github/workflows/refresh-data.yml` runs nightly in SGT-equivalent UTC time, refreshes datasets, and deploys directly to Cloudflare Pages when the relevant secrets exist. Artifacts are never committed to git.

## Notes

- This is not a prediction product.
- Coordinates are resolved during artifact generation, never in the browser.
- OneMap attribution must remain visible when the map is rendered.
