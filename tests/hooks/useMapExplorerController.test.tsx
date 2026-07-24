import { act, renderHook } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  useMapExplorerController,
  type UseMapExplorerControllerOptions,
} from "@/features/map-explorer/useMapExplorerController";
import { DEFAULT_FILTERS, NEAR_ME_SEARCH_QUERY } from "@/shared/lib/constants";
import type { ComparisonArtifact, Coordinates, FilterState } from "@/types/data";
import type { GeographicSearchIntent } from "@/shared/lib/filtering";

type FakeGeolocation = UseMapExplorerControllerOptions["geolocation"];

function makeGeolocation(overrides: Partial<FakeGeolocation> = {}): FakeGeolocation {
  return {
    userLocation: overrides.userLocation ?? null,
    setUserLocation:
      overrides.setUserLocation ?? (vi.fn() as Dispatch<SetStateAction<Coordinates | null>>),
    isLocating: overrides.isLocating ?? false,
    geolocationError: overrides.geolocationError ?? null,
    clearError: overrides.clearError ?? vi.fn(),
    cancelPendingRequest: overrides.cancelPendingRequest ?? vi.fn(),
    locate: overrides.locate ?? vi.fn(),
  };
}

function makeComparison(
  schools: ComparisonArtifact["amenities"]["nearestPrimarySchools"] = [],
): ComparisonArtifact {
  return {
    addressKey: "addr-1",
    town: "BEDOK",
    flatType: "4 ROOM",
    amenities: {
      primarySchoolsWithin1km: schools.length,
      primarySchoolsWithin2km: schools.length,
      nearestPrimarySchoolMeters: schools[0]?.distanceMeters ?? null,
      nearestPrimarySchools: schools,
      hawkerCentresWithin1km: 0,
      nearestHawkerCentreMeters: null,
      supermarketsWithin1km: 0,
      nearestSupermarketMeters: null,
      parksWithin1km: 0,
      nearestParkMeters: null,
    },
    percentileRanks: {
      pricePercentile: 50,
      pricePerSqmPercentile: 50,
      leasePercentile: 50,
      mrtDistancePercentile: 50,
      transactionCountPercentile: 50,
      recencyPercentile: 50,
    },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeOptions(
  overrides: Partial<UseMapExplorerControllerOptions> = {},
): UseMapExplorerControllerOptions {
  return {
    filters: { ...DEFAULT_FILTERS },
    patchFilters: vi.fn(),
    geographicIntent: null,
    mapSearch: "",
    hasMapMarkerScope: false,
    selectedComparison: null,
    isComparisonLoading: false,
    isDesktop: true,
    controlsVisible: true,
    setLeftTab: vi.fn(),
    setIsLeftPanelOpen: vi.fn(),
    setMobileTab: vi.fn(),
    setIsSavedPanelOpen: vi.fn(),
    hasInteractedWithMap: false,
    setIsHeaderVisible: vi.fn(),
    setHasInteractedWithMap: vi.fn(),
    geolocation: makeGeolocation(),
    onCannotLocate: vi.fn(),
    ...overrides,
  };
}

describe("useMapExplorerController", () => {
  it("starts with heatmap disabled, opacity 0.7, and mode price", () => {
    const { result } = renderHook(() => useMapExplorerController(makeOptions()));
    expect(result.current.priceHeatmapEnabled).toBe(false);
    expect(result.current.priceHeatmapOpacity).toBe(0.7);
    expect(result.current.heatmapMode).toBe("price");
  });

  it("starts with MRT stations, exits, and school overlay disabled", () => {
    const { result } = renderHook(() => useMapExplorerController(makeOptions()));
    expect(result.current.mrtStationsEnabled).toBe(false);
    expect(result.current.mrtExitsEnabled).toBe(false);
    expect(result.current.schoolOverlayEnabled).toBe(false);
  });

  it("toggles each layer independently", () => {
    const { result } = renderHook(() => useMapExplorerController(makeOptions()));

    act(() => {
      result.current.togglePriceHeatmap();
    });
    expect(result.current.priceHeatmapEnabled).toBe(true);
    expect(result.current.mrtStationsEnabled).toBe(false);
    expect(result.current.mrtExitsEnabled).toBe(false);
    expect(result.current.schoolOverlayEnabled).toBe(false);

    act(() => {
      result.current.toggleMrtStations();
    });
    expect(result.current.priceHeatmapEnabled).toBe(true);
    expect(result.current.mrtStationsEnabled).toBe(true);
    expect(result.current.mrtExitsEnabled).toBe(false);
    expect(result.current.schoolOverlayEnabled).toBe(false);

    act(() => {
      result.current.toggleMrtExits();
    });
    expect(result.current.mrtExitsEnabled).toBe(true);
    expect(result.current.schoolOverlayEnabled).toBe(false);

    act(() => {
      result.current.toggleSchoolOverlay();
    });
    expect(result.current.schoolOverlayEnabled).toBe(true);
    expect(result.current.mrtStationsEnabled).toBe(true);
    expect(result.current.mrtExitsEnabled).toBe(true);
    expect(result.current.priceHeatmapEnabled).toBe(true);
  });

  it("derives coordinate fit key from geographic intent", () => {
    const geographicIntent: GeographicSearchIntent = {
      type: "coordinates",
      coordinates: { lat: 1.3, lng: 103.8 },
      radiusMeters: 1000,
    };
    const { result } = renderHook(() =>
      useMapExplorerController(makeOptions({ geographicIntent, mapSearch: "ignored" })),
    );
    expect(result.current.autoFitKey).toBe("coordinates:1.3,103.8");
  });

  it("derives lowercase station fit key", () => {
    const geographicIntent: GeographicSearchIntent = {
      type: "station",
      stationName: "Bedok",
      radiusMeters: 800,
    };
    const { result } = renderHook(() =>
      useMapExplorerController(makeOptions({ geographicIntent, mapSearch: "Bedok" })),
    );
    expect(result.current.autoFitKey).toBe("station:bedok");
  });

  it("derives trimmed lowercase search fit key", () => {
    const { result } = renderHook(() =>
      useMapExplorerController(makeOptions({ mapSearch: "  Ang Mo Kio  " })),
    );
    expect(result.current.autoFitKey).toBe("search:ang mo kio");
  });

  it("returns null autoFitKey for empty search", () => {
    const { result } = renderHook(() =>
      useMapExplorerController(makeOptions({ mapSearch: "   " })),
    );
    expect(result.current.autoFitKey).toBeNull();
  });

  it("derives school overlay data from selected comparison", () => {
    const comparison = makeComparison([
      {
        name: "ABC Primary",
        distanceMeters: 400,
        coordinates: { lat: 1.33, lng: 103.9 },
      },
    ]);
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          selectedComparison: comparison,
          filters: { ...DEFAULT_FILTERS, selectedAddressKey: "addr-1" },
        }),
      ),
    );
    expect(result.current.primarySchoolsForOverlay).toHaveLength(1);
    expect(result.current.schoolOverlayAvailable).toBe(true);
    expect(result.current.hasBlockSelection).toBe(true);
  });

  it("marks overlay unavailable when no schools", () => {
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          selectedComparison: makeComparison([]),
          filters: { ...DEFAULT_FILTERS, selectedAddressKey: "addr-1" },
        }),
      ),
    );
    expect(result.current.schoolOverlayAvailable).toBe(false);
    expect(result.current.primarySchoolsForOverlay).toHaveLength(0);
  });

  it("surfaces comparison loading only with an active selection", () => {
    const { result: noSelection } = renderHook(() =>
      useMapExplorerController(makeOptions({ isComparisonLoading: true })),
    );
    expect(noSelection.current.schoolOverlayLoading).toBe(false);

    const { result: withSelection } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isComparisonLoading: true,
          filters: { ...DEFAULT_FILTERS, selectedAddressKey: "addr-1" },
        }),
      ),
    );
    expect(withSelection.current.schoolOverlayLoading).toBe(true);
  });

  it("retains school-overlay preference when availability disappears", () => {
    const schools = [
      {
        name: "ABC Primary",
        distanceMeters: 400,
        coordinates: { lat: 1.33, lng: 103.9 },
      },
    ];
    let selectedComparison: ComparisonArtifact | null = makeComparison(schools);
    let filters: FilterState = { ...DEFAULT_FILTERS, selectedAddressKey: "addr-1" };

    const { result, rerender } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          selectedComparison,
          filters,
        }),
      ),
    );

    act(() => {
      result.current.toggleSchoolOverlay();
    });
    expect(result.current.schoolOverlayEnabled).toBe(true);
    expect(result.current.effectiveSchoolOverlayEnabled).toBe(true);

    selectedComparison = null;
    filters = { ...DEFAULT_FILTERS, selectedAddressKey: null };
    rerender();

    expect(result.current.schoolOverlayEnabled).toBe(true);
    expect(result.current.schoolOverlayAvailable).toBe(false);
    expect(result.current.effectiveSchoolOverlayEnabled).toBe(false);
  });

  it("map geolocate updates user location and near-me filters on desktop", () => {
    const setUserLocation = vi.fn() as Dispatch<SetStateAction<Coordinates | null>>;
    const clearError = vi.fn();
    const patchFilters = vi.fn();
    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isDesktop: true,
          patchFilters,
          setLeftTab,
          setIsLeftPanelOpen,
          geolocation: makeGeolocation({ setUserLocation, clearError }),
        }),
      ),
    );

    act(() => {
      result.current.handleGeolocate({ lat: 1.3, lng: 103.8 });
    });

    expect(setUserLocation).toHaveBeenCalledWith({ lat: 1.3, lng: 103.8 });
    expect(clearError).toHaveBeenCalled();
    expect(patchFilters).toHaveBeenCalledWith({
      search: NEAR_ME_SEARCH_QUERY,
      town: "",
      selectedAddressKey: null,
    });
    expect(setLeftTab).toHaveBeenCalledWith("results");
    expect(setIsLeftPanelOpen).toHaveBeenCalledWith(true);
  });

  it("mobile geolocate does not force a panel open", () => {
    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const setMobileTab = vi.fn();
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isDesktop: false,
          setLeftTab,
          setIsLeftPanelOpen,
          setMobileTab,
        }),
      ),
    );

    act(() => {
      result.current.handleGeolocate({ lat: 1.3, lng: 103.8 });
    });

    expect(setLeftTab).not.toHaveBeenCalled();
    expect(setIsLeftPanelOpen).not.toHaveBeenCalled();
    expect(setMobileTab).not.toHaveBeenCalled();
  });

  it("use-current-location success opens Results on desktop", () => {
    const patchFilters = vi.fn();
    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const locate = vi.fn((onSuccess: (coords: Coordinates) => void) => {
      onSuccess({ lat: 1.31, lng: 103.81 });
    });
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isDesktop: true,
          patchFilters,
          setLeftTab,
          setIsLeftPanelOpen,
          geolocation: makeGeolocation({ locate }),
        }),
      ),
    );

    act(() => {
      result.current.handleUseCurrentLocation();
    });

    expect(locate).toHaveBeenCalled();
    expect(patchFilters).toHaveBeenCalledWith({
      search: NEAR_ME_SEARCH_QUERY,
      town: "",
      selectedAddressKey: null,
    });
    expect(setLeftTab).toHaveBeenCalledWith("results");
    expect(setIsLeftPanelOpen).toHaveBeenCalledWith(true);
  });

  it("use-current-location failure invokes choose-town fallback", () => {
    const onCannotLocate = vi.fn();
    const locate = vi.fn((_onSuccess: (coords: Coordinates) => void, onFail?: () => void) => {
      onFail?.();
    });
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          onCannotLocate,
          geolocation: makeGeolocation({ locate }),
        }),
      ),
    );

    act(() => {
      result.current.handleUseCurrentLocation();
    });

    expect(onCannotLocate).toHaveBeenCalled();
  });

  it("first desktop interaction hides the header once", () => {
    const setIsHeaderVisible = vi.fn();
    const setHasInteractedWithMap = vi.fn();
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isDesktop: true,
          hasInteractedWithMap: false,
          setIsHeaderVisible,
          setHasInteractedWithMap,
        }),
      ),
    );

    act(() => {
      result.current.handleMapInteract("background");
    });

    expect(setIsHeaderVisible).toHaveBeenCalledWith(false);
    expect(setHasInteractedWithMap).toHaveBeenCalledWith(true);
  });

  it("feature interaction does not close panels", () => {
    const setIsLeftPanelOpen = vi.fn();
    const setIsSavedPanelOpen = vi.fn();
    const setMobileTab = vi.fn();
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isDesktop: true,
          hasInteractedWithMap: true,
          setIsLeftPanelOpen,
          setIsSavedPanelOpen,
          setMobileTab,
        }),
      ),
    );

    act(() => {
      result.current.handleMapInteract("feature");
    });

    expect(setIsLeftPanelOpen).not.toHaveBeenCalled();
    expect(setIsSavedPanelOpen).not.toHaveBeenCalled();
    expect(setMobileTab).not.toHaveBeenCalled();
  });

  it("desktop background interaction closes left and Saved panels", () => {
    const setIsLeftPanelOpen = vi.fn();
    const setIsSavedPanelOpen = vi.fn();
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isDesktop: true,
          hasInteractedWithMap: true,
          setIsLeftPanelOpen,
          setIsSavedPanelOpen,
        }),
      ),
    );

    act(() => {
      result.current.handleMapInteract("background");
    });

    expect(setIsLeftPanelOpen).toHaveBeenCalledWith(false);
    expect(setIsSavedPanelOpen).toHaveBeenCalledWith(false);
  });

  it("mobile background interaction clears the mobile tab", () => {
    const setMobileTab = vi.fn();
    const { result } = renderHook(() =>
      useMapExplorerController(
        makeOptions({
          isDesktop: false,
          hasInteractedWithMap: true,
          setMobileTab,
        }),
      ),
    );

    act(() => {
      result.current.handleMapInteract("background");
    });

    expect(setMobileTab).toHaveBeenCalledWith(null);
  });

  it("computes heatmap and amenity control positions for all layout combinations", () => {
    const cases: Array<{
      isDesktop: boolean;
      hasMapMarkerScope: boolean;
      heatmapBottom: string;
      amenityBottom: string;
      right: string;
    }> = [
      {
        isDesktop: true,
        hasMapMarkerScope: true,
        heatmapBottom: "7.5rem",
        amenityBottom: "11rem",
        right: "4.5rem",
      },
      {
        isDesktop: true,
        hasMapMarkerScope: false,
        heatmapBottom: "4rem",
        amenityBottom: "7.5rem",
        right: "4.5rem",
      },
      {
        isDesktop: false,
        hasMapMarkerScope: true,
        heatmapBottom: "11.5rem",
        amenityBottom: "15rem",
        right: "0.75rem",
      },
      {
        isDesktop: false,
        hasMapMarkerScope: false,
        heatmapBottom: "8rem",
        amenityBottom: "11.5rem",
        right: "0.75rem",
      },
    ];

    for (const scenario of cases) {
      const { result } = renderHook(() =>
        useMapExplorerController(
          makeOptions({
            isDesktop: scenario.isDesktop,
            hasMapMarkerScope: scenario.hasMapMarkerScope,
          }),
        ),
      );
      expect(result.current.heatmapControlStyle).toEqual({
        bottom: scenario.heatmapBottom,
        right: scenario.right,
      });
      expect(result.current.amenityControlStyle).toEqual({
        bottom: scenario.amenityBottom,
        right: scenario.right,
      });
    }
  });
});
