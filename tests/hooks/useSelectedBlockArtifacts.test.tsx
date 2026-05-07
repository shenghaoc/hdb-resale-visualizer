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
});
