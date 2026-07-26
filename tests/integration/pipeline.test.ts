import { describe, expect, it } from "vite-plus/test";
import {
  buildMrtStationsGeoJson,
  haversineDistanceMeters,
  makeAddressKey,
} from "../../scripts/lib/pipeline";
import {
  buildFixtureArtifacts,
  fixtureGeocodes,
  fixtureMrtExits,
  fixtureTransactions,
} from "../fixtures/pipeline";

describe("pipeline artifacts", () => {
  it("builds summaries, detail files, and town trends", () => {
    const artifacts = buildFixtureArtifacts();

    expect(artifacts.manifest.schemaVersion).toBe("2.0.0");
    expect(artifacts.manifest.counts.blocks).toBe(2);
    expect(artifacts.manifest.filterOptions).toEqual({
      towns: ["ANG MO KIO", "BEDOK"],
      flatTypes: ["3 ROOM", "4 ROOM"],
      flatModels: ["IMPROVED", "MODEL A"],
    });
    expect(artifacts.blockSummaries[0]?.addressKey).toBe(
      makeAddressKey("BEDOK", "101", "BEDOK NTH AVE 4"),
    );
    expect(artifacts.blockSummaries[0]?.displayName).toBe("BEDOK NORTH GREEN");
    expect("priceIqr" in (artifacts.blockSummaries[0] ?? {})).toBe(false);
    expect(
      artifacts.blockSummaries.find(
        (block) => block.addressKey === makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10"),
      )?.pricePerSqmMedian,
    ).toBeCloseTo(5611.94, 2);
    expect(
      artifacts.details[makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10")]?.summary
        .displayName,
    ).toBeNull();
    expect(
      artifacts.details[makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10")],
    ).toBeTruthy();
    expect(artifacts.townFlatTypeTrend).toHaveLength(3);
  });

  it("computes station distance in meters", () => {
    const distance = haversineDistanceMeters(
      {
        lat: fixtureGeocodes["ang-mo-kio-406-ang-mo-kio-ave-10"].lat,
        lng: fixtureGeocodes["ang-mo-kio-406-ang-mo-kio-ave-10"].lng,
      },
      { lat: 1.3691, lng: 103.8491 },
    );

    expect(distance).toBeLessThan(20);
  });

  it("aggregates MRT exits into station markers without changing nearest-station distance", () => {
    const stations = buildMrtStationsGeoJson(fixtureMrtExits);
    const angMoKioStation = stations.features.find(
      (feature) => feature.properties.stationName === "ANG MO KIO MRT STATION",
    );
    const artifacts = buildFixtureArtifacts();
    const nearestMrt =
      artifacts.details[makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10")]?.summary
        .nearestMrt;

    expect(stations.features).toHaveLength(2);
    expect(angMoKioStation?.geometry.coordinates[0]).toBeCloseTo(103.84985, 5);
    expect(angMoKioStation?.geometry.coordinates[1]).toBeCloseTo(1.3698, 5);
    expect(angMoKioStation?.properties).toMatchObject({
      stationName: "ANG MO KIO MRT STATION",
      color: "#d11141",
      lines: ["NSL"],
      isInterchange: false,
    });
    // 16 m fallback estimate: round(16 / 1.25) = 13 s.
    expect(nearestMrt).toEqual({
      stationName: "ANG MO KIO MRT STATION",
      distanceMeters: 16,
      walkingTimeSeconds: 13,
    });
  });

  it("uses block-level lease commence year and captures nearby MRT options", () => {
    const artifacts = buildFixtureArtifacts();
    const angMoKioSummary =
      artifacts.details[makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10")]?.summary;

    expect(angMoKioSummary?.leaseCommenceRange).toEqual([1979, 1979]);
    expect(angMoKioSummary?.priceIqr).toEqual([374000, 378000]);
    expect(angMoKioSummary?.pricePerSqmMedian).toBeCloseTo(5611.94, 2);
    expect(angMoKioSummary?.pricePerSqftMedian).toBeCloseTo(521.37, 2);
    expect(angMoKioSummary?.nearbyMrts?.[0]).toEqual({
      stationName: "ANG MO KIO MRT STATION",
      distanceMeters: 16,
      walkingTimeSeconds: 13,
    });
  });

  it("emits one coherent evidence cohort per canonical flat type", () => {
    const base = fixtureTransactions[0]!;
    const artifacts = buildFixtureArtifacts([
      ...fixtureTransactions,
      {
        ...base,
        id: "alpha-multi-1",
        month: "2025-11",
        flatType: "MULTI GENERATION",
        floorAreaSqm: 130,
        flatModel: "MODEL A",
        resalePrice: 800000,
        pricePerSqm: 6153.85,
      },
      {
        ...base,
        id: "alpha-multi-2",
        month: "2025-11",
        flatType: "MULTI-GENERATION",
        floorAreaSqm: 135,
        flatModel: "MODEL B",
        resalePrice: 850000,
        pricePerSqm: 6296.3,
      },
    ]);
    const summary = artifacts.blockSummaries.find(
      (block) => block.addressKey === makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10"),
    );

    expect(summary?.flatTypes).toContain("MULTI-GENERATION");
    expect(summary?.flatTypeCohorts?.["MULTI-GENERATION"]).toEqual({
      transactionCount: 2,
      latestMonth: "2025-11",
      floorAreaRange: [130, 135],
      flatModels: ["MODEL A", "MODEL B"],
    });
    expect(summary?.medianPriceByFlatType?.["MULTI-GENERATION"]).toBe(825000);
    expect(
      new Set(
        artifacts.transactions
          ?.filter((row) => row.address_key === summary?.addressKey)
          .map((row) => row.flat_type),
      ),
    ).toEqual(new Set(["3 ROOM", "MULTI-GENERATION"]));
    expect(
      artifacts.townFlatTypeTrend.filter(
        (row) =>
          row.town === "ANG MO KIO" && row.month === "2025-11" && row.flatType.includes("MULTI"),
      ),
    ).toEqual([
      expect.objectContaining({
        flatType: "MULTI-GENERATION",
        transactionCount: 2,
      }),
    ]);
    expect(
      artifacts.details[summary?.addressKey ?? ""]?.recentTransactions
        .filter((row) => row.flatType.includes("MULTI"))
        .map((row) => row.flatType),
    ).toEqual(["MULTI-GENERATION", "MULTI-GENERATION"]);
  });

  it("keeps an older real flat type selectable outside the recent cohort window", () => {
    const base = fixtureTransactions[0]!;
    const recentTransactions = Array.from({ length: 24 }, (_, index) => {
      const year = 2024 + Math.floor(index / 12);
      const month = String((index % 12) + 1).padStart(2, "0");
      return {
        ...base,
        id: `recent-${index}`,
        month: `${year}-${month}`,
        flatType: "3 ROOM",
      };
    });
    const artifacts = buildFixtureArtifacts([
      ...recentTransactions,
      {
        ...base,
        id: "older-real-type",
        month: "2023-12",
        flatType: "4 ROOM",
        floorAreaSqm: 92,
        resalePrice: 560000,
        pricePerSqm: 6086.96,
      },
    ]);
    const summary = artifacts.blockSummaries[0];

    expect(summary?.flatTypes).toEqual(["3 ROOM", "4 ROOM"]);
    expect(summary?.flatTypeCohorts?.["3 ROOM"]).toBeDefined();
    expect(summary?.flatTypeCohorts?.["4 ROOM"]).toEqual({
      transactionCount: 1,
      latestMonth: "2023-12",
      floorAreaRange: [92, 92],
      flatModels: ["IMPROVED"],
    });
    expect(summary?.medianPriceByFlatType?.["4 ROOM"]).toBe(560000);
    expect(artifacts.transactions?.some((row) => row.flat_type === "4 ROOM")).toBe(true);
  });

  it("rejects an empty transaction dataset before producing an invalid manifest", () => {
    expect(() => buildFixtureArtifacts([])).toThrow(
      "Cannot build artifacts without at least one resale transaction",
    );
  });

  it("rejects malformed transaction months before recency arithmetic", () => {
    expect(() => buildFixtureArtifacts([{ ...fixtureTransactions[0], month: "2026-13" }])).toThrow(
      'Invalid transaction month "2026-13" for transaction "alpha-1"',
    );
  });
});
