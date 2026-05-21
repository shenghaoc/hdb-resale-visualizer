import { describe, expect, it } from "vitest";
import { toGeoJson } from "@/lib/map";
import type { BlockSummary } from "@/types/data";

function makeBlock(overrides: Partial<BlockSummary> = {}): BlockSummary {
  return {
    addressKey: "test-block-1",
    town: "BEDOK",
    block: "100",
    streetName: "BEDOK NORTH AVE 4",
    coordinates: { lat: 1.33, lng: 103.93 },
    medianPrice: 600000,
    transactionCount: 10,
    floorAreaRange: [65, 120],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-06",
    availableDateRange: ["2021-01", "2024-06"],
    flatTypes: ["3 ROOM", "5 ROOM"],
    flatModels: ["NEW GENERATION", "IMPROVED"],
    nearestMrt: { stationName: "Bedok", distanceMeters: 500 },
    nearbyMrts: [{ stationName: "Bedok", distanceMeters: 500 }],
    postalCode: "460100",
    ...overrides,
  };
}

describe("toGeoJson", () => {
  it("uses block medianPrice when no flatType is provided", () => {
    const block = makeBlock({
      medianPrice: 600000,
      medianPriceByFlatType: { "3 ROOM": 480000, "5 ROOM": 720000 },
    });
    const result = toGeoJson([block]);
    expect(result.features[0].properties.median_price).toBe(600000);
  });

  it("uses flat-type-specific median when flatType is provided", () => {
    const block = makeBlock({
      medianPrice: 600000,
      medianPriceByFlatType: { "3 ROOM": 480000, "5 ROOM": 720000 },
    });
    const result = toGeoJson([block], "3 ROOM");
    expect(result.features[0].properties.median_price).toBe(480000);
  });

  it("falls back to block median when block has no medianPriceByFlatType", () => {
    const block = makeBlock({ medianPrice: 600000, medianPriceByFlatType: undefined });
    const result = toGeoJson([block], "3 ROOM");
    expect(result.features[0].properties.median_price).toBe(600000);
  });

  it("falls back to block median when flatType is not in medianPriceByFlatType", () => {
    const block = makeBlock({
      medianPrice: 600000,
      medianPriceByFlatType: { "3 ROOM": 480000 },
    });
    const result = toGeoJson([block], "EXECUTIVE");
    expect(result.features[0].properties.median_price).toBe(600000);
  });

  it("uses canonical key for MULTI-GENERATION lookup", () => {
    const block = makeBlock({
      medianPrice: 900000,
      medianPriceByFlatType: { "MULTI-GENERATION": 850000 },
    });
    const result = toGeoJson([block], "MULTI-GENERATION");
    expect(result.features[0].properties.median_price).toBe(850000);
  });
});
