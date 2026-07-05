/**
 * Platform-neutral filter pipeline functions.
 *
 * Extracts deterministic block-filtering and scope-detection logic from the
 * React `useFilterPipeline` hook. The hook becomes an adapter that feeds
 * debounced/URL-resolved inputs into these pure functions.
 */

import type { BlockSummary, FilterState } from "../data-types";
import {
  type GeographicSearchIntent,
  type FilterEvaluationContext,
  matchesFilter,
  matchesGeographicSearchIntent,
} from "./filtering";
import { applyProfileVisibility, type SearchProfile } from "./search-profile";
import type { AffordabilityProfile } from "./affordability";

// ── Pure pipeline functions ──────────────────────────────────────────────

/**
 * Filter a set of blocks against the given filters, geographic intent,
 * affordability profile, and optional Fuse.js pre-matched keys.
 *
 * This is the pure core of the web app's `filterScopedBlocks` callback.
 * No React, no hooks, no debouncing — just deterministic block filtering.
 */
export function filterScopedBlocks(
  blocks: BlockSummary[],
  filters: FilterState & { selectedAddressKey: null },
  geographicIntent: GeographicSearchIntent | null | undefined,
  affordabilityProfile: AffordabilityProfile | null | undefined,
  fuseMatchedKeys: ReadonlySet<string> | null | undefined,
  evaluationContext: FilterEvaluationContext | null | undefined,
  passesAffordabilityForBlock: ((block: BlockSummary) => boolean | null) | null | undefined,
): BlockSummary[] {
  return blocks.filter((block) => {
    if (
      !matchesFilter(
        block,
        filters,
        geographicIntent,
        affordabilityProfile,
        fuseMatchedKeys,
        evaluationContext,
        passesAffordabilityForBlock ? passesAffordabilityForBlock(block) : null,
      )
    )
      return false;
    return geographicIntent ? matchesGeographicSearchIntent(block, geographicIntent) : true;
  });
}

/**
 * Compute map-filtered blocks with selected-address inclusion semantics.
 *
 * When a `selectedAddressKey` is set and the selected block is not already
 * in the filtered set, it is appended. This ensures the map always shows
 * the user's selected block even if it doesn't match current filters.
 */
export function computeMapFilteredBlocks(
  blocks: BlockSummary[],
  mapFilters: FilterState & { selectedAddressKey: null },
  geographicIntent: GeographicSearchIntent | null | undefined,
  affordabilityProfile: AffordabilityProfile | null | undefined,
  searchProfile: SearchProfile,
  fuseMatchedKeys: ReadonlySet<string> | null | undefined,
  selectedAddressKey: string | null,
  blocksByKey: Map<string, BlockSummary>,
  currentYear: number,
  passesAffordabilityForBlock: ((block: BlockSummary) => boolean | null) | null | undefined,
): BlockSummary[] {
  const scopedBlocks = applyProfileVisibility(
    filterScopedBlocks(
      blocks,
      mapFilters,
      geographicIntent,
      affordabilityProfile,
      fuseMatchedKeys,
      null,
      passesAffordabilityForBlock,
    ),
    searchProfile,
    currentYear,
  );

  if (!selectedAddressKey) return scopedBlocks;

  if (scopedBlocks.some((block) => block.addressKey === selectedAddressKey)) {
    return scopedBlocks;
  }

  const selected = blocksByKey.get(selectedAddressKey) ?? null;
  return selected ? [...scopedBlocks, selected] : scopedBlocks;
}

/**
 * Determine whether there is any active filter/search/selection state,
 * independent of which panel is visible.
 */
export function hasResultScope(
  town: string,
  resolvedSearch: string,
  geographicIntent: GeographicSearchIntent | null | undefined,
  selectedAddressKey: string | null,
): boolean {
  return Boolean(town || resolvedSearch.trim() || geographicIntent || selectedAddressKey);
}

/**
 * Determine whether the map has enough scope to show markers.
 * selectedAddressKey is intentionally excluded: a single-block selection has
 * too few data points to render a meaningful heatmap.
 */
export function hasMapMarkerScope(
  town: string,
  search: string,
  geographicIntent: GeographicSearchIntent | null | undefined,
): boolean {
  return Boolean(town || search.trim() || geographicIntent);
}
