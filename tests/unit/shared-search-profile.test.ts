import { describe, expect, it } from "vite-plus/test";
import {
  computeRemainingLeaseYears,
  createProfileEvaluator,
  evaluateBlockForProfile,
  hasCompletedSearchProfile,
} from "@shared/product/search-profile";
import type { BlockSummary } from "@shared/data-types";
import type { SearchProfile } from "@shared/product/search-profile";

function makeBlock(overrides: Partial<BlockSummary> & { addressKey: string }): BlockSummary {
  return {
    town: "BEDOK",
    block: "1",
    streetName: "TEST STREET",
    displayName: null,
    coordinates: { lat: 1.35, lng: 103.8 },
    medianPrice: 600_000,
    pricePerSqmMedian: 6300,
    transactionCount: 10,
    floorAreaRange: [90, 100],
    leaseCommenceRange: [2000, 2000],
    latestMonth: "2025-01",
    availableDateRange: ["2015-01", "2025-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: {
      stationName: "BEDOK MRT STATION",
      distanceMeters: 400,
      walkingTimeSeconds: 320,
    },
    nearbyMrts: [],
    postalCode: null,
    ...overrides,
  };
}

const DEFAULT_PROFILE: SearchProfile = {
  version: 3,
  mainFlatType: "",
  maxBudget: null,
  minimumRemainingLeaseYears: null,
  age: null,
  coApplicantAge: null,
  cpfOABalance: null,
  monthlyIncome: null,
};

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe("shared/product/search-profile", () => {
  describe("hasCompletedSearchProfile", () => {
    it("requires a flat type and minimum remaining lease", () => {
      expect(
        hasCompletedSearchProfile(
          makeProfile({ mainFlatType: "4 ROOM", minimumRemainingLeaseYears: 70 }),
        ),
      ).toBe(true);
      expect(hasCompletedSearchProfile(makeProfile({ mainFlatType: "4 ROOM" }))).toBe(false);
      expect(hasCompletedSearchProfile(makeProfile({ minimumRemainingLeaseYears: 70 }))).toBe(
        false,
      );
      expect(
        hasCompletedSearchProfile(
          makeProfile({ mainFlatType: "   ", minimumRemainingLeaseYears: 70 }),
        ),
      ).toBe(false);
    });

    it("handles nullish and partial profile values", () => {
      expect(hasCompletedSearchProfile(null)).toBe(false);
      expect(hasCompletedSearchProfile(undefined)).toBe(false);
      expect(hasCompletedSearchProfile({ mainFlatType: "4 ROOM" })).toBe(false);
    });
  });

  describe("computeRemainingLeaseYears", () => {
    it("uses the newest lease commencement year", () => {
      expect(computeRemainingLeaseYears([2000, 2005], 2025)).toBe(79);
    });

    it("handles a future lease commencement year deterministically", () => {
      expect(computeRemainingLeaseYears([2025, 2030], 2026)).toBe(103);
    });
  });

  describe("profile evaluation", () => {
    it("returns strong when no profile preferences are set", () => {
      const evaluate = createProfileEvaluator(makeProfile(), 2026);
      expect(evaluate(makeBlock({ addressKey: "x" }))).toEqual({
        tier: "strong",
        flatType: "skip",
        lease: "skip",
        budget: "skip",
      });
    });

    it("returns weak when the selected flat type is unavailable", () => {
      const result = evaluateBlockForProfile(
        makeBlock({ addressKey: "x", flatTypes: ["3 ROOM"] }),
        makeProfile({ mainFlatType: "4 ROOM" }),
        2026,
      );
      expect(result).toMatchObject({ tier: "weak", flatType: "fail" });
    });

    it("returns weak when remaining lease is below the minimum", () => {
      const result = evaluateBlockForProfile(
        makeBlock({ addressKey: "x", leaseCommenceRange: [1970, 1970] }),
        makeProfile({ minimumRemainingLeaseYears: 70 }),
        2026,
      );
      expect(result).toMatchObject({ tier: "weak", lease: "fail" });
    });

    it("uses the selected flat-type median for the hard budget maximum", () => {
      const result = evaluateBlockForProfile(
        makeBlock({
          addressKey: "x",
          medianPrice: 600_000,
          medianPriceByFlatType: {
            "3 ROOM": 550_000,
            "4 ROOM": 750_000,
          },
        }),
        makeProfile({ mainFlatType: "4 ROOM", maxBudget: 700_000 }),
        2026,
      );
      expect(result).toMatchObject({ tier: "weak", budget: "fail" });
    });

    it("does not expose or rank on the retired commute proxy", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        minimumRemainingLeaseYears: 60,
      });
      const near = makeBlock({
        addressKey: "near",
        nearestMrt: {
          stationName: "BEDOK MRT STATION",
          distanceMeters: 100,
          walkingTimeSeconds: 80,
        },
      });
      const far = makeBlock({
        addressKey: "far",
        nearestMrt: null,
        nearbyMrts: [],
      });

      const nearResult = evaluateBlockForProfile(near, profile, 2026);
      const farResult = evaluateBlockForProfile(far, profile, 2026);

      expect(nearResult).toEqual(farResult);
      expect(nearResult).not.toHaveProperty("commute");
    });

    it("keeps local finance fields out of recommendation ranking", () => {
      const block = makeBlock({ addressKey: "x" });
      const withoutFinance = evaluateBlockForProfile(block, makeProfile(), 2026);
      const withFinance = evaluateBlockForProfile(
        block,
        makeProfile({
          age: 35,
          coApplicantAge: 33,
          cpfOABalance: 120_000,
          monthlyIncome: 9_000,
        }),
        2026,
      );
      expect(withFinance).toEqual(withoutFinance);
    });
  });
});
