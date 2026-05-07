import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectedBlockArtifacts } from "@/hooks/useSelectedBlockArtifacts";
import type { AddressDetail, ComparisonArtifact } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchAddressDetail: vi.fn(),
  fetchComparisonArtifact: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  fetchAddressDetail: dataMocks.fetchAddressDetail,
  fetchComparisonArtifact: dataMocks.fetchComparisonArtifact,
}));

const detail = {
  summary: { addressKey: "bedok-101-bedok-nth-ave-4" },
  recentTransactions: [],
  monthlyTrend: [],
} as unknown as AddressDetail;

const comparison = {
  addressKey: "bedok-101-bedok-nth-ave-4",
} as unknown as ComparisonArtifact;

type HookProps = {
  selectedAddressKey: string | null;
};

describe("useSelectedBlockArtifacts", () => {
  beforeEach(() => {
    dataMocks.fetchAddressDetail.mockReset();
    dataMocks.fetchComparisonArtifact.mockReset();
  });

  it("returns loading again when reopening the same selected address", async () => {
    dataMocks.fetchAddressDetail.mockResolvedValueOnce(detail);
    dataMocks.fetchComparisonArtifact.mockResolvedValueOnce(comparison);

    const initialProps: HookProps = { selectedAddressKey: "bedok-101-bedok-nth-ave-4" };
    const { result, rerender } = renderHook(
      ({ selectedAddressKey }: HookProps) => useSelectedBlockArtifacts(selectedAddressKey),
      { initialProps },
    );

    expect(result.current.isDetailLoading).toBe(true);
    expect(result.current.isComparisonLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isDetailLoading).toBe(false);
      expect(result.current.isComparisonLoading).toBe(false);
    });

    act(() => {
      rerender({ selectedAddressKey: null });
    });

    expect(result.current.detail).toBeNull();
    expect(result.current.comparison).toBeNull();

    dataMocks.fetchAddressDetail.mockResolvedValueOnce(detail);
    dataMocks.fetchComparisonArtifact.mockResolvedValueOnce(comparison);

    act(() => {
      rerender({ selectedAddressKey: "bedok-101-bedok-nth-ave-4" });
    });

    expect(result.current.detail).toBeNull();
    expect(result.current.comparison).toBeNull();
    expect(result.current.isDetailLoading).toBe(true);
    expect(result.current.isComparisonLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isDetailLoading).toBe(false);
      expect(result.current.isComparisonLoading).toBe(false);
    });
    expect(dataMocks.fetchAddressDetail).toHaveBeenCalledTimes(2);
    expect(dataMocks.fetchComparisonArtifact).toHaveBeenCalledTimes(2);
  });

  it("clears loading and returns null artifacts when fetches fail", async () => {
    dataMocks.fetchAddressDetail.mockRejectedValueOnce(new Error("detail failed"));
    dataMocks.fetchComparisonArtifact.mockRejectedValueOnce(new Error("comparison failed"));

    const { result } = renderHook(
      ({ selectedAddressKey }: HookProps) => useSelectedBlockArtifacts(selectedAddressKey),
      {
        initialProps: { selectedAddressKey: "bedok-101-bedok-nth-ave-4" },
      },
    );

    expect(result.current.detail).toBeNull();
    expect(result.current.comparison).toBeNull();
    expect(result.current.isDetailLoading).toBe(true);
    expect(result.current.isComparisonLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isDetailLoading).toBe(false);
      expect(result.current.isComparisonLoading).toBe(false);
    });

    expect(result.current.detail).toBeNull();
    expect(result.current.comparison).toBeNull();
    expect(dataMocks.fetchAddressDetail).toHaveBeenCalledTimes(1);
    expect(dataMocks.fetchComparisonArtifact).toHaveBeenCalledTimes(1);
  });

  it("does not expose stale data when selection changes rapidly", async () => {
    const detailA = {
      summary: { addressKey: "addr-a" },
      recentTransactions: [],
      monthlyTrend: [],
    } as unknown as AddressDetail;
    const detailB = {
      summary: { addressKey: "addr-b" },
      recentTransactions: [],
      monthlyTrend: [],
    } as unknown as AddressDetail;

    // Simulate a slow fetch for A and a fast fetch for B
    let resolveA: (value: AddressDetail) => void = () => {};
    const promiseA = new Promise<AddressDetail>((resolve) => {
      resolveA = resolve;
    });
    dataMocks.fetchAddressDetail.mockReturnValueOnce(promiseA);
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);

    const { result, rerender } = renderHook(
      ({ selectedAddressKey }: HookProps) => useSelectedBlockArtifacts(selectedAddressKey),
      { initialProps: { selectedAddressKey: "addr-a" } },
    );

    expect(result.current.isDetailLoading).toBe(true);

    // Switch to B before A resolves
    dataMocks.fetchAddressDetail.mockResolvedValueOnce(detailB);
    act(() => {
      rerender({ selectedAddressKey: "addr-b" });
    });

    // B should be loading, detail should be null (cleared by prevKey pattern)
    expect(result.current.detail).toBeNull();
    expect(result.current.isDetailLoading).toBe(true);

    // B resolves
    await waitFor(() => {
      expect(result.current.isDetailLoading).toBe(false);
    });
    expect(result.current.detail).toBe(detailB);

    // Now A resolves late — it should NOT overwrite B's data because
    // the effect for A was cleaned up (isMounted = false)
    act(() => {
      resolveA(detailA);
    });
    // Flush microtasks
    await waitFor(() => {
      expect(result.current.detail).toBe(detailB);
    });
  });
});
