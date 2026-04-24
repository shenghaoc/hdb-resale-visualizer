import { describe, expect, it } from "vitest";
import { rankShortlistRows } from "@/lib/shortlist-ranking";

const sampleRows = [
  {
    item: { targetPrice: null },
    block: {
      medianPrice: 510000,
      leaseCommenceRange: [1988, 1988] as [number, number],
      nearestMrt: { distanceMeters: 620 },
    },
  },
  {
    item: { targetPrice: 560000 },
    block: {
      medianPrice: 550000,
      leaseCommenceRange: [2002, 2002] as [number, number],
      nearestMrt: { distanceMeters: 410 },
    },
  },
  {
    item: { targetPrice: 600000 },
    block: {
      medianPrice: 650000,
      leaseCommenceRange: [2016, 2016] as [number, number],
      nearestMrt: { distanceMeters: 280 },
    },
  },
];

describe("shortlist ranking", () => {
  it("ranks target-fit rows with a target ahead of rows without a target", () => {
    const ranked = rankShortlistRows(sampleRows, "target-gap");
    expect(ranked[0]?.item.targetPrice).not.toBeNull();
    expect(ranked[2]?.item.targetPrice).toBeNull();
  });

  it("uses price as deterministic tie-breaker", () => {
    const tiedGapRows = [
      {
        item: { targetPrice: 600000 },
        block: {
          medianPrice: 550000,
          leaseCommenceRange: [2012, 2012] as [number, number],
          nearestMrt: { distanceMeters: 320 },
        },
      },
      {
        item: { targetPrice: 500000 },
        block: {
          medianPrice: 550000,
          leaseCommenceRange: [2018, 2018] as [number, number],
          nearestMrt: { distanceMeters: 210 },
        },
      },
      {
        item: { targetPrice: null },
        block: {
          medianPrice: 520000,
          leaseCommenceRange: [1990, 1990] as [number, number],
          nearestMrt: { distanceMeters: 450 },
        },
      },
    ];

    const ranked = rankShortlistRows(tiedGapRows, "target-gap");
    expect(ranked[0]?.block.medianPrice).toBe(550000);
    expect(ranked[1]?.block.medianPrice).toBe(550000);
    expect(ranked[2]?.block.medianPrice).toBe(520000);
  });

  it("sorts by nearest MRT distance when in mrt mode", () => {
    const ranked = rankShortlistRows(sampleRows, "mrt");
    expect(ranked.map((row) => row.block.nearestMrt?.distanceMeters)).toEqual([280, 410, 620]);
  });
});
