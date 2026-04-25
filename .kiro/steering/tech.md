# Technology Stack & Constraints

## Core Stack
- **Runtime**: Bun (Strictly use `bun` for installs and scripts).
- **Frontend**: React 19 (Strictly client-only/static).
- **Language**: TypeScript (Strictly enforced type-checking).
- **Bundler**: Vite.
- **Styling**: Tailwind CSS v4 + Shadcn UI.
- **Mapping**: MapLibre GL JS (OneMap GreyLite tiles).
- **Charts**: Apache ECharts.
- **Validation**: Zod.

## Constraints
1. **Zero Backend**: No runtime server-side logic. All data must be precomputed as static artifacts in `public/data/`.
2. **Data Pipeline**: All geocoding and heavy processing happens in `scripts/sync-data.ts`. Coordinates are never resolved in the browser.
3. **Artifact Integrity**: Generated JSON/GeoJSON artifacts are the source of truth for the frontend.
4. **Browser Storage**: Use `localStorage` exclusively for persistent user state.
5. **No Runtime Domain Fetching**: Do not fetch from external domains (OneMap, Data.gov.sg) in the browser for core data.
