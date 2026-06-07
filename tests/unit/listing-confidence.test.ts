import { describe, expect, it } from "vitest";
import { computeConfidence } from "@/lib/listing-confidence";
import type { AddressDetailTransaction } from "@/types/data";

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

function makeComparables(
  count: number,
  opts?: { month?: string },
): AddressDetailTransaction[] {
  return Array.from({ length: count }, (_, i) =>
    tx({
      id: `tx-${i}`,
      month: opts?.month ?? "2024-06",
    }),
  );
}

describe("computeConfidence", () => {
  it("returns high when ≥12 comparables are recent", () => {
    const comparables = makeComparables(12, { month: "2024-06" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("high");
    expect(result.comparableCount).toBe(12);
    expect(result.newestComparableMonth).toBe("2024-06");
  });

  it("returns medium for 5 comparables", () => {
    const comparables = makeComparables(5, { month: "2024-06" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("medium");
    expect(result.comparableCount).toBe(5);
  });

  it("returns low for 4 comparables", () => {
    const comparables = makeComparables(4, { month: "2024-06" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("low");
    expect(result.comparableCount).toBe(4);
  });

  it("returns low for 1 comparable", () => {
    const comparables = makeComparables(1, { month: "2024-06" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("low");
    expect(result.comparableCount).toBe(1);
  });

  it("returns low with count 0 for empty comparables", () => {
    const result = computeConfidence([], "2025-01");
    expect(result.level).toBe("low");
    expect(result.comparableCount).toBe(0);
    expect(result.newestComparableMonth).toBeNull();
  });

  it("downgrades high → medium when newest comparable is >12 months old", () => {
    const comparables = makeComparables(12, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-01");
    // 2023-05 to 2025-01 = 20 months > 12 → downgrade
    expect(result.level).toBe("medium");
    expect(result.comparableCount).toBe(12);
  });

  it("downgrades medium → low when newest comparable is >12 months old", () => {
    const comparables = makeComparables(5, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-01");
    // 2023-05 to 2025-01 = 20 months > 12 → downgrade
    expect(result.level).toBe("low");
    expect(result.comparableCount).toBe(5);
  });

  it("keeps low as low even when stale", () => {
    const comparables = makeComparables(3, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("low");
  });

  it("does not apply recency downgrade when referenceMonth is omitted", () => {
    const comparables = makeComparables(12, { month: "2023-05" });
    const result = computeConfidence(comparables);
    // No referenceMonth → no downgrade, so stays "high"
    expect(result.level).toBe("high");
    expect(result.comparableCount).toBe(12);
  });

  it("returns high for exactly 12 comparables all within 12 months", () => {
    const comparables = makeComparables(12, { month: "2025-01" });
    const result = computeConfidence(comparables, "2025-01");
    // 0 months difference → still high
    expect(result.level).toBe("high");
  });

  it("returns medium for exactly 5 comparables all within 12 months", () => {
    const comparables = makeComparables(5, { month: "2025-01" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("medium");
  });

  it("sets newestComparableMonth and reason correctly", () => {
    const comparables = [
      tx({ id: "a", month: "2024-03" }),
      tx({ id: "b", month: "2024-09" }),
      tx({ id: "c", month: "2024-06" }),
    ];
    const result = computeConfidence(comparables, "2025-02");
    expect(result.newestComparableMonth).toBe("2024-09");
    expect(result.reason).toBe("3 comparable transactions with recent data");
  });

  it("sets reason to note stale data when newest comparable is >12 months old", () => {
    const comparables = makeComparables(5, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-03");
    expect(result.reason).toBe("5 comparable transactions with no recent data");
  });
});
