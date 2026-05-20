import { describe, expect, it } from "vitest";
import { buildBlockExplanation } from "@/lib/block-explanation";
import type { BlockSummary, ComparisonArtifact, FilterState } from "@/types/data";

const baseBlock: BlockSummary = {
  addressKey: "x",
  town: "ANG MO KIO",
  block: "123",
  streetName: "ANG MO KIO AVE 3",
  coordinates: { lat: 1.3, lng: 103.8 },
  medianPrice: 520000,
  pricePerSqmMedian: 5778,
  transactionCount: 8,
  floorAreaRange: [80, 100],
  leaseCommenceRange: [1998, 2000],
  latestMonth: "2025-12",
  availableDateRange: ["2024-01", "2025-12"],
  flatTypes: ["4 ROOM"],
  flatModels: ["Model A"],
  nearestMrt: { stationName: "Yio Chu Kang", distanceMeters: 550 },
};

const baseFilters: FilterState = {
  search: "",
  town: "",
  flatType: "",
  flatModel: "",
  budgetMin: null,
  budgetMax: null,
  areaMin: null,
  areaMax: null,
  remainingLeaseMin: null,
  startMonth: null,
  endMonth: null,
  mrtMax: null,
  selectedAddressKey: null,
};

const comparison: ComparisonArtifact = {
  addressKey: "x",
  town: "ANG MO KIO",
  flatType: "4 ROOM",
  generatedAt: "2026-01-01T00:00:00.000Z",
  amenities: {
    primarySchoolsWithin1km: 2,
    primarySchoolsWithin2km: 5,
    nearestPrimarySchoolMeters: 300,
    nearestPrimarySchools: [],
    hawkerCentresWithin1km: 1,
    nearestHawkerCentreMeters: 400,
    supermarketsWithin1km: 2,
    nearestSupermarketMeters: 250,
    parksWithin1km: 1,
    nearestParkMeters: 500,
  },
  percentileRanks: {
    pricePercentile: 40,
    pricePerSqmPercentile: 42,
    leasePercentile: 60,
    mrtDistancePercentile: 70,
    transactionCountPercentile: 65,
    recencyPercentile: 55,
  },
};

describe("buildBlockExplanation", () => {
  it("returns budget/lease/mrt and volume rules when absolute SGD thresholds are satisfied", () => {
    const result = buildBlockExplanation({
      block: baseBlock,
      comparison,
      filters: {
        ...baseFilters,
        budgetMin: 500000,
        budgetMax: 530000,
        remainingLeaseMin: 60,
        mrtMax: 600,
      },
      currentYear: 2025,
    });

    expect(result).toEqual([
      "high-transaction-volume",
      "below-town-median-price",
      "within-mrt-threshold",
      "above-lease-threshold",
      "within-budget",
    ]);
  });

  it("handles missing comparison data without town-median rule", () => {
    const result = buildBlockExplanation({
      block: baseBlock,
      comparison: null,
      filters: baseFilters,
    });

    expect(result).toEqual(["high-transaction-volume"]);
  });

  it("omits volume rule when transaction count is too low", () => {
    const result = buildBlockExplanation({
      block: { ...baseBlock, transactionCount: 2 },
      comparison,
      filters: baseFilters,
    });

    expect(result).toEqual(["below-town-median-price"]);
  });

  it("returns only deterministic non-filter rules when no active filters", () => {
    const result = buildBlockExplanation({
      block: baseBlock,
      comparison,
      filters: baseFilters,
    });

    expect(result).toEqual(["high-transaction-volume", "below-town-median-price"]);
  });

  it("does not emit below-town-median-price when pricePercentile is exactly 50", () => {
    const atMedianComparison: ComparisonArtifact = {
      ...comparison,
      percentileRanks: {
        ...comparison.percentileRanks,
        pricePercentile: 50,
      },
    };

    const result = buildBlockExplanation({
      block: baseBlock,
      comparison: atMedianComparison,
      filters: baseFilters,
    });

    expect(result).not.toContain("below-town-median-price");
  });

  it("does not emit within-budget when median price is outside absolute SGD budget filters", () => {
    const belowMinimum = buildBlockExplanation({
      block: baseBlock,
      comparison,
      filters: {
        ...baseFilters,
        budgetMin: 530001,
      },
    });

    const aboveMaximum = buildBlockExplanation({
      block: baseBlock,
      comparison,
      filters: {
        ...baseFilters,
        budgetMax: 519999,
      },
    });

    expect(belowMinimum).not.toContain("within-budget");
    expect(aboveMaximum).not.toContain("within-budget");
  });

  it("does not emit within-mrt-threshold when nearest MRT exceeds the selected maximum", () => {
    const result = buildBlockExplanation({
      block: baseBlock,
      comparison,
      filters: {
        ...baseFilters,
        mrtMax: 500,
      },
    });

    expect(result).not.toContain("within-mrt-threshold");
  });

  it("does not emit above-lease-threshold when remaining lease is below the selected minimum", () => {
    const result = buildBlockExplanation({
      block: baseBlock,
      comparison,
      filters: {
        ...baseFilters,
        remainingLeaseMin: 80,
      },
      currentYear: 2025,
    });

    expect(result).not.toContain("above-lease-threshold");
  });
});
