import { describe, expect, it } from "vitest";
import { assessAskingPrice } from "@/lib/transaction-analysis";
import { computeConfidence } from "../../shared/confidence-system";
import { generateCaveats } from "../../shared/caveat-codes";
import type { AddressDetailTransaction } from "@/types/data";
import type { ConfidenceInput } from "../../shared/confidence-system";

function tx(overrides: Partial<AddressDetailTransaction>): AddressDetailTransaction {
  return {
    id: overrides.id ?? "tx-1",
    month: overrides.month ?? "2024-06",
    flatType: overrides.flatType ?? "4 ROOM",
    storeyRange: overrides.storeyRange ?? "10 TO 12",
    floorAreaSqm: overrides.floorAreaSqm ?? 93,
    flatModel: overrides.flatModel ?? "MODEL A",
    leaseCommenceDate: overrides.leaseCommenceDate ?? 1990,
    remainingLease: overrides.remainingLease ?? "65 years",
    resalePrice: overrides.resalePrice ?? 600000,
    pricePerSqm: overrides.pricePerSqm ?? 6451.6,
    pricePerSqft: overrides.pricePerSqft ?? 599.2,
  };
}

const FIXTURE_COMPARABLES: AddressDetailTransaction[] = [
  tx({ id: "tx-1", resalePrice: 550000, floorAreaSqm: 90, pricePerSqm: 6111.1 }),
  tx({ id: "tx-2", resalePrice: 580000, floorAreaSqm: 93, pricePerSqm: 6236.6 }),
  tx({ id: "tx-3", resalePrice: 620000, floorAreaSqm: 95, pricePerSqm: 6526.3 }),
  tx({ id: "tx-4", resalePrice: 600000, floorAreaSqm: 92, pricePerSqm: 6521.7 }),
  tx({ id: "tx-5", resalePrice: 650000, floorAreaSqm: 96, pricePerSqm: 6770.8 }),
  tx({ id: "tx-6", resalePrice: 570000, floorAreaSqm: 88, pricePerSqm: 6477.3 }),
  tx({ id: "tx-7", resalePrice: 610000, floorAreaSqm: 93, pricePerSqm: 6559.1 }),
  tx({ id: "tx-8", resalePrice: 590000, floorAreaSqm: 91, pricePerSqm: 6483.5 }),
];

const FIXTURE_CONFIDENCE_INPUT: ConfidenceInput = {
  comparableCount: 8,
  sameBlockCount: 2,
  sameStreetCount: 4,
  sameTownCount: 8,
  newestComparableAgeMonths: 2,
  flatTypeMatchCount: 6,
  floorAreaMatchCount: 5,
  storeyMatchCount: 3,
  timeAdjustmentApplied: false,
  trendSampleSize: null,
};

describe("comparable computation determinism", () => {
  it("assessAskingPrice produces identical output for identical input across repeated calls", () => {
    const params = {
      askingPrice: 620000,
      floorAreaSqm: 93,
      comparables: FIXTURE_COMPARABLES,
    };

    const result1 = assessAskingPrice(params);
    const result2 = assessAskingPrice(params);
    const result3 = assessAskingPrice(params);

    expect(result1).not.toBeNull();
    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it("computeConfidence produces identical output for identical input", () => {
    const result1 = computeConfidence(FIXTURE_CONFIDENCE_INPUT);
    const result2 = computeConfidence(FIXTURE_CONFIDENCE_INPUT);
    const result3 = computeConfidence(FIXTURE_CONFIDENCE_INPUT);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it("generateCaveats produces identical output for identical input", () => {
    const confidence = computeConfidence(FIXTURE_CONFIDENCE_INPUT);
    const params = {
      confidence,
      percentileAmongComparables: 75,
      leaseCommenceYear: 1990,
      comparableLeaseYears: [1988, 1990, 1992, 1985, 1990, 1991, 1989, 1990],
      apiCaveats: [] as string[],
    };

    const result1 = generateCaveats(params);
    const result2 = generateCaveats(params);
    const result3 = generateCaveats(params);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it("assessment does not change when unrelated parameters differ", () => {
    const base = {
      askingPrice: 620000,
      floorAreaSqm: 93,
      comparables: FIXTURE_COMPARABLES,
    };

    const resultWithArea = assessAskingPrice(base);
    const resultWithDifferentArea = assessAskingPrice({
      ...base,
      floorAreaSqm: 95,
    });

    expect(resultWithArea).not.toBeNull();
    expect(resultWithDifferentArea).not.toBeNull();
    expect(resultWithArea!.verdict).toBe(resultWithDifferentArea!.verdict);
    expect(resultWithArea!.summary.medianPrice).toBe(resultWithDifferentArea!.summary.medianPrice);
    expect(resultWithArea!.deltaVsMedian).toBe(resultWithDifferentArea!.deltaVsMedian);
  });

  it("full pipeline (assess → confidence → caveats) is stable for fixed fixture", () => {
    const assessment = assessAskingPrice({
      askingPrice: 620000,
      floorAreaSqm: 93,
      comparables: FIXTURE_COMPARABLES,
    });
    expect(assessment).not.toBeNull();

    const confidence = computeConfidence(FIXTURE_CONFIDENCE_INPUT);
    const caveats = generateCaveats({
      confidence,
      percentileAmongComparables: assessment!.percentileAmongComparables,
      leaseCommenceYear: 1990,
      comparableLeaseYears: [1988, 1990, 1992, 1985, 1990, 1991, 1989, 1990],
      apiCaveats: [],
    });

    const assessment2 = assessAskingPrice({
      askingPrice: 620000,
      floorAreaSqm: 93,
      comparables: FIXTURE_COMPARABLES,
    });
    const confidence2 = computeConfidence(FIXTURE_CONFIDENCE_INPUT);
    const caveats2 = generateCaveats({
      confidence: confidence2,
      percentileAmongComparables: assessment2!.percentileAmongComparables,
      leaseCommenceYear: 1990,
      comparableLeaseYears: [1988, 1990, 1992, 1985, 1990, 1991, 1989, 1990],
      apiCaveats: [],
    });

    expect(assessment).toEqual(assessment2);
    expect(confidence).toEqual(confidence2);
    expect(caveats).toEqual(caveats2);
  });
});
