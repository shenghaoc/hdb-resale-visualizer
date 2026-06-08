import { describe, it, expect } from "vitest";
import { buildLeaseSignals } from "../../src/features/block-detail/leaseSignals";

// currentYear = 2026 throughout these tests

const YEAR = 2026;

describe("buildLeaseSignals", () => {
  describe("veryShort signal (< 30 years max remaining)", () => {
    it("emits warn when max remaining lease is exactly 29", () => {
      // max remaining = 99 - (2026 - 1998) = 99 - 28 = 71… wait
      // leaseCommenceRange[1] = latest start = most remaining
      // maxRemaining = 99 - (2026 - commence[1])
      // 99 - (2026 - x) = 29 → x = 2026 - 70 = 1956
      const signals = buildLeaseSignals([1955, 1956], YEAR, null);
      const keys = signals.map((s) => s.key);
      expect(keys).toContain("lease.signal.veryShort");
      expect(signals.find((s) => s.key === "lease.signal.veryShort")?.severity).toBe("warn");
    });

    it("emits warn when max remaining lease is 0 (expired)", () => {
      // 99 - (2026 - 1927) = 99 - 99 = 0
      const signals = buildLeaseSignals([1926, 1927], YEAR, null);
      expect(signals.map((s) => s.key)).toContain("lease.signal.veryShort");
    });

    it("does not emit veryShort when max remaining is exactly 30", () => {
      // 99 - (2026 - x) = 30 → x = 1957
      const signals = buildLeaseSignals([1957, 1957], YEAR, null);
      expect(signals.map((s) => s.key)).not.toContain("lease.signal.veryShort");
    });
  });

  describe("short signal (30 ≤ max remaining < 60)", () => {
    it("emits info when max remaining is exactly 30", () => {
      // 99 - (2026 - 1957) = 30
      const signals = buildLeaseSignals([1957, 1957], YEAR, null);
      const keys = signals.map((s) => s.key);
      expect(keys).toContain("lease.signal.short");
      expect(signals.find((s) => s.key === "lease.signal.short")?.severity).toBe("info");
    });

    it("emits info when max remaining is 59", () => {
      // 99 - (2026 - x) = 59 → x = 1986
      const signals = buildLeaseSignals([1986, 1986], YEAR, null);
      expect(signals.map((s) => s.key)).toContain("lease.signal.short");
    });

    it("does not emit short when max remaining is exactly 60", () => {
      // 99 - (2026 - x) = 60 → x = 1987
      const signals = buildLeaseSignals([1987, 1987], YEAR, null);
      const keys = signals.map((s) => s.key);
      expect(keys).not.toContain("lease.signal.short");
      expect(keys).not.toContain("lease.signal.veryShort");
    });

    it("does not emit short when max remaining is 98", () => {
      // 99 - (2026 - 2025) = 98
      const signals = buildLeaseSignals([2025, 2025], YEAR, null);
      expect(signals.map((s) => s.key)).not.toContain("lease.signal.short");
    });
  });

  describe("oldCommence signal (min commence year < 1975)", () => {
    it("emits info when earliest commence year is 1974", () => {
      const signals = buildLeaseSignals([1974, 1985], YEAR, null);
      const keys = signals.map((s) => s.key);
      expect(keys).toContain("lease.signal.oldCommence");
      expect(signals.find((s) => s.key === "lease.signal.oldCommence")?.severity).toBe("info");
    });

    it("emits info when earliest commence year is 1960", () => {
      const signals = buildLeaseSignals([1960, 1970], YEAR, null);
      expect(signals.map((s) => s.key)).toContain("lease.signal.oldCommence");
    });

    it("does not emit oldCommence when earliest commence year is exactly 1975", () => {
      const signals = buildLeaseSignals([1975, 1980], YEAR, null);
      expect(signals.map((s) => s.key)).not.toContain("lease.signal.oldCommence");
    });

    it("does not emit oldCommence when earliest commence year is 2000", () => {
      const signals = buildLeaseSignals([2000, 2005], YEAR, null);
      expect(signals.map((s) => s.key)).not.toContain("lease.signal.oldCommence");
    });
  });

  describe("belowFilter signal (min remaining < remainingLeaseMin)", () => {
    it("emits info when some units have less than the filter threshold", () => {
      // leaseCommenceRange = [1990, 2000]
      // minRemaining = 99 - (2026 - 1990) = 63
      // maxRemaining = 99 - (2026 - 2000) = 73
      // filter = 70 → minRemaining (63) < 70 → emit
      const signals = buildLeaseSignals([1990, 2000], YEAR, 70);
      const keys = signals.map((s) => s.key);
      expect(keys).toContain("lease.signal.belowFilter");
      expect(signals.find((s) => s.key === "lease.signal.belowFilter")?.severity).toBe("info");
    });

    it("does not emit belowFilter when all units exceed the filter threshold", () => {
      // minRemaining = 63, filter = 60 → no signal
      const signals = buildLeaseSignals([1990, 2000], YEAR, 60);
      expect(signals.map((s) => s.key)).not.toContain("lease.signal.belowFilter");
    });

    it("does not emit belowFilter when remainingLeaseMin is null", () => {
      const signals = buildLeaseSignals([1990, 2000], YEAR, null);
      expect(signals.map((s) => s.key)).not.toContain("lease.signal.belowFilter");
    });

    it("does not emit belowFilter when min remaining equals the filter threshold exactly", () => {
      // minRemaining = 99 - (2026 - 1990) = 63, filter = 63 → not strictly less
      const signals = buildLeaseSignals([1990, 2000], YEAR, 63);
      expect(signals.map((s) => s.key)).not.toContain("lease.signal.belowFilter");
    });
  });

  describe("combined signals", () => {
    it("returns empty array for a healthy block with no filter", () => {
      // commence 2005–2010, long lease, no filter
      const signals = buildLeaseSignals([2005, 2010], YEAR, null);
      expect(signals).toHaveLength(0);
    });

    it("can emit both oldCommence and veryShort for a very old short-lease block", () => {
      // commence [1960, 1960]: oldCommence (< 1975) + veryShort (maxRemaining = 99 - 66 = 33... wait)
      // 99 - (2026 - 1960) = 99 - 66 = 33 → short, not veryShort
      // For veryShort: 99 - (2026 - 1957) = 30 → short boundary; need < 30
      // 99 - (2026 - 1956) = 29 → veryShort
      const signals = buildLeaseSignals([1956, 1956], YEAR, null);
      const keys = signals.map((s) => s.key);
      expect(keys).toContain("lease.signal.veryShort");
      expect(keys).toContain("lease.signal.oldCommence");
    });

    it("can emit short and belowFilter together", () => {
      // commence [1987, 1987]: maxRemaining = 60 → no short; need < 60
      // [1985, 1985]: maxRemaining = 99 - 41 = 58 → short
      // minRemaining = 58, filter = 59 → belowFilter
      const signals = buildLeaseSignals([1985, 1985], YEAR, 59);
      const keys = signals.map((s) => s.key);
      expect(keys).toContain("lease.signal.short");
      expect(keys).toContain("lease.signal.belowFilter");
    });

    it("does not emit both veryShort and short for the same block", () => {
      // These two are mutually exclusive (else/if chain)
      const veryShortSignals = buildLeaseSignals([1956, 1956], YEAR, null);
      const shortSignals = buildLeaseSignals([1985, 1985], YEAR, null);
      const veryShortKeys = veryShortSignals.map((s) => s.key);
      const shortKeys = shortSignals.map((s) => s.key);
      expect(veryShortKeys).not.toContain("lease.signal.short");
      expect(shortKeys).not.toContain("lease.signal.veryShort");
    });
  });
});
