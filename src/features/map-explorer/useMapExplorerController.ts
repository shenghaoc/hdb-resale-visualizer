import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { NEAR_ME_SEARCH_QUERY } from "@/shared/lib/constants";
import type { LeftTab, PanelTab } from "@/hooks/usePanelState";
import type { GeographicSearchIntent } from "@/shared/lib/filtering";
import type { ComparisonArtifact, Coordinates, FilterState } from "@/types/data";
import { getPrimarySchoolsForOverlay } from "./school-proximity";
import { useGeolocation } from "./useGeolocation";
import { usePriceHeatmap } from "./usePriceHeatmap";

export type UseMapExplorerControllerOptions = {
  filters: FilterState;
  patchFilters: (patch: Partial<FilterState>) => void;

  geographicIntent: GeographicSearchIntent | null;
  mapSearch: string;
  hasMapMarkerScope: boolean;

  selectedComparison: ComparisonArtifact | null;
  isComparisonLoading: boolean;

  isDesktop: boolean;
  controlsVisible: boolean;

  setLeftTab: (tab: LeftTab) => void;
  setIsLeftPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  setMobileTab: (next: PanelTab | null | ((current: PanelTab | null) => PanelTab | null)) => void;
  setIsSavedPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;

  hasInteractedWithMap: boolean;
  setIsHeaderVisible: (next: boolean | ((current: boolean) => boolean)) => void;
  setHasInteractedWithMap: (next: boolean | ((current: boolean) => boolean)) => void;

  geolocation: ReturnType<typeof useGeolocation>;
  onCannotLocate: () => void;
};

export type FloatingControlStyle = CSSProperties;

