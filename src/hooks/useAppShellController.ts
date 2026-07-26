import { useCallback } from "react";
import { NEAR_ME_SEARCH_QUERY } from "@/shared/lib/constants";
import { filterPatchForSuggestion } from "@/features/search-profile/suggestActions";
import type { FilterState, Suggestion } from "@/types/data";
import type { LeftTab, PanelTab } from "@/hooks/usePanelState";

type UseAppShellControllerOptions = {
  filters: FilterState;
  patchFilters: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;
  clearGeolocationError: () => void;
  cancelPendingGeolocationRequest: () => void;
  isDesktop: boolean;
  setLeftTab: (tab: LeftTab) => void;
  setIsLeftPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  setMobileTab: (next: PanelTab | null | ((current: PanelTab | null) => PanelTab | null)) => void;
  setIsSavedPanelOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  isSavedPanelOpen: boolean;
  listingCheckAddressKey: string | null;
  prepareListingCheckForAddress: (addressKey: string) => void;
  toggleShortlist: (addressKey: string) => void;
  leftTab: LeftTab;
};

export function useAppShellController({
  filters,
  patchFilters,
  resetFilters,
  clearGeolocationError,
  cancelPendingGeolocationRequest,
  isDesktop,
  setLeftTab,
  setIsLeftPanelOpen,
  setMobileTab,
  setIsSavedPanelOpen,
  isSavedPanelOpen,
  listingCheckAddressKey,
  prepareListingCheckForAddress,
  toggleShortlist,
  leftTab,
}: UseAppShellControllerOptions) {
  const patchUserFilters = useCallback(
    (patch: Partial<FilterState>) => {
      if ("search" in patch || "town" in patch || "selectedAddressKey" in patch) {
        clearGeolocationError();
      }
      const resolved =
        "town" in patch && filters.search === NEAR_ME_SEARCH_QUERY
          ? { ...patch, search: "" }
          : patch;
      patchFilters(resolved);
    },
    [patchFilters, clearGeolocationError, filters.search],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.group === "block") {
        if (isDesktop) {
          setLeftTab("results");
          setIsLeftPanelOpen(true);
          setIsSavedPanelOpen(false);
        } else {
          setMobileTab("results");
        }
      }
      patchUserFilters(filterPatchForSuggestion(suggestion));
    },
    [
      isDesktop,
      patchUserFilters,
      setIsLeftPanelOpen,
      setIsSavedPanelOpen,
      setLeftTab,
      setMobileTab,
    ],
  );

  const handleResetFilters = useCallback(() => {
    clearGeolocationError();
    resetFilters();
  }, [clearGeolocationError, resetFilters]);

  const handleSelectAddress = useCallback(
    (addressKey: string) => {
      if (isDesktop) {
        setIsLeftPanelOpen(true);
        setLeftTab("results");
        setIsSavedPanelOpen(false);
      } else {
        setMobileTab("results");
      }
      patchFilters({ selectedAddressKey: addressKey });
    },
    [isDesktop, setIsLeftPanelOpen, setIsSavedPanelOpen, setLeftTab, setMobileTab, patchFilters],
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
        setIsSavedPanelOpen(false);
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
      setIsSavedPanelOpen,
      setMobileTab,
    ],
  );

  const handleOpenFilters = useCallback(() => {
    if (isDesktop) {
      setLeftTab("filters");
      setIsLeftPanelOpen(true);
      setIsSavedPanelOpen(false);
      return;
    }
    setMobileTab("filters");
  }, [isDesktop, setLeftTab, setIsLeftPanelOpen, setIsSavedPanelOpen, setMobileTab]);

  const handleDesktopFiltersClick = useCallback(() => {
    setIsSavedPanelOpen(false);
    setLeftTab("filters");
    setIsLeftPanelOpen((current) => (leftTab === "filters" ? !current : true));
  }, [setIsSavedPanelOpen, setLeftTab, setIsLeftPanelOpen, leftTab]);

  const handleDesktopResultsClick = useCallback(() => {
    setIsSavedPanelOpen(false);
    setLeftTab("results");
    setIsLeftPanelOpen((current) => (leftTab === "results" ? !current : true));
  }, [setIsSavedPanelOpen, setLeftTab, setIsLeftPanelOpen, leftTab]);

  const handleDesktopSavedClick = useCallback(() => {
    const next = !isSavedPanelOpen;
    setIsSavedPanelOpen(next);
    if (next) {
      setIsLeftPanelOpen(false);
    }
  }, [isSavedPanelOpen, setIsLeftPanelOpen, setIsSavedPanelOpen]);

  const handleDesktopCheckClick = useCallback(() => {
    if (filters.selectedAddressKey && !listingCheckAddressKey) {
      prepareListingCheckForAddress(filters.selectedAddressKey);
    }
    setIsSavedPanelOpen(false);
    setLeftTab("check");
    setIsLeftPanelOpen((current) => (leftTab === "check" ? !current : true));
  }, [
    filters.selectedAddressKey,
    leftTab,
    listingCheckAddressKey,
    prepareListingCheckForAddress,
    setIsLeftPanelOpen,
    setIsSavedPanelOpen,
    setLeftTab,
  ]);

  const handleMobileFiltersClick = useCallback(() => {
    setMobileTab((current) => (current === "filters" ? null : "filters"));
  }, [setMobileTab]);

  const handleMobileMapClick = useCallback(() => {
    setMobileTab(null);
  }, [setMobileTab]);

  const handleMobileResultsClick = useCallback(() => {
    setMobileTab((current) => (current === "results" ? null : "results"));
  }, [setMobileTab]);

  const handleMobileCheckClick = useCallback(() => {
    if (filters.selectedAddressKey && !listingCheckAddressKey) {
      prepareListingCheckForAddress(filters.selectedAddressKey);
    }
    setMobileTab((current) => (current === "check" ? null : "check"));
  }, [
    filters.selectedAddressKey,
    listingCheckAddressKey,
    prepareListingCheckForAddress,
    setMobileTab,
  ]);

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
    handleMobileMapClick,
    handleMobileFiltersClick,
    handleMobileResultsClick,
    handleMobileCheckClick,
    handleMobileSavedClick,
  };
}
