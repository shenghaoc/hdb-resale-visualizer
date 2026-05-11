import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFilterPipeline } from "@/hooks/useFilterPipeline";
import { useBlockLoading } from "@/hooks/useBlockLoading";
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
    town: null,
    flatType: null,
    flatModel: null,
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
    // @ts-expect-error - mock location
    delete window.location;
    window.location = { ...originalLocation, search: "" };

    const { result } = renderHook(() => useFilterPipeline({
      manifest,
      rawFilters: initialFilters,
      userLocation: null,
      resultsVisible: true,
      savedVisible: false,
      shortlistCount: 0,
      t,
    }));

    // For 2024-12 maxMonth, default start month (minus 3 years) is 2021-12
    expect(result.current.effectiveFilters.startMonth).toBe("2021-12");
    expect(result.current.useDefaultStartMonth).toBe(true);

    window.location = originalLocation;
  });

  it("should NOT inject default start month if already in URL", () => {
    const originalLocation = window.location;
    // @ts-expect-error - mock location
    delete window.location;
    window.location = { ...originalLocation, search: "?startMonth=2021-01" };

    const { result } = renderHook(() => useFilterPipeline({
      manifest,
      rawFilters: { ...initialFilters, startMonth: "2021-01" },
      userLocation: null,
      resultsVisible: true,
      savedVisible: false,
      shortlistCount: 0,
      t,
    }));

    expect(result.current.effectiveFilters.startMonth).toBe("2021-01");
    expect(result.current.useDefaultStartMonth).toBe(false);

    window.location = originalLocation;
  });

  it("should compute hasResultScope correctly", () => {
    const { result, rerender } = renderHook(
      ({ rawFilters }) => useFilterPipeline({
        manifest,
        rawFilters,
        userLocation: null,
        resultsVisible: true,
        savedVisible: false,
        shortlistCount: 0,
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
      },
      {
        addressKey: "block-2",
        town: "TAMPINES",
        availableDateRange: ["2020-01", "2024-12"],
        mrtDistances: {},
        metricPercentiles: {},
      },
    ] as unknown as BlockSummary[];
    
    vi.mocked(useBlockLoading).mockReturnValue({ blocks, loadError: null });

    const { result } = renderHook(() => useFilterPipeline({
      manifest,
      rawFilters: { ...initialFilters, town: "BEDOK", selectedAddressKey: "block-2" },
      userLocation: null,
      resultsVisible: true,
      savedVisible: false,
      shortlistCount: 0,
      t,
    }));

    // block-1 is in town BEDOK. block-2 is selected.
    // mapFilteredBlocks should include both.
    expect(result.current.mapFilteredBlocks.map(b => b.addressKey)).toContain("block-1");
    expect(result.current.mapFilteredBlocks.map(b => b.addressKey)).toContain("block-2");
    expect(result.current.mapFilteredBlocks.length).toBe(2);
  });
});
