import { describe, expect, it } from "vitest";
import { deriveDataQualityState } from "@/lib/dataQuality";
import type { Manifest } from "@/types/data";

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: "2.0.0",
    generatedAt: "2026-06-01T00:00:00Z",
    dataWindow: { minMonth: "2020-01", maxMonth: "2026-05" },
    sources: {
      resaleCollectionId: "resale",
      resaleDatasetIds: ["dataset-a"],
      propertyDatasetId: "property",
      mrtDatasetId: "mrt",
      lastUpdatedAt: "2026-05-31T00:00:00Z",
    },
    filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["Model A"] },
    counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
    ...overrides,
  };
}

describe("deriveDataQualityState", () => {
  it("marks complete recent metadata as fresh", () => {
    const state = deriveDataQualityState(
      makeManifest(),
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.syncState).toBe("fresh");
    expect(state.sourceLabels).toEqual(["data.gov.sg", "OneMap"]);
    // Provenance identifiers are preserved for the source-transparency surface.
    expect(state.resaleCollectionId).toBe("resale");
    expect(state.resaleDatasetCount).toBe(1);
  });

  it("marks old latest-month metadata as stale", () => {
    const state = deriveDataQualityState(
      makeManifest({
        dataWindow: { minMonth: "2020-01", maxMonth: "2025-12" },
      }),
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.syncState).toBe("stale");
  });

  it("marks missing optional metadata as partial", () => {
    const state = deriveDataQualityState(
      {
        schemaVersion: "2.0.0",
        dataWindow: { minMonth: "2020-01", maxMonth: "2026-05" },
        filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["Model A"] },
        counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
        sources: {},
      },
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.syncState).toBe("partial");
    expect(state.generatedAt).toBeNull();
    expect(state.lastSyncedAt).toBeNull();
    expect(state.sourceLabels).toEqual([]);
  });

  it("marks partial source metadata as partial", () => {
    const state = deriveDataQualityState(
      makeManifest({
        sources: {
          resaleCollectionId: "resale",
        },
      }),
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.syncState).toBe("partial");
    expect(state.sourceLabels).toEqual(["data.gov.sg"]);
  });

  it("marks null manifest as missing", () => {
    const state = deriveDataQualityState(null, new Date("2026-06-15T00:00:00Z"));

    expect(state.syncState).toBe("missing");
    expect(state.latestMonthUsed).toBeNull();
    expect(state.generatedAt).toBeNull();
    expect(state.lastSyncedAt).toBeNull();
    expect(state.sourceLabels).toEqual([]);
  });

  it("marks empty object manifest as missing", () => {
    const state = deriveDataQualityState({}, new Date("2026-06-15T00:00:00Z"));

    expect(state.syncState).toBe("missing");
    expect(state.latestMonthUsed).toBeNull();
    expect(state.generatedAt).toBeNull();
  });

  it("returns latestMonthUsed from dataWindow.maxMonth", () => {
    const state = deriveDataQualityState(
      makeManifest(),
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.latestMonthUsed).toBe("2026-05");
  });

  it("returns generatedAt and lastSyncedAt from manifest", () => {
    const state = deriveDataQualityState(
      makeManifest(),
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.generatedAt).toBe("2026-06-01T00:00:00Z");
    expect(state.lastSyncedAt).toBe("2026-05-31T00:00:00Z");
  });

  it("treats invalid generatedAt as null", () => {
    const state = deriveDataQualityState(
      makeManifest({ generatedAt: "not-a-date" }),
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.generatedAt).toBeNull();
    expect(state.syncState).toBe("partial");
  });

  it("detects stale even when other fields are partial", () => {
    const state = deriveDataQualityState(
      {
        schemaVersion: "2.0.0",
        dataWindow: { minMonth: "2020-01", maxMonth: "2024-01" },
        filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["M"] },
        counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
        sources: {},
      },
      new Date("2026-06-15T00:00:00Z"),
    );

    expect(state.syncState).toBe("stale");
  });
});
