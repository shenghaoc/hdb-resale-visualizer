import { describe, expect, it } from "vite-plus/test";
import {
  MAX_BUDGET_SGD,
  MAX_FLOOR_AREA_SQM,
  MAX_LEASE_DURATION_YEARS,
  MAX_MRT_DISTANCE_METERS,
  clampNullableNumber,
  orderNullableNumberRange,
} from "../../shared/search-bounds";

describe("clampNullableNumber", () => {
  it("preserves null and rejects non-finite input so typed filters cannot 400 the search API", () => {
    expect(clampNullableNumber(null, 0, MAX_BUDGET_SGD)).toBeNull();
    expect(clampNullableNumber(Number.NaN, 0, MAX_BUDGET_SGD)).toBeNull();
    expect(clampNullableNumber(Number.POSITIVE_INFINITY, 0, MAX_MRT_DISTANCE_METERS)).toBeNull();
    expect(clampNullableNumber(Number.NEGATIVE_INFINITY, 0, MAX_LEASE_DURATION_YEARS)).toBeNull();
  });

  it("clamps to the inclusive bounds used by both Worker search and URL restore", () => {
    expect(clampNullableNumber(-1, 0, MAX_BUDGET_SGD)).toBe(0);
    expect(clampNullableNumber(MAX_BUDGET_SGD + 1, 0, MAX_BUDGET_SGD)).toBe(MAX_BUDGET_SGD);
    expect(clampNullableNumber(MAX_FLOOR_AREA_SQM, 0, MAX_FLOOR_AREA_SQM)).toBe(MAX_FLOOR_AREA_SQM);
    expect(clampNullableNumber(7_500, 0, MAX_MRT_DISTANCE_METERS)).toBe(7_500);
  });
});

describe("orderNullableNumberRange", () => {
  it("swaps inverted endpoints and leaves an open end in place", () => {
    expect(orderNullableNumberRange(800_000, 500_000)).toEqual([500_000, 800_000]);
    expect(orderNullableNumberRange(120, 80)).toEqual([80, 120]);
    expect(orderNullableNumberRange(null, 500_000)).toEqual([null, 500_000]);
    expect(orderNullableNumberRange(500_000, null)).toEqual([500_000, null]);
    expect(orderNullableNumberRange(null, null)).toEqual([null, null]);
  });

  it("keeps already-ordered ranges unchanged", () => {
    expect(orderNullableNumberRange(400_000, 800_000)).toEqual([400_000, 800_000]);
    expect(orderNullableNumberRange(0, 0)).toEqual([0, 0]);
  });
});
