import { describe, expect, it } from "vitest";
import { generateCaveats } from "@/entities/transaction/listing-caveats";
import type { AskingPriceAssessment } from "@/entities/transaction/transaction-analysis";
import type { ConfidenceResult } from "@/entities/transaction/listing-confidence";

function makeAssessment(
  overrides: Partial<AskingPriceAssessment> = {},
): AskingPriceAssessment {
  return {
    comparableCount: overrides.comparableCount ?? 12,
    summary: {
      count: overrides.summary?.count ?? (overrides.comparableCount ?? 12),
      medianPrice: overrides.summary?.medianPrice ?? 600000,
      medianPricePerSqm: overrides.summary?.medianPricePerSqm ?? 6500,
      p25Price: overrides.summary?.p25Price ?? 550000,
      p75Price: overrides.summary?.p75Price ?? 650000,
      minPrice: overrides.summary?.minPrice ?? 480000,
      maxPrice: overrides.summary?.maxPrice ?? 720000,
      latestMonth: overrides.summary?.latestMonth ?? "2025-06",
    },
    deltaVsMedian: overrides.deltaVsMedian ?? 0,
    deltaVsMedianPct: overrides.deltaVsMedianPct ?? 0,
    deltaVsP75: overrides.deltaVsP75 ?? -50000,
    deltaVsP75Pct: overrides.deltaVsP75Pct ?? -7.7,
    deltaVsMax: overrides.deltaVsMax ?? -120000,
    deltaVsMaxPct: overrides.deltaVsMaxPct ?? -16.7,
    percentileAmongComparables: overrides.percentileAmongComparables ?? 50,
    askingPricePerSqm: overrides.askingPricePerSqm ?? 6500,
    pricePerSqmDeltaPct: overrides.pricePerSqmDeltaPct ?? 0,
    verdict: overrides.verdict ?? "fair",
  };
}

function makeConfidence(
  overrides: Partial<ConfidenceResult> = {},
): ConfidenceResult {
  const hasNewest = Object.prototype.hasOwnProperty.call(
    overrides,
    "newestComparableMonth",
  );
  return {
    level: overrides.level ?? "high",
    comparableCount: overrides.comparableCount ?? 12,
    newestComparableMonth: hasNewest
      ? overrides.newestComparableMonth!
      : "2025-06",
    reason: overrides.reason ?? "High confidence — 12 comparables",
  };
}

