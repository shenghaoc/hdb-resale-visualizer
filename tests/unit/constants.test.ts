import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { getCurrentYear } from "../../src/shared/lib/constants";

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
});
