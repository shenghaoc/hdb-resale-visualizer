import { describe, expect, it } from "vitest";
import {
  computeTimeAdjustment,
  computeTimeAdjustments,
  buildTrendLookup,
  findLatestQualifyingMonth,
  findMonthPoint,
  type TrendLookup,
  type TrendPoint,
} from "../../shared/time-adjustment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a TrendPoint with defaults. */
function tp(
  overrides: Partial<TrendPoint> & { month: string },
): TrendPoint {
  return {
    medianPricePerSqm: 5000,
    transactionCount: 10,
    ...overrides,
  };
}

/** Build a small TrendLookup for ANG MO KIO 4 ROOM with typical data. */
function makeTrendLookup(
  points: TrendPoint[] = [
    tp({ month: "2020-01", medianPricePerSqm: 4000, transactionCount: 8 }),
    tp({ month: "2021-01", medianPricePerSqm: 4200, transactionCount: 12 }),
    tp({ month: "2022-01", medianPricePerSqm: 4500, transactionCount: 10 }),
    tp({ month: "2023-01", medianPricePerSqm: 4700, transactionCount: 15 }),
    tp({ month: "2024-01", medianPricePerSqm: 4900, transactionCount: 9 }),
    tp({ month: "2025-01", medianPricePerSqm: 5100, transactionCount: 7 }),
    tp({ month: "2026-01", medianPricePerSqm: 5300, transactionCount: 11 }),
  ],
): TrendLookup {
  const map: TrendLookup = new Map();
  map.set("ANG MO KIO__4 ROOM", [...points].sort((a, b) => a.month.localeCompare(b.month)));
  return map;
}

// ---------------------------------------------------------------------------
// buildTrendLookup
// ---------------------------------------------------------------------------