describe("generateCaveats", () => {
  it("generates a warning when sample count is low (<5)", () => {
    const assessment = makeAssessment({ comparableCount: 3 });
    const confidence = makeConfidence({ comparableCount: 3, level: "low" });

    const caveats = generateCaveats({ assessment, confidence, comparableLeaseYears: [] });

    expect(caveats).toHaveLength(1);
    expect(caveats[0].severity).toBe("warning");
    expect(caveats[0].message).toContain("3 comparable transaction");
    expect(caveats[0].message).toContain("directional only");
  });

  it("generates a special warning when there are no comparables (count=0)", () => {
    const assessment = makeAssessment({ comparableCount: 0 });
    const confidence = makeConfidence({
      comparableCount: 0,
      level: "low",
      newestComparableMonth: null,
      reason: "No comparable transactions",
    });

    const caveats = generateCaveats({ assessment, confidence, comparableLeaseYears: [] });

    expect(caveats).toHaveLength(1);
    expect(caveats[0].severity).toBe("warning");
    expect(caveats[0].message).toContain("No comparable transactions found");
  });

  it("returns empty array when confidence is high and no issues", () => {
    const assessment = makeAssessment();
    const confidence = makeConfidence();
    const comparableLeaseYears = [2000, 2001, 2002, 2003];

    const caveats = generateCaveats({
      assessment,
      confidence,
      leaseCommenceYear: 2001,
      comparableLeaseYears,
    });

    expect(caveats).toEqual([]);
  });

  it("generates a warning when lease year deviates from comparable median by >10 years", () => {
    const assessment = makeAssessment();
    const confidence = makeConfidence();
    const comparableLeaseYears = [1995, 1998, 2000, 2002, 2005];

    const caveats = generateCaveats({
      assessment,
      confidence,
      leaseCommenceYear: 1985,
      comparableLeaseYears,
    });

    const leaseCaveat = caveats.find((c) => c.message.includes("lease"));
    expect(leaseCaveat).toBeDefined();
    expect(leaseCaveat!.severity).toBe("warning");
    expect(leaseCaveat!.message).toContain("1985");
    expect(leaseCaveat!.message).toContain("2000");
  });

  it("does not generate a lease caveat when lease year is close to comparable median", () => {
    const assessment = makeAssessment();
    const confidence = makeConfidence();
    const comparableLeaseYears = [1996, 1998, 2000, 2002, 2004];

    const caveats = generateCaveats({
      assessment,
      confidence,
      leaseCommenceYear: 2000,
      comparableLeaseYears,
    });

    const leaseCaveat = caveats.find((c) => c.message.includes("lease"));
    expect(leaseCaveat).toBeUndefined();
  });

  it("generates a warning when newest comparable is >12 months old", () => {
    const assessment = makeAssessment();
    const confidence = makeConfidence({
      newestComparableMonth: "2023-01",
    });

    const caveats = generateCaveats({
      assessment,
      confidence,
      comparableLeaseYears: [],
      referenceMonth: "2025-06",
    });

    const staleCaveat = caveats.find((c) => c.message.includes("last 12 months"));
    expect(staleCaveat).toBeDefined();
    expect(staleCaveat!.severity).toBe("warning");
  });

  it("generates an info caveat when asking price is at the 100th percentile", () => {
    const assessment = makeAssessment({ percentileAmongComparables: 100 });
    const confidence = makeConfidence();

    const caveats = generateCaveats({
      assessment,
      confidence,
      comparableLeaseYears: [],
    });

    expect(caveats).toHaveLength(1);
    expect(caveats[0].severity).toBe("info");
    expect(caveats[0].message).toContain("exceeds all comparable transactions");
  });

  it("generates an info caveat when asking price is at the 0th percentile", () => {
    const assessment = makeAssessment({ percentileAmongComparables: 0 });
    const confidence = makeConfidence();

    const caveats = generateCaveats({
      assessment,
      confidence,
      comparableLeaseYears: [],
    });

    expect(caveats).toHaveLength(1);
    expect(caveats[0].severity).toBe("info");
    expect(caveats[0].message).toContain("below all comparable transactions");
  });

  it("does not produce duplicate caveats when multiple conditions are met", () => {
    const assessment = makeAssessment({
      comparableCount: 3,
      percentileAmongComparables: 100,
    });
    const confidence = makeConfidence({
      comparableCount: 3,
      level: "low",
      newestComparableMonth: "2023-01",
    });
    const comparableLeaseYears = [1995, 2000, 2005];

    const caveats = generateCaveats({
      assessment,
      confidence,
      leaseCommenceYear: 1985,
      comparableLeaseYears,
      referenceMonth: "2025-06",
    });

    // Low sample + stale data + lease mismatch + extreme outlier = 4 distinct caveats
    expect(caveats).toHaveLength(4);

    // Verify no duplicate messages
    const messages = caveats.map((c) => c.message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("does not trigger lease caveat when leaseCommenceYear is omitted", () => {
    const assessment = makeAssessment();
    const confidence = makeConfidence();
    const comparableLeaseYears = [1995, 1998, 2000, 2002, 2005];

    const caveats = generateCaveats({
      assessment,
      confidence,
      comparableLeaseYears,
    });

    const leaseCaveat = caveats.find((c) => c.message.includes("lease"));
    expect(leaseCaveat).toBeUndefined();
  });

  it("does not trigger stale data warning when newestComparableMonth is null", () => {
    const assessment = makeAssessment();
    const confidence = makeConfidence({
      newestComparableMonth: null,
    });

    const caveats = generateCaveats({
      assessment,
      confidence,
      comparableLeaseYears: [],
      referenceMonth: "2025-06",
    });

    const staleCaveat = caveats.find((c) => c.message.includes("last 12 months"));
    expect(staleCaveat).toBeUndefined();
  });

  it("does not trigger lease caveat when comparableLeaseYears is empty", () => {
    const assessment = makeAssessment();
    const confidence = makeConfidence();

    const caveats = generateCaveats({
      assessment,
      confidence,
      leaseCommenceYear: 1985,
      comparableLeaseYears: [],
    });

    const leaseCaveat = caveats.find((c) => c.message.includes("lease"));
    expect(leaseCaveat).toBeUndefined();
  });
});
