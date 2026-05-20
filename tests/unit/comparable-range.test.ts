import { describe, expect, it } from "vitest";
import { computeComparableRange } from "@/lib/comparable-range";
import type { BlockSummary } from "@/types/data";

function makeBlock(overrides: Partial<BlockSummary> & { addressKey: string }): BlockSummary {
  return {
    town: "BEDOK",
    block: "1",
    streetName: "TEST",
    displayName: null,
    coordinates: { lat: 1.35, lng: 103.8 },
    medianPrice: 600_000,
    pricePerSqmMedian: 6316,
    transactionCount: 10,
    floorAreaRange: [90, 100],
    leaseCommenceRange: [2000, 2000],
    latestMonth: "2025-01",
    availableDateRange: ["2015-01", "2025-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "X", distanceMeters: 400 },
    nearbyMrts: [],
    postalCode: null,
    ...overrides,
  };
}

describe("computeComparableRange", () => {
  it("returns null when there are no similar blocks", () => {
    const source = makeBlock({ addressKey: "src" });
    expect(computeComparableRange(source, [])).toBeNull();
  });

  it("computes min/max/median across the similar set", () => {
    const source = makeBlock({ addressKey: "src", medianPrice: 600_000 });
    const similar = [
      makeBlock({ addressKey: "a", medianPrice: 540_000 }),
      makeBlock({ addressKey: "b", medianPrice: 580_000 }),
      makeBlock({ addressKey: "c", medianPrice: 620_000 }),
    ];
    const result = computeComparableRange(source, similar);
    expect(result).not.toBeNull();
    expect(result!.minPrice).toBe(540_000);
    expect(result!.maxPrice).toBe(620_000);
    expect(result!.medianPrice).toBe(580_000);
    expect(result!.sampleSize).toBe(3);
  });

  it("reports source delta from the comparable median", () => {
    const source = makeBlock({ addressKey: "src", medianPrice: 660_000 });
    const similar = [
      makeBlock({ addressKey: "a", medianPrice: 590_000 }),
      makeBlock({ addressKey: "b", medianPrice: 600_000 }),
      makeBlock({ addressKey: "c", medianPrice: 610_000 }),
    ];
    const result = computeComparableRange(source, similar)!;
    expect(result.medianPrice).toBe(600_000);
    expect(result.deltaFromMedianPct).toBeCloseTo(10, 5);
  });

  it("averages the two middle elements when sample size is even", () => {
    const source = makeBlock({ addressKey: "src", medianPrice: 600_000 });
    const similar = [
      makeBlock({ addressKey: "a", medianPrice: 500_000 }),
      makeBlock({ addressKey: "b", medianPrice: 600_000 }),
      makeBlock({ addressKey: "c", medianPrice: 620_000 }),
      makeBlock({ addressKey: "d", medianPrice: 700_000 }),
    ];
    const result = computeComparableRange(source, similar)!;
    expect(result.medianPrice).toBe(610_000);
  });
});
