import { describe, expect, it } from "vitest";
import { toGeoJson } from "../../src/lib/map";
import type { BlockSummary } from "../../src/types/data";

function makeBlock(overrides: Partial<BlockSummary> = {}): BlockSummary {
  return {
    addressKey: "mixed-block",
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 600_000,
    pricePerSqmMedian: 7_500,
    transactionCount: 4,
    floorAreaRange: [60, 120],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-12",
    availableDateRange: ["2020-01", "2024-12"],
    flatTypes: ["3 ROOM", "5 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
    ...overrides,
  };
}

describe("toGeoJson", () => {
  it("uses precomputed pricePerSqmMedian instead of medianPrice / midArea proxy", () => {
    const block = makeBlock({
      medianPrice: 600_000,
      pricePerSqmMedian: 7_500,
      floorAreaRange: [60, 120],
    });
    const midAreaProxy = Number((block.medianPrice / ((block.floorAreaRange[0] + block.floorAreaRange[1]) / 2)).toFixed(2));

    expect(midAreaProxy).toBe(6666.67);
    expect(toGeoJson([block]).features[0]?.properties.price_per_sqm_median).toBe(7500);
  });
});
