import { describe, expect, it } from "vitest";
import type { BlockSummary, TownFlatTypeTrendPoint } from "@/types/data";
import {
  buildTownCompareSnapshot,
  computeMetricDelta,
  type TownCompareSnapshot,
} from "@/entities/town/town-compare";

function blockStub(
  p: Partial<BlockSummary> & Pick<BlockSummary, "addressKey">,
): BlockSummary {
  return {
    town: "TOWN",
    block: "1",
    streetName: "ST",
    displayName: null,
    coordinates: { lat: 1.332, lng: 103.821 },
    medianPrice: 500_000,
    pricePerSqmMedian: 6000,
    transactionCount: 10,
    floorAreaRange: [90, 92],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-06",
    availableDateRange: ["1995-01", "2024-06"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "X", distanceMeters: 500, walkingTimeSeconds: 400 },
    ...p,
  };
}

const TRENDS: TownFlatTypeTrendPoint[] = [
  { town: "BEDOK", flatType: "4 ROOM", month: "2023-01", medianPrice: 550_000, medianPricePerSqm: 5800, transactionCount: 10 },
  { town: "BEDOK", flatType: "4 ROOM", month: "2024-01", medianPrice: 600_000, medianPricePerSqm: 6300, transactionCount: 15 },
  { town: "BEDOK", flatType: "3 ROOM", month: "2024-01", medianPrice: 450_000, medianPricePerSqm: 5700, transactionCount: 5 },
  { town: "ANG MO KIO", flatType: "4 ROOM", month: "2024-01", medianPrice: 700_000, medianPricePerSqm: 7400, transactionCount: 8 },
];

const RANGE = { start: "2023-01", end: "2024-01" };
const CURRENT_YEAR = 2024;

describe("buildTownCompareSnapshot", () => {
  it("returns empty-shaped snapshot when town has no blocks", () => {
    const snap = buildTownCompareSnapshot({
      town: "BEDOK",
      blocks: [],
      trends: TRENDS,
      range: RANGE,
      currentYear: CURRENT_YEAR,
    });

    expect(snap.blockCount).toBe(0);
    expect(snap.medianPrice).toBeNull();
    expect(snap.medianPricePerSqm).toBeNull();
    expect(snap.medianRemainingLeaseYears).toBeNull();
    expect(snap.modalLeaseDecade).toBeNull();
    expect(snap.medianWalkSeconds).toBeNull();
    // Trend volume is still derived from the trends file independently.
    expect(snap.windowVolume).toBe(30);
  });

  it("rolls up block-level medians and modal lease decade", () => {
    const blocks: BlockSummary[] = [
      blockStub({ addressKey: "a", medianPrice: 500_000, pricePerSqmMedian: 5500, leaseCommenceRange: [1990, 1990] }),
      blockStub({ addressKey: "b", medianPrice: 600_000, pricePerSqmMedian: 6300, leaseCommenceRange: [1992, 1992] }),
      blockStub({ addressKey: "c", medianPrice: 700_000, pricePerSqmMedian: 7000, leaseCommenceRange: [1980, 1980], nearestMrt: null }),
    ];
    const snap = buildTownCompareSnapshot({
      town: "BEDOK",
      blocks,
      trends: TRENDS,
      range: RANGE,
      currentYear: CURRENT_YEAR,
    });

    expect(snap.blockCount).toBe(3);
    expect(snap.medianPrice).toBe(600_000);
    expect(snap.medianPricePerSqm).toBe(6300);
    expect(snap.modalLeaseDecade).toBe(1990);
    // Two MRT walks (others null filtered), median of 400 and 400 = 400.
    expect(snap.medianWalkSeconds).toBe(400);
    // Lease years for upper bounds 1990/1992/1980 at year 2024: 65, 67, 55 → median 65.
    expect(snap.medianRemainingLeaseYears).toBe(65);
  });

  it("computes YoY median price when the prior month exists in trends", () => {
    const snap = buildTownCompareSnapshot({
      town: "BEDOK",
      blocks: [blockStub({ addressKey: "a" })],
      trends: TRENDS,
      range: RANGE,
      currentYear: CURRENT_YEAR,
    });

    // Latest = 2024-01 weighted: (600000*15 + 450000*5)/20 = 562500.
    // Prior  = 2023-01 weighted: 550000.
    // YoY = (562500 - 550000) / 550000 ≈ 2.27%.
    expect(snap.yoyMedianPricePct).not.toBeNull();
    expect(snap.yoyMedianPricePct!).toBeCloseTo(((562500 - 550000) / 550000) * 100);
  });

  it("returns null YoY when prior month is missing", () => {
    const snap = buildTownCompareSnapshot({
      town: "ANG MO KIO",
      blocks: [blockStub({ addressKey: "a" })],
      trends: TRENDS,
      range: RANGE,
      currentYear: CURRENT_YEAR,
    });

    // ANG MO KIO has only 2024-01; no 2023-01 row.
    expect(snap.yoyMedianPricePct).toBeNull();
  });
});