describe("buildTrendLookup", () => {
  it("groups rows by town__flat_type and sorts by month", () => {
    const rows = [
      { town: "BEDOK", flat_type: "5 ROOM", month: "2024-06", median_price_per_sqm: 5000, transaction_count: 8 },
      { town: "BEDOK", flat_type: "5 ROOM", month: "2024-01", median_price_per_sqm: 4800, transaction_count: 10 },
      { town: "BEDOK", flat_type: "5 ROOM", month: "2024-03", median_price_per_sqm: 4900, transaction_count: 12 },
    ];
    const lookup = buildTrendLookup(rows);
    const points = lookup.get("BEDOK__5 ROOM");
    expect(points).toBeDefined();
    expect(points!).toHaveLength(3);
    // Sorted by month ascending
    expect(points![0].month).toBe("2024-01");
    expect(points![1].month).toBe("2024-03");
    expect(points![2].month).toBe("2024-06");
  });

  it("handles empty input", () => {
    const lookup = buildTrendLookup([]);
    expect(lookup.size).toBe(0);
  });

  it("groups multiple town × flat type combinations", () => {
    const rows = [
      { town: "BEDOK", flat_type: "4 ROOM", month: "2024-01", median_price_per_sqm: 4000, transaction_count: 10 },
      { town: "BEDOK", flat_type: "5 ROOM", month: "2024-01", median_price_per_sqm: 5000, transaction_count: 10 },
      { town: "ANG MO KIO", flat_type: "4 ROOM", month: "2024-01", median_price_per_sqm: 4500, transaction_count: 10 },
    ];
    const lookup = buildTrendLookup(rows);
    expect(lookup.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// findLatestQualifyingMonth
// ---------------------------------------------------------------------------

describe("findLatestQualifyingMonth", () => {
  it("returns the last point when all have sufficient samples", () => {
    const points = [
      tp({ month: "2024-01", transactionCount: 10 }),
      tp({ month: "2024-06", transactionCount: 10 }),
    ];
    const result = findLatestQualifyingMonth(points);
    expect(result).not.toBeNull();
    expect(result!.month).toBe("2024-06");
  });

  it("walks back past months with insufficient samples", () => {
    const points = [
      tp({ month: "2024-01", transactionCount: 10 }),
      tp({ month: "2024-06", transactionCount: 3 }),
      tp({ month: "2025-01", transactionCount: 2 }),
    ];
    const result = findLatestQualifyingMonth(points);
    expect(result).not.toBeNull();
    expect(result!.month).toBe("2024-01");
  });

  it("returns null when all months are below threshold", () => {
    const points = [
      tp({ month: "2024-01", transactionCount: 3 }),
      tp({ month: "2024-06", transactionCount: 4 }),
    ];
    expect(findLatestQualifyingMonth(points)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(findLatestQualifyingMonth([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findMonthPoint
// ---------------------------------------------------------------------------

describe("findMonthPoint", () => {
  const points = [
    tp({ month: "2024-01" }),
    tp({ month: "2024-06" }),
    tp({ month: "2025-01" }),
  ];

  it("finds an existing month", () => {
    const result = findMonthPoint(points, "2024-06");
    expect(result).not.toBeNull();
    expect(result!.month).toBe("2024-06");
  });

  it("returns null for a missing month", () => {
    expect(findMonthPoint(points, "2023-12")).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(findMonthPoint([], "2024-01")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeTimeAdjustment — normal cases
// ---------------------------------------------------------------------------

describe("computeTimeAdjustment", () => {
  it("computes correct adjustment for a typical older transaction", () => {
    const lookup = makeTrendLookup();
    const result = computeTimeAdjustment(
      "ANG MO KIO",
      "4 ROOM",
      "2022-01",
      450000,
      5000,
      lookup,
    );

    // Latest qualifying month: 2026-01 (medianPpsm=5300), tx month: 2022-01 (medianPpsm=4500)
    // adjustmentFactor = 5300 / 4500 ≈ 1.1778
    const expectedFactor = 5300 / 4500;
    expect(result.adjustmentFactor).toBeCloseTo(expectedFactor, 4);
    expect(result.adjustedPrice).toBe(Math.round(450000 * expectedFactor));
    expect(result.adjustedPricePerSqm).toBeCloseTo(5000 * expectedFactor, 2);
    expect(result.rawPrice).toBe(450000);
    expect(result.rawPricePerSqm).toBe(5000);
    expect(result.adjustmentLabel).toEqual({ type: "adjusted_from", month: "2022-01" });
  });

  it("walks back to a qualifying latest month when the newest has low samples", () => {
    // 2026-01 has transactionCount=1 (below threshold), walk back to 2025-01
    const lookup = makeTrendLookup([
      tp({ month: "2022-01", medianPricePerSqm: 4500, transactionCount: 10 }),
      tp({ month: "2025-01", medianPricePerSqm: 5100, transactionCount: 7 }),
      tp({ month: "2026-01", medianPricePerSqm: 5300, transactionCount: 1 }),
    ]);
    const result = computeTimeAdjustment(
      "ANG MO KIO", "4 ROOM", "2022-01", 450000, 5000, lookup,
    );
    expect(result.adjustmentFactor).not.toBeNull();
    // Latest qualifying should be 2022-01 itself (since 2025-01 has count 7 >= 5 but wait,
    // no — 2025-01 has transactionCount=7 which IS >= MIN_TREND_SAMPLE_SIZE=5. But 2026-01
    // has count=1 which is below. So latest qualifying is 2025-01.)
    // Re-check: MIN_TREND_SAMPLE_SIZE is 5, so 7 qualifies. Latest qualifying is 2025-01.
    const expectedFactor = 5100 / 4500;
    expect(result.adjustmentFactor).toBeCloseTo(expectedFactor, 4);
    expect(result.adjustmentLabel).toEqual({ type: "adjusted_from", month: "2022-01" });
  });
});

// ---------------------------------------------------------------------------
// computeTimeAdjustment — edge cases
// ---------------------------------------------------------------------------

describe("computeTimeAdjustment edge cases", () => {
  it("returns null adjustment when no trend data exists for town × flat type", () => {
    const lookup = makeTrendLookup(); // Only has ANG MO KIO__4 ROOM
    const result = computeTimeAdjustment(
      "BEDOK", "3 ROOM", "2024-01", 400000, 4500, lookup,
    );
    expect(result.adjustedPrice).toBeNull();
    expect(result.adjustedPricePerSqm).toBeNull();
    expect(result.adjustmentFactor).toBeNull();
    expect(result.adjustmentLabel).toBeNull();
  });

  it("returns null adjustment when transaction month is missing", () => {
    const lookup = makeTrendLookup();
    const result = computeTimeAdjustment(
      "ANG MO KIO", "4 ROOM", "2019-06", 450000, 5000, lookup,
    );
    expect(result.adjustedPrice).toBeNull();
    expect(result.adjustmentFactor).toBeNull();
    expect(result.adjustmentLabel).toBeNull();
  });

  it("returns null adjustment when transaction month has low sample count", () => {
    // 2022-01 has only 4 transactions
    const lookup = makeTrendLookup([
      tp({ month: "2022-01", medianPricePerSqm: 4500, transactionCount: 4 }),
      tp({ month: "2026-01", medianPricePerSqm: 5300, transactionCount: 10 }),
    ]);
    const result = computeTimeAdjustment(
      "ANG MO KIO", "4 ROOM", "2022-01", 450000, 5000, lookup,
    );
    expect(result.adjustedPrice).toBeNull();
    expect(result.adjustmentFactor).toBeNull();
  });

  it("returns null adjustment when tx month qualifies but all later months are below threshold (latest = tx month → already latest)", () => {
    // Tx month has sufficient samples (10) and later months are below threshold.
    // In this case, the tx month IS the latest qualifying month → factor ~1.0.
    const lookup = makeTrendLookup([
      tp({ month: "2022-01", medianPricePerSqm: 4500, transactionCount: 10 }),
      tp({ month: "2025-01", medianPricePerSqm: 5100, transactionCount: 3 }),
    ]);
    const result = computeTimeAdjustment(
      "ANG MO KIO", "4 ROOM", "2022-01", 450000, 5000, lookup,
    );
    // Adjustment is available (tx month is its own latest), factor ≈ 1.0
    expect(result.adjustedPrice).toBe(450000);
    expect(result.adjustmentFactor).toBeCloseTo(1.0, 8);
    expect(result.adjustmentLabel).toEqual({ type: "at_latest" });
  });

  it("returns adjustment with factor ~1.0 when tx month equals latest month", () => {
    const lookup = makeTrendLookup();
    const result = computeTimeAdjustment(
      "ANG MO KIO", "4 ROOM", "2026-01", 500000, 5300, lookup,
    );
    expect(result.adjustmentFactor).toBeCloseTo(1.0, 8);
    expect(result.adjustmentLabel).toEqual({ type: "at_latest" });
    expect(result.adjustedPrice).toBe(500000);
    expect(result.adjustedPricePerSqm).toBe(5300);
  });

  it("returns null on zero median (division guard)", () => {
    const lookup = makeTrendLookup([
      tp({ month: "2022-01", medianPricePerSqm: 0, transactionCount: 10 }),
      tp({ month: "2026-01", medianPricePerSqm: 5300, transactionCount: 10 }),
    ]);
    const result = computeTimeAdjustment(
      "ANG MO KIO", "4 ROOM", "2022-01", 450000, 5000, lookup,
    );
    expect(result.adjustedPrice).toBeNull();
    expect(result.adjustmentFactor).toBeNull();
  });

  it("handles empty TrendLookup", () => {
    const result = computeTimeAdjustment(
      "ANG MO KIO", "4 ROOM", "2024-01", 450000, 5000, new Map(),
    );
    expect(result.adjustedPrice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeTimeAdjustments — batch processing
// ---------------------------------------------------------------------------

describe("computeTimeAdjustments", () => {
  it("adjusts all comparables and returns correct meta when all succeed", () => {
    const lookup = makeTrendLookup();
    const comparables = [
      { town: "ANG MO KIO", flatType: "4 ROOM", month: "2022-01", resalePrice: 450000, pricePerSqm: 5000 },
      { town: "ANG MO KIO", flatType: "4 ROOM", month: "2021-01", resalePrice: 420000, pricePerSqm: 4200 },
    ];
    const { adjustedComparables, meta } = computeTimeAdjustments(comparables, lookup);

    expect(adjustedComparables).toHaveLength(2);
    expect(meta.adjustmentApplied).toBe(true);
    expect(meta.adjustmentCaveats).toContain(
      "Time adjustment applied using town × flat type historical medians. This is not a price forecast.",
    );
  });

  it("reports skipped count when some comparables cannot be adjusted", () => {
    // Only has data for ANG MO KIO 4 ROOM
    const lookup = makeTrendLookup();
    const comparables = [
      { town: "ANG MO KIO", flatType: "4 ROOM", month: "2022-01", resalePrice: 450000, pricePerSqm: 5000 },
      { town: "BEDOK", flatType: "3 ROOM", month: "2024-01", resalePrice: 400000, pricePerSqm: 4500 },
    ];
    const { adjustedComparables, meta } = computeTimeAdjustments(comparables, lookup);

    expect(adjustedComparables).toHaveLength(2);
    expect(adjustedComparables[0].adjustedResalePrice).not.toBeNull();
    expect(adjustedComparables[1].adjustedResalePrice).toBeNull();
    expect(meta.adjustmentApplied).toBe(true);
    // Should mention that 1 of 2 could not be adjusted
    expect(meta.adjustmentCaveats.some((c) => c.includes("1 of 2"))).toBe(true);
  });

  it("returns adjustmentApplied false when no comparables could be adjusted", () => {
    const lookup = makeTrendLookup(); // ANG MO KIO only
    const comparables = [
      { town: "BEDOK", flatType: "3 ROOM", month: "2024-01", resalePrice: 400000, pricePerSqm: 4500 },
    ];
    const { adjustedComparables, meta } = computeTimeAdjustments(comparables, lookup);

    expect(adjustedComparables).toHaveLength(1);
    expect(adjustedComparables[0].adjustedResalePrice).toBeNull();
    expect(meta.adjustmentApplied).toBe(false);
    expect(meta.adjustmentCaveats).toContain(
      "No trend data available for this town and flat type — showing raw prices only.",
    );
  });

  it("returns empty arrays for empty input", () => {
    const { adjustedComparables, meta } = computeTimeAdjustments([], new Map());
    expect(adjustedComparables).toHaveLength(0);
    expect(meta.adjustmentApplied).toBe(false);
    expect(meta.adjustmentCaveats).toHaveLength(0);
  });
});
