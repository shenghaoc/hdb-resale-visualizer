import { describe, expect, it } from "vitest";
import { buildTownRecommendations } from "@/features/search-profile/town-recommendations";
import { DEFAULT_SEARCH_PROFILE } from "@/features/search-profile/searchProfile";
import type { BlockSummary } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

function makeBlock(overrides: Partial<BlockSummary> & { addressKey: string }): BlockSummary {
  return {
    town: "BEDOK",
    block: "1",
    streetName: "TEST",
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
    nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
    nearbyMrts: [],
    postalCode: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return { ...DEFAULT_SEARCH_PROFILE, ...overrides };
}

const PROFILE = makeProfile({
  mainFlatType: "4 ROOM",
  maxBudget: 700_000,
  budgetStretchPercent: 5,
  maxComfortableCommuteMinutes: 30,
});

describe("buildTownRecommendations", () => {
  it("returns an empty list when no blocks are provided", () => {
    expect(buildTownRecommendations(PROFILE, [])).toEqual([]);
  });

  it("ranks towns by match share", () => {
    const bedokBlocks = [
      makeBlock({ addressKey: "b1", town: "BEDOK", medianPrice: 600_000 }),
      makeBlock({ addressKey: "b2", town: "BEDOK", medianPrice: 620_000 }),
      makeBlock({ addressKey: "b3", town: "BEDOK", medianPrice: 640_000 }),
    ];
    const queenstownBlocks = [
      makeBlock({ addressKey: "q1", town: "QUEENSTOWN", medianPrice: 1_200_000, flatTypes: ["3 ROOM"] }),
      makeBlock({ addressKey: "q2", town: "QUEENSTOWN", medianPrice: 1_300_000, flatTypes: ["3 ROOM"] }),
      makeBlock({ addressKey: "q3", town: "QUEENSTOWN", medianPrice: 1_400_000, flatTypes: ["3 ROOM"] }),
    ];

    const recs = buildTownRecommendations(PROFILE, [...bedokBlocks, ...queenstownBlocks]);
    expect(recs[0].town).toBe("BEDOK");
    // QUEENSTOWN should be filtered out because all three blocks are weak (flat type fail).
    expect(recs.find((r) => r.town === "QUEENSTOWN")).toBeUndefined();
  });

  it("excludes towns with fewer than minBlocksPerTown blocks", () => {
    const blocks = [
      makeBlock({ addressKey: "b1", town: "BEDOK", medianPrice: 600_000 }),
      makeBlock({ addressKey: "b2", town: "BEDOK", medianPrice: 620_000 }),
      makeBlock({ addressKey: "t1", town: "TAMPINES", medianPrice: 600_000 }),
    ];

    const recs = buildTownRecommendations(PROFILE, blocks, { minBlocksPerTown: 3 });
    expect(recs.find((r) => r.town === "BEDOK")).toBeUndefined();
    expect(recs.find((r) => r.town === "TAMPINES")).toBeUndefined();

    const inclusive = buildTownRecommendations(PROFILE, blocks, { minBlocksPerTown: 1 });
    expect(inclusive.some((r) => r.town === "BEDOK")).toBe(true);
    expect(inclusive.some((r) => r.town === "TAMPINES")).toBe(true);
  });

  it("respects the limit option", () => {
    const blocks: BlockSummary[] = [];
    for (const town of ["A", "B", "C", "D", "E"]) {
      for (let i = 0; i < 3; i += 1) {
        blocks.push(
          makeBlock({
            addressKey: `${town}-${i}`,
            town,
            medianPrice: 600_000 + i * 1000,
          }),
        );
      }
    }
    expect(buildTownRecommendations(PROFILE, blocks, { limit: 2 })).toHaveLength(2);
  });

  it("reports per-tier match counts and median price", () => {
    const blocks = [
      makeBlock({ addressKey: "s1", town: "BEDOK", medianPrice: 600_000 }),
      makeBlock({ addressKey: "s2", town: "BEDOK", medianPrice: 610_000 }),
      makeBlock({ addressKey: "g1", town: "BEDOK", medianPrice: 720_000 }),
    ];
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      budgetStretchPercent: 5,
    });
    const [rec] = buildTownRecommendations(profile, blocks);
    expect(rec.town).toBe("BEDOK");
    expect(rec.totalBlocks).toBe(3);
    expect(rec.strongCount).toBe(2);
    expect(rec.stretchCount).toBe(1);
    expect(rec.medianPrice).toBe(610_000);
  });
});
