import { describe, expect, it } from "vitest";
import { matchesFilter } from "@/lib/filtering";
import { DEFAULT_FILTERS } from "@/lib/constants";
import type { BlockSummary } from "@/types/data";

/**
 * Preservation Property Tests for Search Matching
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * These tests MUST PASS on unfixed code - passing confirms baseline behavior to preserve.
 * These tests verify that existing search functionality continues to work correctly.
 */

// Create test blocks with various addresses
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

const createBedokBlock = (): BlockSummary => ({
  addressKey: "bedok-101-bedok-nth-ave-4",
  town: "BEDOK",
  block: "101",
  streetName: "BEDOK NTH AVE 4",
  displayName: "BLK 101 BEDOK NTH AVE 4",
  coordinates: { lat: 1.3339, lng: 103.9372 },
  medianPrice: 520000,
  transactionCount: 20,
  floorAreaRange: [75, 100],
  leaseCommenceRange: [1980, 1988],
  latestMonth: "2026-02",
  availableDateRange: ["2025-01", "2026-02"],
  flatTypes: ["4 ROOM", "5 ROOM"],
  flatModels: ["MODEL A"],
  nearestMrt: {
    stationName: "BEDOK NORTH MRT STATION",
    distanceMeters: 650,
  },
});

const createJurongBlock = (): BlockSummary => ({
  addressKey: "jurong-east-202-jurong-east-st-21",
  town: "JURONG EAST",
  block: "202",
  streetName: "JURONG EAST ST 21",
  displayName: "BLK 202 JURONG EAST ST 21",
  coordinates: { lat: 1.3421, lng: 103.7421 },
  medianPrice: 480000,
  transactionCount: 12,
  floorAreaRange: [70, 95],
  leaseCommenceRange: [1982, 1990],
  latestMonth: "2026-01",
  availableDateRange: ["2024-12", "2026-01"],
  flatTypes: ["3 ROOM", "4 ROOM"],
  flatModels: ["IMPROVED", "MODEL A"],
  nearestMrt: {
    stationName: "JURONG EAST MRT STATION",
    distanceMeters: 400,
  },
});

describe("Search Matching Preservation - Baseline Behavior", () => {
  const angMoKioBlock = createAngMoKioBlock();
  const bedokBlock = createBedokBlock();
  const jurongBlock = createJurongBlock();

  describe("Requirement 3.1: Exact substring matches continue to work", () => {
    it("PASSES on unfixed code: 'Ang Mo Kio' matches '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "Ang Mo Kio",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'ANG MO KIO' (uppercase) matches '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "ANG MO KIO",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'ang mo kio' (lowercase) matches '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "ang mo kio",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'Ave 3' matches '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "Ave 3",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: '101' matches block number in '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "101",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'Bedok' matches 'BEDOK NTH AVE 4'", () => {
      const result = matchesFilter(bedokBlock, {
        ...DEFAULT_FILTERS,
        search: "Bedok",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'Jurong East' matches 'JURONG EAST ST 21'", () => {
      const result = matchesFilter(jurongBlock, {
        ...DEFAULT_FILTERS,
        search: "Jurong East",
      });
      expect(result).toBe(true);
    });
  });

  describe("Requirement 3.2: Town-based filtering continues to work", () => {
    it("PASSES on unfixed code: 'ANG MO KIO' town name matches Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "ANG MO KIO",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'BEDOK' town name matches Bedok block", () => {
      const result = matchesFilter(bedokBlock, {
        ...DEFAULT_FILTERS,
        search: "BEDOK",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'JURONG EAST' town name matches Jurong block", () => {
      const result = matchesFilter(jurongBlock, {
        ...DEFAULT_FILTERS,
        search: "JURONG EAST",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: 'Ang Mo Kio' does NOT match Bedok block", () => {
      const result = matchesFilter(bedokBlock, {
        ...DEFAULT_FILTERS,
        search: "Ang Mo Kio",
      });
      expect(result).toBe(false);
    });

    it("PASSES on unfixed code: 'Bedok' does NOT match Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "Bedok",
      });
      expect(result).toBe(false);
    });
  });

  describe("Requirement 3.3: Empty search returns all blocks", () => {
    it("PASSES on unfixed code: empty search matches Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: empty search matches Bedok block", () => {
      const result = matchesFilter(bedokBlock, {
        ...DEFAULT_FILTERS,
        search: "",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: empty search matches Jurong block", () => {
      const result = matchesFilter(jurongBlock, {
        ...DEFAULT_FILTERS,
        search: "",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: whitespace-only search matches all blocks", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "   ",
      });
      expect(result).toBe(true);
    });
  });

  describe("Requirement 3.4: Complete block address matches continue to work", () => {
    it("PASSES on unfixed code: '101 ANG MO KIO AVE 3' matches exact address", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "101 ANG MO KIO AVE 3",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: '101 BEDOK NTH AVE 4' matches exact address", () => {
      const result = matchesFilter(bedokBlock, {
        ...DEFAULT_FILTERS,
        search: "101 BEDOK NTH AVE 4",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: '202 JURONG EAST ST 21' matches exact address", () => {
      const result = matchesFilter(jurongBlock, {
        ...DEFAULT_FILTERS,
        search: "202 JURONG EAST ST 21",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: partial address '101 ANG MO KIO' matches", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "101 ANG MO KIO",
      });
      expect(result).toBe(true);
    });

    it("PASSES on unfixed code: partial address 'BEDOK NTH AVE' matches", () => {
      const result = matchesFilter(bedokBlock, {
        ...DEFAULT_FILTERS,
        search: "BEDOK NTH AVE",
      });
      expect(result).toBe(true);
    });
  });

  describe("Additional preservation: Non-matching searches return false", () => {
    it("PASSES on unfixed code: 'Tampines' does NOT match Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "Tampines",
      });
      expect(result).toBe(false);
    });

    it("PASSES on unfixed code: '999' does NOT match '101' block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...DEFAULT_FILTERS,
        search: "999",
      });
      expect(result).toBe(false);
    });

    it("PASSES on unfixed code: 'Paya Lebar' does NOT match Jurong block", () => {
      const result = matchesFilter(jurongBlock, {
        ...DEFAULT_FILTERS,
        search: "Paya Lebar",
      });
      expect(result).toBe(false);
    });
  });
});
