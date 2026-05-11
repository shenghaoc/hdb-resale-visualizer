import { describe, expect, it } from "vitest";
import { calculatePercentileSorted } from "../../scripts/lib/pipeline";

describe("calculatePercentileSorted", () => {
  it("returns 50 for an empty array", () => {
    expect(calculatePercentileSorted(10, [])).toBe(50);
  });

  it("returns 0 for a value below the minimum", () => {
    expect(calculatePercentileSorted(5, [10, 20, 30])).toBe(0);
  });

  it("returns 100 for a value above the maximum", () => {
    expect(calculatePercentileSorted(40, [10, 20, 30])).toBe(100);
  });

  it("returns correct percentile for a value in the middle", () => {
    // 1 element <= 15 out of 3 total = 1/3 = 33.33% -> 33
    expect(calculatePercentileSorted(15, [10, 20, 30])).toBe(33);
    // 2 elements <= 25 out of 3 total = 2/3 = 66.66% -> 67
    expect(calculatePercentileSorted(25, [10, 20, 30])).toBe(67);
  });

  it("returns 100 for a value exactly matching the maximum", () => {
    expect(calculatePercentileSorted(30, [10, 20, 30])).toBe(100);
  });

  it("handles duplicate values correctly (upper bound)", () => {
    // [10, 10, 10] -> value 10 -> count is 3 -> 3/3 = 100%
    expect(calculatePercentileSorted(10, [10, 10, 10])).toBe(100);
    // [10, 20, 20, 30] -> value 20 -> count is 3 (10, 20, 20) -> 3/4 = 75%
    expect(calculatePercentileSorted(20, [10, 20, 20, 30])).toBe(75);
  });

  it("handles single-element population", () => {
    expect(calculatePercentileSorted(5, [10])).toBe(0);
    expect(calculatePercentileSorted(10, [10])).toBe(100);
    expect(calculatePercentileSorted(15, [10])).toBe(100);
  });

  it("handles Number.POSITIVE_INFINITY", () => {
    // relevant for mrtDistanceMeters when a block is far from all stations
    expect(calculatePercentileSorted(Number.POSITIVE_INFINITY, [100, 200, 300])).toBe(100);
  });
});
