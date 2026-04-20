# Architecture

## Build-Time Data Pipeline vs. Static Frontend
The `hdb-resale-visualizer` operates on a strict separation between data preparation and runtime presentation. The frontend is a 100% static, client-only React application served via Cloudflare Pages. It contains zero server-side logic and no backend routes. All heavy data processing, joining, filtering, and aggregation occurs during a build-time pipeline step.

## Role of `scripts/sync-data.ts`
This script acts as the single data pipeline for the project. It:
1. Fetches raw data from data.gov.sg and LTA.
2. Normalizes, geocodes, and aggregates the data.
3. Precomputes necessary relational values (e.g., distance to the nearest MRT).
4. Outputs static JSON and GeoJSON artifacts.

## Artifact Contract Boundaries
The files generated in `public/data/` act as a strict API contract between the pipeline and the frontend. The React client fetches these static artifacts directly to populate the UI. The frontend must not fetch from external APIs (like OneMap or data.gov.sg) for core domain data at runtime.

## Application Logic Placements
- **Map Logic (MapLibre GL JS):** Renders the precomputed `public/data/block-summaries.json` points and `public/data/mrt-exits.geojson`. OneMap attribution is mandatory and maintained here.
- **Chart Logic (ECharts):** Consumes `public/data/trends/` and `public/data/details/` to render block-level historical and regional data.
- **Table Logic (TanStack Table):** Handles client-side filtering, sorting, and pagination of the loaded static datasets.

## Browser-Local Persistence & State
The application features a "Shortlist" capability with user notes and target prices. Because there is no server mutation path or remote database for user state, this feature relies exclusively on strictly browser-local storage (e.g., `localStorage`).