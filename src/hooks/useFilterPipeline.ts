import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
  getDefaultTransactionStartMonth,
  NEAR_ME_SEARCH_QUERY,
} from "@/lib/constants";
import {
  matchesFilter,
  matchesGeographicSearchIntent,
  resolveGeographicSearchIntent,
} from "@/lib/filtering";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBlockLoading } from "@/hooks/useBlockLoading";
import type { BlockSummary, Coordinates, FilterState, Manifest } from "@/types/data";
import type { Translator } from "@/lib/i18n";

type UseFilterPipelineOptions = {
  manifest: Manifest | null;
  rawFilters: FilterState;
  userLocation: Coordinates | null;
  resultsVisible: boolean;
  savedVisible: boolean;
  shortlistCount: number;
  t: Translator;
};

export function useFilterPipeline({
  manifest,
  rawFilters,
  userLocation,
  resultsVisible,
  savedVisible,
  shortlistCount,
  t,
}: UseFilterPipelineOptions) {
  // Tracks whether the start month is still at its default (not explicitly set
  // by the user). When true, effectiveFilters injects the computed default so
  // the URL stays clean while the filter still operates correctly.
  const [useDefaultStartMonth, setUseDefaultStartMonth] = useState(() => {
    if (typeof window === "undefined") return true;
    return !new URLSearchParams(window.location.search).has("startMonth");
  });

  const defaultStartMonth = useMemo(
    () =>
      manifest
        ? getDefaultTransactionStartMonth(
            manifest.dataWindow.minMonth,
            manifest.dataWindow.maxMonth,
          )
        : null,
    [manifest],
  );

  const effectiveFilters = useMemo(
    () =>
      useDefaultStartMonth && defaultStartMonth && rawFilters.startMonth === null
        ? { ...rawFilters, startMonth: defaultStartMonth }
        : rawFilters,
    [defaultStartMonth, rawFilters, useDefaultStartMonth],
  );

  // Hide the "near me" sentinel from the search input so it looks empty.
  const filterPanelFilters = useMemo(
    () =>
      effectiveFilters.search === NEAR_ME_SEARCH_QUERY
        ? { ...effectiveFilters, search: "" }
        : effectiveFilters,
    [effectiveFilters],
  );

  // "near me" is a sentinel that requires userLocation to resolve. Without a
  // location it must not run as a literal text search against blocks.
  const resolvedSearch = useMemo(
    () =>
      rawFilters.search === NEAR_ME_SEARCH_QUERY && !userLocation ? "" : rawFilters.search,
    [rawFilters.search, userLocation],
  );

  // 100ms debounce eliminates the stacked delay that caused the map and list
  // to fall out of sync during geographic searches.
  const debouncedSearch = useDebouncedValue(resolvedSearch, 100);

  const sortedTowns = useMemo(
    () => manifest?.filterOptions.towns.slice().sort((a, b) => b.length - a.length) ?? [],
    [manifest],
  );

  const { blocks, loadError } = useBlockLoading({
    manifest,
    townFilter: effectiveFilters.town,
    debouncedSearch,
    userLocationPresent: Boolean(userLocation),
    selectedAddressKey: rawFilters.selectedAddressKey,
    sortedTowns,
    savedVisible,
    shortlistCount,
  });

  // O(1) address key lookup.
  const blocksByKey = useMemo(() => {
    const map = new Map<string, BlockSummary>();
    for (const block of blocks) {
      map.set(block.addressKey, block);
    }
    return map;
  }, [blocks]);

  // Shared single-pass filter function for both the results pane and map pane.
  const filterScopedBlocks = useCallback(
    (
      scopeBlocks: BlockSummary[],
      scopeFilters: FilterState & { selectedAddressKey: null },
      scopeIntent: ReturnType<typeof resolveGeographicSearchIntent>,
    ) =>
      scopeBlocks.filter((block) => {
        if (!matchesFilter(block, scopeFilters, scopeIntent)) return false;
        return scopeIntent ? matchesGeographicSearchIntent(block, scopeIntent) : true;
      }),
    [],
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
    ],
  );

  const mapFilters = useMemo(
    () => ({ ...stableFilters, search: debouncedSearch }),
    [debouncedSearch, stableFilters],
  );

  const geographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        effectiveFilters.search,
        blocks,
        effectiveFilters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
        userLocation,
        t("filters.nearMe"),
      ),
    [blocks, effectiveFilters.mrtMax, effectiveFilters.search, userLocation, t],
  );

  const mapGeographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        mapFilters.search,
        blocks,
        mapFilters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
        userLocation,
        t("filters.nearMe"),
      ),
    [blocks, mapFilters.mrtMax, mapFilters.search, userLocation, t],
  );

  // Use non-debounced geographicIntent as fallback so the map responds
  // immediately to geolocate (mapGeographicIntent lags by debouncedSearch delay).
  const effectiveMapGeographicIntent = mapGeographicIntent ?? geographicIntent;

  const hasResultScope = Boolean(
    effectiveFilters.town ||
      resolvedSearch.trim() ||
      geographicIntent ||
      rawFilters.selectedAddressKey,
  );

  const hasMapMarkerScope = Boolean(
    mapFilters.town || mapFilters.search.trim() || effectiveMapGeographicIntent,
  );

  const filteredBlocks = useMemo(
    () =>
      resultsVisible && hasResultScope
        ? filterScopedBlocks(blocks, stableFilters, geographicIntent)
        : [],
    [blocks, filterScopedBlocks, geographicIntent, hasResultScope, resultsVisible, stableFilters],
  );

  const selectedAddressKey = rawFilters.selectedAddressKey;

  const mapFilteredBlocks = useMemo(() => {
    const scopedBlocks = hasMapMarkerScope
      ? filterScopedBlocks(blocks, mapFilters, effectiveMapGeographicIntent)
      : [];

    if (!selectedAddressKey) return scopedBlocks;

    if (scopedBlocks.some((block) => block.addressKey === selectedAddressKey)) {
      return scopedBlocks;
    }

    const selected = blocksByKey.get(selectedAddressKey) ?? null;
    return selected ? [...scopedBlocks, selected] : scopedBlocks;
  }, [
    blocksByKey,
    blocks,
    effectiveMapGeographicIntent,
    filterScopedBlocks,
    hasMapMarkerScope,
    mapFilters,
    selectedAddressKey,
  ]);

  return {
    useDefaultStartMonth,
    setUseDefaultStartMonth,
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
    loadError,
    filteredBlocks,
    mapFilteredBlocks,
    blocksByKey,
  };
}
