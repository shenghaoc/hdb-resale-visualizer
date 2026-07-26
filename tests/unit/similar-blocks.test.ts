import { describe, expect, it } from "vite-plus/test";
import { rankSimilarBlocks, scoreSimilarity } from "@/entities/block/similar-blocks";
import type { BlockSummary } from "@/types/data";

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
    floorAreaRange: [90, 100] as [number, number],
    leaseCommenceRange: [2000, 2000] as [number, number],
    latestMonth: "2024-12",
    availableDateRange: ["2015-01", "2024-12"] as [string, string],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    flatTypeCohorts: {
      "4 ROOM": {
        transactionCount: 10,
        latestMonth: "2024-12",
        floorAreaRange: [90, 100],
        flatModels: ["MODEL A"],
      },
    },
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 500, walkingTimeSeconds: 400 },
    nearbyMrts: [],
    postalCode: null,
    ...overrides,
  };
}

const SOURCE = makeBlock({
  addressKey: "source",
  town: "BEDOK",
  medianPrice: 600_000,
  flatTypes: ["4 ROOM"],
  leaseCommenceRange: [2000, 2000],
  floorAreaRange: [90, 100],
  nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 500, walkingTimeSeconds: 400 },
});

const MIXED_SOURCE = makeBlock({
  addressKey: "mixed-source",
  flatTypes: ["4 ROOM", "5 ROOM"],
  medianPrice: 600_000,
  pricePerSqmMedian: 6300,
  medianPriceByFlatType: { "4 ROOM": 800_000, "5 ROOM": 950_000 },
  medianPricePerSqmByFlatType: { "4 ROOM": 8000, "5 ROOM": 9000 },
});

