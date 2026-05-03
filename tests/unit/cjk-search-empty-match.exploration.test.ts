import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { matchesFilter } from "@/lib/filtering";
import { DEFAULT_FILTERS } from "@/lib/constants";
import type { BlockSummary } from "@/types/data";

/**
 * Bug Condition Exploration Test
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 *
 * This test encodes the EXPECTED (correct) behavior: when a user types a non-empty
 * query that normalizes to zero tokens (unrecognized CJK, emoji, symbols),
 * matchesFilter should return false (match nothing).
 *
 * On UNFIXED code, this test will FAIL because the current implementation returns
 * true for all blocks when tokens are empty — confirming the bug exists.
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

const baseFilters = {
  ...DEFAULT_FILTERS,
  budgetMin: null,
  budgetMax: null,
  remainingLeaseMin: null,
};

// Known CJK alias characters from src/lib/i18n/domain.ts searchAliases map.
// These MUST be excluded from random generation because they resolve to English tokens.
const KNOWN_ALIAS_CHARS = [
  ..."宏茂桥勿洛碧山武吉巴督红武班让知马中央区蔡厝港金文泰芽笼后裕廊东西加冷黄埔林马百列白沙榜鹅女皇镇三旺盛实龙岗淡滨尼大窑兀兰义顺地铁捷运附近周边",
];

const knownAliasSet = new Set(KNOWN_ALIAS_CHARS);

describe("Bug Condition Exploration: Unrecognized CJK Input Matches All Blocks", () => {
  describe("Concrete cases — non-empty query with zero tokens should return false", () => {
    it.each([
      { input: "你好", label: "unrecognized Chinese (你好)" },
      { input: "🏠🏢", label: "emoji-only (🏠🏢)" },
      { input: "###", label: "symbol-only (###)" },
      { input: "你好世界", label: "unrecognized Chinese (你好世界)" },
      { input: "★★★", label: "symbol-only (★★★)" },
      { input: "こんにちは", label: "Japanese hiragana (こんにちは)" },
    ])("$label → matchesFilter should return false", ({ input }) => {
      const result = matchesFilter(angMoKioBlock, {
        ...baseFilters,
        search: input,
      });
      expect(result).toBe(false);
    });
  });

  describe("Property: random CJK strings (not in alias map) should return false", () => {
    /**
     * **Validates: Requirements 1.1, 2.1**
     *
     * Generate random strings from CJK Unified Ideographs (U+4E00–U+9FFF)
     * excluding characters that appear in the known alias map.
     * For all such non-empty strings, matchesFilter should return false.
     */
    it("matchesFilter returns false for all random unrecognized CJK strings", () => {
      const cjkCharArb = fc
        .integer({ min: 0x4e00, max: 0x9fff })
        .map((cp) => String.fromCodePoint(cp))
        .filter((c) => !knownAliasSet.has(c));

      const cjkStringArb = fc
        .array(cjkCharArb, { minLength: 1, maxLength: 8 })
        .map((chars) => chars.join(""));

      fc.assert(
        fc.property(cjkStringArb, (rawQuery) => {
          const result = matchesFilter(angMoKioBlock, {
            ...baseFilters,
            search: rawQuery,
          });
          return result === false;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Property: random emoji strings should return false", () => {
    /**
     * **Validates: Requirements 1.2, 2.2**
     *
     * Generate random strings from Miscellaneous Symbols and Pictographs / Emoticons
     * (U+1F300–U+1F9FF). For all such non-empty strings, matchesFilter should return false.
     */
    it("matchesFilter returns false for all random emoji strings", () => {
      const emojiCharArb = fc
        .integer({ min: 0x1f300, max: 0x1f9ff })
        .map((cp) => String.fromCodePoint(cp));

      const emojiStringArb = fc
        .array(emojiCharArb, { minLength: 1, maxLength: 5 })
        .map((chars) => chars.join(""));

      fc.assert(
        fc.property(emojiStringArb, (rawQuery) => {
          const result = matchesFilter(angMoKioBlock, {
            ...baseFilters,
            search: rawQuery,
          });
          return result === false;
        }),
        { numRuns: 100 },
      );
    });
  });
});
