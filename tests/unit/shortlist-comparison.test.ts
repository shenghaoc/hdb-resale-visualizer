import { describe, expect, it } from "vite-plus/test";
import { buildShortlistComparisonRows } from "@/features/shortlist/shortlist-comparison";
import { MAX_LEASE_DURATION } from "@/shared/lib/constants";
import type { AddressDetailSummary, BlockSummary, ShortlistItem } from "@/types/data";

const baseBlock: BlockSummary = {
  addressKey: "test-block",
  town: "ANG MO KIO",
  block: "101",
  streetName: "Ang Mo Kio Ave 3",
  coordinates: { lat: 1.3521, lng: 103.8198 },
  medianPrice: 500_000,
  pricePerSqmMedian: 6250,
  transactionCount: 12,
  floorAreaRange: [70, 90],
  leaseCommenceRange: [1990, 2000],
  latestMonth: "2024-01",
  availableDateRange: ["2023-01", "2024-01"],
  flatTypes: ["3 ROOM", "4 ROOM"],
  flatModels: ["Model A"],
  nearestMrt: { stationName: "Ang Mo Kio", distanceMeters: 500, walkingTimeSeconds: 400 },
};

const baseItem: ShortlistItem = {
  addressKey: "test-block",
  notes: "Quiet corner, north-facing.",
  targetPrice: 480_000,
  addedAt: "2024-01-01T00:00:00Z",
};

const baseDetailSummary: Pick<AddressDetailSummary, "pricePerSqmMedian" | "pricePerSqftMedian"> = {
  pricePerSqmMedian: 6_250,
  pricePerSqftMedian: 580,
};

function makeRow(
  overrides: {
    block?: Partial<BlockSummary>;
    item?: Partial<ShortlistItem>;
    detailSummary?: Partial<
      Pick<AddressDetailSummary, "pricePerSqmMedian" | "pricePerSqftMedian">
    > | null;
  } = {},
) {
  return {
    item: { ...baseItem, ...overrides.item },
    block: { ...baseBlock, ...overrides.block },
    detailSummary:
      overrides.detailSummary === null
        ? null
        : { ...baseDetailSummary, ...overrides.detailSummary },
  };
}

