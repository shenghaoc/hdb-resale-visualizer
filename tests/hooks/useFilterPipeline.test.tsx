import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFilterPipeline } from "@/hooks/useFilterPipeline";
import { useBlockLoading } from "@/hooks/useBlockLoading";
import { DEFAULT_SEARCH_PROFILE } from "@/lib/searchProfile";
import type { Manifest, FilterState, BlockSummary } from "@/types/data";
import type { Translator } from "@/lib/i18n";

vi.mock("@/hooks/useBlockLoading", () => ({
  useBlockLoading: vi.fn(() => ({ blocks: [], loadError: null })),
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
  };

  it("should inject default start month if not in URL", () => {
    // Mock window.location.search to be empty
    const originalLocation = window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = { ...originalLocation, search: "" } as any;

    const { result } = renderHook(() => useFilterPipeline({
      manifest,
      rawFilters: initialFilters,
      userLocation: null,
      savedVisible: false,
      shortlistCount: 0,
      searchProfile: DEFAULT_SEARCH_PROFILE,
      t,
    }));

    // For 2024-12 maxMonth, default start month (minus 3 years) is 2021-12
    expect(result.current.effectiveFilters.startMonth).toBe("2021-12");
    expect(result.current.useDefaultStartMonth).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = originalLocation as any;
  });

  it("should NOT inject default start month if already in URL", () => {
    const originalLocation = window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = { ...originalLocation, search: "?startMonth=2021-01" } as any;

    const { result } = renderHook(() => useFilterPipeline({
      manifest,
      rawFilters: { ...initialFilters, startMonth: "2021-01" },
      userLocation: null,
      savedVisible: false,
      shortlistCount: 0,
      searchProfile: DEFAULT_SEARCH_PROFILE,
      t,
    }));

    expect(result.current.effectiveFilters.startMonth).toBe("2021-01");
    expect(result.current.useDefaultStartMonth).toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = originalLocation as any;
  });

  it("should compute hasResultScope correctly", () => {
    const { result, rerender } = renderHook(
      ({ rawFilters }) => useFilterPipeline({
        manifest,
        rawFilters,
        userLocation: null,
        savedVisible: false,
        shortlistCount: 0,
        searchProfile: DEFAULT_SEARCH_PROFILE,
        t,
      }),
      { initialProps: { rawFilters: initialFilters } }
    );

    expect(result.current.hasResultScope).toBe(false);

    rerender({ rawFilters: { ...initialFilters, town: "BEDOK" } });
    expect(result.current.hasResultScope).toBe(true);

    rerender({ rawFilters: { ...initialFilters, search: "Some Search" } });
    expect(result.current.hasResultScope).toBe(true);

    rerender({ rawFilters: { ...initialFilters, selectedAddressKey: "some-key" } });
    expect(result.current.hasResultScope).toBe(true);
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
    
    vi.mocked(useBlockLoading).mockReturnValue({ blocks, loadError: null });

    const { result } = renderHook(() => useFilterPipeline({
      manifest,
      rawFilters: { ...initialFilters, town: "BEDOK", selectedAddressKey: "block-2" },
      userLocation: null,
      savedVisible: false,
      shortlistCount: 0,
      searchProfile: DEFAULT_SEARCH_PROFILE,
      t,
    }));

    // block-1 is in town BEDOK. block-2 is selected.
    // mapFilteredBlocks should include both.
    expect(result.current.mapFilteredBlocks.map(b => b.addressKey)).toContain("block-1");
    expect(result.current.mapFilteredBlocks.map(b => b.addressKey)).toContain("block-2");
    expect(result.current.mapFilteredBlocks.length).toBe(2);
  });
});
