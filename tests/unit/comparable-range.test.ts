import { describe, expect, it } from "vitest";
import { summarizeComparables } from "@/lib/transaction-analysis";

describe("comparable summary", () => {
  it("computes middle-50 range", () => {
    const summary = summarizeComparables([
      { id: "1", month: "2026-01", flatType: "4 ROOM", storeyRange: "01 TO 03", floorAreaSqm: 90, flatModel: "A", leaseCommenceDate: 2000, remainingLease: "74 years", resalePrice: 600000, pricePerSqm: 6666, pricePerSqft: 619 },
      { id: "2", month: "2026-01", flatType: "4 ROOM", storeyRange: "01 TO 03", floorAreaSqm: 90, flatModel: "A", leaseCommenceDate: 2000, remainingLease: "74 years", resalePrice: 650000, pricePerSqm: 7222, pricePerSqft: 671 },
      { id: "3", month: "2026-01", flatType: "4 ROOM", storeyRange: "01 TO 03", floorAreaSqm: 90, flatModel: "A", leaseCommenceDate: 2000, remainingLease: "74 years", resalePrice: 700000, pricePerSqm: 7777, pricePerSqft: 722 },
      { id: "4", month: "2026-01", flatType: "4 ROOM", storeyRange: "01 TO 03", floorAreaSqm: 90, flatModel: "A", leaseCommenceDate: 2000, remainingLease: "74 years", resalePrice: 750000, pricePerSqm: 8333, pricePerSqft: 774 },
    ]);
    expect(summary?.p25Price).toBe(637500);
    expect(summary?.p75Price).toBe(712500);
  });
});
