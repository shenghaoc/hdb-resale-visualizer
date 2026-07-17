import { describe, it, expect } from "vite-plus/test";
import { yearMonthIndex } from "@shared/yearMonth";

describe("Year-month month distance", () => {
  function monthDistance(earlierMonth: string, laterMonth: string): number {
    const earlierIndex = yearMonthIndex(earlierMonth);
    const laterIndex = yearMonthIndex(laterMonth);
    if (earlierIndex === null || laterIndex === null) {
      throw new Error("Invalid year-month fixture");
    }
    return Math.max(0, laterIndex - earlierIndex);
  }

  it("returns 0 for same month", () => {
    expect(monthDistance("2024-06", "2024-06")).toBe(0);
  });

  it("returns 0 when later < earlier (clamped)", () => {
    expect(monthDistance("2024-06", "2024-01")).toBe(0);
  });

  it("calculates normal cross-month distance", () => {
    expect(monthDistance("2024-01", "2024-06")).toBe(5);
  });

  it("handles cross-year boundary", () => {
    expect(monthDistance("2024-11", "2025-01")).toBe(2);
  });

  it("handles large distance", () => {
    expect(monthDistance("2020-01", "2025-06")).toBe(65);
  });

  it("rejects partial and calendar-invalid year-month values", () => {
    expect(yearMonthIndex("2026")).toBeNull();
    expect(yearMonthIndex("2026-00")).toBeNull();
    expect(yearMonthIndex("2026-13")).toBeNull();
  });
});

describe("Date ISO format", () => {
  it("produces ISO string with millisecond precision", () => {
    const ts = new Date().toISOString();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("new Date().getFullYear()", () => {
  it("returns current year as a 4-digit number", () => {
    const year = new Date().getFullYear();
    expect(year).toBeGreaterThanOrEqual(2025);
    expect(year).toBeLessThan(2100);
  });
});
