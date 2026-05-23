# Data Pipeline & Architecture

## Core Architectural Boundary
The application separates **build-time ingestion** (Node + GitHub Actions) from **runtime serving** (Cloudflare Pages Functions + D1):
- **Frontend**: React 19 SPA. Only talks to `/api/*` (same-origin Pages Functions).
- **Runtime API**: `functions/api/*` Pages Functions, backed by the `DB` D1 binding.
- **Pipeline**: `scripts/sync-data.ts` is the single source of truth for ingestion. It runs nightly via `.github/workflows/refresh-data.yml` and pushes directly into D1 via the Cloudflare D1 HTTP API.

## Data Pipeline Flow (`scripts/sync-data.ts`)
1. **Ingestion**: Fetches raw data from official Singapore sources (data.gov.sg, LTA).
2. **Normalization**: Sanitizes addresses, derives price/sqm + price/sqft, standardizes lease commencement years.
3. **Geocoding (one-time)**: Loads existing coordinates from the `geocode_cache` table in D1; only addresses missing a row are sent to OneMap. New rows are upserted back to D1 in batches of 250.
4. **MRT walking times (one-time)**: Same pattern with the `walking_time_cache` table.
5. **Artifact build**: `buildArtifacts()` produces the same logical shapes as before (block summaries, address details, comparisons, town × flat-type trends, MRT GeoJSON) — but they are now written to D1, not files.
6. **D1 write**: `scripts/lib/sync/store.ts` truncates and reinserts the generated tables in batched `INSERT OR REPLACE … VALUES (…),(…),…` statements via the D1 HTTP API.

## D1 Tables
**Generated (rebuilt every sync):**
- `manifest` — single-row metadata blob.
- `blocks` — normalized columns + JSON blobs for `flat_types`, `nearby_mrts`, etc.
- `block_details` — one JSON blob per address key (full transaction history + monthly trend).
- `comparisons` — one JSON blob per address key (amenity counts + percentile ranks).
- `town_flat_type_trends` — normalized trend points.
- `mrt_geojson` — two rows (`stations`, `exits`).

**Persistent (upserted, never truncated):**
- `geocode_cache` — `(cache_key, lat, lng, postal_code, display_name, search_value)`.
- `walking_time_cache` — `(cache_key, walking_time_seconds, walking_distance_meters)`.

## Runtime Endpoints (`functions/api/*`)
| Endpoint | Table | Notes |
|---|---|---|
| `GET /api/manifest` | `manifest` | Single-row JSON. |
| `GET /api/block-summaries` | `blocks` | All blocks, sorted by `median_price DESC, transaction_count DESC`. |
| `GET /api/blocks/{town}` | `blocks` | Town-slug filtered (slug is `townToFilename()` from `shared/geo.ts`). |
| `GET /api/details/{addressKey}` | `block_details` | 404 if address unknown. |
| `GET /api/comparisons/{addressKey}` | `comparisons` | 404 when amenity data was unavailable for that block. |
| `GET /api/trends/town-flat-type` | `town_flat_type_trends` | Returns all rows. |
| `GET /api/mrt-stations` | `mrt_geojson` | GeoJSON FeatureCollection. |
| `GET /api/mrt-exits` | `mrt_geojson` | GeoJSON FeatureCollection. |

All endpoints return JSON shapes validated by the Zod schemas in `src/lib/dataSchemas.ts` — that contract is intentionally unchanged from the previous static-artifact era so frontend code paths stay identical.

## Frontend Responsibilities
- **Mapping**: Consumes `/api/block-summaries` and `/api/mrt-exits` via MapLibre GL JS.
- **Charts**: Consumes `/api/trends/*` and `/api/details/*` via Apache ECharts.
- **Filtering**: Performs client-side filtering and sorting on the preloaded blocks array.
- **Persistence**: Shortlists and user notes are stored strictly in `localStorage`.
