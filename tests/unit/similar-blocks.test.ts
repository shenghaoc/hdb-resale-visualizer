import { describe, expect, it } from "vitest";
import { rankSimilarBlocks, scoreSimilarity } from "@/lib/similar-blocks";
import type { BlockSummary } from "@/types/data";

function makeBlock(overrides: Partial<BlockSummary> & { addressKey: string }): BlockSummary {
  return {
    town: "BEDOK",
    block: "1",
    streetName: "TEST STREET",
    displayName: null,
    coordinates: { lat: 1.35, lng: 103.8 },
    medianPrice: 600_000,
    transactionCount: 10,
    floorAreaRange: [90, 100] as [number, number],
    leaseCommenceRange: [2000, 2000] as [number, number],
    latestMonth: "2024-12",
    availableDateRange: ["2015-01", "2024-12"] as [string, string],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 500 },
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
  nearestMrt: { stationName: "BEDOK MRT STATION", distanceMeters: 500 },
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
      nearestMrt: { stationName: "A", distanceMeters: 520 },
    });
    const farMrt = makeBlock({
      addressKey: "farMrt",
      flatTypes: ["4 ROOM"],
      nearestMrt: { stationName: "B", distanceMeters: 2000 },
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

  it("uses neutral price-per-sqm score when floor-area data is missing", () => {
    const sourceMissingArea = makeBlock({
      addressKey: "sourceMissingArea",
      floorAreaRange: [0, 0],
    });
    const candidate = makeBlock({
      addressKey: "candidate",
      flatTypes: ["4 ROOM"],
      floorAreaRange: [90, 100],
    });
    const fullAreaScore = scoreSimilarity(SOURCE, candidate);
    const missingAreaScore = scoreSimilarity(sourceMissingArea, candidate);

    expect(missingAreaScore).toBeGreaterThan(0);
    expect(missingAreaScore).toBeLessThan(fullAreaScore);
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
    const candidates = [
      SOURCE,
      makeBlock({ addressKey: "other", flatTypes: ["4 ROOM"] }),
    ];
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

  it("returns results in descending similarity order", () => {
    const candidates = [
      makeBlock({ addressKey: "cheap", flatTypes: ["4 ROOM"], medianPrice: 300_000 }),
      makeBlock({ addressKey: "veryClose", flatTypes: ["4 ROOM"], medianPrice: 605_000, town: "BEDOK" }),
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
      makeBlock({ addressKey: `block-${i}`, flatTypes: ["4 ROOM"], medianPrice: 600_000 + i * 1000 }),
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
