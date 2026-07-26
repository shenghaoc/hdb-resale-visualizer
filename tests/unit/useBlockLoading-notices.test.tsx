import { act, render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ResultsPane } from "@/components/ResultsPane";
import { I18nProvider } from "@/shared/lib/i18n";
import type { Manifest } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchBlockSummaries: vi.fn(),
  fetchBlocksBySearch: vi.fn(),
  fetchBlocksByTown: vi.fn(),
  fetchTownFlatTypeTrends: vi.fn(),
  townToFilename: (town: string) => town.toLowerCase().replaceAll(" ", "-"),
}));

vi.mock("@/shared/lib/data", () => dataMocks);

describe("block-loading recovery notices", () => {
  beforeEach(() => {
    dataMocks.fetchBlockSummaries.mockReset();
    dataMocks.fetchBlocksBySearch.mockReset();
    dataMocks.fetchBlocksByTown.mockReset();
    dataMocks.fetchTownFlatTypeTrends.mockReset();
  });

  it("A: banner renders even when the pane has no scope and shows zero blocks", async () => {
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[]}
          hasResultScope={false}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact
          searchTruncated
        />
      </I18nProvider>,
    );

    const notice = await screen.findByTestId("search-truncated-notice");
    expect(notice.textContent).toContain("2,000");
    // The empty-scope state is on screen at the same time.
    expect(screen.getByText(/Choose a location scope first/i)).toBeTruthy();
    // No block cards.
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("clears searchTruncated once the coarse filter is removed with no town", async () => {
    const { useBlockLoading } = await import("@/hooks/useBlockLoading");

    const manifest = { counts: { blocks: 10000 } } as unknown as Manifest;
    dataMocks.fetchBlocksBySearch.mockResolvedValue({
      blocks: [],
      truncated: true,
      limit: 2000,
      cohortMetadataAvailable: true,
    });

    const baseCoarse = {
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
    };

    const { result, rerender } = renderHook(
      ({ flatType }: { flatType: string }) =>
        useBlockLoading({
          manifest,
          townFilter: "",
          debouncedSearch: "",
          userLocationPresent: false,
          selectedAddressKey: null,
          sortedTowns: ["BEDOK"],
          savedVisible: false,
          shortlistCount: 0,
          coarseSearchParams: { ...baseCoarse, flatType },
        }),
      { initialProps: { flatType: "4 ROOM" } },
    );

    await waitFor(() => expect(result.current.searchTruncated).toBe(true));

    // User removes the only coarse filter. No town is set.
    rerender({ flatType: "" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.searchTruncated).toBe(false);
  });

  it("clears a failed coarse-search error when Reset removes the last filter", async () => {
    const { useBlockLoading } = await import("@/hooks/useBlockLoading");
    const manifest = { counts: { blocks: 10000 } } as unknown as Manifest;
    dataMocks.fetchBlocksBySearch.mockRejectedValue(new Error("invalid startMonth"));

    const baseCoarse = {
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
    };

    const { result, rerender } = renderHook(
      ({ flatType }: { flatType: string }) =>
        useBlockLoading({
          manifest,
          townFilter: "",
          debouncedSearch: "",
          userLocationPresent: false,
          selectedAddressKey: null,
          sortedTowns: ["BEDOK"],
          savedVisible: false,
          shortlistCount: 0,
          coarseSearchParams: { ...baseCoarse, flatType },
        }),
      { initialProps: { flatType: "4 ROOM" } },
    );

    await waitFor(() => expect(result.current.loadError).toBe("invalid startMonth"));
    rerender({ flatType: "" });
    await waitFor(() => expect(result.current.loadError).toBeNull());
  });

  it("retries a failed full-corpus request when filters were already empty", async () => {
    const { useBlockLoading } = await import("@/hooks/useBlockLoading");
    const manifest = { counts: { blocks: 10000 } } as unknown as Manifest;
    dataMocks.fetchBlockSummaries
      .mockRejectedValueOnce(new Error("full corpus unavailable"))
      .mockResolvedValueOnce([]);
    const coarseSearchParams = {
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
    };
    const sortedTowns = ["BEDOK"];

    const { result } = renderHook(() =>
      useBlockLoading({
        manifest,
        townFilter: "",
        debouncedSearch: "",
        userLocationPresent: false,
        selectedAddressKey: null,
        sortedTowns,
        savedVisible: true,
        shortlistCount: 1,
        coarseSearchParams,
      }),
    );

    await waitFor(() => expect(result.current.loadError).toBe("full corpus unavailable"));
    act(() => result.current.retry());
    await waitFor(() => expect(dataMocks.fetchBlockSummaries).toHaveBeenCalledTimes(2));
    expect(result.current.loadError).toBeNull();
  });
});
