import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/constants";
import {
  getEffectiveMedianPrice,
  getEffectivePricePerSqmMedian,
  matchesFilter,
  resetFilteringCachesForTests,
} from "@/lib/filtering";
import type { BlockSummary } from "@/types/data";

/**
 * Creates a minimal BlockSummary fixture with support for medianPriceByFlatType.
 */
function makeBlock(overrides: Partial<BlockSummary> = {}): BlockSummary {
  return {
    addressKey: "test-block-1",
    town: "BEDOK",
    block: "100",
    streetName: "BEDOK NORTH AVE 4",
    coordinates: { lat: 1.33, lng: 103.93 },
    medianPrice: 600000,
    pricePerSqmMedian: 9000,
    transactionCount: 10,
    floorAreaRange: [65, 120],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-06",
    availableDateRange: ["2021-01", "2024-06"],
    flatTypes: ["3 ROOM", "5 ROOM"],
    flatModels: ["NEW GENERATION", "IMPROVED"],
    nearestMrt: { stationName: "Bedok", distanceMeters: 500, walkingTimeSeconds: 400 },
    nearbyMrts: [{ stationName: "Bedok", distanceMeters: 500, walkingTimeSeconds: 400 }],
    postalCode: "460100",
    ...overrides,
  };
}

describe("budget filter with flat-type-specific median", () => {
  beforeEach(() => {
    resetFilteringCachesForTests();
  });

  it("includes block when flat-type-specific median is within budget even though block median exceeds budget", () => {
    // Block has 3-room median 480k and 5-room median 720k.
    // Overall block median is 600k (skewed by 5-room).
    // Filtering for 3 ROOM with budgetMax=500k should INCLUDE this block.
    const block = makeBlock({
      medianPrice: 600000,
      flatTypes: ["3 ROOM", "5 ROOM"],
      medianPriceByFlatType: {
        "3 ROOM": 480000,
        "5 ROOM": 720000,
      },
    });

    const result = matchesFilter(block, {
      ...DEFAULT_FILTERS,
      flatType: "3 ROOM",
      budgetMax: 500000,
    });

    expect(result).toBe(true);
  });

  it("excludes block when flat-type-specific median exceeds budget", () => {
    const block = makeBlock({
      medianPrice: 600000,
      flatTypes: ["3 ROOM", "5 ROOM"],
      medianPriceByFlatType: {
        "3 ROOM": 480000,
        "5 ROOM": 720000,
      },
    });

    const result = matchesFilter(block, {
      ...DEFAULT_FILTERS,
      flatType: "5 ROOM",
      budgetMax: 500000,
    });

    expect(result).toBe(false);
  });

  it("falls back to block median when no flatType filter is active", () => {
    const block = makeBlock({
      medianPrice: 600000,
      medianPriceByFlatType: {
        "3 ROOM": 480000,
        "5 ROOM": 720000,
      },
    });

    // Without flatType filter, budgetMax=500k should exclude this block (median=600k)
    const result = matchesFilter(block, {
      ...DEFAULT_FILTERS,
      budgetMax: 500000,
    });

    expect(result).toBe(false);
  });

  it("falls back to block median when medianPriceByFlatType is undefined", () => {
    const block = makeBlock({
      medianPrice: 450000,
      medianPriceByFlatType: undefined,
    });

    const result = matchesFilter(block, {
      ...DEFAULT_FILTERS,
      flatType: "3 ROOM",
      budgetMax: 500000,
    });

    expect(result).toBe(true);
  });

  it("uses budgetMin correctly with flat-type-specific median", () => {
    const block = makeBlock({
      medianPrice: 600000,
      flatTypes: ["3 ROOM", "5 ROOM"],
      medianPriceByFlatType: {
        "3 ROOM": 480000,
        "5 ROOM": 720000,
      },
    });

    // 3 ROOM median is 480k, budgetMin is 500k — should exclude
    const result = matchesFilter(block, {
      ...DEFAULT_FILTERS,
      flatType: "3 ROOM",
      budgetMin: 500000,
    });

    expect(result).toBe(false);
  });
});

describe("getEffectiveMedianPrice", () => {
  beforeEach(() => {
    resetFilteringCachesForTests();
  });

  it("returns flat-type-specific median when flatType is provided and available", () => {
    const block = makeBlock({
      medianPrice: 600000,
      medianPriceByFlatType: {
        "3 ROOM": 480000,
        "5 ROOM": 720000,
      },
    });

    expect(getEffectiveMedianPrice(block, "3 ROOM")).toBe(480000);
    expect(getEffectiveMedianPrice(block, "5 ROOM")).toBe(720000);
  });

  it("returns block median when flatType is empty", () => {
    const block = makeBlock({
      medianPrice: 600000,
      medianPriceByFlatType: {
        "3 ROOM": 480000,
      },
    });

    expect(getEffectiveMedianPrice(block, "")).toBe(600000);
  });

  it("returns block median when flatType is not in medianPriceByFlatType", () => {
    const block = makeBlock({
      medianPrice: 600000,
      medianPriceByFlatType: {
        "3 ROOM": 480000,
      },
    });

    expect(getEffectiveMedianPrice(block, "EXECUTIVE")).toBe(600000);
  });
});

describe("getEffectivePricePerSqmMedian", () => {
  beforeEach(() => {
    resetFilteringCachesForTests();
  });

  it("returns flat-type-specific PPSM when flatType is provided and available", () => {
    const block = makeBlock({
      pricePerSqmMedian: 7000,
      medianPricePerSqmByFlatType: { "3 ROOM": 8000, "5 ROOM": 6000 },
    });

    expect(getEffectivePricePerSqmMedian(block, "3 ROOM")).toBe(8000);
    expect(getEffectivePricePerSqmMedian(block, "5 ROOM")).toBe(6000);
  });

  it("returns block pricePerSqmMedian when flatType is empty", () => {
    const block = makeBlock({
      pricePerSqmMedian: 7000,
      medianPricePerSqmByFlatType: { "3 ROOM": 8000 },
    });

    expect(getEffectivePricePerSqmMedian(block, "")).toBe(7000);
  });

  it("falls back to block pricePerSqmMedian when flatType is not in map", () => {
    const block = makeBlock({
      pricePerSqmMedian: 7000,
      medianPricePerSqmByFlatType: { "3 ROOM": 8000 },
    });

    expect(getEffectivePricePerSqmMedian(block, "EXECUTIVE")).toBe(7000);
  });

  it("falls back to block pricePerSqmMedian when medianPricePerSqmByFlatType is undefined", () => {
    const block = makeBlock({
      pricePerSqmMedian: 7000,
      medianPricePerSqmByFlatType: undefined,
    });

    expect(getEffectivePricePerSqmMedian(block, "3 ROOM")).toBe(7000);
  });
});
