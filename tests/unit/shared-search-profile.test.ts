import { describe, expect, it } from "vite-plus/test";
import {
  applyProfileVisibility,
  computeRemainingLeaseYears,
  createProfileEvaluator,
  evaluateBlockForProfile,
  hasCompletedSearchProfile,
  isProfileVisibilityActive,
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
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
    nearbyMrts: [],
    postalCode: null,
    ...overrides,
  };
}

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

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe("shared/product/search-profile", () => {
  describe("hasCompletedSearchProfile", () => {
    it("returns true for a complete profile", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        commuteAnchorLabel: "Raffles Place",
        commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
        maxComfortableCommuteMinutes: 30,
        minimumRemainingLeaseYears: 70,
      });
      expect(hasCompletedSearchProfile(profile)).toBe(true);
    });

    it("returns false when mainFlatType is blank", () => {
      const profile = makeProfile({
        mainFlatType: "",
        commuteAnchorLabel: "Raffles Place",
        commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
        maxComfortableCommuteMinutes: 30,
        minimumRemainingLeaseYears: 70,
      });
      expect(hasCompletedSearchProfile(profile)).toBe(false);
    });

    it("returns false when commuteAnchorLabel is blank", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        commuteAnchorLabel: "",
        commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
        maxComfortableCommuteMinutes: 30,
        minimumRemainingLeaseYears: 70,
      });
      expect(hasCompletedSearchProfile(profile)).toBe(false);
    });

    it("returns false when commuteAnchorMrt is null", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        commuteAnchorLabel: "Raffles Place",
        commuteAnchorMrt: null,
        maxComfortableCommuteMinutes: 30,
        minimumRemainingLeaseYears: 70,
      });
      expect(hasCompletedSearchProfile(profile)).toBe(false);
    });

    it("returns false when maxComfortableCommuteMinutes is null", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        commuteAnchorLabel: "Raffles Place",
        commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
        maxComfortableCommuteMinutes: null,
        minimumRemainingLeaseYears: 70,
      });
      expect(hasCompletedSearchProfile(profile)).toBe(false);
    });

    it("returns false when minimumRemainingLeaseYears is null", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        commuteAnchorLabel: "Raffles Place",
        commuteAnchorMrt: "RAFFLES PLACE MRT STATION",
        maxComfortableCommuteMinutes: 30,
        minimumRemainingLeaseYears: null,
      });
      expect(hasCompletedSearchProfile(profile)).toBe(false);
    });

    it("returns false for default (empty) profile", () => {
      expect(hasCompletedSearchProfile(makeProfile())).toBe(false);
    });
  });

  describe("computeRemainingLeaseYears", () => {
    it("uses MAX_LEASE_DURATION minus elapsed years from upper bound", () => {
      expect(computeRemainingLeaseYears([2000, 2000], 2025)).toBe(74);
    });

    it("handles future lease commence year", () => {
      expect(computeRemainingLeaseYears([2025, 2030], 2026)).toBe(103);
    });
  });

  describe("createProfileEvaluator", () => {
    it("returns strong when no profile fields are set", () => {
      const block = makeBlock({ addressKey: "x" });
      const evaluate = createProfileEvaluator(makeProfile(), 2026);
      expect(evaluate(block).tier).toBe("strong");
    });

    it("returns a reusable evaluator for multiple blocks", () => {
      const evaluate = createProfileEvaluator(
        makeProfile({ mainFlatType: "4 ROOM", maxBudget: 700_000 }),
        2026,
      );
      const passing = makeBlock({
        addressKey: "pass",
        flatTypes: ["4 ROOM"],
        medianPrice: 600_000,
      });
      const failing = makeBlock({
        addressKey: "fail",
        flatTypes: ["3 ROOM"],
        medianPrice: 600_000,
      });
      expect(evaluate(passing).tier).toBe("strong");
      expect(evaluate(failing).tier).toBe("weak");
    });
  });

  describe("evaluateBlockForProfile", () => {
    it("returns weak when the flat type is required but missing", () => {
      const block = makeBlock({ addressKey: "x", flatTypes: ["3 ROOM"] });
      const profile = makeProfile({ mainFlatType: "4 ROOM" });
      expect(evaluateBlockForProfile(block, profile, 2026).tier).toBe("weak");
    });

    it("returns weak when remaining lease is below the floor", () => {
      const block = makeBlock({ addressKey: "x", leaseCommenceRange: [1970, 1970] });
      const profile = makeProfile({ minimumRemainingLeaseYears: 70 });
      expect(evaluateBlockForProfile(block, profile, 2026).tier).toBe("weak");
    });

    it("returns strong when budget and commute both pass", () => {
      const block = makeBlock({
        addressKey: "x",
        medianPrice: 600_000,
        nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
      });
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        maxComfortableCommuteMinutes: 30,
      });
      expect(evaluateBlockForProfile(block, profile, 2026).tier).toBe("strong");
    });

    it("returns good when one dimension stretches and the other passes", () => {
      const block = makeBlock({
        addressKey: "x",
        medianPrice: 720_000,
        nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
      });
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        budgetStretchPercent: 5,
        maxComfortableCommuteMinutes: 30,
      });
      expect(evaluateBlockForProfile(block, profile, 2026).tier).toBe("good");
    });

    it("treats alternative flat types as a stretch on the flat-type dimension", () => {
      const block = makeBlock({ addressKey: "x", flatTypes: ["5 ROOM"] });
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        alternativeFlatTypes: ["5 ROOM"],
      });
      const result = evaluateBlockForProfile(block, profile, 2026);
      expect(result.flatType).toBe("stretch");
      expect(result.tier).toBe("stretch");
    });

    it("returns weak when both budget and commute fail (two soft failures)", () => {
      const block = makeBlock({
        addressKey: "x",
        medianPrice: 1_500_000,
        nearestMrt: { stationName: "X", distanceMeters: 6000, walkingTimeSeconds: 4800 },
      });
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        maxComfortableCommuteMinutes: 30,
      });
      expect(evaluateBlockForProfile(block, profile, 2026).tier).toBe("weak");
    });

    it("returns weak when budget stretches and commute fails with no passing soft signals", () => {
      const block = makeBlock({
        addressKey: "x",
        medianPrice: 720_000,
        nearestMrt: { stationName: "X", distanceMeters: 6000, walkingTimeSeconds: 4800 },
      });
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        budgetStretchPercent: 5,
        maxComfortableCommuteMinutes: 30,
      });
      // budget=stretch, commute=fail → failCount=1, stretchCount=1, passCount=0 → weak
      expect(evaluateBlockForProfile(block, profile, 2026).tier).toBe("weak");
    });

    it("fails commute when the block has no MRT data and a commute target is set", () => {
      const block = makeBlock({ addressKey: "x", nearestMrt: null });
      const profile = makeProfile({ maxComfortableCommuteMinutes: 30 });
      expect(evaluateBlockForProfile(block, profile, 2026).commute).toBe("fail");
    });

    it("passes commute when the anchor MRT is in nearbyMrts and within the threshold", () => {
      const block = makeBlock({
        addressKey: "x",
        nearestMrt: {
          stationName: "OTHER MRT STATION",
          distanceMeters: 5000,
          walkingTimeSeconds: 4000,
        },
        nearbyMrts: [
          { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
        ],
      });
      const profile = makeProfile({
        maxComfortableCommuteMinutes: 30,
        commuteAnchorMrt: "BEDOK MRT STATION",
      });
      expect(evaluateBlockForProfile(block, profile, 2026).commute).toBe("pass");
    });

    it("all dimension values are deterministic with explicit currentYear", () => {
      const block = makeBlock({ addressKey: "x" });
      const result1 = evaluateBlockForProfile(block, makeProfile(), 2026);
      const result2 = evaluateBlockForProfile(block, makeProfile(), 2026);
      expect(result1).toEqual(result2);
    });
  });

  describe("isProfileVisibilityActive", () => {
    it("returns false when showAllBlocks is true", () => {
      expect(
        isProfileVisibilityActive(makeProfile({ mainFlatType: "4 ROOM", showAllBlocks: true })),
      ).toBe(false);
    });

    it("returns false when no profile fields are set", () => {
      expect(isProfileVisibilityActive(makeProfile())).toBe(false);
    });

    it("returns true when at least one filter dimension is set", () => {
      expect(isProfileVisibilityActive(makeProfile({ maxBudget: 700_000 }))).toBe(true);
    });
  });

  describe("applyProfileVisibility", () => {
    const passing = makeBlock({
      addressKey: "pass",
      flatTypes: ["4 ROOM"],
      medianPrice: 600_000,
      nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
    });
    const stretching = makeBlock({
      addressKey: "stretch",
      flatTypes: ["4 ROOM"],
      medianPrice: 720_000,
      nearestMrt: { stationName: "X", distanceMeters: 3000, walkingTimeSeconds: 2400 },
    });
    const weak = makeBlock({ addressKey: "weak", flatTypes: ["3 ROOM"], medianPrice: 600_000 });

    it("hides weak matches by default", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        budgetStretchPercent: 5,
        maxComfortableCommuteMinutes: 30,
        commuteStretchMinutes: 30,
      });
      const result = applyProfileVisibility([passing, stretching, weak], profile, 2026);
      expect(result.map((b) => b.addressKey)).toEqual(["pass", "stretch"]);
    });

    it("hides stretch matches when showStretchOptions is false", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        budgetStretchPercent: 5,
        maxComfortableCommuteMinutes: 30,
        commuteStretchMinutes: 30,
        showStretchOptions: false,
      });
      const result = applyProfileVisibility([passing, stretching, weak], profile, 2026);
      expect(result.map((b) => b.addressKey)).toEqual(["pass"]);
    });

    it("returns the original list when showAllBlocks is true", () => {
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: 700_000,
        showAllBlocks: true,
      });
      const input = [passing, stretching, weak];
      expect(applyProfileVisibility(input, profile, 2026)).toBe(input);
    });

    it("is deterministic with explicit currentYear", () => {
      const profile = makeProfile({ mainFlatType: "4 ROOM", maxBudget: 700_000 });
      const r1 = applyProfileVisibility([passing, weak], profile, 2026);
      const r2 = applyProfileVisibility([passing, weak], profile, 2026);
      expect(r1.map((b) => b.addressKey)).toEqual(r2.map((b) => b.addressKey));
    });
  });
});
