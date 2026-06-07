import { describe, expect, it } from "vitest";
import {
  assessAskingPrice,
  buildTrendEnvelope,
  computeBlockTrajectory,
  findComparableTransactions,
  parseStoreyMidpoint,
  sliceTrendByRange,
  summarizeComparables,
} from "@/entities/transaction/transaction-analysis";
import type {
  AddressDetailTransaction,
  AddressTrendPoint,
} from "@/types/data";

function tx(overrides: Partial<AddressDetailTransaction>): AddressDetailTransaction {
  return {
    id: overrides.id ?? `tx-${Math.random().toString(36).slice(2, 8)}`,
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

describe("parseStoreyMidpoint", () => {
  it("parses 'X TO Y' ranges to midpoint", () => {
    expect(parseStoreyMidpoint("10 TO 12")).toBe(11);
    expect(parseStoreyMidpoint("01 TO 03")).toBe(2);
    expect(parseStoreyMidpoint("40 TO 42")).toBe(41);
  });

  it("parses hyphenated ranges", () => {
    expect(parseStoreyMidpoint("4-6")).toBe(5);
  });

  it("returns null for unparseable input", () => {
    expect(parseStoreyMidpoint("MISSING")).toBeNull();
  });
});

describe("findComparableTransactions", () => {
  const transactions = [
    tx({ id: "a", storeyRange: "10 TO 12", floorAreaSqm: 93, flatType: "4 ROOM", resalePrice: 600000 }),
    tx({ id: "b", storeyRange: "13 TO 15", floorAreaSqm: 93, flatType: "4 ROOM", resalePrice: 620000 }),
    tx({ id: "c", storeyRange: "01 TO 03", floorAreaSqm: 93, flatType: "4 ROOM", resalePrice: 540000 }),
    tx({ id: "d", storeyRange: "10 TO 12", floorAreaSqm: 110, flatType: "4 ROOM", resalePrice: 720000 }),
    tx({ id: "e", storeyRange: "10 TO 12", floorAreaSqm: 93, flatType: "5 ROOM", resalePrice: 800000 }),
  ];

  it("filters by flat type", () => {
    const result = findComparableTransactions(transactions, {
      flatType: "4 ROOM",
      storeyMidpoint: null,
      floorAreaSqm: null,
    });
    expect(result.map((t) => t.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by storey within tolerance (default 3)", () => {
    const result = findComparableTransactions(transactions, {
      flatType: "4 ROOM",
      storeyMidpoint: 11,
      floorAreaSqm: null,
    });
    expect(result.map((t) => t.id).sort()).toEqual(["a", "b", "d"]);
  });

  it("filters by floor area within tolerance (default 5 sqm)", () => {
    const result = findComparableTransactions(transactions, {
      flatType: "4 ROOM",
      storeyMidpoint: 11,
      floorAreaSqm: 93,
    });
    expect(result.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("respects custom tolerances", () => {
    const result = findComparableTransactions(transactions, {
      flatType: null,
      storeyMidpoint: 11,
      floorAreaSqm: null,
      tolerances: { storey: 1, sqm: 5 },
    });
    expect(result.map((t) => t.id).sort()).toEqual(["a", "d", "e"]);
  });
});

describe("summarizeComparables", () => {
  it("returns null when empty", () => {
    expect(summarizeComparables([])).toBeNull();
  });

  it("computes percentile-based summary", () => {
    const sample = [
      tx({ resalePrice: 500000, pricePerSqm: 5000, month: "2024-01" }),
      tx({ resalePrice: 600000, pricePerSqm: 6000, month: "2024-06" }),
      tx({ resalePrice: 700000, pricePerSqm: 7000, month: "2024-09" }),
      tx({ resalePrice: 800000, pricePerSqm: 8000, month: "2024-12" }),
      tx({ resalePrice: 900000, pricePerSqm: 9000, month: "2025-03" }),
    ];
    const summary = summarizeComparables(sample);
    expect(summary).not.toBeNull();
    expect(summary!.count).toBe(5);
    expect(summary!.medianPrice).toBe(700000);
    expect(summary!.minPrice).toBe(500000);
    expect(summary!.maxPrice).toBe(900000);
    expect(summary!.p25Price).toBe(600000);
    expect(summary!.p75Price).toBe(800000);
    expect(summary!.latestMonth).toBe("2025-03");
  });
});

describe("assessAskingPrice", () => {
  const comparables = [
    tx({ resalePrice: 550000, pricePerSqm: 5913, floorAreaSqm: 93 }),
    tx({ resalePrice: 600000, pricePerSqm: 6452, floorAreaSqm: 93 }),
    tx({ resalePrice: 650000, pricePerSqm: 6989, floorAreaSqm: 93 }),
    tx({ resalePrice: 700000, pricePerSqm: 7527, floorAreaSqm: 93 }),
  ];

  it("returns null when no comparables", () => {
    expect(
      assessAskingPrice({ askingPrice: 700000, floorAreaSqm: 93, comparables: [] }),
    ).toBeNull();
  });

  it("flags an unrealistic asking as well_above", () => {
    const result = assessAskingPrice({
      askingPrice: 800000,
      floorAreaSqm: 93,
      comparables,
    });
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("well_above");
    expect(result!.deltaVsMedian).toBe(800000 - 625000);
    expect(result!.percentileAmongComparables).toBe(100);
    expect(result!.deltaVsMax).toBe(100000);
  });

  it("flags a fair asking close to median", () => {
    const result = assessAskingPrice({
      askingPrice: 625000,
      floorAreaSqm: 93,
      comparables,
    });
    expect(result!.verdict).toBe("fair");
    expect(Math.abs(result!.deltaVsMedianPct)).toBeLessThan(1);
  });

  it("computes asking $/sqm and delta when sqm provided", () => {
    const result = assessAskingPrice({
      askingPrice: 744000, // 8000/sqm
      floorAreaSqm: 93,
      comparables,
    });
    expect(result!.askingPricePerSqm).toBeCloseTo(8000, 0);
    expect(result!.pricePerSqmDeltaPct).not.toBeNull();
    expect(result!.pricePerSqmDeltaPct!).toBeGreaterThan(15);
  });

  it("leaves $/sqm null when no sqm supplied", () => {
    const result = assessAskingPrice({
      askingPrice: 700000,
      floorAreaSqm: null,
      comparables,
    });
    expect(result!.askingPricePerSqm).toBeNull();
    expect(result!.pricePerSqmDeltaPct).toBeNull();
  });
});

describe("computeBlockTrajectory", () => {
  it("returns null on empty trend", () => {
    expect(computeBlockTrajectory([])).toBeNull();
  });

  it("computes YoY against the closest prior month and peak-vs-current", () => {
    const trend: AddressTrendPoint[] = [
      { month: "2022-06", medianPrice: 500000, transactionCount: 1, medianPricePerSqm: 5000 },
      { month: "2023-06", medianPrice: 700000, transactionCount: 1, medianPricePerSqm: 7000 },
      { month: "2024-06", medianPrice: 800000, transactionCount: 1, medianPricePerSqm: 8000 },
      { month: "2025-06", medianPrice: 720000, transactionCount: 1, medianPricePerSqm: 7200 },
    ];
    const result = computeBlockTrajectory(trend);
    expect(result).not.toBeNull();
    expect(result!.currentMonth).toBe("2025-06");
    expect(result!.currentMedian).toBe(720000);
    expect(result!.peakMonth).toBe("2024-06");
    expect(result!.peakPrice).toBe(800000);
    expect(result!.peakToCurrentPct).toBeCloseTo(-10, 2);
    expect(result!.yoyDeltaPct).toBeCloseTo(-10, 2);
    expect(result!.direction).toBe("down");
  });

  it("marks direction as up when YoY > +1.5%", () => {
    const trend: AddressTrendPoint[] = [
      { month: "2024-06", medianPrice: 600000, transactionCount: 1, medianPricePerSqm: 6000 },
      { month: "2025-06", medianPrice: 660000, transactionCount: 1, medianPricePerSqm: 6600 },
    ];
    const result = computeBlockTrajectory(trend);
    expect(result!.direction).toBe("up");
  });

  it("leaves YoY null when no prior-year anchor exists", () => {
    const trend: AddressTrendPoint[] = [
      { month: "2025-06", medianPrice: 720000, transactionCount: 1, medianPricePerSqm: 7200 },
    ];
    const result = computeBlockTrajectory(trend);
    expect(result!.yoyDelta).toBeNull();
    expect(result!.yoyDeltaPct).toBeNull();
    expect(result!.direction).toBe("flat");
  });

  it("handles sparse data by skipping anchors that are too far from the 12-month target", () => {
    const trend: AddressTrendPoint[] = [
      { month: "2020-01", medianPrice: 400000, transactionCount: 1, medianPricePerSqm: 4000 },
      { month: "2024-06", medianPrice: 800000, transactionCount: 1, medianPricePerSqm: 8000 },
    ];
    const result = computeBlockTrajectory(trend);
    // 2020-01 is > 16 months before 2024-06. It should be skipped.
    expect(result!.yoyDelta).toBeNull();
  });

  it("finds the closest anchor within the ±4 month window", () => {
    const trend: AddressTrendPoint[] = [
      { month: "2023-01", medianPrice: 500000, transactionCount: 1, medianPricePerSqm: 5000 }, // 17m ago (outside [8, 16])
      { month: "2023-03", medianPrice: 600000, transactionCount: 1, medianPricePerSqm: 6000 }, // 15m ago (inside)
      { month: "2023-09", medianPrice: 700000, transactionCount: 1, medianPricePerSqm: 7000 }, // 9m ago (inside, closer to 12)
      { month: "2024-06", medianPrice: 800000, transactionCount: 1, medianPricePerSqm: 8000 },
    ];
    const result = computeBlockTrajectory(trend);
    // 2023-09 is 9 months ago (off-target = 3)
    // 2023-03 is 15 months ago (off-target = 3)
    // Both are equally close to 12. The loop picks the first one it sees that matches (or last if >=).
    // In my implementation: 2023-03 distanceInMonths=15, offTarget=3, minDistanceTo12=3, yoyAnchor=2023-03
    // Then 2023-09 distanceInMonths=9, offTarget=3, not < minDistanceTo12.
    // So it should pick 2023-03.
    expect(result!.yoyDelta).toBe(800000 - 600000);
  });
});

describe("sliceTrendByRange", () => {
  const trend: AddressTrendPoint[] = Array.from({ length: 150 }, (_, i) => ({
    month: `20${(10 + Math.floor(i / 12)).toString().padStart(2, "0")}-${((i % 12) + 1).toString().padStart(2, "0")}`,
    medianPrice: 500000 + i * 1000,
    transactionCount: 1,
    medianPricePerSqm: 5000 + i * 10,
  }));

  it("slices last 24 months for 2y", () => {
    expect(sliceTrendByRange(trend, "2y")).toHaveLength(24);
  });

  it("slices last 60 months for 5y", () => {
    expect(sliceTrendByRange(trend, "5y")).toHaveLength(60);
  });

  it("returns full trend for max", () => {
    expect(sliceTrendByRange(trend, "max")).toHaveLength(150);
  });
});

describe("buildTrendEnvelope", () => {
  it("builds min/max per month from raw transactions", () => {
    const trend: AddressTrendPoint[] = [
      { month: "2024-06", medianPrice: 600000, transactionCount: 3, medianPricePerSqm: 6000 },
    ];
    const transactions = [
      tx({ month: "2024-06", resalePrice: 550000 }),
      tx({ month: "2024-06", resalePrice: 600000 }),
      tx({ month: "2024-06", resalePrice: 720000 }),
    ];
    const envelope = buildTrendEnvelope(trend, transactions);
    expect(envelope.get("2024-06")).toEqual({ min: 550000, max: 720000 });
  });

  it("omits months with no raw transactions", () => {
    const trend: AddressTrendPoint[] = [
      { month: "2020-01", medianPrice: 400000, transactionCount: 1, medianPricePerSqm: 4000 },
    ];
    const envelope = buildTrendEnvelope(trend, []);
    expect(envelope.has("2020-01")).toBe(false);
  });

  it("skips NaN prices when computing envelope", () => {
    const trend = [{ month: "2024-06", medianPrice: 600000, transactionCount: 1, medianPricePerSqm: 6000 }];
    const transactions = [
      tx({ month: "2024-06", resalePrice: NaN }),
      tx({ month: "2024-06", resalePrice: 700000 }),
    ];
    const envelope = buildTrendEnvelope(trend, transactions);
    expect(envelope.get("2024-06")).toEqual({ min: 700000, max: 700000 });
  });
});
