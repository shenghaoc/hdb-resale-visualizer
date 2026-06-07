import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATA_FETCH_USER_ERROR_MESSAGE,
  fetchBlockSummaries,
  fetchManifest,
  fetchTownFlatTypeTrends,
  resetFetchRetrySettingsForTests,
  resetTownFlatTypeTrendsCacheForTests,
  setFetchRetryDelayForTests,
} from "@/lib/data";

function mockJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe("artifact fetch validation", () => {
  afterEach(() => {
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

    await expect(fetchManifest()).resolves.toMatchObject({
      schemaVersion: "2.0.0",
      generatedAt: undefined,
      sources: {},
    });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse([{ addressKey: "only-one-field" }])));

    await expect(fetchBlockSummaries()).rejects.toThrow(/Artifact contract violation/);
  });

  it("recovers from transient 500 with automatic retry", async () => {
    setFetchRetryDelayForTests(0);
    const fetchMock = vi.fn()
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
    const fetchMock = vi.fn()
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
});
