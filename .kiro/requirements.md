# Product Requirements

## Product Stance
This is a map-first HDB resale decision tool, not a prediction tool. The product should help a buyer narrow real resale choices with deterministic facts: recent transaction history, location, price, lease, access, liquidity, and nearby amenities.

Do not ship fake insight. If a comparison cannot be generated from precomputed artifacts, it should not appear as a scored or status-like UI element. "Pipeline coming soon" cards in the buying flow are noise and should be removed until the static artifact exists.

## Search Criteria
The main form should have 5 core search criteria:

1. Location scope: town, block/street search, MRT search, or coordinates.
2. Flat type.
3. Budget range.
4. Minimum remaining lease.
5. Maximum MRT distance.

Advanced refinements can remain available, but they are not primary search criteria:

1. Flat model.
2. Floor area range.
3. Transaction window.

Rationale: a buyer starts with where, what size/type, affordability, lease risk, and access. Flat model, area, and transaction window are useful refinements, but putting all controls at the same level makes the form feel like a database query instead of a buying workflow.

## Results List Scope
The results list must not dump every block in Singapore by default.

The list may appear only when a location scope exists:

1. A town is selected.
2. The search box contains a block, street, town-like, MRT, or coordinate query.
3. A block is selected from the map or URL state.

It is reasonable to hide the filtered list until a town is selected for browsing, but town must not be the only valid gate. A specific address, street, MRT radius, or coordinate search is also a deliberate location scope.

## Map Visibility & Context
The map is always present, but block markers and visual aids should be contextual:

1. Default state: show the OneMap base map and transport context, but do not show HDB resale block markers.
2. Location scoped state: show only markers that match the current filters and location scope.
3. Selected block state: always show the selected block highlight even if ordinary markers are hidden.
4. **Visual Proximity Context**: when a block is selected, render shaded 1km and 2km concentric circles on the map to provide visual grounding for the "Nearby Amenities" counts.
5. **User Orientation**: provide a "Find my location" control to help users orient themselves relative to target blocks.
6. Background pan/zoom: dismiss overlays that block exploration, but do not reset filters.
7. Feature click: select the block, keep the results workflow open, and show the detail drawer.

OneMap attribution must remain visible whenever the map is rendered.

## Deterministic Comparisons
Current artifact-backed comparisons:

1. Median resale price.
2. Price per square meter and square foot in details.
3. Remaining lease proxy from lease commence year.
4. MRT distance from precomputed station exit geometry.
5. Transaction count as liquidity/confidence.
6. Latest transaction month as freshness.
7. Monthly block trend and town/flat-type trend.
8. Target price gap using browser-local shortlist target prices.

Future deterministic comparisons, to be generated in `scripts/sync-data.ts` only:

1. Nearest primary schools and counts within 1 km and 2 km, using MOE school directory data plus cached geocoding.
2. Nearest hawker centres, supermarkets, and parks, using official GeoJSON/static datasets.
3. Town and flat-type percentile ranks for price, price per sqm, lease, MRT distance, liquidity, and recency.
4. Trend slope and volatility based on historical transaction medians, with minimum sample-size guards.

Not accepted until a reliable artifact exists:

1. EIP quota status.
2. Unit orientation or west-sun exposure.
3. Any price forecast or AI-generated score.

## Shareable Insights
Data portability should extend beyond files:
1. Support copying a specific block's address.
2. Support copying the entire shortlist as a formatted text summary (Markdown or plain text) for easy sharing via messaging apps.

## Acceptance Criteria
1. The `.kiro` plan documents define the search criteria, map visibility policy, and deterministic comparison roadmap.
2. The filter form separates core search criteria from advanced refinements.
3. Results and map block markers are hidden until a location scope exists.
4. Search-scoped map results fit to the matching blocks, not the full island.
5. Placeholder detail cards for unavailable EIP, orientation, schools, and amenities are removed until real artifacts exist.
6. Selecting a block triggers visual 1km/2km radius circles on the map.
7. Type checking, linting, unit tests, e2e tests, and production build pass with Bun.
