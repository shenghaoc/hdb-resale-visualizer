import { describe, expect, it } from "vitest";
import { matchesFilter } from "@/lib/filtering";
import { DEFAULT_FILTERS } from "@/lib/constants";
import type { BlockSummary } from "@/types/data";

const EMPTY_FILTERS = {
  ...DEFAULT_FILTERS,
  budgetMin: null,
  budgetMax: null,
  remainingLeaseMin: null,
};

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

describe("Search Matching Regression", () => {
  const block = createAngMoKioBlock();

  describe("Out-of-order terms", () => {
    it("matches 'Kio Ang Mo' against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "Kio Ang Mo",
      });
      expect(result).toBe(true);
    });

    it("matches 'Ave Kio 101' against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "Ave Kio 101",
      });
      expect(result).toBe(true);
    });
  });

  describe("Abbreviations", () => {
    it("matches 'AMK' against 'Ang Mo Kio' blocks", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "AMK",
      });
      expect(result).toBe(true);
    });

    it("matches 'AMK 101' against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "AMK 101",
      });
      expect(result).toBe(true);
    });
  });

  describe("Fuzzy matching", () => {
    it("matches 'Ang Mo Koi' against 'Ang Mo Kio' blocks", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "Ang Mo Koi",
      });
      expect(result).toBe(true);
    });

    it("matches 'Ang Mo Kiu' against 'Ang Mo Kio' blocks", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "Ang Mo Kiu",
      });
      expect(result).toBe(true);
    });
  });

  describe("Tokenized matching", () => {
    it("matches '101 Ang Mo' against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "101 Ang Mo",
      });
      expect(result).toBe(true);
    });

    it("matches 'Ang Mo Kio 101' against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(block, {
        ...EMPTY_FILTERS,
        search: "Ang Mo Kio 101",
      });
      expect(result).toBe(true);
    });
  });
});
