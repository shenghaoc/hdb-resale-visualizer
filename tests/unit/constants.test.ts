import { describe, it, expect, vi, afterEach } from "vitest";
import { getCurrentYear, getDefaultTransactionStartMonth } from "../../src/lib/constants";

describe("constants", () => {
  describe("getCurrentYear", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return the current year", () => {
      const spy = vi.spyOn(Temporal.Now, "plainDateISO").mockReturnValue(
        Temporal.PlainDate.from("2025-05-02")
      );

      expect(getCurrentYear()).toBe(2025);
      spy.mockRestore();
    });

    it("should return another year when time changes", () => {
      const spy = vi.spyOn(Temporal.Now, "plainDateISO").mockReturnValue(
        Temporal.PlainDate.from("2020-01-01")
      );

      expect(getCurrentYear()).toBe(2020);
      spy.mockRestore();
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
