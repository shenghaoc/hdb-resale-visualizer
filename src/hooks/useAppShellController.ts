import { useCallback } from "react";
import { NEAR_ME_SEARCH_QUERY } from "@/shared/lib/constants";
import { filterPatchForSuggestion } from "@/features/search-profile/suggestActions";
import type { FilterState, Suggestion } from "@/types/data";
import type { LeftTab, PanelTab } from "@/hooks/usePanelState";

type UseAppShellControllerOptions = {
  filters: FilterState;
  patchFilters: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;
  setUseDefaultStartMonth: (next: boolean) => void;
  clearGeolocationError: () => void;
  cancelPendingGeolocationRequest: () => void;
  isDesktop: boolean;
  setLeftTab: (tab: LeftTab) => void;
  setIsLeftPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  setMobileTab: (next: PanelTab | null | ((current: PanelTab | null) => PanelTab | null)) => void;
  setIsSavedPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;
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
  isDesktop,
  setLeftTab,
  setIsLeftPanelOpen,
  setMobileTab,
  setIsSavedPanelOpen,
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
