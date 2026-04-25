# Data Pipeline & Architecture

## Core Architectural Boundary
The application operates on a strict separation between build-time data preparation and runtime presentation.
- **Frontend**: 100% static React 19 application. Zero server-side logic.
- **Pipeline**: `scripts/sync-data.ts` is the single source of truth for data ingestion and normalization.

## Data Pipeline Flow (`scripts/sync-data.ts`)
1. **Ingestion**: Fetches raw data from official Singapore sources (data.gov.sg, LTA).
2. **Normalization**:
   - Sanitizes address strings and unit metrics.
   - Standardizes lease commencement years to calculate remaining lease consistently.
   - Derived metrics like Price per Sqm and Price per Sqft are calculated here.
3. **Geocoding**: Coordinates are resolved via OneMap API and cached in `data/cache/geocodes.json`. **Never geocode in the browser.**
4. **MRT Analysis**: Computes linear distances to the nearest MRT station exits.
5. **Artifact Generation**: Emits static JSON/GeoJSON files to `public/data/`.

## Authoritative Artifacts (`public/data/`)
These files constitute the strict API contract:
- `manifest.json`: Metadata and last updated timestamps.
- `block-summaries.json`: High-level data for map and global filters.
- `mrt-exits.geojson`: Station locations for map context.
- `trends/`: Aggregated historical pricing data.
- `details/`: Deep-dive transactional history per block.

## Frontend Responsibilities
- **Mapping**: Consumes `block-summaries.json` and `mrt-exits.geojson` via MapLibre GL JS.
- **Charts**: Consumes trend and detail artifacts via Apache ECharts.
- **Filtering**: Performs high-performance client-side filtering and sorting on the preloaded blocks array.
- **Persistence**: Shortlists and user notes are stored strictly in `localStorage`.
