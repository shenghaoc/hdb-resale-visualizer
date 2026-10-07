# Data Pipeline & Architecture

## Core Architectural Boundary
The application separates **build-time ingestion** (Node + GitHub Actions) from **runtime serving** (Cloudflare Worker + D1, with an optional Neon read backend selected by `PUBLIC_DATA_BACKEND`):
- **Frontend**: React 19 SPA. Only talks to `/api/*` (same-origin Pages Functions).
- **Runtime API**: `functions/api/*` Pages Functions-style handlers, backed by the `DB` D1 binding (or, when `PUBLIC_DATA_BACKEND=neon`, a read-only Neon shim; shortlists stay on D1). Production currently selects Neon, so `scripts/sync-data.ts` refreshing D1 does not change what the site serves until the selector is switched back. See `docs/architecture/public-read-backend.md`.
- **Pipeline**: `scripts/sync-data.ts` is the single source of truth for ingestion and pushes directly into D1 via the Cloudflare D1 HTTP API. The scheduled `refresh-data.yml` workflow has been removed (data.gov.sg rate limits + upcoming strict D1 rate enforcement made nightly runs untenable for a hobby project), so the D1 dataset is frozen at its last successful sync. The script remains runnable manually if a one-off refresh is ever required.

## Data Pipeline Flow (`scripts/sync-data.ts`)
1. **Ingestion**: Fetches raw data from official Singapore sources (data.gov.sg, LTA).
2. **Normalization**: Sanitizes addresses, derives price/sqm + price/sqft, standardizes lease commencement years.
3. **Geocoding (one-time)**: Loads existing coordinates from the `geocode_cache` table in D1; only addresses missing a row are sent to OneMap. New rows are upserted back to D1 in batches of 250.
4. **MRT walking times (one-time)**: Same pattern with the `walking_time_cache` table.
5. **Artifact build**: `buildArtifacts()` produces the same logical shapes as before (block summaries, address details, comparisons, town × flat-type trends, MRT GeoJSON) — but they are now written to D1, not files.
6. **D1 write**: `scripts/lib/sync/store.ts` stamps a `publicationInProgress` marker (owned by this run) into the stored manifest and reads it back, truncates and reinserts the generated tables in batched statements via the D1 HTTP API (every write is conditional on still owning the marker, inside the statement, so a superseded run changes nothing), and writes the manifest last with a statement that is conditional on that ownership and read back; that final write replaces the document and so removes the marker. While the marker is present the Worker's public-data cache stores nothing (see `docs/architecture/public-read-backend.md`). If a run aborts the marker stays, and the next `sync-data` run publishes again even when upstream is unchanged. Run one `sync-data` at a time.

## D1 Tables
**Generated (rebuilt every sync):**
- `manifest` — single-row metadata blob.
- `blocks` — normalized columns + JSON blobs for `flat_types`, `nearby_mrts`, etc.
- `block_details` — one JSON blob per address key (full transaction history + monthly trend).
- `comparisons` — one JSON blob per address key (amenity counts + percentile ranks).
- `town_flat_type_trends` — normalized trend points.
- `mrt_geojson` — two rows (`stations`, `exits`).
- `transactions` — one row per registered resale (listing-check evidence). `storey_midpoint` and `price_per_sqm` are derived at read time, not stored.

**Persistent (upserted, never truncated):**
- `geocode_cache` — `(cache_key, lat, lng, postal_code, display_name, search_value)`.
- `walking_time_cache` — `(cache_key, walking_time_seconds, walking_distance_meters)`.

**Runtime user state (opt-in, written by the Worker — not the sync pipeline):**
- `shortlists` — `(code_hash, items_json, updated_at)`. One row per anonymous sync code, holding an opt-in cloud backup of a user's shortlist. Written at runtime by `functions/api/shortlist/*` and never touched by `scripts/sync-data.ts`. Only the SHA-256 hash of the bearer sync code is stored; the raw code lives solely in the user's browser.

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
| `GET /api/search` | `blocks` | Coarse filters only; text/geographic search and affordability stay client-side. Cap 2000. |
| `GET /api/suggest` | `blocks` | Typeahead (`q`, 2–256 chars). Groups: town, street, block, mrt, postal. |
| `POST /api/comparable-transactions` | `transactions` | Listing Check evidence. `?adjust=time` applies trend-based time adjustment. |
| `POST /api/shortlist` | `shortlists` | Opt-in create/replace. Only runtime D1 write path. 10 writes / IP / colo / 60s. |
| `GET /api/shortlist/{syncCode}` | `shortlists` | Lookup by SHA-256 of the bearer code. 404 for unknown or malformed codes. |

The Worker (`worker/index.ts`) also serves `/sitemap.xml`, `/robots.txt`, `/og/block/{addressKey}.png`, `/og/compare/{townA}/{townB}.png`, and HTML SEO rewrites. A daily cron (`0 3 * * *`) purges shortlist rows unused for 180 days. Full request contracts live in [docs/architecture/artifact-contracts.md](../../docs/architecture/artifact-contracts.md).

JSON shapes are validated by the Zod schemas in `src/shared/lib/dataSchemas.ts`.

## Frontend Responsibilities
- **Mapping**: Consumes `/api/block-summaries` and `/api/mrt-exits` via MapLibre GL JS.
- **Charts**: Consumes `/api/trends/*` and `/api/details/*` via Recharts (lazy-loaded where practical).
- **Filtering**: Coarse filters can run on the server via `/api/search`; text/geographic search, CPF-based affordability, and sorting stay in the browser. Remaining-lease filters require a `FilterEvaluationContext` with an explicit `currentYear`.
- **Persistence**: Shortlists and user notes are stored in `localStorage` by default. Optionally, a user can enable cloud sync with an anonymous sync code; the shortlist is then mirrored to the `shortlists` D1 table through `functions/api/shortlist/*` (the only runtime D1 write path). `localStorage` remains the offline baseline on each device.
