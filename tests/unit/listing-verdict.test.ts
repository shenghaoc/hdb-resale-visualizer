import { describe, expect, it } from "vitest";
import { performListingCheck } from "@/lib/listing-verdict";
import type { AddressDetailTransaction } from "@/types/data";
import type { ComparableQuery } from "@/lib/transaction-analysis";

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

const defaultQuery: ComparableQuery = {
  flatType: "4 ROOM",
  storeyMidpoint: 11,
  floorAreaSqm: null,
};

describe("performListingCheck", () => {
  it("returns a complete result for a fair asking price with 4 comparables", () => {
    const transactions = [
      tx({ id: "a", resalePrice: 550000, pricePerSqm: 5913, month: "2024-03" }),
      tx({ id: "b", resalePrice: 580000, pricePerSqm: 6236, month: "2024-04" }),
      tx({ id: "c", resalePrice: 620000, pricePerSqm: 6666, month: "2024-05" }),
      tx({ id: "d", resalePrice: 650000, pricePerSqm: 6989, month: "2024-06" }),
    ];

    const result = performListingCheck({
      askingPrice: 600_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
    });

    expect(result).not.toBeNull();
    expect(result!.assessment.verdict).toBe("fair");
    expect(result!.assessment.comparableCount).toBe(4);
    expect(result!.assessment.percentileAmongComparables).toBe(50);
    expect(result!.confidence.level).toBe("low"); // 4 < 5 → low
    expect(result!.confidence.comparableCount).toBe(4);
    expect(result!.confidence.newestComparableMonth).toBe("2024-06");
    expect(result!.caveats.length).toBeGreaterThanOrEqual(1);
    expect(result!.caveats.some((c) => c.message.includes("4 comparable transactions"))).toBe(true);
  });

  it("returns null when the transaction list is empty (no comparables match)", () => {
    const result = performListingCheck({
      askingPrice: 600_000,
      floorAreaSqm: 93,
      transactions: [],
      comparableQuery: defaultQuery,
    });

    expect(result).toBeNull();
  });

  it("returns null when no transactions match the comparable query", () => {
    const transactions = [
      tx({ id: "a", flatType: "5 ROOM", resalePrice: 800000 }),
    ];

    const result = performListingCheck({
      askingPrice: 600_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: { flatType: "4 ROOM", storeyMidpoint: 11, floorAreaSqm: null },
    });

    expect(result).toBeNull();
  });

  it("flags a well_above asking price with high percentile", () => {
    const transactions = [
      tx({ id: "a", resalePrice: 550000, pricePerSqm: 5913 }),
      tx({ id: "b", resalePrice: 600000, pricePerSqm: 6452 }),
      tx({ id: "c", resalePrice: 650000, pricePerSqm: 6989 }),
      tx({ id: "d", resalePrice: 700000, pricePerSqm: 7527 }),
    ];

    const result = performListingCheck({
      askingPrice: 900_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
    });

    expect(result).not.toBeNull();
    expect(result!.assessment.verdict).toBe("well_above");
    expect(result!.assessment.percentileAmongComparables).toBe(100);
    expect(result!.assessment.deltaVsMedian).toBeGreaterThan(0);
    expect(result!.assessment.deltaVsMax).toBeGreaterThan(0);
    // Exceeds-all caveat
    expect(result!.caveats.some((c) => c.message.includes("exceeds all comparable transactions"))).toBe(true);
  });

  it("generates lease mismatch caveat when leaseCommenceYear differs significantly", () => {
    const transactions = [
      tx({ id: "a", leaseCommenceDate: 1990, resalePrice: 550000, pricePerSqm: 5913 }),
      tx({ id: "b", leaseCommenceDate: 1990, resalePrice: 600000, pricePerSqm: 6452 }),
      tx({ id: "c", leaseCommenceDate: 1992, resalePrice: 650000, pricePerSqm: 6989 }),
    ];

    const result = performListingCheck({
      askingPrice: 600_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
      leaseCommenceYear: 2005,
    });

    expect(result).not.toBeNull();
    const leaseCaveat = result!.caveats.find((c) => c.message.includes("lease"));
    expect(leaseCaveat).toBeDefined();
    expect(leaseCaveat!.message).toContain("2005");
    expect(leaseCaveat!.message).toContain("1990");
  });

  it("does not generate lease caveat when lease years are close", () => {
    const transactions = [
      tx({ id: "a", leaseCommenceDate: 1990, resalePrice: 550000, pricePerSqm: 5913 }),
      tx({ id: "b", leaseCommenceDate: 1992, resalePrice: 600000, pricePerSqm: 6452 }),
    ];

    const result = performListingCheck({
      askingPrice: 600_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
      leaseCommenceYear: 1991,
    });

    expect(result).not.toBeNull();
    const leaseCaveat = result!.caveats.find((c) => c.message.includes("lease began"));
    expect(leaseCaveat).toBeUndefined();
  });

  it("downgrades confidence when referenceMonth is far ahead of newest comparable", () => {
    // 6 comparables → base level "medium"; reference month far future → downgrade to "low"
    const transactions = Array.from({ length: 6 }, (_, i) =>
      tx({
        id: `r${i}`,
        resalePrice: 550_000 + i * 20_000,
        pricePerSqm: 5913 + i * 200,
        month: "2024-06",
      }),
    );

    const result = performListingCheck({
      askingPrice: 620_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
      referenceMonth: "2026-06",
    });

    expect(result).not.toBeNull();
    expect(result!.confidence.level).toBe("low");
    expect(result!.confidence.reason).toContain("no recent data");
  });

  it("keeps confidence high when referenceMonth is close to newest comparable", () => {
    const transactions = Array.from({ length: 12 }, (_, i) =>
      tx({
        id: `h${i}`,
        resalePrice: 550_000 + i * 10_000,
        pricePerSqm: 5913 + i * 100,
        month: "2025-06",
      }),
    );

    const result = performListingCheck({
      askingPrice: 620_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
      referenceMonth: "2025-07",
    });

    expect(result).not.toBeNull();
    // 12 comparables → high; reference 1 month ahead → no downgrade
    expect(result!.confidence.level).toBe("high");
    expect(result!.confidence.reason).toContain("recent data");
  });

  it("computes askingPricePerSqm when floor area is provided", () => {
    const transactions = [
      tx({ id: "a", resalePrice: 550000, pricePerSqm: 5913 }),
      tx({ id: "b", resalePrice: 650000, pricePerSqm: 6989 }),
    ];

    const result = performListingCheck({
      askingPrice: 744_000, // 744000 / 93 ≈ 8000
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
    });

    expect(result).not.toBeNull();
    expect(result!.assessment.askingPricePerSqm).toBeCloseTo(8000, 0);
    expect(result!.assessment.pricePerSqmDeltaPct).not.toBeNull();
  });

  it("leaves askingPricePerSqm as null when floor area is null", () => {
    const transactions = [
      tx({ id: "a", resalePrice: 550000, pricePerSqm: 5913 }),
      tx({ id: "b", resalePrice: 650000, pricePerSqm: 6989 }),
    ];

    const result = performListingCheck({
      askingPrice: 700_000,
      floorAreaSqm: null,
      transactions,
      comparableQuery: defaultQuery,
    });

    expect(result).not.toBeNull();
    expect(result!.assessment.askingPricePerSqm).toBeNull();
    expect(result!.assessment.pricePerSqmDeltaPct).toBeNull();
  });

  it("filters comparables by flat type and storey from the query", () => {
    const transactions = [
      tx({ id: "match-4rm-mid", flatType: "4 ROOM", storeyRange: "10 TO 12", resalePrice: 600000 }),
      tx({ id: "match-4rm-mid2", flatType: "4 ROOM", storeyRange: "13 TO 15", resalePrice: 620000 }),
      tx({ id: "skip-5rm", flatType: "5 ROOM", storeyRange: "10 TO 12", resalePrice: 800000 }),
      tx({ id: "skip-low", flatType: "4 ROOM", storeyRange: "01 TO 03", resalePrice: 540000 }),
      tx({ id: "skip-big", flatType: "4 ROOM", storeyRange: "10 TO 12", floorAreaSqm: 110, resalePrice: 720000 }),
    ];

    const result = performListingCheck({
      askingPrice: 610_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: {
        flatType: "4 ROOM",
        storeyMidpoint: 11,
        floorAreaSqm: 93,
      },
    });

    expect(result).not.toBeNull();
    // Only "match-4rm-mid" and "match-4rm-mid2" should be included
    // ("match-4rm-mid2": storeyRange "13 TO 15" → midpoint 14, |14 - 11| = 3 ≤ 3 → included)
    expect(result!.assessment.comparableCount).toBe(2);
  });

  it("produces consistent confidence level and caveats for sparse old data", () => {
    const transactions = [
      tx({ id: "s1", resalePrice: 580000, pricePerSqm: 6236, month: "2023-01" }),
      tx({ id: "s2", resalePrice: 650000, pricePerSqm: 6989, month: "2023-01" }),
    ];

    const result = performListingCheck({
      askingPrice: 900_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
    });

    expect(result).not.toBeNull();

    // 2 comparables → low confidence
    expect(result!.confidence.level).toBe("low");

    // Low sample count caveat
    expect(
      result!.caveats.some(
        (c) => c.severity === "warning" && c.message.includes("2 comparable transactions"),
      ),
    ).toBe(true);

    // Well above asking → exceeds-all caveat
    expect(
      result!.caveats.some(
        (c) => c.message.includes("exceeds all comparable transactions"),
      ),
    ).toBe(true);

    // Confidence reason should match the level
    expect(result!.confidence.reason).toContain("2 comparable transactions");
  });

  it("accepts a query with custom tolerances", () => {
    const transactions = [
      tx({ id: "a", storeyRange: "10 TO 12", resalePrice: 600000 }),
      tx({ id: "b", storeyRange: "14 TO 16", resalePrice: 620000 }), // midpoint 15, |15-11|=4 > default 3
    ];

    // Default tolerance (3) excludes tx "b"
    const strictResult = performListingCheck({
      askingPrice: 600_000,
      floorAreaSqm: null,
      transactions,
      comparableQuery: {
        flatType: "4 ROOM",
        storeyMidpoint: 11,
        floorAreaSqm: null,
      },
    });
    expect(strictResult!.assessment.comparableCount).toBe(1);

    // Custom tolerance (5) includes tx "b"
    const relaxedResult = performListingCheck({
      askingPrice: 600_000,
      floorAreaSqm: null,
      transactions,
      comparableQuery: {
        flatType: "4 ROOM",
        storeyMidpoint: 11,
        floorAreaSqm: null,
        tolerances: { storey: 5, sqm: 5 },
      },
    });
    expect(relaxedResult!.assessment.comparableCount).toBe(2);
  });

  it("returns a below verdict when asking is well under median", () => {
    const transactions = [
      tx({ id: "a", resalePrice: 600000, pricePerSqm: 6452 }),
      tx({ id: "b", resalePrice: 650000, pricePerSqm: 6989 }),
      tx({ id: "c", resalePrice: 700000, pricePerSqm: 7527 }),
    ];

    const result = performListingCheck({
      askingPrice: 520_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
    });

    expect(result).not.toBeNull();
    expect(result!.assessment.verdict).toBe("well_below");
    expect(result!.assessment.percentileAmongComparables).toBe(0);
    // Below-all caveat
    expect(
      result!.caveats.some((c) => c.message.includes("below all comparable transactions")),
    ).toBe(true);
  });

  it("handles leaseCommenceDate that is NaN in comparables gracefully", () => {
    const transactions = [
      tx({ id: "a", leaseCommenceDate: NaN, resalePrice: 550000, pricePerSqm: 5913 }),
      tx({ id: "b", leaseCommenceDate: NaN, resalePrice: 600000, pricePerSqm: 6452 }),
    ];

    const result = performListingCheck({
      askingPrice: 580_000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: defaultQuery,
      leaseCommenceYear: 2000,
    });

    expect(result).not.toBeNull();
    // No lease caveat because comparableLeaseYears is empty (NaN filtered out)
    const leaseCaveat = result!.caveats.find((c) => c.message.includes("lease began"));
    expect(leaseCaveat).toBeUndefined();
  });
});
