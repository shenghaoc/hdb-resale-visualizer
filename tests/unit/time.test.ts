import { describe, expect, it } from "vitest";
import {
  currentIsoYear,
  epochIsoString,
  monthDistance,
  nowIsoString,
} from "../../scripts/lib/time";

describe("monthDistance", () => {
  it("returns 0 for the same month", () => {
    expect(monthDistance("2024-06", "2024-06")).toBe(0);
  });

  it("returns 0 when laterMonth is before earlierMonth (clamped)", () => {
    expect(monthDistance("2024-01", "2024-06")).toBe(0);
  });

  it("returns correct distance within the same year", () => {
    expect(monthDistance("2024-06", "2024-01")).toBe(5);
  });

  it("returns correct distance across a year boundary", () => {
    expect(monthDistance("2025-01", "2024-11")).toBe(2);
  });

  it("returns correct large distance", () => {
    expect(monthDistance("2025-06", "2020-01")).toBe(65);
  });
});

describe("nowIsoString", () => {
  it("returns an ISO string containing a dot and ending with Z", () => {
    const result = nowIsoString();
    expect(result).toContain(".");
    expect(result).toMatch(/Z$/);
  });
});

describe("epochIsoString", () => {
  it("returns the Unix epoch as an ISO string", () => {
    expect(epochIsoString()).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("currentIsoYear", () => {
  it("returns a 4-digit number matching the current year", () => {
    const year = currentIsoYear();
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(year).toBeLessThanOrEqual(2100);
    expect(year).toBe(new Date().getFullYear());
  });
});
