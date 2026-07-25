import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DATA_FETCH_USER_ERROR_MESSAGE,
  fetchBlockSummaries,
  fetchManifest,
  fetchTownFlatTypeTrends,
  fetchBlocksBySearch,
  resetBlockSummariesCacheForTests,
  resetBlocksBySearchCacheForTests,
  resetFetchRetrySettingsForTests,
  resetTownFlatTypeTrendsCacheForTests,
  setFetchRetryDelayForTests,
} from "@/shared/lib/data";

function mockJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe("artifact fetch validation", () => {
  afterEach(() => {
    resetBlockSummariesCacheForTests();
    resetBlocksBySearchCacheForTests();
    resetTownFlatTypeTrendsCacheForTests();
    resetFetchRetrySettingsForTests();
    vi.unstubAllGlobals();
  });

  it("parses manifest when artifact shape is valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          schemaVersion: "2.0.0",
          generatedAt: "2026-01-01T00:00:00Z",
          dataWindow: { minMonth: "2020-01", maxMonth: "2026-01" },
          sources: {
            resaleCollectionId: "a",
            resaleDatasetIds: ["b"],
            propertyDatasetId: "c",
            mrtDatasetId: "d",
            lastUpdatedAt: "2026-01-01T00:00:00Z",
          },
          filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["Model A"] },
          counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
        }),
      ),
    );

    await expect(fetchManifest()).resolves.toMatchObject({ schemaVersion: "2.0.0" });
  });

  it("parses manifest when optional metadata fields are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          schemaVersion: "2.0.0",
          dataWindow: { minMonth: "2020-01", maxMonth: "2026-01" },
          filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["Model A"] },
          counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
        }),
      ),
    );

    const manifest = await fetchManifest();
    expect(manifest.schemaVersion).toBe("2.0.0");
    expect(manifest.generatedAt).toBeUndefined();
    expect(manifest.sources).toEqual({});
  });

  it("parses manifest when source metadata is partial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          schemaVersion: "2.0.0",
          generatedAt: "2026-01-01T00:00:00Z",
          dataWindow: { minMonth: "2020-01", maxMonth: "2026-01" },
          sources: {
            resaleCollectionId: "a",
          },
          filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["Model A"] },
          counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
        }),
      ),
    );

    await expect(fetchManifest()).resolves.toMatchObject({
      sources: {
        resaleCollectionId: "a",
      },
    });
  });

  it("throws precise artifact-contract error for invalid block summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse([{ addressKey: "only-one-field" }])),
    );

    await expect(fetchBlockSummaries()).rejects.toThrow(/Artifact contract violation/);
  });

  it("preserves flat-type median maps from fetched block summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse([
          {
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
            flatTypes: ["2 ROOM", "4 ROOM"],
            flatModels: ["MODEL A"],
            medianPriceByFlatType: { "2 ROOM": 400000, "4 ROOM": 700000 },
            medianPricePerSqmByFlatType: { "2 ROOM": 5500, "4 ROOM": 6500 },
            flatTypeCohorts: {
              "2 ROOM": {
                transactionCount: 4,
                latestMonth: "2025-12",
                floorAreaRange: [45, 55],
                flatModels: ["MODEL A"],
              },
              "4 ROOM": {
                transactionCount: 6,
                latestMonth: "2026-01",
                floorAreaRange: [90, 110],
                flatModels: ["MODEL B"],
              },
            },
            nearestMrt: null,
          },
        ]),
      ),
    );

    await expect(fetchBlockSummaries()).resolves.toMatchObject([
      {
        medianPriceByFlatType: { "2 ROOM": 400000, "4 ROOM": 700000 },
        medianPricePerSqmByFlatType: { "2 ROOM": 5500, "4 ROOM": 6500 },
        flatTypeCohorts: {
          "2 ROOM": {
            transactionCount: 4,
            latestMonth: "2025-12",
            floorAreaRange: [45, 55],
            flatModels: ["MODEL A"],
          },
          "4 ROOM": {
            transactionCount: 6,
            latestMonth: "2026-01",
            floorAreaRange: [90, 110],
            flatModels: ["MODEL B"],
          },
        },
      },
    ]);
  });

  it("recovers from transient 500 with automatic retry", async () => {
    setFetchRetryDelayForTests(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse([], false, 500))
      .mockResolvedValueOnce(
        mockJsonResponse({
          schemaVersion: "2.0.0",
          generatedAt: "2026-01-01T00:00:00Z",
          dataWindow: { minMonth: "2020-01", maxMonth: "2026-01" },
          sources: {
            resaleCollectionId: "a",
            resaleDatasetIds: ["b"],
            propertyDatasetId: "c",
            mrtDatasetId: "d",
            lastUpdatedAt: "2026-01-01T00:00:00Z",
          },
          filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["Model A"] },
          counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchManifest()).resolves.toMatchObject({ schemaVersion: "2.0.0" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a user-visible error after exhausting retries", async () => {
    setFetchRetryDelayForTests(0);
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([], false, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchManifest()).rejects.toMatchObject({
      userMessage: DATA_FETCH_USER_ERROR_MESSAGE,
      message: DATA_FETCH_USER_ERROR_MESSAGE,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries town flat-type trends after a transient failure", async () => {
    setFetchRetryDelayForTests(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse([], false, 503))
      .mockResolvedValueOnce(
        mockJsonResponse([
          {
            town: "BEDOK",
            flatType: "4 ROOM",
            month: "2024-01",
            medianPrice: 580_000,
            medianPricePerSqm: 6105.26,
            transactionCount: 12,
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTownFlatTypeTrends()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves cohortMetadataAvailable=false so an unanswerable search is not read as zero matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({
            blocks: [],
            truncated: false,
            limit: 2000,
            cohortMetadataAvailable: false,
          }),
        ),
    );

    const result = await fetchBlocksBySearch({
      town: "",
      flatType: "4 ROOM",
      flatModel: "Improved",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      mrtMax: null,
    });

    expect(result.blocks).toEqual([]);
    expect(result.cohortMetadataAvailable).toBe(false);
  });

  it("treats a response without cohortMetadataAvailable as answerable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ blocks: [], truncated: false, limit: 2000 })),
    );

    const result = await fetchBlocksBySearch({
      town: "BEDOK",
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
    });

    expect(result.cohortMetadataAvailable).toBe(true);
  });
});