export function useMapExplorerController({
  filters,
  patchFilters,
  geographicIntent,
  mapSearch,
  hasMapMarkerScope,
  selectedComparison,
  isComparisonLoading,
  isDesktop,
  controlsVisible,
  setLeftTab,
  setIsLeftPanelOpen,
  setMobileTab,
  setIsSavedPanelOpen,
  hasInteractedWithMap,
  setIsHeaderVisible,
  setHasInteractedWithMap,
  geolocation,
  onCannotLocate,
}: UseMapExplorerControllerOptions) {
  const {
    setUserLocation,
    clearError: clearGeolocationError,
    locate,
    geolocationError,
    isLocating,
  } = geolocation;
  const heatmap = usePriceHeatmap();
  const [schoolOverlayEnabled, setSchoolOverlayEnabled] = useState(false);
  const [mrtEnabled, setMrtEnabled] = useState(false);

  const primarySchoolsForOverlay = useMemo(
    () => getPrimarySchoolsForOverlay(selectedComparison?.amenities.nearestPrimarySchools ?? []),
    [selectedComparison],
  );
  const schoolOverlayAvailable = primarySchoolsForOverlay.length > 0;
  const hasBlockSelection = Boolean(filters.selectedAddressKey);
  const schoolOverlayLoading = hasBlockSelection && isComparisonLoading;
  const effectiveSchoolOverlayEnabled = schoolOverlayEnabled && schoolOverlayAvailable;

  const autoFitKey = useMemo(() => {
    if (geographicIntent?.type === "coordinates") {
      return `coordinates:${geographicIntent.coordinates.lat},${geographicIntent.coordinates.lng}`;
    }
    if (geographicIntent?.type === "station") {
      return `station:${geographicIntent.stationName.toLowerCase()}`;
    }
    const trimmedSearch = mapSearch.trim();
    if (trimmedSearch) {
      return `search:${trimmedSearch.toLowerCase()}`;
    }
    return null;
  }, [geographicIntent, mapSearch]);

  const toggleMrt = useCallback(() => {
    setMrtEnabled((value) => !value);
  }, []);

  const toggleSchoolOverlay = useCallback(() => {
    setSchoolOverlayEnabled((value) => !value);
  }, []);

  const handleGeolocate = useCallback(
    (coords: Coordinates) => {
      setUserLocation(coords);
      clearGeolocationError();
      patchFilters({ search: NEAR_ME_SEARCH_QUERY, town: "", selectedAddressKey: null });
      if (isDesktop) {
        setLeftTab("results");
        setIsLeftPanelOpen(true);
      }
    },
    [
      setUserLocation,
      clearGeolocationError,
      patchFilters,
      isDesktop,
      setLeftTab,
      setIsLeftPanelOpen,
    ],
  );

  const handleUseCurrentLocation = useCallback(() => {
    locate(
      (coords) => {
        patchFilters({ search: NEAR_ME_SEARCH_QUERY, town: "", selectedAddressKey: null });
        if (isDesktop) {
          setLeftTab("results");
          setIsLeftPanelOpen(true);
        }
        // Mobile: stay on map so nearby markers are visible once scope resolves.
        // The geo hook already called setUserLocation before invoking this callback.
        void coords;
      },
      () => onCannotLocate(),
    );
  }, [locate, patchFilters, isDesktop, setLeftTab, setIsLeftPanelOpen, onCannotLocate]);

  const handleMapInteract = useCallback(
    (interactionType: "background" | "feature" = "background") => {
      if (!hasInteractedWithMap) {
        if (isDesktop) setIsHeaderVisible(false);
        setHasInteractedWithMap(true);
      }
      if (interactionType === "feature") return;
      if (isDesktop) {
        setIsLeftPanelOpen(false);
        setIsSavedPanelOpen(false);
        return;
      }
      setMobileTab(null);
    },
    [
      hasInteractedWithMap,
      isDesktop,
      setIsHeaderVisible,
      setHasInteractedWithMap,
      setIsLeftPanelOpen,
      setIsSavedPanelOpen,
      setMobileTab,
    ],
  );

  const heatmapControlStyle = useMemo<FloatingControlStyle>(
    () => ({
      bottom: isDesktop
        ? hasMapMarkerScope
          ? "7.5rem"
          : "4rem"
        : hasMapMarkerScope
          ? "11.5rem"
          : "8rem",
      right: isDesktop ? "4.5rem" : "0.75rem",
    }),
    [isDesktop, hasMapMarkerScope],
  );

  const amenityControlStyle = useMemo<FloatingControlStyle>(
    () => ({
      bottom: isDesktop
        ? hasMapMarkerScope
          ? "11rem"
          : "7.5rem"
        : hasMapMarkerScope
          ? "15rem"
          : "11.5rem",
      right: isDesktop ? "4.5rem" : "0.75rem",
    }),
    [isDesktop, hasMapMarkerScope],
  );

  return useMemo(
    () => ({
      // Heatmap
      priceHeatmapEnabled: heatmap.priceHeatmapEnabled,
      priceHeatmapOpacity: heatmap.priceHeatmapOpacity,
      heatmapMode: heatmap.heatmapMode,
      togglePriceHeatmap: heatmap.togglePriceHeatmap,
      setPriceHeatmapOpacity: heatmap.setPriceHeatmapOpacity,
      setHeatmapMode: heatmap.setHeatmapMode,

      // Amenity overlays
      mrtEnabled,
      schoolOverlayEnabled,
      schoolOverlayAvailable,
      schoolOverlayLoading,
      hasBlockSelection,
      primarySchoolsForOverlay,
      effectiveSchoolOverlayEnabled,
      toggleMrt,
      toggleSchoolOverlay,

      // Fit / interaction
      autoFitKey,
      handleGeolocate,
      handleUseCurrentLocation,
      handleMapInteract,

      // Geolocation surface for ScopePrompt
      geolocationError,
      isLocating,

      // Floating control layout
      controlsVisible,
      heatmapControlStyle,
      amenityControlStyle,
    }),
    [
      heatmap.priceHeatmapEnabled,
      heatmap.priceHeatmapOpacity,
      heatmap.heatmapMode,
      heatmap.togglePriceHeatmap,
      heatmap.setPriceHeatmapOpacity,
      heatmap.setHeatmapMode,
      mrtEnabled,
      schoolOverlayEnabled,
      schoolOverlayAvailable,
      schoolOverlayLoading,
      hasBlockSelection,
      primarySchoolsForOverlay,
      effectiveSchoolOverlayEnabled,
      toggleMrt,
      toggleSchoolOverlay,
      autoFitKey,
      handleGeolocate,
      handleUseCurrentLocation,
      handleMapInteract,
      geolocationError,
      isLocating,
      controlsVisible,
      heatmapControlStyle,
      amenityControlStyle,
    ],
  );
}
