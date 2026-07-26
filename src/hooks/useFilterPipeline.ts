import { useCallback, useMemo } from "react";
import {
  DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
  NEAR_ME_SEARCH_QUERY,
} from "@/shared/lib/constants";
import {
  createFilterEvaluationContext,
  resolveGeographicSearchIntent,
} from "@/shared/lib/filtering";
import {
  computeMapFilteredBlocks as computeMapFilteredBlocksCore,
  filterScopedBlocks as filterScopedBlocksCore,
  hasMapMarkerScope as hasMapMarkerScopeCore,
  hasResultScope as hasResultScopeCore,
} from "@shared/product/filter-pipeline";
import { passesAffordabilityMode } from "@/shared/lib/affordability";
import { getFuseMatchedKeys } from "@/features/search-profile/searchFuse";
import { hasCompletedSearchProfile } from "@/features/search-profile/searchProfile";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBlockLoading } from "@/hooks/useBlockLoading";
import { normalizeNumericFilterRangeOrder } from "@/shared/lib/queryState";
import type { BlockSummary, Coordinates, FilterState, Manifest } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import type { Translator } from "@/shared/lib/i18n";

type UseFilterPipelineOptions = {
  manifest: Manifest | null;
  rawFilters: FilterState;
  userLocation: Coordinates | null;
  resultsVisible?: boolean;
  savedVisible: boolean;
  shortlistCount: number;
  searchProfile: SearchProfile;
  t: Translator;
};

