import { describe, expect, it } from "vitest";
import {
  applyProfileVisibility,
  computeRemainingLeaseYears,
  evaluateBlockForProfile,
  isProfileVisibilityActive,
} from "@/lib/matchProfile";
import { DEFAULT_SEARCH_PROFILE } from "@/lib/searchProfile";
import { MAX_LEASE_DURATION, getCurrentYear } from "@/lib/constants";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

function makeBlock(overrides: Partial<BlockSummary> & { addressKey: string }): BlockSummary {
  return {
    town: "BEDOK",
    block: "1",
    streetName: "TEST STREET",
    displayName: null,
    coordinates: { lat: 1.35, lng: 103.8 },
    medianPrice: 600_000,
    transactionCount: 10,
    floorAreaRange: [90, 100],
    leaseCommenceRange: [2000, 2000],
    latestMonth: "2025-01",
    availableDateRange: ["2015-01", "2025-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 400 },
    nearbyMrts: [],
    postalCode: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return { ...DEFAULT_SEARCH_PROFILE, ...overrides };
}

const CURRENT_YEAR = getCurrentYear();

describe("computeRemainingLeaseYears", () => {
  it("uses MAX_LEASE_DURATION minus elapsed years from upper bound", () => {
    expect(computeRemainingLeaseYears([2000, 2000], 2025)).toBe(MAX_LEASE_DURATION - 25);
  });
});

describe("evaluateBlockForProfile", () => {
  it("returns strong when no profile fields are set", () => {
    const block = makeBlock({ addressKey: "x" });
    const result = evaluateBlockForProfile(block, makeProfile());
    expect(result.tier).toBe("strong");
  });

  it("returns weak when the flat type is required but missing", () => {
    const block = makeBlock({ addressKey: "x", flatTypes: ["3 ROOM"] });
    const profile = makeProfile({ mainFlatType: "4 ROOM" });
    expect(evaluateBlockForProfile(block, profile).tier).toBe("weak");
  });

  it("returns weak when remaining lease is below the floor", () => {
    const block = makeBlock({
      addressKey: "x",
      leaseCommenceRange: [1970, 1970],
    });
    const profile = makeProfile({ minimumRemainingLeaseYears: 70 });
    expect(evaluateBlockForProfile(block, profile, CURRENT_YEAR).tier).toBe("weak");
  });

  it("returns strong when budget and commute both pass", () => {
    const block = makeBlock({
      addressKey: "x",
      medianPrice: 600_000,
      nearestMrt: { stationName: "X", distanceMeters: 400 },
    });
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      maxComfortableCommuteMinutes: 30,
    });
    expect(evaluateBlockForProfile(block, profile).tier).toBe("strong");
  });

  it("returns good when one dimension stretches and the other passes", () => {
    const block = makeBlock({
      addressKey: "x",
      medianPrice: 720_000,
      nearestMrt: { stationName: "X", distanceMeters: 400 },
    });
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      budgetStretchPercent: 5,
      maxComfortableCommuteMinutes: 30,
    });
    expect(evaluateBlockForProfile(block, profile).tier).toBe("good");
  });

  it("returns stretch when both budget and commute stretch", () => {
    const block = makeBlock({
      addressKey: "x",
      medianPrice: 720_000,
      nearestMrt: { stationName: "X", distanceMeters: 3000 },
    });
    const profile = makeProfile({
      maxBudget: 700_000,
      budgetStretchPercent: 5,
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 30,
    });
    expect(evaluateBlockForProfile(block, profile).tier).toBe("stretch");
  });

  it("returns weak when both soft dimensions fail outright", () => {
    const block = makeBlock({
      addressKey: "x",
      medianPrice: 1_500_000,
      nearestMrt: { stationName: "X", distanceMeters: 6000 },
    });
    const profile = makeProfile({
      maxBudget: 700_000,
      maxComfortableCommuteMinutes: 30,
    });
    expect(evaluateBlockForProfile(block, profile).tier).toBe("weak");
  });

  it("treats alternative flat types as a stretch on the flat-type dimension", () => {
    const block = makeBlock({ addressKey: "x", flatTypes: ["5 ROOM"] });
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: ["5 ROOM"],
    });
    const result = evaluateBlockForProfile(block, profile);
    expect(result.flatType).toBe("stretch");
    expect(result.tier).toBe("stretch");
  });

  it("fails commute when the block has no MRT data and a commute target is set", () => {
    const block = makeBlock({ addressKey: "x", nearestMrt: null });
    const profile = makeProfile({ maxComfortableCommuteMinutes: 30 });
    expect(evaluateBlockForProfile(block, profile).commute).toBe("fail");
  });
});

describe("isProfileVisibilityActive", () => {
  it("returns false when showAllBlocks is true", () => {
    const profile = makeProfile({ mainFlatType: "4 ROOM", showAllBlocks: true });
    expect(isProfileVisibilityActive(profile)).toBe(false);
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
    nearestMrt: { stationName: "X", distanceMeters: 400 },
  });
  const stretching = makeBlock({
    addressKey: "stretch",
    flatTypes: ["4 ROOM"],
    medianPrice: 720_000,
    nearestMrt: { stationName: "X", distanceMeters: 3000 },
  });
  const weak = makeBlock({
    addressKey: "weak",
    flatTypes: ["3 ROOM"],
    medianPrice: 600_000,
  });

  it("hides weak matches by default and keeps strong + stretch", () => {
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      budgetStretchPercent: 5,
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 30,
    });
    const result = applyProfileVisibility([passing, stretching, weak], profile);
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
    const result = applyProfileVisibility([passing, stretching, weak], profile);
    expect(result.map((b) => b.addressKey)).toEqual(["pass"]);
  });

  it("returns the original list when showAllBlocks is true", () => {
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      showAllBlocks: true,
    });
    const input = [passing, stretching, weak];
    expect(applyProfileVisibility(input, profile)).toBe(input);
  });

  it("returns the original list when no profile field is set", () => {
    const input = [passing, stretching, weak];
    expect(applyProfileVisibility(input, makeProfile())).toBe(input);
  });
});
