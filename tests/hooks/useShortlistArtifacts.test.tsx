import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useShortlistArtifacts } from "@/hooks/useShortlistArtifacts";
import type { AddressDetail, BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchAddressDetail: vi.fn<(key: string) => Promise<AddressDetail | null>>(),
  fetchComparisonArtifact: vi.fn<(key: string) => Promise<ComparisonArtifact | null>>(),
}));

vi.mock("@/lib/data", () => ({
  fetchAddressDetail: dataMocks.fetchAddressDetail,
  fetchComparisonArtifact: dataMocks.fetchComparisonArtifact,
}));

function makeBlock(addressKey: string, medianPrice = 500_000): BlockSummary {
  return {
    addressKey,
    town: "BEDOK",
    block: "1",
    streetName: "BEDOK NTH AVE 1",
    coordinates: { lat: 1.33, lng: 103.92 },
    medianPrice,
    pricePerSqmMedian: 5556,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2026-01",
    availableDateRange: ["2023-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
  };
}

function makeItem(addressKey: string, targetPrice: number | null = null): ShortlistItem {
  return { addressKey, notes: "", targetPrice, addedAt: new Date().toISOString() };
}

function makeDetail(addressKey: string): AddressDetail {
  return {
    summary: { addressKey } as AddressDetail["summary"],
    recentTransactions: [],
    monthlyTrend: [],
  };
}

function makeComparison(addressKey: string): ComparisonArtifact {
  return {
    addressKey,
    town: "BEDOK",
    flatType: "4 ROOM",
    amenities: {} as ComparisonArtifact["amenities"],
    percentileRanks: {} as ComparisonArtifact["percentileRanks"],
    generatedAt: "2026-01-01T00:00:00Z",
  };
}

const baseArgs = {
  blocks: [] as BlockSummary[],
  items: [] as ShortlistItem[],
  savedVisible: true,
  selectedDetail: null,
  selectedComparison: null,
  isShortlistOpen: true,
};

describe("useShortlistArtifacts", () => {
  beforeEach(() => {
    dataMocks.fetchAddressDetail.mockReset();
    dataMocks.fetchComparisonArtifact.mockReset();
  });

  it("returns empty shortlistRows when savedVisible is false", () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a")];
    const { result } = renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items, savedVisible: false }),
    );
    expect(result.current.shortlistRows).toHaveLength(0);
  });

  it("does not fetch when shortlist is not open", () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a")];
    dataMocks.fetchAddressDetail.mockResolvedValue(null);
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);

    renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items, isShortlistOpen: false }),
    );

    expect(dataMocks.fetchAddressDetail).not.toHaveBeenCalled();
    expect(dataMocks.fetchComparisonArtifact).not.toHaveBeenCalled();
  });

  it("fetches detail and comparison for each shortlist item when enabled", async () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a")];
    dataMocks.fetchAddressDetail.mockResolvedValue(makeDetail("addr-a"));
    dataMocks.fetchComparisonArtifact.mockResolvedValue(makeComparison("addr-a"));

    const { result } = renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items }),
    );

    await waitFor(() => {
      expect(result.current.shortlistRows).toHaveLength(1);
      expect(result.current.shortlistRows[0]?.detailSummary).not.toBeNull();
      expect(result.current.shortlistRows[0]?.comparison).not.toBeNull();
    });

    expect(dataMocks.fetchAddressDetail).toHaveBeenCalledWith("addr-a");
    expect(dataMocks.fetchComparisonArtifact).toHaveBeenCalledWith("addr-a");
  });

  it("handles fetch failure gracefully — sets artifact to null", async () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a")];
    dataMocks.fetchAddressDetail.mockRejectedValue(new Error("network error"));
    dataMocks.fetchComparisonArtifact.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items }),
    );

    await waitFor(() => {
      // row still appears (block exists), but detailSummary and comparison are null
      expect(result.current.shortlistRows).toHaveLength(1);
    });

    expect(result.current.shortlistRows[0]?.detailSummary).toBeNull();
    expect(result.current.shortlistRows[0]?.comparison).toBeNull();
  });

  it("does not fetch already-loaded artifacts on re-render", async () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a")];
    dataMocks.fetchAddressDetail.mockResolvedValue(makeDetail("addr-a"));
    dataMocks.fetchComparisonArtifact.mockResolvedValue(makeComparison("addr-a"));

    const { rerender } = renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items }),
    );

    await waitFor(() => {
      expect(dataMocks.fetchAddressDetail).toHaveBeenCalledTimes(1);
    });

    // Force a re-render — same items/blocks
    act(() => rerender());

    // Should still be called only once
    expect(dataMocks.fetchAddressDetail).toHaveBeenCalledTimes(1);
  });

  it("falls back to selectedDetail when shortlist detail not yet loaded", async () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a")];
    const selectedDetail = makeDetail("addr-a");
    const selectedComparison = makeComparison("addr-a");

    // Make fetches pend forever so the fallback kicks in
    dataMocks.fetchAddressDetail.mockReturnValue(new Promise(() => {}));
    dataMocks.fetchComparisonArtifact.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      useShortlistArtifacts({
        ...baseArgs,
        blocks,
        items,
        selectedDetail,
        selectedComparison,
      }),
    );

    // Row should appear with selectedDetail/selectedComparison as fallback
    expect(result.current.shortlistRows).toHaveLength(1);
    expect(result.current.shortlistRows[0]?.detailSummary?.addressKey).toBe("addr-a");
    expect(result.current.shortlistRows[0]?.comparison?.addressKey).toBe("addr-a");
  });

  it("excludes items whose addressKey is not in blocks", () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a"), makeItem("addr-ghost")];

    dataMocks.fetchAddressDetail.mockResolvedValue(null);
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items }),
    );

    expect(result.current.shortlistRows.map((r) => r.item.addressKey)).toEqual(["addr-a"]);
  });

  it("sorts rows by target price gap (ascending), then addedAt for ties", async () => {
    const blocks = [
      makeBlock("addr-close", 500_000),
      makeBlock("addr-far", 500_000),
      makeBlock("addr-no-target", 500_000),
    ];
    const items: ShortlistItem[] = [
      { addressKey: "addr-far", notes: "", targetPrice: 600_000, addedAt: "2026-01-01T00:00:00Z" },
      { addressKey: "addr-close", notes: "", targetPrice: 510_000, addedAt: "2026-01-02T00:00:00Z" },
      { addressKey: "addr-no-target", notes: "", targetPrice: null, addedAt: "2026-01-03T00:00:00Z" },
    ];

    dataMocks.fetchAddressDetail.mockResolvedValue(null);
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items }),
    );

    // Sorted: addr-close gap=10k, addr-far gap=100k, addr-no-target gap=Infinity
    const keys = result.current.shortlistRows.map((r) => r.item.addressKey);
    expect(keys).toEqual(["addr-close", "addr-far", "addr-no-target"]);
  });

  it("fetches multiple items concurrently (all 3 items fetched)", async () => {
    const blocks = ["addr-1", "addr-2", "addr-3"].map(makeBlock);
    const items = ["addr-1", "addr-2", "addr-3"].map(makeItem);

    dataMocks.fetchAddressDetail.mockResolvedValue(null);
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);

    renderHook(() => useShortlistArtifacts({ ...baseArgs, blocks, items }));

    await waitFor(() => {
      expect(dataMocks.fetchAddressDetail).toHaveBeenCalledTimes(3);
    });
  });

  it("cancels in-flight state updates after unmount", async () => {
    const blocks = [makeBlock("addr-a")];
    const items = [makeItem("addr-a")];

    let resolveDetail!: (d: AddressDetail | null) => void;
    dataMocks.fetchAddressDetail.mockReturnValue(
      new Promise<AddressDetail | null>((res) => { resolveDetail = res; }),
    );
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);

    const { result, unmount } = renderHook(() =>
      useShortlistArtifacts({ ...baseArgs, blocks, items }),
    );

    unmount();

    await act(async () => {
      resolveDetail(makeDetail("addr-a"));
      await Promise.resolve();
    });

    // After unmount, state should not have been updated.
    // The detailSummary should still be null because the successful fetch
    // should have been ignored.
    expect(result.current.shortlistRows[0]?.detailSummary).toBeNull();
  });
});
