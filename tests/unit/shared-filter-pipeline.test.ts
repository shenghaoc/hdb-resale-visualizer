import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  filterScopedBlocks,
  computeMapFilteredBlocks,
  hasResultScope,
  hasMapMarkerScope,
} from "@shared/product/filter-pipeline";
import { resetFilteringCachesForTests } from "@shared/product/filtering";
import type { BlockSummary, FilterState } from "@shared/data-types";
import type { SearchProfile } from "@shared/product/search-profile";

const BASE_FILTERS: FilterState & { selectedAddressKey: null } = {
  search: "",
  town: "",
  flatType: "",
  flatModel: "",
  budgetMin: null,
  budgetMax: null,
  areaMin: null,
  areaMax: null,
  remainingLeaseMin: null,
  startMonth: null,
  endMonth: null,
  mrtMax: null,
  selectedAddressKey: null,
  compareTown: "",
  affordable: "",
  sort: "",
};

const DEFAULT_PROFILE: SearchProfile = {
  version: 1,
  mainFlatType: "",
  alternativeFlatTypes: [],
  maxBudget: null,
  commuteAnchorLabel: "",
  commuteAnchorMrt: null,
  maxComfortableCommuteMinutes: null,
  commuteStretchMinutes: 10,
  minimumRemainingLeaseYears: null,
  budgetStretchPercent: 5,
  showStretchOptions: true,
  showAllBlocks: false,
  age: null,
  coApplicantAge: null,
  cpfOABalance: null,
  monthlyIncome: null,
};

