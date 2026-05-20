import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/constants";
import {
  matchesFilter,
  matchesGeographicSearchIntent,
  resetFilteringCachesForTests,
} from "@/lib/filtering";
import type { BlockSummary, FilterState } from "@/types/data";

const BASE_FILTERS: FilterState = {
  ...DEFAULT_FILTERS,
  budgetMin: null,
  budgetMax: null,
  remainingLeaseMin: null,
};

function makeBlock(overrides: Partial<BlockSummary> = {}): BlockSummary {
  return {
    addressKey: "test-block",
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 500_000,
    pricePerSqmMedian: 5500,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-12",
    availableDateRange: ["2020-01", "2024-12"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 400 },
    ...overrides,
  };
}

describe("matchesFilter — null/missing nearestMrt", () => {
  beforeEach(() => resetFilteringCachesForTests());

  it("excludes block with null nearestMrt when mrtMax filter is set", () => {
    const block = makeBlock({ nearestMrt: null });

    expect(matchesFilter(block, { ...BASE_FILTERS, mrtMax: 1000 })).toBe(false);
  });

  it("includes block with null nearestMrt when no mrtMax filter", () => {
    const block = makeBlock({ nearestMrt: null });

    expect(matchesFilter(block, { ...BASE_FILTERS, mrtMax: null })).toBe(true);
  });

  it("includes block where nearestMrt distance is within mrtMax", () => {
    const block = makeBlock({ nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 300 } });

    expect(matchesFilter(block, { ...BASE_FILTERS, mrtMax: 400 })).toBe(true);
  });

  it("excludes block where nearestMrt distance exceeds mrtMax", () => {
    const block = makeBlock({ nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 800 } });

    expect(matchesFilter(block, { ...BASE_FILTERS, mrtMax: 500 })).toBe(false);
  });
});

describe("matchesFilter — area range boundary conditions", () => {
  beforeEach(() => resetFilteringCachesForTests());

  it("includes block whose max area exactly equals areaMin", () => {
    const block = makeBlock({ floorAreaRange: [60, 80] });

    expect(matchesFilter(block, { ...BASE_FILTERS, areaMin: 80, areaMax: null })).toBe(true);
  });

  it("excludes block whose max area is below areaMin", () => {
    const block = makeBlock({ floorAreaRange: [60, 79] });

    expect(matchesFilter(block, { ...BASE_FILTERS, areaMin: 80, areaMax: null })).toBe(false);
  });

  it("includes block whose min area exactly equals areaMax", () => {
    const block = makeBlock({ floorAreaRange: [100, 120] });

    expect(matchesFilter(block, { ...BASE_FILTERS, areaMin: null, areaMax: 100 })).toBe(true);
  });

  it("excludes block whose min area exceeds areaMax", () => {
    const block = makeBlock({ floorAreaRange: [101, 120] });

    expect(matchesFilter(block, { ...BASE_FILTERS, areaMin: null, areaMax: 100 })).toBe(false);
  });

  it("handles zero floor area without crashing", () => {
    const block = makeBlock({ floorAreaRange: [0, 0] });

    // areaMin: 0 means range[1] (0) >= 0 → should pass
    expect(matchesFilter(block, { ...BASE_FILTERS, areaMin: 0, areaMax: null })).toBe(true);

    // areaMin: 1 means range[1] (0) < 1 → should fail
    expect(matchesFilter(block, { ...BASE_FILTERS, areaMin: 1, areaMax: null })).toBe(false);
  });
});

describe("matchesFilter — remainingLeaseMin", () => {
  beforeEach(() => {
    resetFilteringCachesForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    resetFilteringCachesForTests(); // reset again after time change just in case
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes block where max remaining lease meets or exceeds remainingLeaseMin", () => {
    // leaseCommenceRange[1] = 2000, current year mocked to 2026 → 99 - (2026 - 2000) = 73 years
    const block = makeBlock({ leaseCommenceRange: [1990, 2000] });

    expect(matchesFilter(block, { ...BASE_FILTERS, remainingLeaseMin: 73 })).toBe(true);
    expect(matchesFilter(block, { ...BASE_FILTERS, remainingLeaseMin: 74 })).toBe(false);
  });

  it("excludes very old blocks with low remaining lease", () => {
    // leaseCommenceRange[1] = 1960 → 99 - (2026 - 1960) = 33 years
    const block = makeBlock({ leaseCommenceRange: [1960, 1960] });

    expect(matchesFilter(block, { ...BASE_FILTERS, remainingLeaseMin: 50 })).toBe(false);
    expect(matchesFilter(block, { ...BASE_FILTERS, remainingLeaseMin: 30 })).toBe(true);
  });
});