export function useFilterPipeline({
  manifest,
  rawFilters,
  userLocation,
  resultsVisible = true,
  savedVisible,
  shortlistCount,
  searchProfile,
  t,
}: UseFilterPipelineOptions) {
  // URL-backed filters are the complete result contract. Never inject a hidden
  // date constraint: null means no latest-sale cutoff.
  const effectiveFilters = useMemo(
    () => normalizeNumericFilterRangeOrder(rawFilters),
    [rawFilters],
  );

  // Hide the "near me" sentinel from the search input so it looks empty.
  const filterPanelFilters = useMemo(
    () => (rawFilters.search === NEAR_ME_SEARCH_QUERY ? { ...rawFilters, search: "" } : rawFilters),
    [rawFilters],
  );

  // "near me" is a sentinel that requires userLocation to resolve. Without a
  // location it must not run as a literal text search against blocks.
  const resolvedSearch = useMemo(
    () => (rawFilters.search === NEAR_ME_SEARCH_QUERY && !userLocation ? "" : rawFilters.search),
    [rawFilters.search, userLocation],
  );

  // 100ms debounce eliminates the stacked delay that caused the map and list
  // to fall out of sync during geographic searches.
  const debouncedSearch = useDebouncedValue(resolvedSearch, 100);

  const sortedTowns = useMemo(
    () => manifest?.filterOptions.towns.slice().sort((a, b) => b.length - a.length) ?? [],
    [manifest],
  );

  // Skip full-corpus load when a scope is already active (town/search/selectedAddress):
  // recommendations are only shown in the empty-scope state.
  // NOTE: hasInitialScope is the pre-blocks analogue of hasResultScope — it omits
  //       geographicIntent which depends on blocks loaded by useBlockLoading below.
  const hasInitialScope = Boolean(
    resultsVisible &&
    (effectiveFilters.town || resolvedSearch.trim() || rawFilters.selectedAddressKey),
  );

  const profileReadyForRecommendations =
    resultsVisible && hasCompletedSearchProfile(searchProfile) && !hasInitialScope;

  const coarseSearchParams = useMemo(
    () => ({
      flatType: effectiveFilters.flatType,
      flatModel: effectiveFilters.flatModel,
      budgetMin: effectiveFilters.budgetMin,
      budgetMax: effectiveFilters.budgetMax,
      areaMin: effectiveFilters.areaMin,
      areaMax: effectiveFilters.areaMax,
      remainingLeaseMin: effectiveFilters.remainingLeaseMin,
      startMonth: effectiveFilters.startMonth,
      endMonth: effectiveFilters.endMonth,
      mrtMax: effectiveFilters.mrtMax,
    }),
    [
      effectiveFilters.flatType,
      effectiveFilters.flatModel,
      effectiveFilters.budgetMin,
      effectiveFilters.budgetMax,
      effectiveFilters.areaMin,
      effectiveFilters.areaMax,
      effectiveFilters.remainingLeaseMin,
      effectiveFilters.startMonth,
      effectiveFilters.endMonth,
      effectiveFilters.mrtMax,
    ],
  );

  const {
    blocks,
    loadError,
    searchTruncated,
    refinementUnsupported,
    isLoading: blocksLoading,
    retry: retryBlockLoading,
  } = useBlockLoading({
    manifest,
    townFilter: effectiveFilters.town,
    debouncedSearch,
    userLocationPresent: Boolean(userLocation),
    selectedAddressKey: rawFilters.selectedAddressKey,
    sortedTowns,
    savedVisible,
    shortlistCount,
    needsAllBlocksForRecommendations: profileReadyForRecommendations,
    coarseSearchParams,
  });

  // O(1) address key lookup.
  const blocksByKey = useMemo(() => {
    const map = new Map<string, BlockSummary>();
    for (const block of blocks) {
      map.set(block.addressKey, block);
    }
    return map;
  }, [blocks]);

  // The affordability profile slice is the only piece of the search profile
  // that affects matchesFilter; memoise it so a stable identity feeds the
  // module-level verdict cache and the filter pipeline doesn't re-render when
  // unrelated profile fields change.
  const affordabilityProfile = useMemo(
    () => ({
      monthlyIncome: searchProfile.monthlyIncome,
      cpfOABalance: searchProfile.cpfOABalance,
      age: searchProfile.age,
      coApplicantAge: searchProfile.coApplicantAge,
    }),
    [
      searchProfile.monthlyIncome,
      searchProfile.cpfOABalance,
      searchProfile.age,
      searchProfile.coApplicantAge,
    ],
  );

  const stableFilters = useMemo(
    () => ({ ...effectiveFilters, search: resolvedSearch, selectedAddressKey: null }),
    // Intentional: list filter fields explicitly to avoid reference churn when
    // effectiveFilters is recreated without a meaningful filter value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      resolvedSearch,
      effectiveFilters.town,
      effectiveFilters.flatType,
      effectiveFilters.flatModel,
      effectiveFilters.budgetMin,
      effectiveFilters.budgetMax,
      effectiveFilters.areaMin,
      effectiveFilters.areaMax,
      effectiveFilters.remainingLeaseMin,
      effectiveFilters.startMonth,
      effectiveFilters.endMonth,
      effectiveFilters.mrtMax,
      effectiveFilters.affordable,
    ],
  );

  const mapFilters = useMemo(
    () => ({ ...stableFilters, search: debouncedSearch }),
    [debouncedSearch, stableFilters],
  );

  const filterEvaluationContext = useMemo(
    () => (stableFilters.remainingLeaseMin === null ? null : createFilterEvaluationContext()),
    [stableFilters.remainingLeaseMin],
  );

  const passesAffordabilityForBlock = useCallback(
    (block: BlockSummary) =>
      stableFilters.affordable
        ? passesAffordabilityMode(
            block,
            affordabilityProfile,
            stableFilters.affordable,
            stableFilters.flatType,
          )
        : null,
    [affordabilityProfile, stableFilters.affordable, stableFilters.flatType],
  );

  const resultsFuseMatchedKeys = useMemo(
    () => (stableFilters.search ? getFuseMatchedKeys(blocks, stableFilters.search) : null),
    [blocks, stableFilters.search],
  );

  const mapFuseMatchedKeys = useMemo(
    () => (mapFilters.search ? getFuseMatchedKeys(blocks, mapFilters.search) : null),
    [blocks, mapFilters.search],
  );

  const nearMeLabel = useMemo(() => t("filters.nearMe"), [t]);

  const geographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        effectiveFilters.search,
        blocks,
        effectiveFilters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
        userLocation,
        nearMeLabel,
      ),
    [blocks, effectiveFilters.mrtMax, effectiveFilters.search, userLocation, nearMeLabel],
  );

  const mapGeographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        mapFilters.search,
        blocks,
        mapFilters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
        userLocation,
        nearMeLabel,
      ),
    [blocks, mapFilters.mrtMax, mapFilters.search, userLocation, nearMeLabel],
  );

  // Use non-debounced geographicIntent as fallback so the map responds
  // immediately to geolocate (mapGeographicIntent lags by debouncedSearch delay).
  const effectiveMapGeographicIntent = mapGeographicIntent ?? geographicIntent;

  const hasResultScope = hasResultScopeCore(
    effectiveFilters.town,
    resolvedSearch,
    geographicIntent,
    rawFilters.selectedAddressKey,
  );

  const hasMapMarkerScope = hasMapMarkerScopeCore(
    mapFilters.town,
    mapFilters.search,
    effectiveMapGeographicIntent,
  );

  const filteredBlocks = useMemo(() => {
    if (!resultsVisible) return [];
    return filterScopedBlocksCore(
      blocks,
      stableFilters,
      geographicIntent,
      affordabilityProfile,
      resultsFuseMatchedKeys,
      filterEvaluationContext,
      passesAffordabilityForBlock,
    );
  }, [
    affordabilityProfile,
    blocks,
    filterEvaluationContext,
    geographicIntent,
    passesAffordabilityForBlock,
    resultsVisible,
    stableFilters,
    resultsFuseMatchedKeys,
  ]);

  const selectedAddressKey = rawFilters.selectedAddressKey;

  const mapFilteredBlocks = useMemo(() => {
    if (!hasMapMarkerScope) {
      if (!selectedAddressKey) return [];
      const selected = blocksByKey.get(selectedAddressKey) ?? null;
      return selected ? [selected] : [];
    }

    return computeMapFilteredBlocksCore(
      blocks,
      mapFilters,
      effectiveMapGeographicIntent,
      affordabilityProfile,
      mapFuseMatchedKeys,
      selectedAddressKey,
      blocksByKey,
      filterEvaluationContext?.currentYear ?? createFilterEvaluationContext().currentYear,
      passesAffordabilityForBlock,
    );
  }, [
    affordabilityProfile,
    blocksByKey,
    blocks,
    effectiveMapGeographicIntent,
    filterEvaluationContext?.currentYear,
    hasMapMarkerScope,
    mapFilters,
    passesAffordabilityForBlock,
    selectedAddressKey,
    mapFuseMatchedKeys,
  ]);

  return useMemo(
    () => ({
      effectiveFilters,
      filterPanelFilters,
      resolvedSearch,
      debouncedSearch,
      sortedTowns,
      stableFilters,
      mapFilters,
      geographicIntent,
      effectiveMapGeographicIntent,
      hasResultScope,
      hasMapMarkerScope,
      blocks,
      blocksLoading,
      loadError,
      retryBlockLoading,
      searchTruncated,
      refinementUnsupported,
      filteredBlocks,
      mapFilteredBlocks,
      blocksByKey,
    }),
    [
      effectiveFilters,
      filterPanelFilters,
      resolvedSearch,
      debouncedSearch,
      sortedTowns,
      stableFilters,
      mapFilters,
      geographicIntent,
      effectiveMapGeographicIntent,
      hasResultScope,
      hasMapMarkerScope,
      blocks,
      blocksLoading,
      loadError,
      retryBlockLoading,
      searchTruncated,
      refinementUnsupported,
      filteredBlocks,
      mapFilteredBlocks,
      blocksByKey,
    ],
  );
}
