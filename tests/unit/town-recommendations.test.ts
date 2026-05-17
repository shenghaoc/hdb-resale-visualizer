import { describe, expect, it } from "vitest";
import { buildTownRecommendations } from "@/lib/town-recommendations";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

const profile: SearchProfile = {
  version: 1,
  mainFlatType: "4 ROOM",
  alternativeFlatTypes: [],
  maxBudget: 700000,
  commuteAnchorLabel: "Raffles Place",
  commuteAnchorMrt: null,
  maxComfortableCommuteMinutes: 20,
  commuteStretchMinutes: 10,
  minimumRemainingLeaseYears: 60,
  budgetStretchPercent: 5,
  showStretchOptions: true,
  showAllBlocks: false,
};

const block = (town: string, medianPrice: number, leaseYear = 2000): BlockSummary => ({
  addressKey: `${town}-${medianPrice}`,
  town,
  block: "1",
  streetName: "X",
  coordinates: { lat: 1.3, lng: 103.8 },
  medianPrice,
  transactionCount: 10,
  floorAreaRange: [90, 100],
  leaseCommenceRange: [leaseYear, leaseYear],
  latestMonth: "2026-01",
  availableDateRange: ["2025-01", "2026-01"],
  flatTypes: ["4 ROOM"],
  flatModels: ["A"],
  nearestMrt: { stationName: "A", distanceMeters: 800 },
});

describe("town recommendations", () => {
  it("ranks towns and caps results", () => {
    const rows = buildTownRecommendations([
      block("BEDOK", 650000),
      block("BEDOK", 680000),
      block("TAMPINES", 800000),
      block("YISHUN", 620000),
    ], profile, 2);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.score).toBeGreaterThanOrEqual(rows[1]?.score ?? 0);
  });
});
