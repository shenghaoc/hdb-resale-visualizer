import { describe, it, expect } from "vite-plus/test";

describe("Temporal PlainYearMonth month distance", () => {
  function monthDistance(earlierMonth: string, laterMonth: string): number {
    return Math.max(
      0,
      Temporal.PlainYearMonth.from(earlierMonth).until(Temporal.PlainYearMonth.from(laterMonth), {
        largestUnit: "months",
      }).months,
    );
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
});

describe("Temporal.Now.instant() ISO format", () => {
  it("produces ISO string with millisecond precision", () => {
    const ts = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("Temporal.Now.plainDateISO().year", () => {
  it("returns current year as a 4-digit number", () => {
    const year = Temporal.Now.plainDateISO().year;
    expect(year).toBeGreaterThanOrEqual(2025);
    expect(year).toBeLessThan(2100);
  });
});
