import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DATA_FETCH_USER_ERROR_MESSAGE,
  fetchAddressDetail,
  fetchBlocksByTown,
  resetBlocksByTownCacheForTests,
  resetFetchRetrySettingsForTests,
  setFetchRetryDelayForTests,
} from "@/shared/lib/data";

function mockJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(payload) } as unknown as Response;
}

function validAddressDetail() {
  return {
    summary: {
      addressKey: "ang-mo-kio-123a",
      town: "ANG MO KIO",
      block: "123A",
      streetName: "ANG MO KIO AVE 1",
      coordinates: { lat: 1.37, lng: 103.84 },
      medianPrice: 600000,
      pricePerSqmMedian: 6452,
      transactionCount: 4,
      floorAreaRange: [90, 96],
      leaseCommenceRange: [1990, 1990],
      latestMonth: "2026-04",
      availableDateRange: ["2023-04", "2026-04"],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: null,
      priceIqr: [550000, 650000],
      pricePerSqftMedian: null,
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
    ],
    monthlyTrend: [],
  };
}

function validBlockSummary() {
  return {
    addressKey: "bedok-101-bedok-nth-ave-4",
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 500000,
    pricePerSqmMedian: 6000,
    transactionCount: 10,
    floorAreaRange: [45, 110],
    leaseCommenceRange: [1980, 1980],
    latestMonth: "2026-01",
    availableDateRange: ["2020-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
  };
}

describe("fetchAddressDetail", () => {
  afterEach(() => {
    resetFetchRetrySettingsForTests();
    vi.unstubAllGlobals();
  });

  it("parses a valid block-detail payload", async () => {
    const payload = validAddressDetail();
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAddressDetail("ang-mo-kio-123a")).resolves.toMatchObject({
      summary: { addressKey: "ang-mo-kio-123a", medianPrice: 600000 },
      recentTransactions: [{ id: "tx-1" }],
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/details/ang-mo-kio-123a");
  });

  it("throws an artifact-contract error for an incomplete detail payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ summary: { addressKey: "only-one-field" } })),
    );

    await expect(fetchAddressDetail("ang-mo-kio-123a")).rejects.toThrow(
      /Artifact contract violation/,
    );
  });

  it("does not retry a 404 missing block", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({}, false, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAddressDetail("missing-block")).rejects.toThrow(/Failed to load/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 429 then surfaces a user-visible error", async () => {
    setFetchRetryDelayForTests(0);
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({}, false, 429));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAddressDetail("ang-mo-kio-123a")).rejects.toMatchObject({
      userMessage: DATA_FETCH_USER_ERROR_MESSAGE,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("fetchBlocksByTown", () => {
  afterEach(() => {
    resetBlocksByTownCacheForTests();
    resetFetchRetrySettingsForTests();
    vi.unstubAllGlobals();
  });

  it("reuses the in-flight request for the same town", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([validBlockSummary()]));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      fetchBlocksByTown("BEDOK"),
      fetchBlocksByTown("BEDOK"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/blocks/bedok");
    expect(first).toBe(second);
  });

  it("slugifies KALLANG/WHAMPOA for the town endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchBlocksByTown("KALLANG/WHAMPOA");
    expect(fetchMock).toHaveBeenCalledWith("/api/blocks/kallang-whampoa");
  });

  it("drops a failed town cache entry so a later request can retry", async () => {
    setFetchRetryDelayForTests(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({}, false, 500))
      .mockResolvedValueOnce(mockJsonResponse({}, false, 500))
      .mockResolvedValueOnce(mockJsonResponse({}, false, 500))
      .mockResolvedValueOnce(mockJsonResponse([validBlockSummary()]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBlocksByTown("BEDOK")).rejects.toMatchObject({
      userMessage: DATA_FETCH_USER_ERROR_MESSAGE,
    });
    await expect(fetchBlocksByTown("BEDOK")).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
