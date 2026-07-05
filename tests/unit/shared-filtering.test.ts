import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  matchesFilter,
  matchesGeographicSearchIntent,
  resolveGeographicSearchIntent,
  getEffectiveMedianPrice,
  getEffectivePricePerSqmMedian,
  resetFilteringCachesForTests,
  createFilterEvaluationContext,
  type GeographicSearchIntent,
} from "@shared/product/filtering";
import type { BlockSummary, FilterState } from "@shared/data-types";

const BASE_FILTERS: FilterState = {
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

function makeBlock(overrides: Partial<BlockSummary> = {}): BlockSummary {
  return {
    addressKey: "test-block",
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    displayName: null,
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 500_000,
    pricePerSqmMedian: 5500,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-12",
    availableDateRange: ["2020-01", "2024-12"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
    postalCode: null,
    ...overrides,
  };
}

describe("shared/product/filtering", () => {
  beforeEach(() => resetFilteringCachesForTests());

  describe("matchesFilter — town", () => {
    it("filters by town", () => {
      const block = makeBlock({ town: "BEDOK" });
      expect(matchesFilter(block, { ...BASE_FILTERS, town: "BEDOK" })).toBe(true);
      expect(matchesFilter(block, { ...BASE_FILTERS, town: "ANG MO KIO" })).toBe(false);
    });
  });

  describe("matchesFilter — budget", () => {
    it("includes block where medianPrice exactly equals budgetMin", () => {
      expect(
        matchesFilter(makeBlock({ medianPrice: 500_000 }), { ...BASE_FILTERS, budgetMin: 500_000 }),
      ).toBe(true);
    });

    it("excludes block where medianPrice is below budgetMin", () => {
      expect(
        matchesFilter(makeBlock({ medianPrice: 499_999 }), { ...BASE_FILTERS, budgetMin: 500_000 }),
      ).toBe(false);
    });

    it("includes block where medianPrice exactly equals budgetMax", () => {
      expect(
        matchesFilter(makeBlock({ medianPrice: 800_000 }), { ...BASE_FILTERS, budgetMax: 800_000 }),
      ).toBe(true);
    });

    it("excludes block where medianPrice exceeds budgetMax", () => {
      expect(
        matchesFilter(makeBlock({ medianPrice: 800_001 }), { ...BASE_FILTERS, budgetMax: 800_000 }),
      ).toBe(false);
    });
  });

  describe("matchesFilter — remaining lease", () => {
    it("requires an explicit evaluation context", () => {
      const block = makeBlock({ leaseCommenceRange: [1990, 2000] });
      expect(() => matchesFilter(block, { ...BASE_FILTERS, remainingLeaseMin: 73 })).toThrow(
        /FilterEvaluationContext/,
      );
    });

    it("includes block where max remaining lease meets remainingLeaseMin", () => {
      // leaseCommenceRange[1] = 2000, year 2026 → 99 - 26 = 73
      const block = makeBlock({ leaseCommenceRange: [1990, 2000] });
      const ctx = createFilterEvaluationContext(2026);
      expect(
        matchesFilter(
          block,
          { ...BASE_FILTERS, remainingLeaseMin: 73 },
          undefined,
          undefined,
          undefined,
          ctx,
        ),
      ).toBe(true);
      expect(
        matchesFilter(
          block,
          { ...BASE_FILTERS, remainingLeaseMin: 74 },
          undefined,
          undefined,
          undefined,
          ctx,
        ),
      ).toBe(false);
    });
  });

  describe("matchesFilter — area range", () => {
    it("includes block whose max area exactly equals areaMin", () => {
      expect(
        matchesFilter(makeBlock({ floorAreaRange: [60, 80] }), { ...BASE_FILTERS, areaMin: 80 }),
      ).toBe(true);
    });

    it("excludes block whose max area is below areaMin", () => {
      expect(
        matchesFilter(makeBlock({ floorAreaRange: [60, 79] }), { ...BASE_FILTERS, areaMin: 80 }),
      ).toBe(false);
    });
  });

  describe("matchesFilter — date range", () => {
    it("excludes block whose latest is before startMonth", () => {
      expect(
        matchesFilter(makeBlock({ availableDateRange: ["2020-01", "2021-06"] }), {
          ...BASE_FILTERS,
          startMonth: "2022-01",
        }),
      ).toBe(false);
    });

    it("excludes block whose earliest is after endMonth", () => {
      expect(
        matchesFilter(makeBlock({ availableDateRange: ["2023-01", "2024-12"] }), {
          ...BASE_FILTERS,
          endMonth: "2022-12",
        }),
      ).toBe(false);
    });
  });

  describe("matchesFilter — MRT distance", () => {
    it("excludes block with null nearestMrt when mrtMax is set", () => {
      expect(
        matchesFilter(makeBlock({ nearestMrt: null }), { ...BASE_FILTERS, mrtMax: 1000 }),
      ).toBe(false);
    });

    it("includes block with null nearestMrt when no mrtMax", () => {
      expect(
        matchesFilter(makeBlock({ nearestMrt: null }), { ...BASE_FILTERS, mrtMax: null }),
      ).toBe(true);
    });
  });

  describe("matchesFilter — flat type and model", () => {
    it("excludes block that does not have the selected flat type", () => {
      expect(
        matchesFilter(makeBlock({ flatTypes: ["3 ROOM"] }), {
          ...BASE_FILTERS,
          flatType: "5 ROOM",
        }),
      ).toBe(false);
    });

    it("includes block that has the selected flat type", () => {
      expect(
        matchesFilter(makeBlock({ flatTypes: ["4 ROOM", "5 ROOM"] }), {
          ...BASE_FILTERS,
          flatType: "5 ROOM",
        }),
      ).toBe(true);
    });
  });

  describe("matchesFilter — affordability", () => {
    it("passes when passesAffordability is null and affordable is set", () => {
      expect(
        matchesFilter(
          makeBlock(),
          { ...BASE_FILTERS, affordable: "comfortable" },
          undefined,
          undefined,
          undefined,
          undefined,
          null,
        ),
      ).toBe(true);
    });

    it("fails when passesAffordability is false and affordable is set", () => {
      expect(
        matchesFilter(
          makeBlock(),
          { ...BASE_FILTERS, affordable: "comfortable" },
          undefined,
          undefined,
          undefined,
          undefined,
          false,
        ),
      ).toBe(false);
    });

    it("passes when passesAffordability is true", () => {
      expect(
        matchesFilter(
          makeBlock(),
          { ...BASE_FILTERS, affordable: "comfortable" },
          undefined,
          undefined,
          undefined,
          undefined,
          true,
        ),
      ).toBe(true);
    });
  });

  describe("matchesFilter — text search", () => {
    it("matches block address text", () => {
      expect(matchesFilter(makeBlock(), { ...BASE_FILTERS, search: "bedok" })).toBe(true);
    });

    it("does not match unrelated text", () => {
      expect(matchesFilter(makeBlock(), { ...BASE_FILTERS, search: "ang mo kio" })).toBe(false);
    });

    it("uses fuseMatchedKeys when provided", () => {
      const block = makeBlock();
      const keys = new Set(["test-block"]);
      expect(
        matchesFilter(block, { ...BASE_FILTERS, search: "xyz" }, undefined, undefined, keys),
      ).toBe(true);
      expect(
        matchesFilter(block, { ...BASE_FILTERS, search: "xyz" }, undefined, undefined, new Set()),
      ).toBe(false);
    });
  });

  describe("getEffectiveMedianPrice", () => {
    it("returns block median when no flatType filter", () => {
      const block = makeBlock({ medianPrice: 500_000 });
      expect(getEffectiveMedianPrice(block, "")).toBe(500_000);
    });

    it("returns flat-type-specific median when available", () => {
      const block = makeBlock({
        medianPrice: 500_000,
        medianPriceByFlatType: { "4 ROOM": 550_000 },
      });
      expect(getEffectiveMedianPrice(block, "4 ROOM")).toBe(550_000);
    });

    it("falls back to block median when flat-type median is missing", () => {
      const block = makeBlock({ medianPrice: 500_000, medianPriceByFlatType: {} });
      expect(getEffectiveMedianPrice(block, "5 ROOM")).toBe(500_000);
    });
  });

  describe("getEffectivePricePerSqmMedian", () => {
    it("returns block pricePerSqmMedian when no flatType filter", () => {
      const block = makeBlock({ pricePerSqmMedian: 5500 });
      expect(getEffectivePricePerSqmMedian(block, "")).toBe(5500);
    });

    it("returns flat-type-specific median when available", () => {
      const block = makeBlock({
        pricePerSqmMedian: 5500,
        medianPricePerSqmByFlatType: { "4 ROOM": 6000 },
      });
      expect(getEffectivePricePerSqmMedian(block, "4 ROOM")).toBe(6000);
    });
  });

  describe("resolveGeographicSearchIntent", () => {
    const blocks = [
      makeBlock({
        town: "ANG MO KIO",
        nearestMrt: {
          stationName: "ANG MO KIO MRT STATION",
          distanceMeters: 300,
          walkingTimeSeconds: 240,
        },
        nearbyMrts: [
          { stationName: "ANG MO KIO MRT STATION", distanceMeters: 300, walkingTimeSeconds: 240 },
        ],
      }),
    ];

    it("resolves station intent from cue words + station name", () => {
      const intent = resolveGeographicSearchIntent("near ang mo kio mrt", blocks, 800);
      expect(intent).toEqual({
        type: "station",
        stationName: "ANG MO KIO MRT STATION",
        radiusMeters: 800,
      });
    });

    it("resolves coordinate intent", () => {
      const intent = resolveGeographicSearchIntent("1.3692, 103.8492", blocks, 300);
      expect(intent).toEqual({
        type: "coordinates",
        coordinates: { lat: 1.3692, lng: 103.8492 },
        radiusMeters: 300,
      });
    });

    it("resolves near-me intent when userLocation is provided", () => {
      const userLocation = { lat: 1.33, lng: 103.94 };
      const intent = resolveGeographicSearchIntent("near me", blocks, 1200, userLocation);
      expect(intent).toEqual({
        type: "coordinates",
        coordinates: userLocation,
        radiusMeters: 1200,
      });
    });

    it("suppresses station intent for exact town matches without cue words", () => {
      const intent = resolveGeographicSearchIntent("Ang Mo Kio", blocks, 800);
      expect(intent).toBeNull();
    });

    it("resolves station intent for town matches when cue words are present", () => {
      const intent = resolveGeographicSearchIntent("near Ang Mo Kio", blocks, 800);
      expect(intent).toEqual({
        type: "station",
        stationName: "ANG MO KIO MRT STATION",
        radiusMeters: 800,
      });
    });

    it("returns null for empty query", () => {
      expect(resolveGeographicSearchIntent("", blocks, 800)).toBeNull();
    });
  });

  describe("matchesGeographicSearchIntent", () => {
    it("matches block within coordinate radius", () => {
      const block = makeBlock({ coordinates: { lat: 1.3692, lng: 103.8492 } });
      const intent: GeographicSearchIntent = {
        type: "coordinates",
        coordinates: { lat: 1.3692, lng: 103.8492 },
        radiusMeters: 500,
      };
      expect(matchesGeographicSearchIntent(block, intent)).toBe(true);
    });

    it("excludes block outside coordinate radius", () => {
      const block = makeBlock({ coordinates: { lat: 1.3339, lng: 103.9372 } });
      const intent: GeographicSearchIntent = {
        type: "coordinates",
        coordinates: { lat: 1.3692, lng: 103.8492 },
        radiusMeters: 300,
      };
      expect(matchesGeographicSearchIntent(block, intent)).toBe(false);
    });

    it("matches block where station is in nearbyMrts within radius", () => {
      const block = makeBlock({
        nearestMrt: { stationName: "OTHER", distanceMeters: 5000, walkingTimeSeconds: 4000 },
        nearbyMrts: [
          { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
        ],
      });
      const intent: GeographicSearchIntent = {
        type: "station",
        stationName: "BEDOK MRT STATION",
        radiusMeters: 800,
      };
      expect(matchesGeographicSearchIntent(block, intent)).toBe(true);
    });

    it("returns false for station intent when block has null nearestMrt and no nearbyMrts", () => {
      const block = makeBlock({ nearestMrt: null, nearbyMrts: undefined });
      const intent: GeographicSearchIntent = {
        type: "station",
        stationName: "BEDOK MRT STATION",
        radiusMeters: 800,
      };
      expect(matchesGeographicSearchIntent(block, intent)).toBe(false);
    });
  });
});
