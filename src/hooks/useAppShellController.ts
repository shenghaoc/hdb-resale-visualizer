import { useCallback } from "react";
import { NEAR_ME_SEARCH_QUERY } from "@/shared/lib/constants";
import { filterPatchForSuggestion } from "@/features/search-profile/suggestActions";
import type { FilterState, Suggestion } from "@/types/data";
import type { LeftTab, PanelTab } from "@/hooks/usePanelState";
import type { Coordinates } from "@/types/data";

type UseAppShellControllerOptions = {
  filters: FilterState;
  patchFilters: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;
  setUseDefaultStartMonth: (next: boolean) => void;
  clearGeolocationError: () => void;
  cancelPendingGeolocationRequest: () => void;
  locate: (onSuccess: (coords: Coordinates) => void, onCannotLocate?: () => void) => void;
  setUserLocation: (coords: Coordinates) => void;
  isDesktop: boolean;
  setLeftTab: (tab: LeftTab) => void;
  setIsLeftPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  setMobileTab: (next: PanelTab | null | ((current: PanelTab | null) => PanelTab | null)) => void;
  setIsSavedPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  hasInteractedWithMap: boolean;
  setIsHeaderVisible: (next: boolean | ((current: boolean) => boolean)) => void;
  setHasInteractedWithMap: (next: boolean | ((current: boolean) => boolean)) => void;
  toggleShortlist: (addressKey: string) => void;
  leftTab: LeftTab;
};

export function useAppShellController({
  filters,
  patchFilters,
  resetFilters,
  setUseDefaultStartMonth,
  clearGeolocationError,
  cancelPendingGeolocationRequest,
  locate,
  setUserLocation,
  isDesktop,
  setLeftTab,
  setIsLeftPanelOpen,
  setMobileTab,
  setIsSavedPanelOpen,
  hasInteractedWithMap,
  setIsHeaderVisible,
  setHasInteractedWithMap,
  toggleShortlist,
  leftTab,
}: UseAppShellControllerOptions) {
  const patchUserFilters = useCallback(
    (patch: Partial<FilterState>) => {
      if ("startMonth" in patch) {
        setUseDefaultStartMonth(false);
      }
      if ("search" in patch || "town" in patch || "selectedAddressKey" in patch) {
        clearGeolocationError();
      }
      const resolved =
        "town" in patch && filters.search === NEAR_ME_SEARCH_QUERY
          ? { ...patch, search: "" }
          : patch;
      patchFilters(resolved);
    },
    [patchFilters, setUseDefaultStartMonth, clearGeolocationError, filters.search],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      patchUserFilters(filterPatchForSuggestion(suggestion));
    },
    [patchUserFilters],
  );

  const handleResetFilters = useCallback(() => {
    setUseDefaultStartMonth(true);
    clearGeolocationError();
    resetFilters();
  }, [setUseDefaultStartMonth, clearGeolocationError, resetFilters]);

  const handleSelectAddress = useCallback(
    (addressKey: string) => {
      if (isDesktop) {
        setIsLeftPanelOpen(true);
        setLeftTab("results");
      } else {
        setMobileTab("results");
      }
      patchFilters({ selectedAddressKey: addressKey });
    },
    [isDesktop, setIsLeftPanelOpen, setLeftTab, setMobileTab, patchFilters],
  );

  const handleToggleShortlist = useCallback(
    (addressKey: string) => toggleShortlist(addressKey),
    [toggleShortlist],
  );

  const handleChooseTown = useCallback(
    (options?: { clearGeolocationError?: boolean }) => {
      if (options?.clearGeolocationError !== false) clearGeolocationError();
      cancelPendingGeolocationRequest();
      if (isDesktop) {
        setLeftTab("filters");
        setIsLeftPanelOpen(true);
        return;
      }
      setMobileTab("filters");
    },
    [
      clearGeolocationError,
      cancelPendingGeolocationRequest,
      isDesktop,
      setLeftTab,
      setIsLeftPanelOpen,
      setMobileTab,
    ],
  );

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
      () => handleChooseTown({ clearGeolocationError: false }),
    );
  }, [locate, patchFilters, isDesktop, setLeftTab, setIsLeftPanelOpen, handleChooseTown]);

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

  const handleOpenFilters = useCallback(() => {
    if (isDesktop) {
      setLeftTab("filters");
      setIsLeftPanelOpen(true);
      return;
    }
    setMobileTab("filters");
  }, [isDesktop, setLeftTab, setIsLeftPanelOpen, setMobileTab]);

  const handleDesktopFiltersClick = useCallback(() => {
    setLeftTab("filters");
    setIsLeftPanelOpen((current) => (leftTab === "filters" ? !current : true));
  }, [setLeftTab, setIsLeftPanelOpen, leftTab]);

  const handleDesktopResultsClick = useCallback(() => {
    setLeftTab("results");
    setIsLeftPanelOpen((current) => (leftTab === "results" ? !current : true));
  }, [setLeftTab, setIsLeftPanelOpen, leftTab]);

  const handleDesktopSavedClick = useCallback(() => {
    setIsSavedPanelOpen((current) => !current);
  }, [setIsSavedPanelOpen]);

  const handleDesktopCheckClick = useCallback(() => {
    setLeftTab("check");
    setIsLeftPanelOpen((current) => (leftTab === "check" ? !current : true));
  }, [setLeftTab, setIsLeftPanelOpen, leftTab]);

  const handleMobileFiltersClick = useCallback(() => {
    setMobileTab((current) => (current === "filters" ? null : "filters"));
  }, [setMobileTab]);

  const handleMobileResultsClick = useCallback(() => {
    setMobileTab((current) => (current === "results" ? null : "results"));
  }, [setMobileTab]);

  const handleMobileCheckClick = useCallback(() => {
    setMobileTab((current) => (current === "check" ? null : "check"));
  }, [setMobileTab]);

  const handleMobileSavedClick = useCallback(() => {
    setMobileTab((current) => (current === "saved" ? null : "saved"));
  }, [setMobileTab]);

  return {
    patchUserFilters,
    handleSelectSuggestion,
    handleResetFilters,
    handleSelectAddress,
    handleToggleShortlist,
    handleChooseTown,
    handleGeolocate,
    handleUseCurrentLocation,
    handleMapInteract,
    handleOpenFilters,
    handleDesktopFiltersClick,
    handleDesktopResultsClick,
    handleDesktopCheckClick,
    handleDesktopSavedClick,
    handleMobileFiltersClick,
    handleMobileResultsClick,
    handleMobileCheckClick,
    handleMobileSavedClick,
  };
}
