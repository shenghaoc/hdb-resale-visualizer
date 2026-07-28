import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { useFilterPipeline } from "@/hooks/useFilterPipeline";
import { useBlockLoading } from "@/hooks/useBlockLoading";
import { MAP_SEARCH_DEBOUNCE_MS, MAX_LEASE_DURATION, getCurrentYear } from "@/shared/lib/constants";
import { DEFAULT_SEARCH_PROFILE } from "@/features/search-profile/searchProfile";
import type { Manifest, FilterState, BlockSummary } from "@/types/data";
import type { Translator } from "@/shared/lib/i18n";

vi.mock("@/hooks/useBlockLoading", () => ({
  useBlockLoading: vi.fn(() => ({
    blocks: [],
    loadError: null,
    searchTruncated: false,
    refinementUnsupported: false,
    isLoading: false,
  })),
}));

describe("useFilterPipeline", () => {
  const t = vi.fn((key: string) => key) as unknown as Translator;
  const manifest: Manifest = {
    dataWindow: { minMonth: "2020-01", maxMonth: "2024-12" },
    filterOptions: { towns: ["BEDOK", "TAMPINES"], flatTypes: [], flatModels: [] },
  } as unknown as Manifest;

  const initialFilters: FilterState = {
    town: "",
    flatType: "",
    flatModel: "",
    budgetMin: null,
    budgetMax: null,
    areaMin: null,
    areaMax: null,
    remainingLeaseMin: null,
    startMonth: null,
    endMonth: null,
    mrtMax: null,
    search: "",
    selectedAddressKey: null,
    compareTown: "",
    affordable: "",
    sort: "",
  };

  it("does not inject a hidden start month when the URL has none", () => {
    // Mock window.location.search to be empty
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { search: "" },
    });

    const { result } = renderHook(() =>
      useFilterPipeline({
        manifest,
        rawFilters: initialFilters,
        userLocation: null,
        savedVisible: false,
        shortlistCount: 0,
        searchProfile: DEFAULT_SEARCH_PROFILE,
        t,
      }),
    );

    expect(result.current.effectiveFilters.startMonth).toBeNull();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("should NOT inject default start month if already in URL", () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { search: "?startMonth=2021-01" },
    });

    const { result } = renderHook(() =>
      useFilterPipeline({
        manifest,
        rawFilters: { ...initialFilters, startMonth: "2021-01" },
        userLocation: null,
        savedVisible: false,
        shortlistCount: 0,
        searchProfile: DEFAULT_SEARCH_PROFILE,
        t,
      }),
    );

    expect(result.current.effectiveFilters.startMonth).toBe("2021-01");

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("should compute hasResultScope correctly", () => {
    const { result, rerender } = renderHook(
      ({ rawFilters }) =>
        useFilterPipeline({
          manifest,
          rawFilters,
          userLocation: null,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      { initialProps: { rawFilters: initialFilters } },
    );

    expect(result.current.hasResultScope).toBe(false);

    rerender({ rawFilters: { ...initialFilters, town: "BEDOK" } });
    expect(result.current.hasResultScope).toBe(true);

    rerender({ rawFilters: { ...initialFilters, search: "Some Search" } });
    expect(result.current.hasResultScope).toBe(true);

    rerender({ rawFilters: { ...initialFilters, selectedAddressKey: "some-key" } });
    expect(result.current.hasResultScope).toBe(true);
  });

  it("hasResultScope is true when resultsVisible=false with a preselected town (deep-link regression)", () => {
    const { result } = renderHook(() =>
      useFilterPipeline({
        manifest,
        rawFilters: { ...initialFilters, town: "BEDOK" },
        userLocation: null,
        resultsVisible: false,
        savedVisible: false,
        shortlistCount: 0,
        searchProfile: DEFAULT_SEARCH_PROFILE,
        t,
      }),
    );

    expect(result.current.hasResultScope).toBe(true);
    expect(result.current.filteredBlocks).toEqual([]);
  });

  it("should append selectedAddressKey block to mapFilteredBlocks even if not in scope", () => {
    const blocks = [
      {
        addressKey: "block-1",
        town: "BEDOK",
        availableDateRange: ["2020-01", "2024-12"],
        mrtDistances: {},
        metricPercentiles: {},
        pricePerSqmMedian: 6000,
      },
      {
        addressKey: "block-2",
        town: "TAMPINES",
        availableDateRange: ["2020-01", "2024-12"],
        mrtDistances: {},
        metricPercentiles: {},
        pricePerSqmMedian: 6000,
      },
    ] as unknown as BlockSummary[];

    vi.mocked(useBlockLoading).mockReturnValue({
      blocks,
      loadError: null,
      searchTruncated: false,
      refinementUnsupported: false,
      isLoading: false,
      retry: vi.fn(),
    });

    const { result } = renderHook(() =>
      useFilterPipeline({
        manifest,
        rawFilters: { ...initialFilters, town: "BEDOK", selectedAddressKey: "block-2" },
        userLocation: null,
        savedVisible: false,
        shortlistCount: 0,
        searchProfile: DEFAULT_SEARCH_PROFILE,
        t,
      }),
    );

    // block-1 is in town BEDOK. block-2 is selected.
    // mapFilteredBlocks should include both.
    expect(result.current.mapFilteredBlocks.map((b) => b.addressKey)).toContain("block-1");
    expect(result.current.mapFilteredBlocks.map((b) => b.addressKey)).toContain("block-2");
    expect(result.current.mapFilteredBlocks.length).toBe(2);
  });

  it("applies the current-year remaining-lease cutoff to both result and map blocks", () => {
    // Lease age is expressed relative to getCurrentYear() so the expectation
    // survives a calendar rollover instead of pinning a literal year.
    const currentYear = getCurrentYear();
    const youngLeaseAgeYears = 10;
    const oldLeaseAgeYears = 60;
    const blocks = [
      {
        addressKey: "young-lease",
        town: "BEDOK",
        leaseCommenceRange: [currentYear - youngLeaseAgeYears, currentYear - youngLeaseAgeYears],
        availableDateRange: ["2020-01", "2024-12"],
      },
      {
        addressKey: "old-lease",
        town: "BEDOK",
        leaseCommenceRange: [currentYear - oldLeaseAgeYears, currentYear - oldLeaseAgeYears],
        availableDateRange: ["2020-01", "2024-12"],
      },
    ] as unknown as BlockSummary[];

    vi.mocked(useBlockLoading).mockReturnValue({
      blocks,
      loadError: null,
      searchTruncated: false,
      refinementUnsupported: false,
      isLoading: false,
      retry: vi.fn(),
    });

    // Between the two blocks' remaining lease (89 vs 39 years at MAX_LEASE_DURATION 99).
    const cutoff = MAX_LEASE_DURATION - (youngLeaseAgeYears + oldLeaseAgeYears) / 2;

    const { result } = renderHook(() =>
      useFilterPipeline({
        manifest,
        rawFilters: { ...initialFilters, town: "BEDOK", remainingLeaseMin: cutoff },
        userLocation: null,
        savedVisible: false,
        shortlistCount: 0,
        searchProfile: DEFAULT_SEARCH_PROFILE,
        t,
      }),
    );

    expect(result.current.filteredBlocks.map((block) => block.addressKey)).toEqual(["young-lease"]);
    expect(result.current.mapFilteredBlocks.map((block) => block.addressKey)).toEqual([
      "young-lease",
    ]);
  });

  it("keeps geographic intents stable when a new translator returns the same label", () => {
    vi.mocked(useBlockLoading).mockReturnValue({
      blocks: [],
      loadError: null,
      searchTruncated: false,
      refinementUnsupported: false,
      isLoading: false,
      retry: vi.fn(),
    });
    const firstTranslator = vi.fn(() => "Nearby") as unknown as Translator;
    const secondTranslator = vi.fn(() => "Nearby") as unknown as Translator;
    const userLocation = { lat: 1.3521, lng: 103.8198 };

    const { result, rerender } = renderHook(
      ({ translator }) =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...initialFilters, search: "Nearby" },
          userLocation,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t: translator,
        }),
      { initialProps: { translator: firstTranslator } },
    );
    const initialGeographicIntent = result.current.geographicIntent;
    const initialMapGeographicIntent = result.current.effectiveMapGeographicIntent;

    rerender({ translator: secondTranslator });

    expect(secondTranslator).toHaveBeenCalledWith("filters.nearMe");
    expect(result.current.geographicIntent).toBe(initialGeographicIntent);
    expect(result.current.effectiveMapGeographicIntent).toBe(initialMapGeographicIntent);
  });

  it("uses only canonical filters for visible results, not hidden profile preferences", () => {
    const blocks = [
      {
        addressKey: "four-room",
        town: "BEDOK",
        flatTypes: ["4 ROOM"],
        availableDateRange: ["2020-01", "2024-12"],
      },
      {
        addressKey: "five-room",
        town: "BEDOK",
        flatTypes: ["5 ROOM"],
        availableDateRange: ["2020-01", "2024-12"],
      },
    ] as unknown as BlockSummary[];
    vi.mocked(useBlockLoading).mockReturnValue({
      blocks,
      loadError: null,
      searchTruncated: false,
      refinementUnsupported: false,
      isLoading: false,
      retry: vi.fn(),
    });

    const { result } = renderHook(() =>
      useFilterPipeline({
        manifest,
        rawFilters: { ...initialFilters, town: "BEDOK" },
        userLocation: null,
        savedVisible: false,
        shortlistCount: 0,
        searchProfile: {
          ...DEFAULT_SEARCH_PROFILE,
          mainFlatType: "4 ROOM",
        },
        t,
      }),
    );

    expect(result.current.filteredBlocks.map((block) => block.addressKey)).toEqual([
      "four-room",
      "five-room",
    ]);
  });

  it("keeps map filtering stable until the debounced search changes", () => {
    vi.useFakeTimers();
    const makeSearchBlock = (addressKey: string, town: string): BlockSummary => ({
      addressKey,
      town,
      block: "101",
      streetName: `${town} STREET 1`,
      coordinates: { lat: 1.33, lng: 103.9 },
      medianPrice: 500_000,
      pricePerSqmMedian: 5_500,
      transactionCount: 5,
      floorAreaRange: [80, 100],
      leaseCommenceRange: [1990, 1990],
      latestMonth: "2024-12",
      availableDateRange: ["2020-01", "2024-12"],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: null,
    });
    const blocks = [makeSearchBlock("bedok", "BEDOK"), makeSearchBlock("ang-mo-kio", "ANG MO KIO")];
    vi.mocked(useBlockLoading).mockReturnValue({
      blocks,
      loadError: null,
      searchTruncated: false,
      refinementUnsupported: false,
      isLoading: false,
      retry: vi.fn(),
    });

    try {
      const { result, rerender } = renderHook(
        ({ search }) =>
          useFilterPipeline({
            manifest,
            rawFilters: { ...initialFilters, search },
            userLocation: null,
            savedVisible: false,
            shortlistCount: 0,
            searchProfile: DEFAULT_SEARCH_PROFILE,
            t,
          }),
        { initialProps: { search: "BEDOK" } },
      );
      const initialMapFilters = result.current.mapFilters;
      const initialMapBlocks = result.current.mapFilteredBlocks;

      rerender({ search: "ANG MO KIO" });

      expect(result.current.filteredBlocks.map((block) => block.addressKey)).toEqual([
        "ang-mo-kio",
      ]);
      expect(result.current.mapFilters).toBe(initialMapFilters);
      expect(result.current.mapFilteredBlocks).toBe(initialMapBlocks);
      expect(result.current.mapFilteredBlocks.map((block) => block.addressKey)).toEqual(["bedok"]);

      act(() => {
        vi.advanceTimersByTime(MAP_SEARCH_DEBOUNCE_MS);
      });

      expect(result.current.mapFilters).not.toBe(initialMapFilters);
      expect(result.current.mapFilteredBlocks.map((block) => block.addressKey)).toEqual([
        "ang-mo-kio",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