describe("computeMetricDelta", () => {
  it("returns null when either side is null", () => {
    expect(computeMetricDelta("medianPrice", null, 500_000)).toBeNull();
    expect(computeMetricDelta("medianPrice", 500_000, null)).toBeNull();
  });

  it("classifies a lower compare price as better for the buyer", () => {
    const result = computeMetricDelta("medianPrice", 600_000, 500_000);
    expect(result).not.toBeNull();
    expect(result!.delta).toBe(-100_000);
    expect(result!.pct).toBeCloseTo(-100_000 / 600_000 * 100);
    expect(result!.tone).toBe("better");
  });

  it("classifies a longer compare lease as better", () => {
    const result = computeMetricDelta("medianRemainingLeaseYears", 50, 70);
    expect(result!.delta).toBe(20);
    expect(result!.tone).toBe("better");
  });

  it("classifies a longer walk as worse for the buyer", () => {
    const result = computeMetricDelta("medianWalkSeconds", 300, 600);
    expect(result!.delta).toBe(300);
    expect(result!.tone).toBe("worse");
  });

  it("treats small differences as neutral", () => {
    expect(computeMetricDelta("medianPrice", 600_000, 605_000)!.tone).toBe("neutral");
    expect(computeMetricDelta("medianRemainingLeaseYears", 60, 62)!.tone).toBe("neutral");
    expect(computeMetricDelta("medianWalkSeconds", 300, 360)!.tone).toBe("neutral");
  });

  it("flags a higher transaction volume as better (more liquid market)", () => {
    expect(computeMetricDelta("windowVolume", 100, 200)!.tone).toBe("better");
    expect(computeMetricDelta("windowVolume", 200, 100)!.tone).toBe("worse");
  });

  it("classifies a rise from zero volume as better when compare is non-zero", () => {
    const result = computeMetricDelta("windowVolume", 0, 50);
    expect(result!.delta).toBe(50);
    expect(result!.pct).toBeNull();
    expect(result!.tone).toBe("better");
  });

  it("stays neutral when both volume sides are zero", () => {
    const result = computeMetricDelta("windowVolume", 0, 0);
    expect(result!.delta).toBe(0);
    expect(result!.pct).toBe(0);
    expect(result!.tone).toBe("neutral");
  });
});

describe("computeMetricDelta — same-town guard parity", () => {
  it("renders an all-neutral comparison when both snapshots are identical", () => {
    const blocks: BlockSummary[] = [blockStub({ addressKey: "a" })];
    const snap: TownCompareSnapshot = buildTownCompareSnapshot({
      town: "BEDOK",
      blocks,
      trends: TRENDS,
      range: RANGE,
      currentYear: CURRENT_YEAR,
    });

    expect(computeMetricDelta("medianPrice", snap.medianPrice, snap.medianPrice)!.tone).toBe("neutral");
    expect(computeMetricDelta("medianWalkSeconds", snap.medianWalkSeconds, snap.medianWalkSeconds)!.tone).toBe("neutral");
  });
});
