import { beforeEach, describe, expect, it } from "vite-plus/test";
import { getFuseMatchedKeys, resetSearchFuseForTests } from "@/features/search-profile/searchFuse";
import type { BlockSummary } from "@/types/data";

function makeBlock(addressKey: string, town: string): BlockSummary {
  return {
    addressKey,
    town,
    block: "101",
    streetName: `${town} STREET 1`,
    coordinates: { lat: 1.33, lng: 103.9 },
    medianPrice: 500_000,
    pricePerSqmMedian: 5_500,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2026-01",
    availableDateRange: ["2020-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
  };
}

describe("searchFuse", () => {
  beforeEach(() => {
    resetSearchFuseForTests();
  });

  it.each(["", " ", "B"])("does not activate search for %j", (query) => {
    expect(getFuseMatchedKeys([makeBlock("bedok", "BEDOK")], query)).toBeNull();
  });

  it("reuses the latest query result for the same block corpus", () => {
    const blocks = [makeBlock("bedok", "BEDOK"), makeBlock("tampines", "TAMPINES")];

    const first = getFuseMatchedKeys(blocks, "BEDOK");
    const repeated = getFuseMatchedKeys(blocks, "BEDOK");

    expect(first).toEqual(new Set(["bedok"]));
    expect(repeated).toBe(first);
  });

  it("invalidates the query result when the block corpus identity changes", () => {
    const blocks = [makeBlock("bedok", "BEDOK")];
    const first = getFuseMatchedKeys(blocks, "BEDOK");
    const replacement = getFuseMatchedKeys([...blocks], "BEDOK");

    expect(replacement).toEqual(first);
    expect(replacement).not.toBe(first);
  });

  it("prefers exact matches, handles one-edit typos, and retains fuzzy fallback", () => {
    const blocks = [makeBlock("bedok", "BEDOK"), makeBlock("bedoo", "BEDOO")];

    expect(getFuseMatchedKeys(blocks, "BEDOK")).toEqual(new Set(["bedok"]));
    expect(getFuseMatchedKeys(blocks, "  bedok  ")).toEqual(new Set(["bedok"]));
    expect(getFuseMatchedKeys(blocks, "BEDOKK")).toEqual(new Set(["bedok"]));
    expect(getFuseMatchedKeys(blocks, "BEDO")).toEqual(new Set(["bedok", "bedoo"]));
    expect(getFuseMatchedKeys(blocks, "BEDOX")).toEqual(new Set(["bedok", "bedoo"]));
    expect(getFuseMatchedKeys(blocks, "BEDOK STREET")).toEqual(new Set(["bedok", "bedoo"]));
  });

  // Both search paths cap at 500. The structured index applies the cap while
  // building, so an exact query on a field shared by more blocks keeps an
  // arbitrary corpus-ordered subset rather than the most relevant one.
  it("caps exact matches at the shared search limit", () => {
    const blocks = Array.from({ length: 620 }, (_, index) =>
      makeBlock(`woodlands-${index}`, "WOODLANDS"),
    );

    const matches = getFuseMatchedKeys(blocks, "WOODLANDS");

    expect(matches?.size).toBe(500);
    expect(matches?.has("woodlands-0")).toBe(true);
    expect(matches?.has("woodlands-499")).toBe(true);
    expect(matches?.has("woodlands-500")).toBe(false);
  });

  it("caps one-edit matches at the shared search limit", () => {
    const blocks = Array.from({ length: 620 }, (_, index) =>
      makeBlock(`woodland-${index}`, `WOODLAND${index % 2 === 0 ? "S" : "Z"}`),
    );

    // Neither WOODLANDS nor WOODLANDZ is an exact hit for WOODLANDX, so both
    // one-edit buckets contribute until the cap stops the scan.
    expect(getFuseMatchedKeys(blocks, "WOODLANDX")?.size).toBe(500);
  });
});
