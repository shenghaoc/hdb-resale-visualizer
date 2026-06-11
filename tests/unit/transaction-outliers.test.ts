import { describe, expect, it } from "vite-plus/test";
import {
  detectRecentTransactionOutliers,
  RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE,
} from "@/entities/transaction/transaction-analysis";
import type { AddressDetailTransaction } from "@/types/data";

function makeTransaction(
  id: string,
  flatType: string,
  resalePrice: number,
  month = "2025-01",
): AddressDetailTransaction {
  return {
    id,
    month,
    flatType,
    storeyRange: "10 TO 12",
    floorAreaSqm: 93,
    flatModel: "Model A",
    leaseCommenceDate: 1998,
    remainingLease: "73 years 4 months",
    resalePrice,
    pricePerSqm: resalePrice / 93,
    pricePerSqft: resalePrice / (93 * 10.7639),
  };
}

describe("detectRecentTransactionOutliers", () => {
  it("flags obvious high and low outliers within the same flat type", () => {
    const transactions = [
      makeTransaction("a", "4 ROOM", 500_000),
      makeTransaction("b", "4 ROOM", 510_000),
      makeTransaction("c", "4 ROOM", 520_000),
      makeTransaction("d", "4 ROOM", 530_000),
      makeTransaction("e", "4 ROOM", 540_000),
      makeTransaction("high", "4 ROOM", 900_000),
      makeTransaction("f", "4 ROOM", 495_000, "2025-02"),
      makeTransaction("g", "4 ROOM", 505_000, "2025-02"),
      makeTransaction("h", "4 ROOM", 515_000, "2025-02"),
      makeTransaction("i", "4 ROOM", 525_000, "2025-02"),
      makeTransaction("j", "4 ROOM", 535_000, "2025-02"),
      makeTransaction("low", "4 ROOM", 300_000, "2025-02"),
    ];

    const outliers = detectRecentTransactionOutliers(transactions);
    expect(outliers.get("high")?.direction).toBe("high");
    expect(outliers.get("low")?.direction).toBe("low");
    expect(outliers.get("high")).toMatchObject({
      id: "high",
      flatType: "4 ROOM",
      medianPrice: 517_500,
    });
    expect(outliers.get("low")).toMatchObject({
      id: "low",
      flatType: "4 ROOM",
      medianPrice: 517_500,
    });
    expect(outliers.get("high")?.percentFromMedian).toBeCloseTo(73.913, 3);
    expect(outliers.get("low")?.percentFromMedian).toBeCloseTo(-42.029, 3);
  });

  it("does not flag when sample size for a flat type is too small", () => {
    const transactions = Array.from(
      { length: RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE - 1 },
      (_, idx) => makeTransaction(`small-${idx}`, "5 ROOM", 780_000 + idx * 5_000),
    );
    const outliers = detectRecentTransactionOutliers(transactions);
    expect(outliers.size).toBe(0);
  });

  it("evaluates outliers per flat type instead of across mixed flat types", () => {
    const fourRoom = [
      makeTransaction("4-1", "4 ROOM", 500_000),
      makeTransaction("4-2", "4 ROOM", 505_000),
      makeTransaction("4-3", "4 ROOM", 510_000),
      makeTransaction("4-4", "4 ROOM", 515_000),
      makeTransaction("4-5", "4 ROOM", 520_000),
      makeTransaction("4-high", "4 ROOM", 880_000),
    ];
    const fiveRoom = [
      makeTransaction("5-1", "5 ROOM", 780_000),
      makeTransaction("5-2", "5 ROOM", 790_000),
      makeTransaction("5-3", "5 ROOM", 800_000),
      makeTransaction("5-4", "5 ROOM", 810_000),
      makeTransaction("5-5", "5 ROOM", 820_000),
      makeTransaction("5-6", "5 ROOM", 830_000),
    ];
    const outliers = detectRecentTransactionOutliers([...fourRoom, ...fiveRoom]);
    expect(outliers.has("4-high")).toBe(true);
    expect(outliers.has("5-6")).toBe(false);
  });

  it("does not flag values that fail the 20% median-distance threshold", () => {
    const transactions = [
      makeTransaction("a", "4 ROOM", 500_000),
      makeTransaction("b", "4 ROOM", 500_000),
      makeTransaction("c", "4 ROOM", 500_000),
      makeTransaction("d", "4 ROOM", 500_000),
      makeTransaction("e", "4 ROOM", 500_000),
      makeTransaction("mild-high", "4 ROOM", 590_000),
    ];
    const outliers = detectRecentTransactionOutliers(transactions);
    expect(outliers.has("mild-high")).toBe(false);
  });

  it("does not flag values that exceed the median threshold but stay inside the IQR fence", () => {
    const transactions = [
      makeTransaction("a", "4 ROOM", 400_000),
      makeTransaction("b", "4 ROOM", 450_000),
      makeTransaction("c", "4 ROOM", 500_000),
      makeTransaction("d", "4 ROOM", 500_000),
      makeTransaction("wide-high", "4 ROOM", 630_000),
      makeTransaction("e", "4 ROOM", 650_000),
    ];

    const outliers = detectRecentTransactionOutliers(transactions);
    expect(outliers.has("wide-high")).toBe(false);
  });
});
