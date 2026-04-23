import { describe, expect, it } from "vitest";
import { matchesFilter } from "@/lib/filtering";
import { DEFAULT_FILTERS } from "@/lib/constants";
import type { BlockSummary } from "@/types/data";

/**
 * Bug Condition Exploration Test for Search Matching Regression
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * The test encodes the expected behavior from Requirements 2.1, 2.2, 2.3, 2.4.
 * When the fix is implemented, this test will pass.
 */

// Create a test block with Ang Mo Kio address
const createAngMoKioBlock = (): BlockSummary => ({
  addressKey: "ang-mo-kio-101-ang-mo-kio-ave-3",
  town: "ANG MO KIO",
  block: "101",
  streetName: "ANG MO KIO AVE 3",
  displayName: "BLK 101 ANG MO KIO AVE 3",
  coordinates: { lat: 1.3692, lng: 103.8492 },
  medianPrice: 450000,
  transactionCount: 15,
  floorAreaRange: [67, 92],
  leaseCommenceRange: [1979, 1985],
  latestMonth: "2026-02",
  availableDateRange: ["2025-01", "2026-02"],
  flatTypes: ["3 ROOM", "4 ROOM"],
  flatModels: ["IMPROVED", "MODEL A"],
  nearestMrt: {
    stationName: "ANG MO KIO MRT STATION",
    distanceMeters: 500,
  },
});

describe("Search Matching Regression - Bug Condition Exploration", () => {
  const block = createAngMoKioBlock();

  describe("Bug 1.1: Out-of-order terms fail to match", () => {
    it("FAILS on unfixed code: 'Kio Ang Mo' should match '101 Ang Mo Kio Ave 3'", () => {
      // Requirement 2.1: Tokenized matching where all search terms are present in any order
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "Kio Ang Mo",
      });

      // EXPECTED: true (all tokens "Kio", "Ang", "Mo" are present in address)
      // ACTUAL on unfixed code: false (simple substring match fails)
      expect(result).toBe(true);
    });

    it("FAILS on unfixed code: 'Ave Kio 101' should match '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "Ave Kio 101",
      });

      // EXPECTED: true (all tokens present in address in any order)
      // ACTUAL on unfixed code: false
      expect(result).toBe(true);
    });
  });

  describe("Bug 1.2: Abbreviations fail to match", () => {
    it("FAILS on unfixed code: 'AMK' should match 'Ang Mo Kio' blocks", () => {
      // Requirement 2.2: Alias expansion for common Singapore location abbreviations
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "AMK",
      });

      // EXPECTED: true (AMK is a common abbreviation for Ang Mo Kio)
      // ACTUAL on unfixed code: false (no alias expansion)
      expect(result).toBe(true);
    });

    it("FAILS on unfixed code: 'AMK 101' should match '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "AMK 101",
      });

      // EXPECTED: true (AMK expands to Ang Mo Kio, 101 matches block number)
      // ACTUAL on unfixed code: false
      expect(result).toBe(true);
    });
  });

  describe("Bug 1.3: Minor typos fail to match", () => {
    it("FAILS on unfixed code: 'Ang Mo Koi' should match 'Ang Mo Kio' blocks", () => {
      // Requirement 2.3: Fuzzy matching with appropriate tolerance for minor typos
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "Ang Mo Koi",
      });

      // EXPECTED: true (single character typo 'i' vs 'o' in Kio)
      // ACTUAL on unfixed code: false (no fuzzy matching)
      expect(result).toBe(true);
    });

    it("FAILS on unfixed code: 'Ang Mo Kio' with typo 'Ang Mo Kiu' should match", () => {
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "Ang Mo Kiu",
      });

      // EXPECTED: true (single character typo)
      // ACTUAL on unfixed code: false
      expect(result).toBe(true);
    });
  });

  describe("Bug 1.4: Substring not in exact '<block> <street>' order fails", () => {
    it("FAILS on unfixed code: '101 Ang Mo' should match '101 Ang Mo Kio Ave 3'", () => {
      // Requirement 2.4: Tokenized matching for multiple terms
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "101 Ang Mo",
      });

      // EXPECTED: true (both tokens present in address)
      // ACTUAL on unfixed code: true (this might pass as substring)
      // Note: This test documents expected behavior
      expect(result).toBe(true);
    });

    it("FAILS on unfixed code: 'Ang Mo Kio 101' should match '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...DEFAULT_FILTERS,
        search: "Ang Mo Kio 101",
      });

      // EXPECTED: true (all tokens present)
      // ACTUAL on unfixed code: false (substring not in exact order)
      expect(result).toBe(true);
    });
  });
});
