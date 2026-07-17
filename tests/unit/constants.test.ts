import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { getCurrentYear, getDefaultTransactionStartMonth } from "../../src/shared/lib/constants";

describe("constants", () => {
  describe("getCurrentYear", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return the current year", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 4, 2, 12));

      expect(getCurrentYear()).toBe(2025);
    });

    it("should return another year when time changes", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2020, 0, 1, 12));

      expect(getCurrentYear()).toBe(2020);
    });
  });

  describe("getDefaultTransactionStartMonth", () => {
    it("uses the same month three years before the latest data month", () => {
      expect(getDefaultTransactionStartMonth("2017-01", "2026-04")).toBe("2023-04");
    });

    it("clamps to the earliest available data month", () => {
      expect(getDefaultTransactionStartMonth("2025-01", "2026-04")).toBe("2025-01");
    });

    it("does not return a malformed minimum month", () => {
      expect(getDefaultTransactionStartMonth("invalid", "2026-04")).toBe("2026-04");
    });

    it("falls back to the minimum month when the latest data month is malformed", () => {
      expect(getDefaultTransactionStartMonth("2025-01", "invalid")).toBe("2025-01");
    });

    it("returns null when both data window months are malformed", () => {
      expect(getDefaultTransactionStartMonth("invalid-min", "invalid-max")).toBeNull();
    });
  });
});
