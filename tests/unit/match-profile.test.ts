import { describe, expect, it } from "vite-plus/test";
import {
  computeRemainingLeaseYears,
  evaluateBlockForProfile,
} from "@/features/search-profile/matchProfile";
import { DEFAULT_SEARCH_PROFILE } from "@/features/search-profile/searchProfile";
import { MAX_LEASE_DURATION, getCurrentYear } from "@/shared/lib/constants";
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

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return { ...DEFAULT_SEARCH_PROFILE, ...overrides };
}

describe("matchProfile web adapter", () => {
  it("uses the current year when no year is supplied", () => {
    expect(computeRemainingLeaseYears([2000, 2000])).toBe(
      MAX_LEASE_DURATION - (getCurrentYear() - 2000),
    );
  });

  it("mirrors the commute-free shared evaluation contract", () => {
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      minimumRemainingLeaseYears: 60,
    });
    const result = evaluateBlockForProfile(makeBlock({ addressKey: "x" }), profile, 2026);

    expect(result).toEqual({
      tier: "strong",
      flatType: "pass",
      lease: "pass",
      budget: "pass",
    });
  });

  it("returns weak when any visible matching preference fails", () => {
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 500_000,
      minimumRemainingLeaseYears: 70,
    });
    const result = evaluateBlockForProfile(
      makeBlock({
        addressKey: "x",
        flatTypes: ["3 ROOM"],
        leaseCommenceRange: [1970, 1970],
      }),
      profile,
      2026,
    );

    expect(result).toEqual({
      tier: "weak",
      flatType: "fail",
      lease: "fail",
      budget: "fail",
    });
  });

  it("does not change output when MRT data changes", () => {
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      minimumRemainingLeaseYears: 60,
    });
    const withMrt = evaluateBlockForProfile(makeBlock({ addressKey: "with" }), profile, 2026);
    const withoutMrt = evaluateBlockForProfile(
      makeBlock({ addressKey: "without", nearestMrt: null }),
      profile,
      2026,
    );

    expect(withMrt).toEqual(withoutMrt);
    expect(withMrt).not.toHaveProperty("commute");
  });
});
