import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatCurrency,
  formatCompactCurrency,
  formatNumber,
  formatMeters,
  formatMinutesWalk,
  formatMonth,
  formatRemainingLease,
  resetFormatCachesForTests,
} from "@/shared/lib/format";
import * as constants from "@/shared/lib/constants";
import type { Translator } from "@/shared/lib/i18n/types";

const t: Translator = (key, vars) => {
  if (key === "unit.km") return `${String(vars?.value)} km`;
  if (key === "unit.m") return `${String(vars?.value)} m`;
  if (key === "unit.minutesWalk") return `${String(vars?.value)} min walk`;
  if (key === "unit.years") return `${String(vars?.value)} years`;
  if (key === "unit.yearsRange") return `${String(vars?.min)}-${String(vars?.max)} years`;
  return key;
};

describe("format edge cases", () => {
  beforeEach(() => {
    resetFormatCachesForTests();
  });

  describe("formatCurrency — large values", () => {
    it("formats values in the hundreds of millions", () => {
      const result = formatCurrency(999_999_999);
      expect(result).toContain("999,999,999");
      expect(result).toMatch(/\$|SGD/);
    });

    it("formats values in the billions", () => {
      const result = formatCurrency(1_000_000_000);
      expect(result).toContain("1,000,000,000");
    });

    it("formats zero without sign", () => {
      const result = formatCurrency(0);
      expect(result).toContain("0");
      expect(result).toMatch(/\$|SGD/);
    });

    it("returns a string for zh-SG locale", () => {
      const result = formatCurrency(500_000, "zh-SG");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain("500,000");
    });
  });

  describe("formatCompactCurrency — large and edge values", () => {
    it("formats billions compactly", () => {
      const result = formatCompactCurrency(1_200_000_000);
      // Expect compact representation like 1.2B
      expect(result).toMatch(/1\.?2?B/i);
    });

    it("formats exactly 1 million", () => {
      const result = formatCompactCurrency(1_000_000);
      // Allow for optional decimal (e.g. "$1.0M" or "$1M")
      expect(result).toMatch(/1(?:\.\d+)?M/i);
    });

    it("formats values below 1000 as plain currency (no compact suffix)", () => {
      const result = formatCompactCurrency(999);
      expect(result).toContain("999");
      expect(result).not.toMatch(/K|M|B/i);
    });

    it("returns a string for zh-SG locale", () => {
      const result = formatCompactCurrency(500_000, "zh-SG");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles zero", () => {
      const result = formatCompactCurrency(0);
      expect(result).toContain("0");
    });
  });

  describe("formatNumber — edge values", () => {
    it("formats zero correctly", () => {
      expect(formatNumber(0)).toBe("0");
    });

    it("formats large integers", () => {
      expect(formatNumber(1_000_000)).toBe("1,000,000");
    });

    it("rounds to specified fraction digits", () => {
      expect(formatNumber(1.015, 2)).toBe("1.02");
      expect(formatNumber(1.004, 2)).toBe("1");
    });

    it("formats negative numbers", () => {
      const result = formatNumber(-1234);
      expect(result).toContain("1,234");
      expect(result).toContain("-");
    });
  });

  describe("formatMeters — boundary at exactly 1000m", () => {
    it("switches to km at exactly 1000m", () => {
      expect(formatMeters(1000, t)).toBe("1 km");
    });

    it("stays as meters at 999m", () => {
      expect(formatMeters(999, t)).toBe("999 m");
    });

    it("formats fractional km correctly", () => {
      expect(formatMeters(1500, t)).toBe("1.5 km");
      expect(formatMeters(12345, t)).toBe("12.3 km");
    });

    it("handles zero meters", () => {
      expect(formatMeters(0, t)).toBe("0 m");
    });
  });

  describe("formatMinutesWalk — rounding and minimum display", () => {
    it("rounds seconds up to the nearest minute", () => {
      expect(formatMinutesWalk(60, t)).toBe("1 min walk");
      expect(formatMinutesWalk(89, t)).toBe("1 min walk");
      expect(formatMinutesWalk(90, t)).toBe("2 min walk");
      expect(formatMinutesWalk(500, t)).toBe("8 min walk");
    });

    it("clamps sub-30-second walks to 1 min walk so the cell is never blank", () => {
      expect(formatMinutesWalk(0, t)).toBe("1 min walk");
      expect(formatMinutesWalk(15, t)).toBe("1 min walk");
    });
  });

  describe("formatMonth — all valid months", () => {
    const validMonths = [
      "2024-01", "2024-02", "2024-03", "2024-04",
      "2024-05", "2024-06", "2024-07", "2024-08",
      "2024-09", "2024-10", "2024-11", "2024-12",
    ];

    it.each(validMonths)("formats %s without returning the raw string", (month) => {
      const result = formatMonth(month);
      expect(result).not.toBe(month);
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns raw string for month 00 (invalid)", () => {
      expect(formatMonth("2024-00")).toBe("2024-00");
    });

    it("returns raw string for month 13 (invalid)", () => {
      expect(formatMonth("2024-13")).toBe("2024-13");
    });

    it("returns raw string for completely invalid input", () => {
      expect(formatMonth("not-a-date")).toBe("not-a-date");
      expect(formatMonth("")).toBe("");
    });

    it("formats correctly for zh-SG locale", () => {
      const result = formatMonth("2024-06", "zh-SG");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      // Should not be the raw string
      expect(result).not.toBe("2024-06");
    });
  });

  describe("formatRemainingLease — edge cases", () => {
    beforeEach(() => {
      vi.spyOn(constants, "getCurrentYear").mockReturnValue(2026);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("formats a block with many years remaining (recent build)", () => {
      // leaseCommenceRange[1] = 2020 → 99 - (2026 - 2020) = 93 years
      const result = formatRemainingLease([2020, 2020], t);
      expect(result).toBe("93 years");
    });

    it("formats an old block with low remaining lease", () => {
      // leaseCommenceRange[1] = 1960 → 99 - (2026 - 1960) = 33 years
      const result = formatRemainingLease([1960, 1960], t);
      expect(result).toBe("33 years");
    });

    it("formats a range correctly", () => {
      // [1960, 1990] → min = 99-(2026-1960)=33, max = 99-(2026-1990)=63
      const result = formatRemainingLease([1960, 1990], t);
      expect(result).toBe("33-63 years");
    });

    it("handles the same min and max (single year)", () => {
      const result = formatRemainingLease([2000, 2000], t);
      // 99 - (2026 - 2000) = 73 years
      expect(result).toBe("73 years");
    });
  });

  describe("cache — returns consistent results across calls", () => {
    it("returns same value on repeated calls (cache hit)", () => {
      const first = formatCurrency(123_456);
      const second = formatCurrency(123_456);
      expect(first).toBe(second);
    });

    it("returns same compact value on repeated calls", () => {
      const first = formatCompactCurrency(1_500_000);
      const second = formatCompactCurrency(1_500_000);
      expect(first).toBe(second);
    });

    it("returns fresh result after cache reset", () => {
      const before = formatMonth("2024-03");
      resetFormatCachesForTests();
      const after = formatMonth("2024-03");
      // Value should be identical (same locale, same input)
      expect(after).toBe(before);
    });
  });
});