describe("buildShortlistComparisonRows", () => {
  it("returns an empty array for empty input", () => {
    expect(buildShortlistComparisonRows([])).toEqual([]);
  });

  it("flattens block + item + detail summary into a comparison row", () => {
    const [row] = buildShortlistComparisonRows([makeRow()], { currentYear: 2024 });

    expect(row).toMatchObject({
      addressKey: "test-block",
      address: "101 Ang Mo Kio Ave 3",
      town: "ANG MO KIO",
      flatTypeLabel: "3 ROOM, 4 ROOM",
      medianPrice: 500_000,
      medianPricePerSqm: 6_250,
      medianPricePerSqft: 580,
      recentTransactionCount: 12,
      leaseCommenceRange: [1990, 2000],
      nearestMrt: { stationName: "Ang Mo Kio", distanceMeters: 500, walkingTimeSeconds: 400 },
      targetPrice: 480_000,
      notes: "Quiet corner, north-facing.",
    });
  });

  it("computes remaining lease years from leaseCommenceRange and currentYear", () => {
    const [row] = buildShortlistComparisonRows(
      [makeRow({ block: { leaseCommenceRange: [1990, 2010] } })],
      { currentYear: 2025 },
    );

    expect(row.remainingLeaseYears).toEqual({
      min: MAX_LEASE_DURATION - (2025 - 1990),
      max: MAX_LEASE_DURATION - (2025 - 2010),
    });
  });

  it("clamps remaining lease years at zero when the lease has expired", () => {
    const [row] = buildShortlistComparisonRows(
      [makeRow({ block: { leaseCommenceRange: [1900, 1900] } })],
      { currentYear: 2025 },
    );

    expect(row.remainingLeaseYears).toEqual({ min: 0, max: 0 });
  });

  it("orders remainingLeaseYears so min <= max even with reversed input", () => {
    const [row] = buildShortlistComparisonRows(
      [makeRow({ block: { leaseCommenceRange: [2010, 1990] } })],
      { currentYear: 2025 },
    );

    expect(row.remainingLeaseYears.min).toBeLessThanOrEqual(row.remainingLeaseYears.max);
  });

  it("returns a 'below' target gap when median is below target (good for buyer)", () => {
    const [row] = buildShortlistComparisonRows([
      makeRow({ item: { targetPrice: 550_000 }, block: { medianPrice: 500_000 } }),
    ]);

    expect(row.targetGap).toEqual({ amount: 50_000, tone: "below" });
  });

  it("returns an 'above' target gap when median exceeds target", () => {
    const [row] = buildShortlistComparisonRows([
      makeRow({ item: { targetPrice: 450_000 }, block: { medianPrice: 500_000 } }),
    ]);

    expect(row.targetGap).toEqual({ amount: 50_000, tone: "above" });
  });

  it("returns a 'match' gap when target equals median", () => {
    const [row] = buildShortlistComparisonRows([
      makeRow({ item: { targetPrice: 500_000 }, block: { medianPrice: 500_000 } }),
    ]);

    expect(row.targetGap).toEqual({ amount: 0, tone: "match" });
  });

  it("returns a null target gap when no target price is set", () => {
    const [row] = buildShortlistComparisonRows([makeRow({ item: { targetPrice: null } })]);

    expect(row.targetGap).toBeNull();
    expect(row.targetPrice).toBeNull();
  });

  it("treats non-finite target prices as missing", () => {
    const [row] = buildShortlistComparisonRows([makeRow({ item: { targetPrice: Number.NaN } })]);

    expect(row.targetGap).toBeNull();
  });

  it("falls back to nulls when detailSummary is missing", () => {
    const [row] = buildShortlistComparisonRows([makeRow({ detailSummary: null })]);

    expect(row.medianPricePerSqm).toBeNull();
    expect(row.medianPricePerSqft).toBeNull();
  });

  it("preserves nearestMrt as-is and exposes null when absent", () => {
    const [withMrt, withoutMrt] = buildShortlistComparisonRows([
      makeRow(),
      makeRow({
        item: { addressKey: "no-mrt" },
        block: { addressKey: "no-mrt", nearestMrt: null },
      }),
    ]);

    expect(withMrt.nearestMrt).toEqual({
      stationName: "Ang Mo Kio",
      distanceMeters: 500,
      walkingTimeSeconds: 400,
    });
    expect(withoutMrt.nearestMrt).toBeNull();
  });

  it("joins all flat types as the label and uses null when none are present", () => {
    const [withFlatTypes, withoutFlatTypes] = buildShortlistComparisonRows([
      makeRow(),
      makeRow({ block: { flatTypes: [] } }),
    ]);

    expect(withFlatTypes.flatTypeLabel).toBe("3 ROOM, 4 ROOM");
    expect(withoutFlatTypes.flatTypeLabel).toBeNull();
  });

  it("does not mutate the input rows", () => {
    const input = makeRow();
    const snapshot = JSON.stringify(input);

    buildShortlistComparisonRows([input], { currentYear: 2024 });

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("computes deltaVsFairMedian from fairRangeMedian vs block medianPrice", () => {
    const [row] = buildShortlistComparisonRows([
      makeRow({
        item: {
          askingPrice: 500000,
          suggestedOfferCeiling: 520000,
          buyerOpeningOffer: 495000,
          fairRangeMedian: 500000,
        },
        block: { medianPrice: 470000 },
      }),
    ]);

    expect(row.deltaVsFairMedian).toEqual({ amount: 30000, tone: "below" });
    expect(row.askingPrice).toBe(500000);
    expect(row.suggestedOfferCeiling).toBe(520000);
  });

  it("computes deltaVsFairMedian from fairRangeMedian vs block medianPrice", () => {
    const [row] = buildShortlistComparisonRows([
      makeRow({
        item: {
          targetPrice: 460000,
          fairRangeMedian: 480000,
        },
        block: { medianPrice: 500000 },
      }),
    ]);

    expect(row.deltaVsFairMedian).toEqual({ amount: 20000, tone: "above" });
  });

  it("builds confidence and caveat metadata", () => {
    const [row] = buildShortlistComparisonRows([
      makeRow({
        item: {
          fairRangeLow: undefined,
          fairRangeMedian: undefined,
          fairRangeHigh: undefined,
        },
        block: {
          nearestMrt: null,
          transactionCount: 2,
        },
      }),
    ]);

    expect(row.confidenceLevelLabel).toBe("confidence.low.label");
    expect(row.caveatKeys).toEqual([
      "shortlist.compare.caveat.noFairRange",
      "shortlist.compare.caveat.noMrt",
      "shortlist.compare.caveat.lowConfidence",
    ]);
  });
});
