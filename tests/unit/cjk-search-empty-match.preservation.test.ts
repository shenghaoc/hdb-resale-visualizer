import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { matchesFilter, resetFilteringCachesForTests } from "@/lib/filtering";
import { DEFAULT_FILTERS } from "@/lib/constants";
import type { BlockSummary, FilterState } from "@/types/data";

/**
 * Preservation Property Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests capture the CURRENT (unfixed) behavior for non-buggy inputs.
 * They must PASS on unfixed code, confirming the baseline behavior to preserve.
 * After the fix is applied, they must continue to PASS (no regressions).
 */

const angMoKioBlock: BlockSummary = {
  addressKey: "ang-mo-kio-ave-3-blk-123",
  town: "ANG MO KIO",
  block: "123",
  streetName: "ANG MO KIO AVE 3",
  displayName: null,
  coordinates: { lat: 1.3692, lng: 103.8492 },
  medianPrice: 450000,
  transactionCount: 15,
  floorAreaRange: [67, 110],
  leaseCommenceRange: [1980, 1985],
  latestMonth: "2024-06",
  availableDateRange: ["2020-01", "2024-06"],
  flatTypes: ["3 ROOM", "4 ROOM"],
  flatModels: ["New Generation", "Model A"],
  nearestMrt: { stationName: "Ang Mo Kio", distanceMeters: 350 },
  nearbyMrts: [],
  postalCode: "560123",
};

const bedokBlock: BlockSummary = {
  addressKey: "bedok-north-ave-1-blk-456",
  town: "BEDOK",
  block: "456",
  streetName: "BEDOK NORTH AVE 1",
  displayName: null,
  coordinates: { lat: 1.3260, lng: 103.9300 },
  medianPrice: 520000,
  transactionCount: 20,
  floorAreaRange: [73, 120],
  leaseCommenceRange: [1985, 1990],
  latestMonth: "2024-06",
  availableDateRange: ["2020-01", "2024-06"],
  flatTypes: ["4 ROOM", "5 ROOM"],
  flatModels: ["Model A", "Improved"],
  nearestMrt: { stationName: "Bedok", distanceMeters: 500 },
  nearbyMrts: [],
  postalCode: "460456",
};

const allBlocks = [angMoKioBlock, bedokBlock];

function filtersWithSearch(search: string): FilterState {
  return { ...DEFAULT_FILTERS, search };
}