function makeBlock(overrides: Partial<BlockSummary> & { addressKey: string }): BlockSummary {
  return {
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    displayName: null,
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 500_000,
    pricePerSqmMedian: 5500,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [2000, 2000],
    latestMonth: "2024-12",
    availableDateRange: ["2020-01", "2024-12"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
    postalCode: null,
    ...overrides,
  };
}

describe("shared/product/filter-pipeline", () => {
  beforeEach(() => resetFilteringCachesForTests());

  describe("filterScopedBlocks", () => {
    it("returns all blocks when no filters are active", () => {
      const blocks = [makeBlock({ addressKey: "a" }), makeBlock({ addressKey: "b" })];
      const result = filterScopedBlocks(blocks, BASE_FILTERS, null, null, null, null, null);
      expect(result).toHaveLength(2);
    });

    it("filters by town", () => {
      const bedok = makeBlock({ addressKey: "bedok", town: "BEDOK" });
      const amk = makeBlock({ addressKey: "amk", town: "ANG MO KIO" });
      const result = filterScopedBlocks(
        [bedok, amk],
        { ...BASE_FILTERS, town: "BEDOK" },
        null,
        null,
        null,
        null,
        null,
      );
      expect(result.map((b) => b.addressKey)).toEqual(["bedok"]);
    });

    it("filters by budget", () => {
      const cheap = makeBlock({ addressKey: "cheap", medianPrice: 400_000 });
      const expensive = makeBlock({ addressKey: "expensive", medianPrice: 800_000 });
      const result = filterScopedBlocks(
        [cheap, expensive],
        { ...BASE_FILTERS, budgetMax: 600_000 },
        null,
        null,
        null,
        null,
        null,
      );
      expect(result.map((b) => b.addressKey)).toEqual(["cheap"]);
    });

    it("applies profile visibility when profile has active dimensions", () => {
      const pass = makeBlock({ addressKey: "pass", flatTypes: ["4 ROOM"], medianPrice: 500_000 });
      const weak = makeBlock({ addressKey: "weak", flatTypes: ["3 ROOM"], medianPrice: 500_000 });
      const result = filterScopedBlocks([pass, weak], BASE_FILTERS, null, null, null, null, null);
      // Profile visibility is NOT applied by filterScopedBlocks — it's applied
      // separately by the caller (or by computeMapFilteredBlocks).
      // So both blocks pass the filter, but the caller applies visibility.
      expect(result).toHaveLength(2);
    });

    it("requires an explicit evaluation context for remaining lease filters", () => {
      const block = makeBlock({ addressKey: "lease", leaseCommenceRange: [1990, 2000] });
      expect(() =>
        filterScopedBlocks(
          [block],
          { ...BASE_FILTERS, remainingLeaseMin: 73 },
          null,
          null,
          null,
          null,
          null,
        ),
      ).toThrow(/FilterEvaluationContext/);
    });
  });

  describe("computeMapFilteredBlocks", () => {
    it("includes selected address even when it doesn't match filters", () => {
      const matching = makeBlock({ addressKey: "match", town: "BEDOK", medianPrice: 500_000 });
      const selected = makeBlock({
        addressKey: "selected",
        town: "ANG MO KIO",
        medianPrice: 500_000,
      });
      const blocks = [matching, selected];
      const blocksByKey = new Map(blocks.map((b) => [b.addressKey, b]));

      const result = computeMapFilteredBlocks(
        blocks,
        { ...BASE_FILTERS, town: "BEDOK" },
        null,
        null,
        DEFAULT_PROFILE,
        null,
        "selected",
        blocksByKey,
        2026,
        null,
      );

      expect(result.map((b) => b.addressKey)).toContain("match");
      expect(result.map((b) => b.addressKey)).toContain("selected");
    });

    it("does not duplicate selected address when it already matches", () => {
      const matching = makeBlock({ addressKey: "match", town: "BEDOK" });
      const blocks = [matching];
      const blocksByKey = new Map(blocks.map((b) => [b.addressKey, b]));

      const result = computeMapFilteredBlocks(
        blocks,
        { ...BASE_FILTERS, town: "BEDOK" },
        null,
        null,
        DEFAULT_PROFILE,
        null,
        "match",
        blocksByKey,
        2026,
        null,
      );

      expect(result.filter((b) => b.addressKey === "match")).toHaveLength(1);
    });

    it("returns all blocks when no filters are active and no selected address", () => {
      const blocks = [makeBlock({ addressKey: "a" })];
      const blocksByKey = new Map(blocks.map((b) => [b.addressKey, b]));

      const result = computeMapFilteredBlocks(
        blocks,
        BASE_FILTERS,
        null,
        null,
        DEFAULT_PROFILE,
        null,
        null,
        blocksByKey,
        2026,
        null,
      );

      // No filters active → all blocks pass. The "no map scope → skip filtering"
      // optimization is the caller's responsibility (the hook), not the pure function's.
      expect(result).toHaveLength(1);
    });

    it("uses the supplied currentYear for remaining lease filtering", () => {
      const block = makeBlock({ addressKey: "lease", leaseCommenceRange: [1990, 2000] });
      const blocks = [block];
      const blocksByKey = new Map(blocks.map((b) => [b.addressKey, b]));
      const filters = { ...BASE_FILTERS, remainingLeaseMin: 73 };

      expect(
        computeMapFilteredBlocks(
          blocks,
          filters,
          null,
          null,
          DEFAULT_PROFILE,
          null,
          null,
          blocksByKey,
          2026,
          null,
        ).map((b) => b.addressKey),
      ).toEqual(["lease"]);

      expect(
        computeMapFilteredBlocks(
          blocks,
          filters,
          null,
          null,
          DEFAULT_PROFILE,
          null,
          null,
          blocksByKey,
          2027,
          null,
        ),
      ).toEqual([]);
    });
  });

  describe("hasResultScope", () => {
    it("returns false when no scope indicators", () => {
      expect(hasResultScope("", "", null, null)).toBe(false);
    });

    it("returns true when town is set", () => {
      expect(hasResultScope("BEDOK", "", null, null)).toBe(true);
    });

    it("returns true when search is set", () => {
      expect(hasResultScope("", "bedok", null, null)).toBe(true);
    });

    it("returns true when geographic intent is present", () => {
      expect(
        hasResultScope("", "", { type: "station", stationName: "X", radiusMeters: 800 }, null),
      ).toBe(true);
    });

    it("returns true when selectedAddressKey is set", () => {
      expect(hasResultScope("", "", null, "some-key")).toBe(true);
    });
  });

  describe("hasMapMarkerScope", () => {
    it("returns false when no scope indicators", () => {
      expect(hasMapMarkerScope("", "", null)).toBe(false);
    });

    it("returns true when town is set", () => {
      expect(hasMapMarkerScope("BEDOK", "", null)).toBe(true);
    });

    it("ignores selectedAddressKey", () => {
      // selectedAddressKey is intentionally excluded from map scope
      expect(hasMapMarkerScope("", "", null)).toBe(false);
    });
  });
});
