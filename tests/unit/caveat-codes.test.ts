import { describe, expect, it } from "vite-plus/test";
import { generateCaveats, type Caveat, type CaveatCode } from "../../shared/caveat-codes";
import { computeConfidence, type ConfidenceInput } from "../../shared/confidence-system";

function input(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    comparableCount: 12,
    sameBlockCount: 8,
    sameStreetCount: 2,
    sameTownCount: 2,
    newestComparableAgeMonths: 2,
    flatTypeMatchCount: 12,
    floorAreaMatchCount: 10,
    storeyMatchCount: 8,
    timeAdjustmentApplied: false,
    trendSampleSize: null,
    ...overrides,
  };
}

function assess(overrides: Partial<ConfidenceInput> = {}) {
  return computeConfidence(input(overrides));
}

function codes(caveats: Caveat[]): CaveatCode[] {
  return caveats.map((c) => c.code);
}

describe("sample size caveats", () => {
  it("emits NO_COMPARABLES with critical severity when count is 0", () => {
    const result = generateCaveats({
      confidence: assess({
        comparableCount: 0,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 0,
        flatTypeMatchCount: 0,
        floorAreaMatchCount: 0,
        storeyMatchCount: 0,
        newestComparableAgeMonths: null,
      }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("NO_COMPARABLES");
    const caveat = result.find((c) => c.code === "NO_COMPARABLES")!;
    expect(caveat.severity).toBe("critical");
  });

  it("emits VERY_LOW_SAMPLE for count < 3", () => {
    const result = generateCaveats({
      confidence: assess({
        comparableCount: 2,
        sameBlockCount: 2,
        flatTypeMatchCount: 2,
        floorAreaMatchCount: 2,
        storeyMatchCount: 2,
      }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("VERY_LOW_SAMPLE");
    expect(codes(result)).not.toContain("LOW_SAMPLE");
    expect(codes(result)).not.toContain("NO_COMPARABLES");
  });

  it("emits LOW_SAMPLE for count 3-4", () => {
    const result = generateCaveats({
      confidence: assess({
        comparableCount: 4,
        sameBlockCount: 4,
        flatTypeMatchCount: 4,
        floorAreaMatchCount: 4,
        storeyMatchCount: 4,
      }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("LOW_SAMPLE");
    expect(codes(result)).not.toContain("VERY_LOW_SAMPLE");
  });

  it("does not emit sample caveats when count >= 5", () => {
    const result = generateCaveats({
      confidence: assess({
        comparableCount: 5,
        sameBlockCount: 5,
        flatTypeMatchCount: 5,
        floorAreaMatchCount: 5,
        storeyMatchCount: 5,
      }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("LOW_SAMPLE");
    expect(codes(result)).not.toContain("VERY_LOW_SAMPLE");
    expect(codes(result)).not.toContain("NO_COMPARABLES");
  });
});

describe("recency caveats", () => {
  it("emits STALE_DATA when newest > 12 months old", () => {
    const result = generateCaveats({
      confidence: assess({ newestComparableAgeMonths: 13 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("STALE_DATA");
  });

  it("does not emit STALE_DATA when newest <= 12 months", () => {
    const result = generateCaveats({
      confidence: assess({ newestComparableAgeMonths: 12 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("STALE_DATA");
  });

  it("does not emit STALE_DATA when age is null", () => {
    const result = generateCaveats({
      confidence: assess({ newestComparableAgeMonths: null }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("STALE_DATA");
  });
});

describe("scope proximity caveats", () => {
  it("emits NO_SAME_STREET when sameBlock=0 and sameStreet=0", () => {
    const result = generateCaveats({
      confidence: assess({ sameBlockCount: 0, sameStreetCount: 0, sameTownCount: 12 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("NO_SAME_STREET");
    expect(codes(result)).not.toContain("NO_SAME_BLOCK");
  });

  it("emits NO_SAME_BLOCK when sameBlock=0 but sameStreet > 0", () => {
    const result = generateCaveats({
      confidence: assess({ sameBlockCount: 0, sameStreetCount: 5, sameTownCount: 7 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("NO_SAME_BLOCK");
    expect(codes(result)).not.toContain("NO_SAME_STREET");
  });

  it("does not emit scope caveats when sameBlock > 0", () => {
    const result = generateCaveats({
      confidence: assess(),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("NO_SAME_BLOCK");
    expect(codes(result)).not.toContain("NO_SAME_STREET");
  });

  it("does not emit scope caveats when count is 0", () => {
    const result = generateCaveats({
      confidence: assess({
        comparableCount: 0,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 0,
        flatTypeMatchCount: 0,
        floorAreaMatchCount: 0,
        storeyMatchCount: 0,
        newestComparableAgeMonths: null,
      }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("NO_SAME_BLOCK");
    expect(codes(result)).not.toContain("NO_SAME_STREET");
  });
});

describe("API caveat mapping", () => {
  it("maps widened-to-street API caveat", () => {
    const result = generateCaveats({
      confidence: assess(),
      comparableLeaseYears: [],
      apiCaveats: [
        "Few comparable transactions in the same block — search widened to the same street.",
      ],
    });
    expect(codes(result)).toContain("WIDENED_TO_STREET");
  });

  it("maps widened-to-town API caveat", () => {
    const result = generateCaveats({
      confidence: assess(),
      comparableLeaseYears: [],
      apiCaveats: [
        "Few comparable transactions on the same street — search widened to the entire town.",
      ],
    });
    expect(codes(result)).toContain("WIDENED_TO_TOWN");
  });

  it("ignores unrecognized API caveats", () => {
    const result = generateCaveats({
      confidence: assess(),
      comparableLeaseYears: [],
      apiCaveats: ["Some unknown caveat message"],
    });
    expect(codes(result)).not.toContain("WIDENED_TO_STREET");
    expect(codes(result)).not.toContain("WIDENED_TO_TOWN");
  });
});

describe("match quality caveats", () => {
  it("emits FLAT_TYPE_MISMATCH when < 50% match", () => {
    const result = generateCaveats({
      confidence: assess({ flatTypeMatchCount: 5 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("FLAT_TYPE_MISMATCH");
  });

  it("does not emit FLAT_TYPE_MISMATCH when >= 50% match", () => {
    const result = generateCaveats({
      confidence: assess({ flatTypeMatchCount: 6 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("FLAT_TYPE_MISMATCH");
  });

  it("emits FLOOR_AREA_MISMATCH when < 50% match", () => {
    const result = generateCaveats({
      confidence: assess({ floorAreaMatchCount: 5 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("FLOOR_AREA_MISMATCH");
  });

  it("emits STOREY_MISMATCH when < 50% match", () => {
    const result = generateCaveats({
      confidence: assess({ storeyMatchCount: 5 }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("STOREY_MISMATCH");
  });
});

describe("lease mismatch", () => {
  it("emits LEASE_MISMATCH when diff > 10 years", () => {
    const result = generateCaveats({
      confidence: assess(),
      leaseCommenceYear: 2020,
      comparableLeaseYears: [2000, 2002, 2005],
    });
    expect(codes(result)).toContain("LEASE_MISMATCH");
  });

  it("does not emit when diff <= 10 years", () => {
    const result = generateCaveats({
      confidence: assess(),
      leaseCommenceYear: 2010,
      comparableLeaseYears: [2000, 2005, 2010],
    });
    expect(codes(result)).not.toContain("LEASE_MISMATCH");
  });

  it("does not emit when leaseCommenceYear is absent", () => {
    const result = generateCaveats({
      confidence: assess(),
      comparableLeaseYears: [2000, 2005],
    });
    expect(codes(result)).not.toContain("LEASE_MISMATCH");
  });

  it("does not emit when comparableLeaseYears is empty", () => {
    const result = generateCaveats({
      confidence: assess(),
      leaseCommenceYear: 2020,
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("LEASE_MISMATCH");
  });
});

describe("extreme outliers", () => {
  it("emits EXTREME_OUTLIER_LOW at percentile 0", () => {
    const result = generateCaveats({
      confidence: assess(),
      percentileAmongComparables: 0,
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("EXTREME_OUTLIER_LOW");
    const caveat = result.find((c) => c.code === "EXTREME_OUTLIER_LOW")!;
    expect(caveat.severity).toBe("info");
  });

  it("emits EXTREME_OUTLIER_HIGH at percentile 100", () => {
    const result = generateCaveats({
      confidence: assess(),
      percentileAmongComparables: 100,
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("EXTREME_OUTLIER_HIGH");
  });

  it("does not emit outlier caveats for percentile 1-99", () => {
    const result = generateCaveats({
      confidence: assess(),
      percentileAmongComparables: 50,
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("EXTREME_OUTLIER_LOW");
    expect(codes(result)).not.toContain("EXTREME_OUTLIER_HIGH");
  });
});

describe("time adjustment caveats", () => {
  it("emits TIME_ADJUSTMENT_APPLIED when flag is set", () => {
    const result = generateCaveats({
      confidence: assess({ timeAdjustmentApplied: true }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("TIME_ADJUSTMENT_APPLIED");
  });

  it("emits SMALL_TREND_SAMPLE when trendSampleSize < 6", () => {
    const result = generateCaveats({
      confidence: assess({ trendSampleSize: 3, timeAdjustmentApplied: true }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).toContain("SMALL_TREND_SAMPLE");
  });

  it("does not emit SMALL_TREND_SAMPLE when trendSampleSize >= 6", () => {
    const result = generateCaveats({
      confidence: assess({ trendSampleSize: 6, timeAdjustmentApplied: true }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("SMALL_TREND_SAMPLE");
  });

  it("does not emit SMALL_TREND_SAMPLE when trendSampleSize is null", () => {
    const result = generateCaveats({
      confidence: assess({ trendSampleSize: null }),
      comparableLeaseYears: [],
    });
    expect(codes(result)).not.toContain("SMALL_TREND_SAMPLE");
  });

  it("emits TIME_ADJUSTMENT_UNAVAILABLE when trend data is missing", () => {
    const result = generateCaveats({
      confidence: assess({ timeAdjustmentApplied: true }),
      comparableLeaseYears: [],
      apiCaveats: [
        "3 of 8 comparable transactions could not be time-adjusted due to insufficient trend data.",
      ],
    });
    expect(codes(result)).toContain("TIME_ADJUSTMENT_UNAVAILABLE");
    expect(codes(result)).not.toContain("TIME_ADJUSTMENT_APPLIED");
  });

  it("emits TIME_ADJUSTMENT_UNAVAILABLE when no trend data exists for town × flat type", () => {
    const result = generateCaveats({
      confidence: assess({ timeAdjustmentApplied: false }),
      comparableLeaseYears: [],
      apiCaveats: [
        "No trend data available for this town and flat type — showing raw prices only.",
      ],
    });
    expect(codes(result)).toContain("TIME_ADJUSTMENT_UNAVAILABLE");
  });
});

describe("deduplication", () => {
  it("never produces duplicate codes", () => {
    const result = generateCaveats({
      confidence: assess({
        comparableCount: 2,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 2,
        newestComparableAgeMonths: 15,
        flatTypeMatchCount: 0,
        floorAreaMatchCount: 0,
        storeyMatchCount: 0,
        timeAdjustmentApplied: true,
        trendSampleSize: 2,
      }),
      percentileAmongComparables: 0,
      leaseCommenceYear: 2020,
      comparableLeaseYears: [1990],
      apiCaveats: [
        "Few comparable transactions on the same street — search widened to the entire town.",
      ],
    });

    const allCodes = codes(result);
    const uniqueCodes = new Set(allCodes);
    expect(allCodes.length).toBe(uniqueCodes.size);
  });
});

describe("clean input", () => {
  it("produces no caveats for a high-confidence, well-matched set", () => {
    const result = generateCaveats({
      confidence: assess(),
      percentileAmongComparables: 50,
      comparableLeaseYears: [],
    });
    expect(result).toHaveLength(0);
  });
});

describe("critical severity", () => {
  it("only NO_COMPARABLES uses critical severity", () => {
    const scenarios = [
      {
        overrides: {
          comparableCount: 0,
          sameBlockCount: 0,
          sameStreetCount: 0,
          sameTownCount: 0,
          flatTypeMatchCount: 0,
          floorAreaMatchCount: 0,
          storeyMatchCount: 0,
          newestComparableAgeMonths: null as number | null,
        },
        extra: {},
      },
      {
        overrides: {
          comparableCount: 2,
          sameBlockCount: 0,
          sameStreetCount: 0,
          sameTownCount: 2,
          flatTypeMatchCount: 0,
          floorAreaMatchCount: 0,
          storeyMatchCount: 0,
          newestComparableAgeMonths: 20,
        },
        extra: {
          percentileAmongComparables: 0,
          leaseCommenceYear: 2020,
          comparableLeaseYears: [1990],
        },
      },
    ];

    for (const { overrides, extra } of scenarios) {
      const result = generateCaveats({
        confidence: assess(overrides),
        comparableLeaseYears: [],
        ...extra,
      });
      for (const caveat of result) {
        if (caveat.code !== "NO_COMPARABLES") {
          expect(caveat.severity).not.toBe("critical");
        }
      }
    }
  });
});
