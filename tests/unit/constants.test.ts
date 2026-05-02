import { describe, it, expect, vi, afterEach } from "vitest";
import { getCurrentYear } from "../../src/lib/constants";

describe("constants", () => {
  describe("getCurrentYear", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return the current year", () => {
      // Mock the system time to a specific date
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-05-02T12:00:00Z"));

      expect(getCurrentYear()).toBe(2025);
    });

    it("should return another year when time changes", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));

      expect(getCurrentYear()).toBe(2020);
    });
  });
});
