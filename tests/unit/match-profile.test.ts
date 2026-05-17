import { describe, expect, it, vi } from "vitest";
import { applyProfileVisibility, evaluateBlockForProfile } from "@/lib/matchProfile";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

vi.useFakeTimers();
vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

const baseProfile: SearchProfile = {
  version: 1,
  mainFlatType: "4 ROOM",
  alternativeFlatTypes: [],
  maxBudget: 700000,
  commuteAnchorLabel: "Raffles Place",
  commuteAnchorMrt: null,
  maxComfortableCommuteMinutes: 10,
  commuteStretchMinutes: 10,
  minimumRemainingLeaseYears: 70,
  budgetStretchPercent: 5,
  showStretchOptions: true,
  showAllBlocks: false,
};

function block(overrides: Partial<BlockSummary>): BlockSummary {
  return {
    addressKey: "a",
    town: "BEDOK",
    block: "1",
    streetName: "STREET",
    coordinates: { lat: 1.3, lng: 103.9 },
    medianPrice: 680000,
    transactionCount: 10,
    floorAreaRange: [90, 100],
    leaseCommenceRange: [2000, 2000],
    latestMonth: "2026-01",
    availableDateRange: ["2025-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["Model A"],
    nearestMrt: { stationName: "X", distanceMeters: 800 },
    ...overrides,
  };
}

describe("match profile visibility", () => {
  it("returns strong when lease, budget, commute pass", () => {
    const result = evaluateBlockForProfile(block({}), baseProfile);
    expect(result.tier).toBe("strong");
    expect(result.visible).toBe(true);
  });

  it("returns stretch when just over budget within stretch", () => {
    const result = evaluateBlockForProfile(block({ medianPrice: 730000 }), baseProfile);
    expect(result.tier).toBe("good");
    expect(result.visible).toBe(true);
  });

  it("hides weak when showAllBlocks is false", () => {
    const result = evaluateBlockForProfile(block({ medianPrice: 900000, leaseCommenceRange: [1980, 1980], nearestMrt: { stationName: "X", distanceMeters: 4000 } }), baseProfile);
    expect(result.tier).toBe("weak");
    expect(result.visible).toBe(false);
  });

  it("keeps weak visible when showAllBlocks is true", () => {
    const profile = { ...baseProfile, showAllBlocks: true };
    const result = evaluateBlockForProfile(block({ medianPrice: 900000, leaseCommenceRange: [1980, 1980] }), profile);
    expect(result.tier).toBe("weak");
    expect(result.visible).toBe(true);
  });

  it("filters list by visibility", () => {
    const blocks = [
      block({ addressKey: "strong" }),
      block({ addressKey: "weak", medianPrice: 900000, leaseCommenceRange: [1980, 1980] }),
    ];
    expect(applyProfileVisibility(blocks, baseProfile).map((b) => b.addressKey)).toEqual(["strong"]);
  });
});
