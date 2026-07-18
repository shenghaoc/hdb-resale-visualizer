import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useListingCheckAnalysis } from "@/features/listing-check/useListingCheckAnalysis";
import type { AddressDetail } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchAddressDetail: vi.fn<(addressKey: string) => Promise<AddressDetail | null>>(),
}));

vi.mock("@/shared/lib/data", () => ({
  fetchAddressDetail: dataMocks.fetchAddressDetail,
}));

function makeDetail(overrides: Partial<AddressDetail["summary"]> = {}): AddressDetail {
  return {
    summary: {
      addressKey: "ang-mo-kio-123a",
      town: "ANG MO KIO",
      block: "123A",
      streetName: "ANG MO KIO AVE 1",
      displayName: null,
      coordinates: { lat: 1.37, lng: 103.84 },
      medianPrice: 600000,
      pricePerSqmMedian: 6452,
      transactionCount: 4,
      floorAreaRange: [90, 96],
      leaseCommenceRange: [1990, 1990],
      latestMonth: "2026-04",
      availableDateRange: ["2023-04", "2026-04"],
      flatTypes: ["4 ROOM", "5 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: null,
      nearbyMrts: [],
      postalCode: null,
      priceIqr: [550000, 650000],
      pricePerSqftMedian: null,
      ...overrides,
    },
    recentTransactions: [
      {
        id: "tx-1",
        month: "2026-03",
        flatType: "4 ROOM",
        storeyRange: "07 TO 09",
        floorAreaSqm: 93,
        flatModel: "MODEL A",
        leaseCommenceDate: 1990,
        remainingLease: "63 years",
        resalePrice: 600000,
        pricePerSqm: 6452,
        pricePerSqft: null,
      },
      {
        id: "tx-2",
        month: "2026-02",
        flatType: "5 ROOM",
        storeyRange: "10 TO 12",
        floorAreaSqm: 110,
        flatModel: "IMPROVED",
        leaseCommenceDate: 1990,
        remainingLease: "63 years",
        resalePrice: 700000,
        pricePerSqm: 6364,
        pricePerSqft: null,
      },
    ],
    monthlyTrend: [],
  };
}

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

function getFetchCall(mock: { mock: { calls: unknown[][] } }, index = 0): FetchCall {
  return mock.mock.calls[index] as unknown as FetchCall;
}

function getFetchBody(mock: { mock: { calls: unknown[][] } }, index = 0): unknown {
  const body = getFetchCall(mock, index)[1]?.body;
  if (typeof body !== "string") {
    throw new Error("Expected fetch body to be a JSON string");
  }
  return JSON.parse(body);
}

function makeComparableResponse() {
  return {
    comparables: [
      {
        transactionId: "cmp-1",
        month: "2026-02",
        town: "ANG MO KIO",
        block: "123A",
        streetName: "ANG MO KIO AVE 1",
        flatType: "4 ROOM",
        storeyRange: "07 TO 09",
        floorAreaSqm: 93,
        leaseCommenceDate: 1990,
        resalePrice: 580000,
        pricePerSqm: 6237,
        similarity: 0.95,
        matchReasons: ["Same flat type", "Similar floor area (±5%)", "Similar storey"],
      },
      {
        transactionId: "cmp-2",
        month: "2026-01",
        town: "ANG MO KIO",
        block: "124",
        streetName: "ANG MO KIO AVE 1",
        flatType: "4 ROOM",
        storeyRange: "07 TO 09",
        floorAreaSqm: 92,
        leaseCommenceDate: 1990,
        resalePrice: 610000,
        pricePerSqm: 6630,
        similarity: 0.9,
        matchReasons: ["Same flat type", "Similar floor area (±5%)"],
      },
      {
        transactionId: "cmp-3",
        month: "2025-12",
        town: "ANG MO KIO",
        block: "200",
        streetName: "ANG MO KIO AVE 3",
        flatType: "4 ROOM",
        storeyRange: "04 TO 06",
        floorAreaSqm: 94,
        leaseCommenceDate: 1991,
        resalePrice: 590000,
        pricePerSqm: 6277,
        similarity: 0.85,
        matchReasons: ["Same flat type"],
      },
    ],
    sameBlockCount: 1,
    sameStreetCount: 2,
    sameTownCount: 3,
    newestComparableAgeMonths: 2,
    widenedSearch: false,
    caveats: [],
    adjustmentApplied: false,
    adjustmentCaveats: [],
  };
}

type HookProps = {
  selectedAddressKey: string | null;
  askingPrice: number | null;
  floorAreaSqm: number | null;
  flatType: string | null;
  storeyRange: string | null;
  leaseCommenceYear: number | null;
  referenceMonth?: string;
};

function renderAnalysis(initial: Partial<HookProps> = {}) {
  const onFlatTypeChange = vi.fn();
  const onStoreyRangeChange = vi.fn();
  const defaults: HookProps = {
    selectedAddressKey: null,
    askingPrice: null,
    floorAreaSqm: null,
    flatType: null,
    storeyRange: null,
    leaseCommenceYear: null,
    referenceMonth: "2026-04",
    ...initial,
  };

  const rendered = renderHook(
    (props: HookProps) =>
      useListingCheckAnalysis({
        ...props,
        onFlatTypeChange,
        onStoreyRangeChange,
      }),
    { initialProps: defaults },
  );

  return { ...rendered, onFlatTypeChange, onStoreyRangeChange, defaults };
}

describe("useListingCheckAnalysis", () => {
  beforeEach(() => {
    dataMocks.fetchAddressDetail.mockReset();
    dataMocks.fetchAddressDetail.mockResolvedValue(makeDetail());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(makeComparableResponse())),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues no detail request without an address", async () => {
    renderAnalysis({ selectedAddressKey: null });
    await act(async () => {
      await Promise.resolve();
    });
    expect(dataMocks.fetchAddressDetail).not.toHaveBeenCalled();
  });

  it("loads detail when an address is selected", async () => {
    const { result } = renderAnalysis({ selectedAddressKey: "ang-mo-kio-123a" });

    await waitFor(() => {
      expect(result.current.detail).not.toBeNull();
    });
    expect(dataMocks.fetchAddressDetail).toHaveBeenCalledWith("ang-mo-kio-123a");
    expect(result.current.selectedBlockLabel).toBe("123A ANG MO KIO AVE 1");
  });

  it("clears detail and analysis state when address is cleared", async () => {
    const { result, rerender } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      floorAreaSqm: 93,
      askingPrice: 650000,
    });

    await waitFor(() => {
      expect(result.current.detail).not.toBeNull();
    });
    await waitFor(() => {
      expect(result.current.comparableSet).not.toBeNull();
    });

    rerender({
      selectedAddressKey: null,
      askingPrice: 650000,
      floorAreaSqm: 93,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: null,
      referenceMonth: "2026-04",
    });

    await waitFor(() => {
      expect(result.current.detail).toBeNull();
      expect(result.current.detailLoading).toBe(false);
      expect(result.current.detailError).toBe(false);
      expect(result.current.comparableSet).toBeNull();
    });
  });

  it("clears stale detail immediately when selecting a different address", async () => {
    let resolveSecond: (value: AddressDetail) => void = () => {};
    const secondPromise = new Promise<AddressDetail>((resolve) => {
      resolveSecond = resolve;
    });

    dataMocks.fetchAddressDetail
      .mockResolvedValueOnce(makeDetail({ addressKey: "ang-mo-kio-123a" }))
      .mockImplementationOnce(() => secondPromise);

    const fetchMock = vi.fn(async () => Response.json(makeComparableResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      floorAreaSqm: 93,
      askingPrice: 650000,
    });

    await waitFor(() => {
      expect(result.current.detail?.summary.addressKey).toBe("ang-mo-kio-123a");
    });
    const comparableCallsBeforeSwitch = fetchMock.mock.calls.length;

    rerender({
      selectedAddressKey: "bedok-1",
      askingPrice: 650000,
      floorAreaSqm: 93,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: null,
      referenceMonth: "2026-04",
    });

    // Stale detail must drop before the next detail resolves.
    await waitFor(() => {
      expect(result.current.detail).toBeNull();
      expect(result.current.detailLoading).toBe(true);
    });
    // Without stale detail, no comparable request should fire for the old address.
    expect(fetchMock.mock.calls.length).toBe(comparableCallsBeforeSwitch);

    await act(async () => {
      resolveSecond(
        makeDetail({
          addressKey: "bedok-1",
          town: "BEDOK",
          block: "1",
          streetName: "BEDOK NORTH",
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.detail?.summary.addressKey).toBe("bedok-1");
    });
  });

  it("ignores stale detail responses for a newer address", async () => {
    let resolveFirst: (value: AddressDetail) => void = () => {};
    const firstPromise = new Promise<AddressDetail>((resolve) => {
      resolveFirst = resolve;
    });

    dataMocks.fetchAddressDetail
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce(
        makeDetail({
          addressKey: "bedok-1",
          town: "BEDOK",
          block: "1",
          streetName: "BEDOK NORTH",
        }),
      );

    const { result, rerender } = renderAnalysis({ selectedAddressKey: "slow-address" });

    rerender({
      selectedAddressKey: "bedok-1",
      askingPrice: null,
      floorAreaSqm: null,
      flatType: null,
      storeyRange: null,
      leaseCommenceYear: null,
      referenceMonth: "2026-04",
    });

    await waitFor(() => {
      expect(result.current.detail?.summary.addressKey).toBe("bedok-1");
    });

    await act(async () => {
      resolveFirst(
        makeDetail({
          addressKey: "slow-address",
          town: "ANG MO KIO",
          block: "999",
          streetName: "SLOW STREET",
        }),
      );
      await Promise.resolve();
    });

    expect(result.current.detail?.summary.addressKey).toBe("bedok-1");
    expect(result.current.detail?.summary.block).toBe("1");
  });

  it("sets detail error state on request failure", async () => {
    dataMocks.fetchAddressDetail.mockRejectedValueOnce(new Error("network"));
    const { result } = renderAnalysis({ selectedAddressKey: "bad-key" });

    await waitFor(() => {
      expect(result.current.detailError).toBe(true);
    });
    expect(result.current.detail).toBeNull();
    expect(result.current.detailLoading).toBe(false);
  });

  it("defaults flat type only when the current value is invalid", async () => {
    const { result, onFlatTypeChange, rerender } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      flatType: "EXECUTIVE",
    });

    await waitFor(() => {
      expect(result.current.flatTypeOptions.length).toBeGreaterThan(0);
    });
    expect(onFlatTypeChange).toHaveBeenCalledWith("4 ROOM");

    onFlatTypeChange.mockClear();
    rerender({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: null,
      floorAreaSqm: null,
      flatType: "4 ROOM",
      storeyRange: null,
      leaseCommenceYear: null,
      referenceMonth: "2026-04",
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(onFlatTypeChange).not.toHaveBeenCalled();
  });

  it("defaults storey range only when the current value is invalid", async () => {
    const { result, onStoreyRangeChange, rerender } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      storeyRange: "99 TO 99",
    });

    await waitFor(() => {
      expect(result.current.storeyOptions.length).toBeGreaterThan(0);
    });
    expect(onStoreyRangeChange).toHaveBeenCalledWith("07 TO 09");

    onStoreyRangeChange.mockClear();
    rerender({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: null,
      floorAreaSqm: null,
      flatType: null,
      storeyRange: "07 TO 09",
      leaseCommenceYear: null,
      referenceMonth: "2026-04",
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(onStoreyRangeChange).not.toHaveBeenCalled();
  });

  it("sends the exact comparable payload to ?adjust=time", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeComparableResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      referenceMonth: "2026-04",
    });

    await waitFor(() => {
      expect(result.current.detail).not.toBeNull();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, init] = getFetchCall(fetchMock);
    expect(url).toBe("/api/comparable-transactions?adjust=time");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(getFetchBody(fetchMock)).toEqual({
      town: "ANG MO KIO",
      block: "123A",
      streetName: "ANG MO KIO AVE 1",
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      referenceMonth: "2026-04",
    });
  });

  it("uses median floor-area midpoint when no floor area is supplied", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeComparableResponse()));
    vi.stubGlobal("fetch", fetchMock);

    renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      floorAreaSqm: null,
      leaseCommenceYear: 1990,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = getFetchBody(fetchMock) as { floorAreaSqm: number };
    expect(body.floorAreaSqm).toBe(93);
  });

  it("issues no comparable request without required detail/options", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeComparableResponse()));
    vi.stubGlobal("fetch", fetchMock);

    renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      flatType: null,
      storeyRange: null,
    });

    await waitFor(() => {
      expect(dataMocks.fetchAddressDetail).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recomputes result on asking-price change without refetching comparables", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeComparableResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: 500000,
      floorAreaSqm: 93,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: 1990,
    });

    await waitFor(() => {
      expect(result.current.result).not.toBeNull();
    });
    const fetchCount = fetchMock.mock.calls.length;
    const firstDelta = result.current.result!.assessment.deltaVsMedian;
    const firstVerdict = result.current.result!.assessment.verdict;

    rerender({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: 1_000_000,
      floorAreaSqm: 93,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: 1990,
      referenceMonth: "2026-04",
    });

    await waitFor(() => {
      expect(result.current.result!.assessment.deltaVsMedian).not.toBe(firstDelta);
    });
    expect(result.current.result!.assessment.verdict).not.toBe(firstVerdict);
    expect(fetchMock.mock.calls.length).toBe(fetchCount);
  });

  it("issues a new comparable request when floor area changes", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeComparableResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: 650000,
      floorAreaSqm: 93,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: 1990,
    });

    await waitFor(() => {
      expect(result.current.comparableSet).not.toBeNull();
    });
    const fetchCount = fetchMock.mock.calls.length;

    rerender({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: 650000,
      floorAreaSqm: 110,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: 1990,
      referenceMonth: "2026-04",
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchCount);
    });
    const lastBody = getFetchBody(fetchMock, fetchMock.mock.calls.length - 1) as {
      floorAreaSqm: number;
    };
    expect(lastBody.floorAreaSqm).toBe(110);
  });

  it("ignores stale comparable responses for newer inputs", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce(
        Response.json({
          ...makeComparableResponse(),
          caveats: ["SECOND_RESPONSE"],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: 650000,
      floorAreaSqm: 93,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: 1990,
    });

    await waitFor(() => {
      expect(result.current.detail).not.toBeNull();
    });

    // Wait until first fetch is in flight
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    rerender({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: 650000,
      floorAreaSqm: 100,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: 1990,
      referenceMonth: "2026-04",
    });

    await waitFor(() => {
      expect(result.current.comparableSet?.caveats).toContain("SECOND_RESPONSE");
    });

    await act(async () => {
      resolveFirst(
        Response.json({
          ...makeComparableResponse(),
          caveats: ["STALE_FIRST"],
        }),
      );
      await Promise.resolve();
    });

    expect(result.current.comparableSet?.caveats).toContain("SECOND_RESPONSE");
    expect(result.current.comparableSet?.caveats).not.toContain("STALE_FIRST");
  });

  it("sets comparable error state on request failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("api down");
      }),
    );

    const { result } = renderAnalysis({
      selectedAddressKey: "ang-mo-kio-123a",
      askingPrice: 650000,
      floorAreaSqm: 93,
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      leaseCommenceYear: 1990,
    });

    await waitFor(() => {
      expect(result.current.comparableSetError).toBe(true);
    });
    expect(result.current.comparableSet).toBeNull();
    expect(result.current.comparableSetLoading).toBe(false);
  });
});