describe("Preservation: Empty Search and English/Numeric Queries Unchanged", () => {
  /**
   * Property A: Empty search — whitespace-only strings match all blocks
   *
   * **Validates: Requirements 3.1**
   *
   * For all whitespace-only strings (including empty), matchesFilter returns true
   * for all blocks. This is the "show full dataset" behavior.
   */
  describe("Property A: Empty/whitespace search matches all blocks", () => {
    it("concrete: empty string matches all blocks", () => {
      for (const block of allBlocks) {
        expect(matchesFilter(block, filtersWithSearch(""))).toBe(true);
      }
    });

    it("concrete: spaces-only matches all blocks", () => {
      for (const block of allBlocks) {
        expect(matchesFilter(block, filtersWithSearch("   "))).toBe(true);
      }
    });

    it("concrete: tab and newline matches all blocks", () => {
      for (const block of allBlocks) {
        expect(matchesFilter(block, filtersWithSearch("\t\n"))).toBe(true);
      }
    });

    it("property: all whitespace-only strings match all blocks", () => {
      const whitespaceArb = fc
        .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"), {
          minLength: 0,
          maxLength: 10,
        })
        .map((chars) => chars.join(""));

      fc.assert(
        fc.property(whitespaceArb, (ws) => {
          for (const block of allBlocks) {
            const result = matchesFilter(block, filtersWithSearch(ws));
            if (result !== true) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property B: English/numeric searches are deterministic
   *
   * **Validates: Requirements 3.3, 3.4**
   *
   * For all strings generated from [a-zA-Z0-9 ] that produce at least one token,
   * matchesFilter returns a deterministic result (same input → same output).
   * Since we're running on unfixed code, we verify the result is stable.
   */
  describe("Property B: English/numeric searches are deterministic", () => {
    it("concrete: 'ang mo kio' matches AMK, not Bedok", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("ang mo kio"))).toBe(true);
      expect(matchesFilter(bedokBlock, filtersWithSearch("ang mo kio"))).toBe(false);
    });

    it("concrete: 'bedok' matches Bedok, not AMK", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("bedok"))).toBe(false);
      expect(matchesFilter(bedokBlock, filtersWithSearch("bedok"))).toBe(true);
    });

    it("concrete: '560123' matches AMK (postal code)", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("560123"))).toBe(true);
    });

    it("concrete: '560' matches AMK (postal prefix)", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("560"))).toBe(true);
    });

    it("concrete: '123' matches AMK (block number)", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("123"))).toBe(true);
    });

    it("property: English/numeric searches produce same result on repeated calls", () => {
      const englishNumericArb = fc
        .array(
          fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 "),
          { minLength: 1, maxLength: 20 },
        )
        .map((chars) => chars.join(""))
        .filter((s) => s.trim().length > 0);

      fc.assert(
        fc.property(englishNumericArb, (query) => {
          // Clear caches between runs to ensure determinism isn't just cache hits
          resetFilteringCachesForTests();

          const result1Amk = matchesFilter(angMoKioBlock, filtersWithSearch(query));
          const result1Bedok = matchesFilter(bedokBlock, filtersWithSearch(query));

          resetFilteringCachesForTests();

          const result2Amk = matchesFilter(angMoKioBlock, filtersWithSearch(query));
          const result2Bedok = matchesFilter(bedokBlock, filtersWithSearch(query));

          return result1Amk === result2Amk && result1Bedok === result2Bedok;
        }),
        { numRuns: 200 },
      );
    });
  });

  /**
   * Property C: Known CJK aliases continue to resolve correctly
   *
   * **Validates: Requirements 3.2, 3.5**
   *
   * For all known CJK alias keys, search produces non-empty tokens and matches
   * the correct town blocks. Each alias maps to a specific English town name.
   */
  describe("Property C: Known CJK aliases match correct blocks", () => {
    // Map of CJK alias → expected town name (uppercase, matching block.town)
    const aliasToTown: Array<{ alias: string; town: string }> = [
      { alias: "宏茂桥", town: "ANG MO KIO" },
      { alias: "勿洛", town: "BEDOK" },
      { alias: "碧山", town: "BISHAN" },
    ];

    it.each(aliasToTown)(
      "CJK alias '$alias' matches blocks with town '$town'",
      ({ alias, town }) => {
        for (const block of allBlocks) {
          const result = matchesFilter(block, filtersWithSearch(alias));
          if (block.town === town) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }
      },
    );

    it("concrete: '宏茂桥' (ang mo kio) matches AMK block", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("宏茂桥"))).toBe(true);
      expect(matchesFilter(bedokBlock, filtersWithSearch("宏茂桥"))).toBe(false);
    });

    it("concrete: '勿洛' (bedok) matches Bedok block", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("勿洛"))).toBe(false);
      expect(matchesFilter(bedokBlock, filtersWithSearch("勿洛"))).toBe(true);
    });

    it("concrete: '碧山' (bishan) matches neither AMK nor Bedok", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("碧山"))).toBe(false);
      expect(matchesFilter(bedokBlock, filtersWithSearch("碧山"))).toBe(false);
    });

    it("concrete: '大巴窑' (toa payoh) matches neither AMK nor Bedok", () => {
      expect(matchesFilter(angMoKioBlock, filtersWithSearch("大巴窑"))).toBe(false);
      expect(matchesFilter(bedokBlock, filtersWithSearch("大巴窑"))).toBe(false);
    });

    it("property: all known town CJK aliases produce non-empty token matches", () => {
      // All known CJK aliases that map to town names
      const townAliases = [
        "宏茂桥", "勿洛", "碧山", "武吉巴督", "红山", "武吉班让",
        "武吉知马", "中央区", "蔡厝港", "金文泰", "芽笼", "后港",
        "裕廊东", "裕廊西", "加冷", "黄埔", "林厝港", "马林百列",
        "白沙", "榜鹅", "女皇镇", "三巴旺", "盛港", "实龙岗",
        "淡滨尼", "大巴窑", "兀兰", "义顺",
      ];

      const aliasArb = fc.constantFrom(...townAliases);

      fc.assert(
        fc.property(aliasArb, (alias) => {
          // Each known alias should produce a deterministic result (not match-all)
          // The result depends on whether the resolved English name matches the block
          const resultAmk = matchesFilter(angMoKioBlock, filtersWithSearch(alias));
          const resultBedok = matchesFilter(bedokBlock, filtersWithSearch(alias));

          // At least one should be false — a town alias can't match every block
          // (unless the alias resolves to tokens that happen to match both, which
          // doesn't happen for distinct town names)
          return !(resultAmk === true && resultBedok === true);
        }),
        { numRuns: 28 }, // One run per alias
      );
    });
  });
});
