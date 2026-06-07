import { describe, expect, it } from "vitest";
import {
  computeConfidence,
  computeMatchSignal,
  computeRecencySignal,
  computeSampleSignal,
  computeScopeSignal,
  type ConfidenceInput,
} from "../../shared/confidence-system";

function input(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    comparableCount: 12,
    sameBlockCount: 8,
    sameStreetCount: 2,
    sameTownCount: 2,
    newestComparableAgeMonths: 2,
    flatTypeMatchCount: 12,
    floorAreaMatchCount: 10,
    storeyMatchCount: 8,
    timeAdjustmentApplied: false,
    trendSampleSize: null,
    ...overrides,
  };
}

describe("sub-signal: sample", () => {
  it("returns 0 for count 0", () => {
    expect(computeSampleSignal(0)).toBe(0);
  });

  it("returns 0.5 for count 6 (half of saturation)", () => {
    expect(computeSampleSignal(6)).toBe(0.5);
  });

  it("returns 1 at saturation (12)", () => {
    expect(computeSampleSignal(12)).toBe(1);
  });

  it("clamps at 1 above saturation", () => {
    expect(computeSampleSignal(30)).toBe(1);
  });
});

describe("sub-signal: recency", () => {
  it("returns 1 when null (unknown age)", () => {
    expect(computeRecencySignal(null)).toBe(1);
  });

  it("returns 1 for age 0", () => {
    expect(computeRecencySignal(0)).toBe(1);
  });

  it("returns 0.5 at half decay (12 months)", () => {
    expect(computeRecencySignal(12)).toBe(0.5);
  });

  it("returns 0 at full decay (24 months)", () => {
    expect(computeRecencySignal(24)).toBe(0);
  });

  it("clamps at 0 beyond decay", () => {
    expect(computeRecencySignal(60)).toBe(0);
  });
});

describe("sub-signal: scope", () => {
  it("returns 0.5 when all comparables are same-block", () => {
    expect(computeScopeSignal(10, 0, 0, 10)).toBe(0.5);
  });

  it("returns 1.0 when all comparables contribute to all scopes", () => {
    expect(computeScopeSignal(10, 10, 10, 10)).toBe(1.0);
  });

  it("returns 0.2 when all are same-town only", () => {
    expect(computeScopeSignal(0, 0, 10, 10)).toBeCloseTo(0.2);
  });

  it("handles totalCount 0 without NaN", () => {
    expect(computeScopeSignal(0, 0, 0, 0)).toBe(0);
  });
});

describe("sub-signal: match", () => {
  it("returns 1 when all three match counts equal total", () => {
    expect(computeMatchSignal(10, 10, 10, 10)).toBe(1);
  });

  it("returns 0 when no matches", () => {
    expect(computeMatchSignal(0, 0, 0, 10)).toBe(0);
  });

  it("returns 1/3 when one of three fully matches", () => {
    expect(computeMatchSignal(10, 0, 0, 10)).toBeCloseTo(1 / 3);
  });

  it("handles totalCount 0 without NaN", () => {
    expect(computeMatchSignal(0, 0, 0, 0)).toBe(0);
  });
});

