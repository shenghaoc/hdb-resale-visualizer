# AI Agent Instructions

## Project Summary
Map-first Singapore HDB resale explorer built for real buying decisions, not price prediction.

## Stack Summary
Vite, React 19, TypeScript, MapLibre GL JS, TanStack Table, ECharts, Zod, Bun, Vitest, Playwright.

## Product Scope & Boundaries
- **Not a prediction product**: Do not invent or add price forecasting features.
- **Static Frontend**: The application is served statically via Cloudflare Pages.
- **No Server Mutation**: There is no server-side mutation path or backend API routes.
- **Browser-Local State**: Persistent user state (like shortlists, target prices, or notes) must remain strictly browser-local (e.g., `localStorage`).

## Architecture & Data Pipeline Invariants
- **Precomputed Artifacts Only**: Core domain data for map rendering, filtering, trends, and details must come from precomputed static JSON/GeoJSON artifacts in `public/data/`.
- **No Runtime Domain Fetching**: Do not introduce runtime fetching from data.gov.sg or OneMap for core application functionality.
- **Geocoding Constraint**: All geocoding happens in `scripts/sync-data.ts` and must be cached in `data/cache/geocodes.json`. Coordinates are resolved during artifact generation, never in the browser.
- **Heavy Processing**: Keep heavy processing in the data pipeline, not in the browser frontend.
- **Contract Strictness**: Treat the generated artifact structure as a strict API contract between the script generator and frontend consumers.

## UI Rules
- **OneMap Attribution**: OneMap attribution must remain visible whenever the map is rendered. Do not remove or hide it.

## Testing Rules
- Execute type checking, linting, and tests to validate all proposed changes before declaring completion.

## Package Management & Commands
**Use `bun` only.** Never use `npm`, `yarn`, or `pnpm`. Do not introduce `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`.

Available commands:
```bash
bun install
bun run dev
bun run build
bun run preview
bun run typecheck
bun run lint
bun run test
bun run test:e2e
bun run sync-data
```