describe("matchesFilter — budget boundaries", () => {
  beforeEach(() => resetFilteringCachesForTests());

  it("includes block where medianPrice exactly equals budgetMin", () => {
    const block = makeBlock({ medianPrice: 500_000 });

    expect(matchesFilter(block, { ...BASE_FILTERS, budgetMin: 500_000, budgetMax: null })).toBe(true);
  });

  it("excludes block where medianPrice is below budgetMin", () => {
    const block = makeBlock({ medianPrice: 499_999 });

    expect(matchesFilter(block, { ...BASE_FILTERS, budgetMin: 500_000, budgetMax: null })).toBe(false);
  });

  it("includes block where medianPrice exactly equals budgetMax", () => {
    const block = makeBlock({ medianPrice: 800_000 });

    expect(matchesFilter(block, { ...BASE_FILTERS, budgetMin: null, budgetMax: 800_000 })).toBe(true);
  });

  it("excludes block where medianPrice exceeds budgetMax", () => {
    const block = makeBlock({ medianPrice: 800_001 });

    expect(matchesFilter(block, { ...BASE_FILTERS, budgetMin: null, budgetMax: 800_000 })).toBe(false);
  });

  it("handles budgetMin and budgetMax together (range filter)", () => {
    const block = makeBlock({ medianPrice: 600_000 });

    expect(matchesFilter(block, { ...BASE_FILTERS, budgetMin: 500_000, budgetMax: 700_000 })).toBe(true);
    expect(matchesFilter(block, { ...BASE_FILTERS, budgetMin: 650_000, budgetMax: 700_000 })).toBe(false);
    expect(matchesFilter(block, { ...BASE_FILTERS, budgetMin: 500_000, budgetMax: 550_000 })).toBe(false);
  });
});

describe("matchesFilter — date range", () => {
  beforeEach(() => resetFilteringCachesForTests());

  it("excludes block whose latestTransaction is before startMonth", () => {
    const block = makeBlock({ availableDateRange: ["2020-01", "2021-06"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, startMonth: "2022-01", endMonth: null })).toBe(false);
  });

  it("includes block whose latestTransaction is on or after startMonth", () => {
    const block = makeBlock({ availableDateRange: ["2020-01", "2022-01"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, startMonth: "2022-01", endMonth: null })).toBe(true);
  });

  it("excludes block whose earliestTransaction is after endMonth", () => {
    const block = makeBlock({ availableDateRange: ["2023-01", "2024-12"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, startMonth: null, endMonth: "2022-12" })).toBe(false);
  });

  it("includes block whose earliestTransaction is on or before endMonth", () => {
    const block = makeBlock({ availableDateRange: ["2022-12", "2024-12"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, startMonth: null, endMonth: "2022-12" })).toBe(true);
  });
});

describe("matchesFilter — flat type and model", () => {
  beforeEach(() => resetFilteringCachesForTests());

  it("excludes block that does not have the selected flat type", () => {
    const block = makeBlock({ flatTypes: ["3 ROOM"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, flatType: "5 ROOM" })).toBe(false);
  });

  it("includes block that has the selected flat type", () => {
    const block = makeBlock({ flatTypes: ["4 ROOM", "5 ROOM"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, flatType: "5 ROOM" })).toBe(true);
  });

  it("excludes block that does not have the selected flat model", () => {
    const block = makeBlock({ flatModels: ["MODEL A"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, flatModel: "IMPROVED" })).toBe(false);
  });

  it("includes block that has the selected flat model", () => {
    const block = makeBlock({ flatModels: ["MODEL A", "IMPROVED"] });

    expect(matchesFilter(block, { ...BASE_FILTERS, flatModel: "IMPROVED" })).toBe(true);
  });
});

describe("matchesFilter — combined filters short-circuit", () => {
  beforeEach(() => resetFilteringCachesForTests());

  it("fails fast on town mismatch even if other filters pass", () => {
    const block = makeBlock({ town: "ANG MO KIO", medianPrice: 500_000 });

    expect(
      matchesFilter(block, {
        ...BASE_FILTERS,
        town: "BEDOK",
        budgetMax: 600_000,
      }),
    ).toBe(false);
  });

  it("passes when all filters match", () => {
    const block = makeBlock({
      town: "BEDOK",
      medianPrice: 550_000,
      floorAreaRange: [85, 100],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 300 },
    });

    expect(
      matchesFilter(block, {
        ...BASE_FILTERS,
        town: "BEDOK",
        budgetMin: 500_000,
        budgetMax: 600_000,
        areaMin: 80,
        areaMax: 110,
        flatType: "4 ROOM",
        flatModel: "MODEL A",
        mrtMax: 400,
      }),
    ).toBe(true);
  });
});

describe("matchesGeographicSearchIntent — null nearestMrt on station intent", () => {
  it("returns false for station intent when block has null nearestMrt and no nearbyMrts", () => {
    const block = makeBlock({ nearestMrt: null, nearbyMrts: undefined });

    expect(
      matchesGeographicSearchIntent(block, {
        type: "station",
        stationName: "BEDOK MRT STATION",
        radiusMeters: 800,
      }),
    ).toBe(false);
  });

  it("returns false for station intent when block nearestMrt is too far", () => {
    const block = makeBlock({
      nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 1200 },
    });

    expect(
      matchesGeographicSearchIntent(block, {
        type: "station",
        stationName: "BEDOK MRT STATION",
        radiusMeters: 800,
      }),
    ).toBe(false);
  });

  it("returns true for station intent when nearbyMrts contains the target within radius", () => {
    const block = makeBlock({
      nearestMrt: null,
      nearbyMrts: [{ stationName: "BEDOK MRT STATION", distanceMeters: 500 }],
    });

    expect(
      matchesGeographicSearchIntent(block, {
        type: "station",
        stationName: "BEDOK MRT STATION",
        radiusMeters: 800,
      }),
    ).toBe(true);
  });
});
