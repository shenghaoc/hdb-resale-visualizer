import { describe, expect, it } from "vitest";
import { computeConfidence } from "@/entities/transaction/listing-confidence";
import { computeConfidence as computeConfidenceV2 } from "../../shared/confidence-system";
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

describe("listing-confidence adapter", () => {
  it("returns ConfidenceResult shape with all required fields", () => {
    const comparables = Array.from({ length: 5 }, (_, i) =>
      tx({ id: `tx-${i}`, month: "2024-06" }),
    );
    const result = computeConfidence(comparables, "2025-01");

    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("comparableCount");
    expect(result).toHaveProperty("newestComparableMonth");
    expect(result).toHaveProperty("reason");
    expect(typeof result.level).toBe("string");
    expect(typeof result.comparableCount).toBe("number");
    expect(typeof result.reason).toBe("string");
  });

  it("level agrees with shared engine for equivalent input", () => {
    const comparables = Array.from({ length: 8 }, (_, i) =>
      tx({ id: `tx-${i}`, month: "2024-06" }),
    );
    const adapterResult = computeConfidence(comparables, "2025-01");

    const directInput: ConfidenceInput = {
      comparableCount: 8,
      sameBlockCount: 8,
      sameStreetCount: 0,
      sameTownCount: 0,
      newestComparableAgeMonths: 7,
      flatTypeMatchCount: 8,
      floorAreaMatchCount: 8,
      storeyMatchCount: 8,
      timeAdjustmentApplied: false,
      trendSampleSize: null,
    };
    const directResult = computeConfidenceV2(directInput);

    expect(adapterResult.level).toBe(directResult.level);
  });

  it("reason is populated from the shared engine summary", () => {
    const comparables = Array.from({ length: 10 }, (_, i) =>
      tx({ id: `tx-${i}`, month: "2024-06" }),
    );
    const result = computeConfidence(comparables, "2025-01");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.reason.toLowerCase()).toContain("confidence");
  });

  it("handles empty comparables", () => {
    const result = computeConfidence([], "2025-01");
    expect(result.level).toBe("low");
    expect(result.comparableCount).toBe(0);
    expect(result.newestComparableMonth).toBeNull();
    expect(result.reason).toContain("no comparable");
  });

  it("works without referenceMonth", () => {
    const comparables = Array.from({ length: 12 }, (_, i) =>
      tx({ id: `tx-${i}`, month: "2023-01" }),
    );
    const result = computeConfidence(comparables);
    expect(result.level).toBe("high");
  });
});
