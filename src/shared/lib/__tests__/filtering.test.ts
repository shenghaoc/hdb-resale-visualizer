import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_FILTERS } from "../constants";
import {
  createFilterEvaluationContext,
  getEffectiveMedianPrice,
  getEffectivePricePerSqmMedian,
  matchesFilter,
  resetFilteringCachesForTests,
} from "../filtering";
import { resetAffordabilityCacheForTests } from "../affordability";
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

describe("budget filter × affordability filter layering", () => {
  // Profile: ceiling = 400_000, comfortable < 320_000, stretch < 400_000.
  const profile = {
    monthlyIncome: 8000,
    cpfOABalance: 100000,
    age: 35,
    coApplicantAge: null,
  };

  beforeEach(() => {
    resetFilteringCachesForTests();
    resetAffordabilityCacheForTests();
  });
  afterEach(() => {
    resetAffordabilityCacheForTests();
  });

  it("requires BOTH the typed budget AND affordability mode to pass", () => {
    // A block at 350_000 is within a generous typed budget (≤500k) but is a
    // "stretch" under the affordability profile (above the comfortable
    // threshold of 320k). With affordable="comfortable" it must be rejected.
    const block = makeBlock({ medianPrice: 350000 });
    const result = matchesFilter(
      block,
      { ...DEFAULT_FILTERS, budgetMax: 500000, affordable: "comfortable" },
      null,
      profile,
    );
    expect(result).toBe(false);
  });

  it("accepts a block that clears both budget and affordability comfortably", () => {
    const block = makeBlock({ medianPrice: 250000 });
    const result = matchesFilter(
      block,
      { ...DEFAULT_FILTERS, budgetMax: 500000, affordable: "comfortable" },
      null,
      profile,
    );
    expect(result).toBe(true);
  });

  it("a typed budget higher than the affordability ceiling is intentional — affordability still filters", () => {
    // User typed budget 800k but affordability ceiling is 400k. Block at 600k
    // passes budget but is "over" affordability → fail both modes.
    const block = makeBlock({ medianPrice: 600000 });
    expect(
      matchesFilter(
        block,
        { ...DEFAULT_FILTERS, budgetMax: 800000, affordable: "stretch" },
        null,
        profile,
      ),
    ).toBe(false);
  });

  it("when the affordability profile is incomplete, the affordability predicate is inert", () => {
    // ceiling = 100k from CPF alone (no income). Block at 600k would be "over"
    // — but a missing profile must disable the filter, not silently filter.
    const block = makeBlock({ medianPrice: 600000 });
    const incompleteProfile = {
      monthlyIncome: null,
      cpfOABalance: 100000,
      age: 35,
      coApplicantAge: null,
    };
    expect(
      matchesFilter(
        block,
        { ...DEFAULT_FILTERS, affordable: "comfortable" },
        null,
        incompleteProfile,
      ),
    ).toBe(true);
  });
});

describe("filter consistency under rapid state toggles", () => {
  beforeEach(() => {
    resetFilteringCachesForTests();
  });

  const blocks = [
    makeBlock({ addressKey: "bedok-100", town: "BEDOK", medianPrice: 500000 }),
    makeBlock({
      addressKey: "tampines-200",
      town: "TAMPINES",
      block: "200",
      streetName: "TAMPINES ST 21",
      medianPrice: 700000,
      coordinates: { lat: 1.35, lng: 103.95 },
    }),
    makeBlock({ addressKey: "bedok-101", town: "BEDOK", block: "101", medianPrice: 400000 }),
  ];

  it("toggling town filter back and forth produces identical results", () => {
    const withTown = blocks.filter((b) => matchesFilter(b, { ...DEFAULT_FILTERS, town: "BEDOK" }));
    const withoutTown = blocks.filter((b) => matchesFilter(b, DEFAULT_FILTERS));
    const withTownAgain = blocks.filter((b) =>
      matchesFilter(b, { ...DEFAULT_FILTERS, town: "BEDOK" }),
    );

    expect(withTown).toHaveLength(2);
    expect(withoutTown).toHaveLength(3);
    expect(withTownAgain).toEqual(withTown);
  });

  it("toggling flatType filter produces consistent results across iterations", () => {
    const blocksWithTypes = [
      makeBlock({ addressKey: "a", flatTypes: ["3 ROOM", "4 ROOM"] }),
      makeBlock({ addressKey: "b", flatTypes: ["5 ROOM"] }),
      makeBlock({ addressKey: "c", flatTypes: ["3 ROOM"] }),
    ];

    const pass1 = blocksWithTypes.filter((b) =>
      matchesFilter(b, { ...DEFAULT_FILTERS, flatType: "3 ROOM" }),
    );
    const pass2 = blocksWithTypes.filter((b) =>
      matchesFilter(b, { ...DEFAULT_FILTERS, flatType: "5 ROOM" }),
    );
    const pass3 = blocksWithTypes.filter((b) =>
      matchesFilter(b, { ...DEFAULT_FILTERS, flatType: "3 ROOM" }),
    );

    expect(pass1).toHaveLength(2);
    expect(pass2).toHaveLength(1);
    expect(pass3).toEqual(pass1);
  });

  it("toggling budget range produces deterministic sets", () => {
    const pass1 = blocks.filter((b) => matchesFilter(b, { ...DEFAULT_FILTERS, budgetMax: 600000 }));
    const pass2 = blocks.filter((b) => matchesFilter(b, { ...DEFAULT_FILTERS, budgetMax: 800000 }));
    const pass3 = blocks.filter((b) => matchesFilter(b, { ...DEFAULT_FILTERS, budgetMax: 600000 }));

    expect(pass1).toHaveLength(2);
    expect(pass2).toHaveLength(3);
    expect(pass3).toEqual(pass1);
  });

  it("combined filter toggles produce consistent results", () => {
    const filters1 = { ...DEFAULT_FILTERS, town: "BEDOK", budgetMax: 450000 };
    const filters2 = { ...DEFAULT_FILTERS, town: "BEDOK" };
    const filters3 = { ...DEFAULT_FILTERS, town: "BEDOK", budgetMax: 450000 };

    const pass1 = blocks.filter((b) => matchesFilter(b, filters1));
    const pass2 = blocks.filter((b) => matchesFilter(b, filters2));
    const pass3 = blocks.filter((b) => matchesFilter(b, filters3));

    expect(pass1).toHaveLength(1);
    expect(pass2).toHaveLength(2);
    expect(pass3).toEqual(pass1);
  });
});

describe("filter evaluation context", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetFilteringCachesForTests();
  });

  it("reuses a Temporal-derived current year across a filter pass", () => {
    const plainDateSpy = vi
      .spyOn(Temporal.Now, "plainDateISO")
      .mockReturnValue(Temporal.PlainDate.from("2026-01-01"));
    const evaluationContext = createFilterEvaluationContext();
    const filters = { ...DEFAULT_FILTERS, remainingLeaseMin: 73 };
    const blocks = [
      makeBlock({ addressKey: "a", leaseCommenceRange: [1990, 2000] }),
      makeBlock({ addressKey: "b", leaseCommenceRange: [1995, 2000] }),
    ];

    const matched = blocks.filter((block) =>
      matchesFilter(block, filters, null, null, null, evaluationContext),
    );

    expect(matched).toHaveLength(2);
    expect(plainDateSpy).toHaveBeenCalledTimes(1);
  });
});