describe("tier thresholds", () => {
  it("returns high when score >= 0.70", () => {
    const result = computeConfidence(input());
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.level).toBe("high");
  });

  it("returns medium when score is in [0.40, 0.70)", () => {
    const result = computeConfidence(
      input({
        comparableCount: 6,
        sameBlockCount: 0,
        sameStreetCount: 3,
        sameTownCount: 3,
        newestComparableAgeMonths: 10,
        flatTypeMatchCount: 3,
        floorAreaMatchCount: 2,
        storeyMatchCount: 2,
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0.4);
    expect(result.score).toBeLessThan(0.7);
    expect(result.level).toBe("medium");
  });

  it("returns low when score < 0.40", () => {
    const result = computeConfidence(
      input({
        comparableCount: 2,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 2,
        newestComparableAgeMonths: 20,
        flatTypeMatchCount: 0,
        floorAreaMatchCount: 0,
        storeyMatchCount: 0,
      }),
    );
    expect(result.score).toBeLessThan(0.4);
    expect(result.level).toBe("low");
  });
});

describe("override rules", () => {
  it("caps at low when comparableCount < 3", () => {
    const result = computeConfidence(
      input({
        comparableCount: 2,
        sameBlockCount: 2,
        sameStreetCount: 0,
        sameTownCount: 0,
        newestComparableAgeMonths: 0,
        flatTypeMatchCount: 2,
        floorAreaMatchCount: 2,
        storeyMatchCount: 2,
      }),
    );
    expect(result.level).toBe("low");
  });

  it("caps at medium when newestComparableAgeMonths > 18", () => {
    const result = computeConfidence(
      input({
        comparableCount: 20,
        sameBlockCount: 15,
        sameStreetCount: 3,
        sameTownCount: 2,
        newestComparableAgeMonths: 19,
        flatTypeMatchCount: 20,
        floorAreaMatchCount: 20,
        storeyMatchCount: 20,
      }),
    );
    expect(result.level).toBe("medium");
  });

  it("does not cap at medium when age is exactly 18", () => {
    const result = computeConfidence(
      input({
        comparableCount: 20,
        sameBlockCount: 20,
        sameStreetCount: 20,
        sameTownCount: 20,
        newestComparableAgeMonths: 18,
        flatTypeMatchCount: 20,
        floorAreaMatchCount: 20,
        storeyMatchCount: 20,
      }),
    );
    expect(result.level).toBe("high");
  });

  it("caps at medium when sameBlockCount=0 and sameStreetCount=0", () => {
    const result = computeConfidence(
      input({
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 12,
        newestComparableAgeMonths: 1,
      }),
    );
    expect(result.level).toBe("medium");
  });

  it("does not cap when sameStreetCount > 0 even with sameBlockCount=0", () => {
    const result = computeConfidence(
      input({
        sameBlockCount: 0,
        sameStreetCount: 5,
        sameTownCount: 7,
      }),
    );
    expect(result.level).not.toBe("low");
  });

  it("overrides only cap — never raise the tier", () => {
    const result = computeConfidence(
      input({
        comparableCount: 3,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 3,
        newestComparableAgeMonths: 20,
        flatTypeMatchCount: 0,
        floorAreaMatchCount: 0,
        storeyMatchCount: 0,
      }),
    );
    expect(result.level).toBe("low");
  });
});

describe("integration cases", () => {
  it("same-block heavy set with recent data scores high", () => {
    const result = computeConfidence(
      input({
        comparableCount: 15,
        sameBlockCount: 12,
        sameStreetCount: 2,
        sameTownCount: 1,
        newestComparableAgeMonths: 1,
        flatTypeMatchCount: 14,
        floorAreaMatchCount: 12,
        storeyMatchCount: 10,
      }),
    );
    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it("town-wide stale set scores low", () => {
    const result = computeConfidence(
      input({
        comparableCount: 4,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 4,
        newestComparableAgeMonths: 22,
        flatTypeMatchCount: 2,
        floorAreaMatchCount: 1,
        storeyMatchCount: 1,
      }),
    );
    expect(result.level).toBe("low");
  });

  it("empty comparables returns low with meaningful summary", () => {
    const result = computeConfidence(
      input({
        comparableCount: 0,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 0,
        newestComparableAgeMonths: null,
        flatTypeMatchCount: 0,
        floorAreaMatchCount: 0,
        storeyMatchCount: 0,
      }),
    );
    expect(result.level).toBe("low");
    expect(result.score).toBe(0.25); // only recency signal (null → 1.0) * 0.25
    expect(result.summary).toContain("no comparable transactions");
  });
});

describe("output shape", () => {
  it("includes all expected fields", () => {
    const result = computeConfidence(input());
    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("signals");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("input");
    expect(result.signals).toHaveProperty("sample");
    expect(result.signals).toHaveProperty("recency");
    expect(result.signals).toHaveProperty("scope");
    expect(result.signals).toHaveProperty("match");
  });

  it("summary is non-empty and matches level", () => {
    for (const level of ["high", "medium", "low"] as const) {
      const overrides: Partial<ConfidenceInput> =
        level === "high"
          ? {}
          : level === "medium"
            ? {
                comparableCount: 6,
                sameBlockCount: 0,
                sameStreetCount: 3,
                sameTownCount: 3,
                newestComparableAgeMonths: 10,
                flatTypeMatchCount: 3,
                floorAreaMatchCount: 2,
                storeyMatchCount: 2,
              }
            : {
                comparableCount: 2,
                sameBlockCount: 0,
                sameStreetCount: 0,
                sameTownCount: 2,
                newestComparableAgeMonths: 20,
                flatTypeMatchCount: 0,
                floorAreaMatchCount: 0,
                storeyMatchCount: 0,
              };
      const result = computeConfidence(input(overrides));
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary.toLowerCase()).toContain(level);
    }
  });

  it("echoes the input", () => {
    const inp = input({ comparableCount: 7 });
    const result = computeConfidence(inp);
    expect(result.input).toEqual(inp);
  });
});
