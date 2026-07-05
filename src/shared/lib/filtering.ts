/**
 * Web adapter for the shared filtering module.
 *
 * Re-exports the platform-neutral filtering logic from `shared/product/filtering`
 * and adds web-specific convenience wrappers (getCurrentYear defaults, affordability
 * caching integration, filter options builder).
 */

import type { BlockSummary } from "../../types/data";
import { getCurrentYear } from "./constants";
import { buildFilterOptions } from "../../../shared/filter-options";
import { passesAffordabilityMode, type AffordabilityProfile } from "./affordability";

export type { GeographicSearchIntent, FilterEvaluationContext } from "@shared/product/filtering";

export {
  matchesGeographicSearchIntent,
  getEffectiveMedianPrice,
  getEffectivePricePerSqmMedian,
  resetFilteringCachesForTests,
} from "@shared/product/filtering";

import {
  matchesFilter as _matchesFilter,
  resolveGeographicSearchIntent as _resolveGeographicSearchIntent,
  createFilterEvaluationContext as _createFilterEvaluationContext,
  type GeographicSearchIntent,
  type FilterEvaluationContext,
} from "@shared/product/filtering";
import type { Coordinates, FilterState } from "../../types/data";

export function createFilterEvaluationContext(): FilterEvaluationContext {
  return _createFilterEvaluationContext(getCurrentYear());
}

export function resolveGeographicSearchIntent(
  query: string,
  blocks: BlockSummary[],
  radiusMeters: number,
  userLocation?: Coordinates | null,
  nearMeQuery?: string,
): GeographicSearchIntent | null {
  return _resolveGeographicSearchIntent(query, blocks, radiusMeters, userLocation, nearMeQuery);
}

/**
 * Web adapter for the shared matchesFilter predicate.
 *
 * Integrates with the web's affordability caching layer by computing
 * `passesAffordabilityMode` for each block before delegating to the
 * shared predicate.
 */
export function matchesFilter(
  block: BlockSummary,
  filters: FilterState,
  geographicIntent?: GeographicSearchIntent | null,
  affordabilityProfile?: AffordabilityProfile | null,
  fuseMatchedKeys?: ReadonlySet<string> | null,
  evaluationContext?: FilterEvaluationContext | null,
): boolean {
  // Pre-compute affordability pass/fail using the web's cached verdict layer.
  let passesAffordability: boolean | null = null;
  if (filters.affordable && affordabilityProfile) {
    passesAffordability = passesAffordabilityMode(block, affordabilityProfile, filters.affordable);
  }

  return _matchesFilter(
    block,
    filters,
    geographicIntent,
    affordabilityProfile,
    fuseMatchedKeys,
    evaluationContext,
    passesAffordability,
  );
}

export function getFilterOptions(blocks: BlockSummary[]) {
  return buildFilterOptions(blocks);
}
