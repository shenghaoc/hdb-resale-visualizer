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

describe("Search Matching Preservation", () => {
  const angMoKioBlock = createAngMoKioBlock();
  const bedokBlock = createBedokBlock();
  const jurongBlock = createJurongBlock();

  describe("Exact substring matches", () => {
    it("matches 'Ang Mo Kio' against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "Ang Mo Kio",
      });
      expect(result).toBe(true);
    });

    it("matches 'ANG MO KIO' (uppercase) against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "ANG MO KIO",
      });
      expect(result).toBe(true);
    });

    it("matches 'ang mo kio' (lowercase) against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "ang mo kio",
      });
      expect(result).toBe(true);
    });

    it("matches 'Ave 3' against '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "Ave 3",
      });
      expect(result).toBe(true);
    });

    it("matches '101' against block number in '101 Ang Mo Kio Ave 3'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "101",
      });
      expect(result).toBe(true);
    });

    it("matches 'Bedok' against 'BEDOK NTH AVE 4'", () => {
      const result = matchesFilter(bedokBlock, {
        ...EMPTY_FILTERS,
        search: "Bedok",
      });
      expect(result).toBe(true);
    });

    it("matches 'Jurong East' against 'JURONG EAST ST 21'", () => {
      const result = matchesFilter(jurongBlock, {
        ...EMPTY_FILTERS,
        search: "Jurong East",
      });
      expect(result).toBe(true);
    });
  });

  describe("Town-based filtering", () => {
    it("matches 'ANG MO KIO' town name for Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "ANG MO KIO",
      });
      expect(result).toBe(true);
    });

    it("matches 'BEDOK' town name for Bedok block", () => {
      const result = matchesFilter(bedokBlock, {
        ...EMPTY_FILTERS,
        search: "BEDOK",
      });
      expect(result).toBe(true);
    });

    it("matches 'JURONG EAST' town name for Jurong block", () => {
      const result = matchesFilter(jurongBlock, {
        ...EMPTY_FILTERS,
        search: "JURONG EAST",
      });
      expect(result).toBe(true);
    });

    it("does NOT match 'Ang Mo Kio' against Bedok block", () => {
      const result = matchesFilter(bedokBlock, {
        ...EMPTY_FILTERS,
        search: "Ang Mo Kio",
      });
      expect(result).toBe(false);
    });

    it("does NOT match 'Bedok' against Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "Bedok",
      });
      expect(result).toBe(false);
    });
  });

  describe("Empty and whitespace search", () => {
    it("returns true for empty search against Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "",
      });
      expect(result).toBe(true);
    });

    it("returns true for empty search against Bedok block", () => {
      const result = matchesFilter(bedokBlock, {
        ...EMPTY_FILTERS,
        search: "",
      });
      expect(result).toBe(true);
    });

    it("returns true for empty search against Jurong block", () => {
      const result = matchesFilter(jurongBlock, {
        ...EMPTY_FILTERS,
        search: "",
      });
      expect(result).toBe(true);
    });

    it("returns true for whitespace-only search", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "   ",
      });
      expect(result).toBe(true);
    });
  });

  describe("Complete block address matches", () => {
    it("matches '101 ANG MO KIO AVE 3' exactly", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "101 ANG MO KIO AVE 3",
      });
      expect(result).toBe(true);
    });

    it("matches '101 BEDOK NTH AVE 4' exactly", () => {
      const result = matchesFilter(bedokBlock, {
        ...EMPTY_FILTERS,
        search: "101 BEDOK NTH AVE 4",
      });
      expect(result).toBe(true);
    });

    it("matches '202 JURONG EAST ST 21' exactly", () => {
      const result = matchesFilter(jurongBlock, {
        ...EMPTY_FILTERS,
        search: "202 JURONG EAST ST 21",
      });
      expect(result).toBe(true);
    });

    it("matches partial address '101 ANG MO KIO'", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "101 ANG MO KIO",
      });
      expect(result).toBe(true);
    });

    it("matches partial address 'BEDOK NTH AVE'", () => {
      const result = matchesFilter(bedokBlock, {
        ...EMPTY_FILTERS,
        search: "BEDOK NTH AVE",
      });
      expect(result).toBe(true);
    });
  });

  describe("Non-matching searches", () => {
    it("does NOT match 'Tampines' against Ang Mo Kio block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "Tampines",
      });
      expect(result).toBe(false);
    });

    it("does NOT match '999' against '101' block", () => {
      const result = matchesFilter(angMoKioBlock, {
        ...EMPTY_FILTERS,
        search: "999",
      });
      expect(result).toBe(false);
    });

    it("does NOT match 'Paya Lebar' against Jurong block", () => {
      const result = matchesFilter(jurongBlock, {
        ...EMPTY_FILTERS,
        search: "Paya Lebar",
      });
      expect(result).toBe(false);
    });
  });
});
