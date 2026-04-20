# Data Pipeline & Normalization

## Official Raw Data Sources
The application relies entirely on official Singapore government data:
- HDB Resale Flat Prices (Collection 189)
- HDB Property Information
- LTA MRT Station Exits (GeoJSON)

## Generated Artifacts & Consumers
The `scripts/sync-data.ts` pipeline emits the following static files to `public/data/`, which are heavily consumed by the React UI:
- `manifest.json`: Tracks last updated timestamps to manage cache invalidation.
- `block-summaries.json`: High-level data for map points and global table filtering.
- `mrt-exits.geojson`: Station locations for map rendering.
- `trends/*.json`: Aggregated trend data for ECharts.
- `details/*.json`: Specific transactional history and metadata per block/address key.

## Normalization Expectations & Derivations
- **Text/Metrics**: Text values are sanitized and title/upper-cased consistently. Price per Sqm and Price per Sqft are calculated during the pipeline build to ensure frontend performance.
- **MRT Distances**: The pipeline pre-calculates the linear distance from each HDB block to the nearest MRT station exit. The frontend simply references this static property.

## Edge Cases Handled in Pipeline
- **Malformed Dates**: Inconsistent formatting in transaction dates and lease fields are cleaned or discarded if unresolvable.
- **Inconsistent Lease Fields**: Remaining lease strings vary heavily over historical datasets; the pipeline normalizes these against the commencement year.
- **Address Normalization Issues**: Blocks and street names are rigorously formatted to handle inconsistencies and ensure correct matching across the Property Info and Resale datasets.
- **Missing Coordinates & Geocoding Cache**: Addresses are geocoded against the OneMap API strictly during pipeline execution and permanently cached in `data/cache/geocodes.json`. Unresolved OneMap queries are logged and skipped without breaking the rest of the build. The frontend *never* performs runtime geocoding.