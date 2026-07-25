import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { useAppShellController } from "@/hooks/useAppShellController";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";

type Options = Parameters<typeof useAppShellController>[0];

function makeOptions(overrides: Partial<Options> = {}): Options {
  return {
    filters: DEFAULT_FILTERS,
    patchFilters: vi.fn(),
    resetFilters: vi.fn(),
    setUseDefaultStartMonth: vi.fn(),
    clearGeolocationError: vi.fn(),
    cancelPendingGeolocationRequest: vi.fn(),
    isDesktop: true,
    setLeftTab: vi.fn(),
    setIsLeftPanelOpen: vi.fn(),
    setMobileTab: vi.fn(),
    setIsSavedPanelOpen: vi.fn(),
    isSavedPanelOpen: false,
    listingCheckAddressKey: null,
    prepareListingCheckForAddress: vi.fn(),
    toggleShortlist: vi.fn(),
    leftTab: "filters",
    ...overrides,
  };
}

describe("useAppShellController", () => {
  it("routes a global block suggestion into Results and closes Saved", () => {
    const options = makeOptions({ isSavedPanelOpen: true });
    const { result } = renderHook(() => useAppShellController(options));

    act(() => {
      result.current.handleSelectSuggestion({
        group: "block",
        label: "101 BEDOK NTH AVE 4",
        addressKey: "bedok-101-bedok-nth-ave-4",
      });
    });

    expect(options.setLeftTab).toHaveBeenCalledWith("results");
    expect(options.setIsLeftPanelOpen).toHaveBeenCalledWith(true);
    expect(options.setIsSavedPanelOpen).toHaveBeenCalledWith(false);
    expect(options.patchFilters).toHaveBeenCalledWith({
      selectedAddressKey: "bedok-101-bedok-nth-ave-4",
      search: "",
      town: "",
    });
  });

  it("carries the selected block into Check and makes the destination exclusive", () => {
    const prepareListingCheckForAddress = vi.fn();
    const options = makeOptions({
      filters: {
        ...DEFAULT_FILTERS,
        selectedAddressKey: "bedok-101-bedok-nth-ave-4",
      },
      isSavedPanelOpen: true,
      prepareListingCheckForAddress,
    });
    const { result } = renderHook(() => useAppShellController(options));

    act(() => result.current.handleDesktopCheckClick());

    expect(prepareListingCheckForAddress).toHaveBeenCalledWith("bedok-101-bedok-nth-ave-4");
    expect(options.setIsSavedPanelOpen).toHaveBeenCalledWith(false);
    expect(options.setLeftTab).toHaveBeenCalledWith("check");
  });

  it("does not replace an explicit listing-check block with the map selection", () => {
    const prepareListingCheckForAddress = vi.fn();
    const options = makeOptions({
      filters: {
        ...DEFAULT_FILTERS,
        selectedAddressKey: "bedok-101-bedok-nth-ave-4",
      },
      listingCheckAddressKey: "bishan-119-bishan-st-12",
      prepareListingCheckForAddress,
    });
    const { result } = renderHook(() => useAppShellController(options));

    act(() => result.current.handleDesktopCheckClick());

    expect(prepareListingCheckForAddress).not.toHaveBeenCalled();
    expect(options.setLeftTab).toHaveBeenCalledWith("check");
  });

  it("opens Saved as a primary destination instead of tiling it over another task", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useAppShellController(options));

    act(() => result.current.handleDesktopSavedClick());

    expect(options.setIsSavedPanelOpen).toHaveBeenCalledWith(true);
    expect(options.setIsLeftPanelOpen).toHaveBeenCalledWith(false);
  });
});
