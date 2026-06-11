import { describe, expect, it } from "vite-plus/test";
import { computeConfidence } from "@/entities/transaction/listing-confidence";
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

function makeComparables(count: number, opts?: { month?: string }): AddressDetailTransaction[] {
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

  it("returns medium for 4 same-block well-matched comparables", () => {
    const comparables = makeComparables(4, { month: "2024-06" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("medium");
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

  it("caps at medium when newest comparable is >18 months old", () => {
    const comparables = makeComparables(12, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-01");
    // 2023-05 to 2025-01 = 20 months > 18 → capped at medium
    expect(result.level).toBe("medium");
    expect(result.comparableCount).toBe(12);
  });

  it("keeps medium when stale data with 5 comparables", () => {
    const comparables = makeComparables(5, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-01");
    // 2023-05 to 2025-01 = 20 months, capped at medium
    expect(result.level).toBe("medium");
    expect(result.comparableCount).toBe(5);
  });

  it("caps at medium for 3 stale comparables", () => {
    const comparables = makeComparables(3, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-01");
    // age > 18 → capped at medium; score also naturally medium
    expect(result.level).toBe("medium");
  });

  it("does not apply recency downgrade when referenceMonth is omitted", () => {
    const comparables = makeComparables(12, { month: "2023-05" });
    const result = computeConfidence(comparables);
    // No referenceMonth → age is null → no staleness penalty
    expect(result.level).toBe("high");
    expect(result.comparableCount).toBe(12);
  });

  it("returns high for exactly 12 comparables all within 12 months", () => {
    const comparables = makeComparables(12, { month: "2025-01" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("high");
  });

  it("returns medium for exactly 5 comparables all within 12 months", () => {
    const comparables = makeComparables(5, { month: "2025-01" });
    const result = computeConfidence(comparables, "2025-01");
    expect(result.level).toBe("medium");
  });

  it("sets newestComparableMonth and summary correctly", () => {
    const comparables = [
      tx({ id: "a", month: "2024-03" }),
      tx({ id: "b", month: "2024-09" }),
      tx({ id: "c", month: "2024-06" }),
    ];
    const result = computeConfidence(comparables, "2025-02");
    expect(result.newestComparableMonth).toBe("2024-09");
    expect(result.reason).toContain("3 comparables");
    expect(result.reason).toContain("same-block");
  });

  it("includes age in summary when data is stale", () => {
    const comparables = makeComparables(5, { month: "2023-05" });
    const result = computeConfidence(comparables, "2025-03");
    expect(result.reason).toContain("5 comparables");
    expect(result.reason).toContain("months ago");
  });
});
