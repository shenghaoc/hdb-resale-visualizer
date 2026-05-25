import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useFilterPipeline } from "@/hooks/useFilterPipeline";
import { useBlockLoading } from "@/hooks/useBlockLoading";
import { NEAR_ME_SEARCH_QUERY } from "@/lib/constants";
import { DEFAULT_SEARCH_PROFILE } from "@/lib/searchProfile";
import type { Manifest, FilterState, BlockSummary } from "@/types/data";
import type { Translator } from "@/lib/i18n";

vi.mock("@/hooks/useBlockLoading", () => ({
  useBlockLoading: vi.fn(() => ({ blocks: [], loadError: null, searchTruncated: false })),
}));

const t = vi.fn((key: string) => key) as unknown as Translator;

const manifest: Manifest = {
  dataWindow: { minMonth: "2020-01", maxMonth: "2024-12" },
  filterOptions: { towns: ["BEDOK", "TAMPINES", "ANG MO KIO"], flatTypes: [], flatModels: [] },
} as unknown as Manifest;

const baseFilters: FilterState = {
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

function mockLocation(search = ""): void {
  Object.defineProperty(window, "location", {
    value: { href: `http://localhost/${search}`, pathname: "/", search },
    writable: true,
  });
}

function makeBlock(overrides: Partial<BlockSummary> & { addressKey: string }): BlockSummary {
  return {
    town: "BEDOK",
    block: "1",
    streetName: "BEDOK NTH AVE 1",
    coordinates: { lat: 1.33, lng: 103.92 },
    medianPrice: 500_000,
    pricePerSqmMedian: 5556,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-12",
    availableDateRange: ["2020-01", "2024-12"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
    ...overrides,
  };
}

describe("useFilterPipeline — additional edge cases", () => {
  beforeEach(() => {
    vi.mocked(useBlockLoading).mockReturnValue({ blocks: [], loadError: null, searchTruncated: false });
    vi.clearAllMocks();
    mockLocation("");
  });

  describe("near-me sentinel handling", () => {
    it("hides near-me sentinel from filterPanelFilters", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, search: NEAR_ME_SEARCH_QUERY },
          userLocation: { lat: 1.33, lng: 103.92 },
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.filterPanelFilters.search).toBe("");
    });

    it("resolves near-me to empty search when userLocation is null", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, search: NEAR_ME_SEARCH_QUERY },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.resolvedSearch).toBe("");
    });

    it("keeps near-me as resolvedSearch when userLocation is provided", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, search: NEAR_ME_SEARCH_QUERY },
          userLocation: { lat: 1.33, lng: 103.92 },
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.resolvedSearch).toBe(NEAR_ME_SEARCH_QUERY);
    });
  });

  describe("hasResultScope", () => {
    it("is false when all filters are empty", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: baseFilters,
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.hasResultScope).toBe(false);
    });

    it("is false when only mrtMax is set (no town/search/selectedKey)", () => {
      // mrtMax alone does not constitute a result scope — geographic intent needs blocks
      // to match stations. With no blocks/search, hasResultScope should be false.
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, mrtMax: 500 },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.hasResultScope).toBe(false);
    });

    it("is false for whitespace-only and true for non-empty content", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, search: "  " },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );
      expect(result.current.hasResultScope).toBe(false);

      const { result: result2 } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, search: "bedok" },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );
      expect(result2.current.hasResultScope).toBe(true);
    });
  });

  describe("filteredBlocks", () => {
    it("returns empty array when resultsVisible is false", () => {
      const blocks = [makeBlock({ addressKey: "addr-1", town: "BEDOK" })];
      vi.mocked(useBlockLoading).mockReturnValue({ blocks, loadError: null, searchTruncated: false });

      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, town: "BEDOK" },
          userLocation: null,
          resultsVisible: false,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.filteredBlocks).toHaveLength(0);
    });

  });

  describe("mapFilteredBlocks", () => {
    it("is empty when hasMapMarkerScope is false", () => {
      const blocks = [makeBlock({ addressKey: "addr-1" })];
      vi.mocked(useBlockLoading).mockReturnValue({ blocks, loadError: null, searchTruncated: false });

      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: baseFilters,
          userLocation: null,
          resultsVisible: false,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.mapFilteredBlocks).toHaveLength(0);
    });

    it("does not duplicate selectedAddressKey block when it is already in scope", () => {
      const blocks = [
        makeBlock({ addressKey: "addr-1", town: "BEDOK" }),
        makeBlock({ addressKey: "addr-2", town: "BEDOK" }),
      ];
      vi.mocked(useBlockLoading).mockReturnValue({ blocks, loadError: null, searchTruncated: false });

      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, town: "BEDOK", selectedAddressKey: "addr-1" },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      const keys = result.current.mapFilteredBlocks.map((b) => b.addressKey);
      expect(keys.filter((k) => k === "addr-1")).toHaveLength(1);
    });

    it("appends selectedAddressKey block not in scope without duplication", () => {
      const blocks = [
        makeBlock({ addressKey: "addr-bedok", town: "BEDOK" }),
        makeBlock({ addressKey: "addr-tampines", town: "TAMPINES" }),
      ];
      vi.mocked(useBlockLoading).mockReturnValue({ blocks, loadError: null, searchTruncated: false });

      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, town: "BEDOK", selectedAddressKey: "addr-tampines" },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      const keys = result.current.mapFilteredBlocks.map((b) => b.addressKey);
      expect(keys).toContain("addr-bedok");
      expect(keys).toContain("addr-tampines");
      expect(keys.filter((k) => k === "addr-tampines")).toHaveLength(1);
    });

    it("does not append selectedAddressKey when it cannot be found in blocksByKey", () => {
      const blocks = [makeBlock({ addressKey: "addr-bedok", town: "BEDOK" })];
      vi.mocked(useBlockLoading).mockReturnValue({ blocks, loadError: null, searchTruncated: false });

      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, town: "BEDOK", selectedAddressKey: "ghost-key" },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      const keys = result.current.mapFilteredBlocks.map((b) => b.addressKey);
      expect(keys).not.toContain("ghost-key");
    });
  });

  describe("defaultStartMonth injection", () => {
    it("does not inject when manifest is null", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest: null,
          rawFilters: baseFilters,
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.effectiveFilters.startMonth).toBeNull();
    });

    it("keeps user-supplied startMonth even when useDefaultStartMonth would be set", () => {
      mockLocation("");

      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: { ...baseFilters, startMonth: "2022-06" },
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      // Even though the URL has no startMonth param, rawFilters.startMonth is not null
      // so effectiveFilters should use it as-is (useDefaultStartMonth only injects when startMonth is null)
      expect(result.current.effectiveFilters.startMonth).toBe("2022-06");
    });
  });

  describe("popstate listener updates useDefaultStartMonth", () => {
    it("sets useDefaultStartMonth false when popstate fires with startMonth in URL", () => {
      mockLocation("");

      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: baseFilters,
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.useDefaultStartMonth).toBe(true);

      act(() => {
        mockLocation("?startMonth=2021-01");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(result.current.useDefaultStartMonth).toBe(false);
    });
  });

  describe("sortedTowns", () => {
    it("returns towns sorted by length descending", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest,
          rawFilters: baseFilters,
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      const towns = result.current.sortedTowns;
      for (let i = 1; i < towns.length; i++) {
        expect(towns[i]!.length).toBeLessThanOrEqual(towns[i - 1]!.length);
      }
    });

    it("returns empty array when manifest is null", () => {
      const { result } = renderHook(() =>
        useFilterPipeline({
          manifest: null,
          rawFilters: baseFilters,
          userLocation: null,
          resultsVisible: true,
          savedVisible: false,
          shortlistCount: 0,
          searchProfile: DEFAULT_SEARCH_PROFILE,
          t,
        }),
      );

      expect(result.current.sortedTowns).toEqual([]);
    });
  });
});
