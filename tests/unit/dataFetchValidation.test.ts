import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBlockSummaries, fetchManifest } from "@/lib/data";

function mockJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe("artifact fetch validation", () => {
  afterEach(() => {
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

  it("throws precise artifact-contract error for invalid block summaries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse([{ addressKey: "only-one-field" }])));

    await expect(fetchBlockSummaries()).rejects.toThrow(/Artifact contract violation/);
  });
});
