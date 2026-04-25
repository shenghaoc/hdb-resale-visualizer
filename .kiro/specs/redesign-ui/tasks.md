# Implementation Tasks

## Phase 1: Product Policy Cleanup
- [x] Rewrite `.kiro` requirements and design around search criteria, location scope, deterministic comparisons, and map visibility.
- [x] Rename result-list gating from town-specific wording to location-scope wording.
- [x] Hide HDB block markers unless a location scope exists, while keeping selected-block highlighting independent.
- [x] Fit the map to search-scoped blocks, not the full island.
- [x] Remove unavailable "pipeline coming soon" detail cards for EIP, orientation, schools, and amenities (Initial sweep).

## Phase 2: Filter Form Overhaul
- [x] Split the filter form into 5 core criteria and advanced refinements.
- [x] Update labels and empty states so users understand location scope without in-app instructional clutter.
- [x] Keep query-string serialization unchanged unless the data contract needs a version bump.

## Phase 3: Shortlist Stabilization & UX Redesign
- [x] Fix Shortlist scrolling bug using `ScrollArea` and flex-bounded container.
- [x] Replace sorting "Tabs" with semantic `Select` component.
- [x] Audit and cleanup shadcn components (Buttons, Icons, Fields).
- [x] Implement high-fidelity UI placeholders for Schools, Amenities, EIP, and Orientation in `DetailDrawer.tsx`.

## Phase 4: Comparison Data Integration
- [x] **Task 9: Data Fetching Implementation**: Update `src/lib/data.ts` to include `fetchComparisonArtifact(addressKey)`.
- [x] **Task 10: App State Integration**: Update `src/App.tsx` to load comparison data when a block is selected.
- [x] **Task 11: UI Data Binding**: Replace the "Pipeline coming soon" placeholders in `DetailDrawer.tsx` with real data from `AmenityComparison` and `PercentileRanks`.
- [x] **Task 12: Shortlist Comparison Update**: Bind the comparison data to the Shortlist view for side-by-side amenity analysis.

## Phase 5: Validation & Final Polish
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.
- [x] Run `bun run test`.
- [x] Final e2e smoke test for the new data bindings.

## Phase 6: Visual Context & Advanced Sharing
- [x] **Task 13: Map Radius Visualization**: Update `MapView.tsx` to render concentric 1km/2km shaded circles around the selected block.
- [x] **Task 14: Geolocate Integration**: Add a Geolocate control to the map UI with custom styling.
- [x] **Task 15: Copy All Summary**: Implement a "Copy All" button in `ShortlistDrawer` that formats the entire shortlist as a Markdown table for easy sharing.
- [x] **Task 16: Shortlist Market Badges**: Add tiny "Price Rank" and "MRT Rank" badges to the Shortlist cards for immediate side-by-side ranking comparison.
- [x] **Task 17: Dark Mode Reliability**: Add persistent theme preference and ensure core surfaces use semantic color tokens so dark mode renders correctly across desktop and mobile panels.

## Phase 7: Mobile Viewport Stability Hotfixes
- [x] Pin the app shell to viewport bounds so mobile browser zoom/tilt/resize cannot expose background gaps between map content and the bottom tab bar.