describe("scoreSimilarity", () => {
  it("returns 0 when there is no flat-type overlap", () => {
    const candidate = makeBlock({ addressKey: "x", flatTypes: ["5 ROOM"] });
    expect(scoreSimilarity(SOURCE, candidate)).toBe(0);
  });

  it("gives a higher score to same-town blocks", () => {
    const sameTown = makeBlock({ addressKey: "same", town: "BEDOK", flatTypes: ["4 ROOM"] });
    const diffTown = makeBlock({ addressKey: "diff", town: "TAMPINES", flatTypes: ["4 ROOM"] });
    expect(scoreSimilarity(SOURCE, sameTown)).toBeGreaterThan(scoreSimilarity(SOURCE, diffTown));
  });

  it("penalises price deviation — closer price ranks higher", () => {
    const near = makeBlock({ addressKey: "near", flatTypes: ["4 ROOM"], medianPrice: 620_000 });
    const far = makeBlock({ addressKey: "far", flatTypes: ["4 ROOM"], medianPrice: 900_000 });
    expect(scoreSimilarity(SOURCE, near)).toBeGreaterThan(scoreSimilarity(SOURCE, far));
  });

  it("penalises lease-commence deviation", () => {
    const sameEra = makeBlock({
      addressKey: "sameEra",
      flatTypes: ["4 ROOM"],
      leaseCommenceRange: [2001, 2001],
    });
    const oldEra = makeBlock({
      addressKey: "oldEra",
      flatTypes: ["4 ROOM"],
      leaseCommenceRange: [1980, 1980],
    });
    expect(scoreSimilarity(SOURCE, sameEra)).toBeGreaterThan(scoreSimilarity(SOURCE, oldEra));
  });

  it("penalises MRT distance deviation when both have data", () => {
    const closeMrt = makeBlock({
      addressKey: "closeMrt",
      flatTypes: ["4 ROOM"],
      nearestMrt: { stationName: "A", distanceMeters: 520, walkingTimeSeconds: 416 },
    });
    const farMrt = makeBlock({
      addressKey: "farMrt",
      flatTypes: ["4 ROOM"],
      nearestMrt: { stationName: "B", distanceMeters: 2000, walkingTimeSeconds: 1600 },
    });
    expect(scoreSimilarity(SOURCE, closeMrt)).toBeGreaterThan(scoreSimilarity(SOURCE, farMrt));
  });

  it("uses neutral MRT score when source or candidate has no MRT data", () => {
    const noMrtCandidate = makeBlock({
      addressKey: "noMrt",
      flatTypes: ["4 ROOM"],
      nearestMrt: null,
    });
    const score = scoreSimilarity(SOURCE, noMrtCandidate);
    expect(score).toBeGreaterThan(0);
  });

  it("penalises price-per-sqm deviation — closer psm ranks higher", () => {
    const nearPsm = makeBlock({
      addressKey: "nearPsm",
      flatTypes: ["4 ROOM"],
      pricePerSqmMedian: 6400,
    });
    const farPsm = makeBlock({
      addressKey: "farPsm",
      flatTypes: ["4 ROOM"],
      pricePerSqmMedian: 9000,
    });
    expect(scoreSimilarity(SOURCE, nearPsm)).toBeGreaterThan(scoreSimilarity(SOURCE, farPsm));
  });

  it("gives partial flat-type score for partial overlap", () => {
    const fullOverlap = makeBlock({
      addressKey: "full",
      flatTypes: ["4 ROOM"],
    });
    const partialOverlap = makeBlock({
      addressKey: "partial",
      flatTypes: ["4 ROOM", "5 ROOM"],
    });
    // SOURCE has only "4 ROOM"; partial has Jaccard 1/2, full has Jaccard 1/1
    expect(scoreSimilarity(SOURCE, fullOverlap)).toBeGreaterThan(
      scoreSimilarity(SOURCE, partialOverlap),
    );
  });

  it("returns a score bounded within [0, 1]", () => {
    const twin = makeBlock({ addressKey: "twin", town: "BEDOK", flatTypes: ["4 ROOM"] });
    const score = scoreSimilarity(SOURCE, twin);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("rankSimilarBlocks", () => {
  it("excludes the source block itself", () => {
    const candidates = [SOURCE, makeBlock({ addressKey: "other", flatTypes: ["4 ROOM"] })];
    const results = rankSimilarBlocks(SOURCE, candidates);
    expect(results.every((b) => b.addressKey !== SOURCE.addressKey)).toBe(true);
  });

  it("excludes blocks with no flat-type overlap", () => {
    const candidates = [
      makeBlock({ addressKey: "noOverlap", flatTypes: ["5 ROOM"] }),
      makeBlock({ addressKey: "hasOverlap", flatTypes: ["4 ROOM"] }),
    ];
    const results = rankSimilarBlocks(SOURCE, candidates);
    expect(results.some((b) => b.addressKey === "noOverlap")).toBe(false);
    expect(results.some((b) => b.addressKey === "hasOverlap")).toBe(true);
  });

  it("keeps benchmark peer ranking independent of the source price", () => {
    const candidates = [
      makeBlock({
        addressKey: "newer-near-mrt",
        leaseCommenceRange: [2001, 2001],
        nearestMrt: { stationName: "A", distanceMeters: 520, walkingTimeSeconds: 416 },
        medianPrice: 610_000,
        pricePerSqmMedian: 6_400,
      }),
      makeBlock({
        addressKey: "older-far-mrt",
        leaseCommenceRange: [1985, 1985],
        nearestMrt: { stationName: "B", distanceMeters: 1_500, walkingTimeSeconds: 1_200 },
        medianPrice: 900_000,
        pricePerSqmMedian: 9_000,
      }),
    ];
    const repricedSource = {
      ...SOURCE,
      medianPrice: 1_200_000,
      pricePerSqmMedian: 12_000,
    };

    const initial = rankSimilarBlocks(SOURCE, candidates, { ignorePriceProximity: true });
    const afterSourceReprice = rankSimilarBlocks(repricedSource, candidates, {
      ignorePriceProximity: true,
    });

    expect(initial.map((block) => block.addressKey)).toEqual(["newer-near-mrt", "older-far-mrt"]);
    expect(afterSourceReprice.map((block) => block.addressKey)).toEqual(
      initial.map((block) => block.addressKey),
    );
  });

  it("requires the canonical selected flat type instead of any source-type overlap", () => {
    const wrongType = makeBlock({
      addressKey: "only-five-room",
      flatTypes: ["5 ROOM"],
      medianPriceByFlatType: { "4 ROOM": 805_000, "5 ROOM": 900_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 8050, "5 ROOM": 9000 },
    });
    const matchingType = makeBlock({
      addressKey: "has-four-room",
      flatTypes: ["4 ROOM"],
      medianPriceByFlatType: { "4 ROOM": 810_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 8100 },
    });

    const results = rankSimilarBlocks(MIXED_SOURCE, [wrongType, matchingType], {
      flatType: " 4 room ",
    });

    expect(results.map((block) => block.addressKey)).toEqual(["has-four-room"]);
  });

  it("excludes missing type-price metrics while retaining legacy type-price evidence", () => {
    const missingMedian = makeBlock({
      addressKey: "missing-median",
      flatTypes: ["4 ROOM"],
      medianPricePerSqmByFlatType: { "4 ROOM": 8050 },
    });
    const missingPpsm = makeBlock({
      addressKey: "missing-ppsm",
      flatTypes: ["4 ROOM"],
      medianPriceByFlatType: { "4 ROOM": 805_000 },
    });
    const complete = makeBlock({
      addressKey: "complete",
      flatTypes: ["4 ROOM"],
      medianPriceByFlatType: { "4 ROOM": 810_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 8100 },
    });
    const missingCohort = makeBlock({
      addressKey: "missing-cohort",
      flatTypes: ["4 ROOM"],
      medianPriceByFlatType: { "4 ROOM": 812_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 8120 },
      flatTypeCohorts: undefined,
    });

    const results = rankSimilarBlocks(
      MIXED_SOURCE,
      [missingMedian, missingPpsm, missingCohort, complete],
      {
        flatType: "4 ROOM",
      },
    );

    expect(results.map((block) => block.addressKey)).toEqual(["complete", "missing-cohort"]);
  });

  it("ranks by the selected-type median price instead of the overall block median", () => {
    const overallCloseTypeFar = makeBlock({
      addressKey: "overall-close-type-far",
      flatTypes: ["4 ROOM"],
      medianPrice: 605_000,
      medianPriceByFlatType: { "4 ROOM": 1_200_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 8000 },
    });
    const overallFarTypeClose = makeBlock({
      addressKey: "overall-far-type-close",
      flatTypes: ["4 ROOM"],
      medianPrice: 300_000,
      medianPriceByFlatType: { "4 ROOM": 810_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 8000 },
    });
    const candidates = [overallCloseTypeFar, overallFarTypeClose];

    expect(rankSimilarBlocks(MIXED_SOURCE, candidates)[0]?.addressKey).toBe(
      "overall-close-type-far",
    );
    expect(rankSimilarBlocks(MIXED_SOURCE, candidates, { flatType: "4 ROOM" })[0]?.addressKey).toBe(
      "overall-far-type-close",
    );
  });

  it("ranks by selected-type price per sqm instead of the overall block value", () => {
    const overallCloseTypeFar = makeBlock({
      addressKey: "overall-ppsm-close-type-far",
      flatTypes: ["4 ROOM"],
      medianPrice: 600_000,
      pricePerSqmMedian: 6320,
      medianPriceByFlatType: { "4 ROOM": 800_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 12_000 },
    });
    const overallFarTypeClose = makeBlock({
      addressKey: "overall-ppsm-far-type-close",
      flatTypes: ["4 ROOM"],
      medianPrice: 600_000,
      pricePerSqmMedian: 4000,
      medianPriceByFlatType: { "4 ROOM": 800_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 8100 },
    });
    const candidates = [overallCloseTypeFar, overallFarTypeClose];

    expect(rankSimilarBlocks(MIXED_SOURCE, candidates)[0]?.addressKey).toBe(
      "overall-ppsm-close-type-far",
    );
    expect(rankSimilarBlocks(MIXED_SOURCE, candidates, { flatType: "4 ROOM" })[0]?.addressKey).toBe(
      "overall-ppsm-far-type-close",
    );
  });

  it("returns results in descending similarity order", () => {
    const candidates = [
      makeBlock({ addressKey: "cheap", flatTypes: ["4 ROOM"], medianPrice: 300_000 }),
      makeBlock({
        addressKey: "veryClose",
        flatTypes: ["4 ROOM"],
        medianPrice: 605_000,
        town: "BEDOK",
      }),
      makeBlock({ addressKey: "ok", flatTypes: ["4 ROOM"], medianPrice: 680_000 }),
    ];
    const results = rankSimilarBlocks(SOURCE, candidates);
    // veryClose should rank first: same town, same flat type, nearest price
    expect(results[0]?.addressKey).toBe("veryClose");
  });

  it("respects the limit option", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeBlock({ addressKey: `block-${i}`, flatTypes: ["4 ROOM"] }),
    );
    const results = rankSimilarBlocks(SOURCE, candidates, { limit: 5 });
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("defaults limit to 6", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeBlock({ addressKey: `block-${i}`, flatTypes: ["4 ROOM"] }),
    );
    const results = rankSimilarBlocks(SOURCE, candidates);
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it("returns an empty array when no candidates match", () => {
    const candidates = [makeBlock({ addressKey: "noMatch", flatTypes: ["EXECUTIVE"] })];
    const results = rankSimilarBlocks(SOURCE, candidates);
    expect(results).toHaveLength(0);
  });

  it("returns an empty array for an empty candidates list", () => {
    expect(rankSimilarBlocks(SOURCE, [])).toHaveLength(0);
  });

  it("is deterministic — same output for same input", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeBlock({
        addressKey: `block-${i}`,
        flatTypes: ["4 ROOM"],
        medianPrice: 600_000 + i * 1000,
      }),
    );
    const first = rankSimilarBlocks(SOURCE, candidates);
    const second = rankSimilarBlocks(SOURCE, candidates);
    expect(first.map((b) => b.addressKey)).toEqual(second.map((b) => b.addressKey));
  });

  it("prefers same-town blocks over cross-town with similar attributes", () => {
    const sameTown = makeBlock({
      addressKey: "sameTown",
      town: "BEDOK",
      flatTypes: ["4 ROOM"],
      medianPrice: 650_000,
    });
    const diffTown = makeBlock({
      addressKey: "diffTown",
      town: "TAMPINES",
      flatTypes: ["4 ROOM"],
      medianPrice: 605_000,
    });
    const results = rankSimilarBlocks(SOURCE, [sameTown, diffTown], { limit: 2 });
    expect(results[0]?.addressKey).toBe("sameTown");
  });
});
