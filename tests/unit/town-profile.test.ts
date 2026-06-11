import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BlockSummary, TownFlatTypeTrendPoint } from "@/types/data";
import { townFlatTypeTrendPointSchema } from "@/shared/lib/dataSchemas";
import {
  buildLeaseCommencementHistogram,
  clampMonthToDataWindow,
  filterTownFlatTrendsInRange,
  medianNumeric,
  pickBlocksBelowTownMedian,
  pickTopBlocksByTransactionCount,
  resolveTrendMonthRange,
  rollupTownFlatTypesInRange,
  sumRollupVolume,
  volumeWeightedMeanLatestMedianPricePerSqm,
} from "@/entities/town/town-profile";

const DW = { minMonth: "2020-01", maxMonth: "2026-03" };

function blockStub(
  p: Partial<BlockSummary> & Pick<BlockSummary, "addressKey" | "medianPrice" | "transactionCount">,
): BlockSummary {
  return {
    town: "TOWN",
    block: "1",
    streetName: "ST",
    displayName: null,
    coordinates: { lat: 1.332, lng: 103.821 },
    pricePerSqmMedian: 6000,
    floorAreaRange: [90, 92],
    leaseCommenceRange: [1988, 1988],
    latestMonth: "2024-06",
    availableDateRange: ["1995-01", "2024-06"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
    ...p,
  };
}

describe("town-profile month helpers", () => {
  it("clamps months to the manifest window", () => {
    expect(clampMonthToDataWindow("2010-06", DW)).toBe("2020-01");
    expect(clampMonthToDataWindow("2099-12", DW)).toBe("2026-03");
    expect(clampMonthToDataWindow("2024-06", DW)).toBe("2024-06");
  });

  it("resolves an inclusive window and falls back when start is after end", () => {
    expect(resolveTrendMonthRange(DW, null, null)).toEqual({
      start: DW.minMonth,
      end: DW.maxMonth,
    });
    expect(resolveTrendMonthRange(DW, "2025-06", null)).toEqual({
      start: "2025-06",
      end: "2026-03",
    });
    expect(resolveTrendMonthRange(DW, "2026-03", "2020-01")).toEqual({
      start: DW.minMonth,
      end: DW.maxMonth,
    });
  });
});

describe("town-profile statistical helpers", () => {
  it("medianNumeric handles odd and even lengths", () => {
    expect(medianNumeric([5])).toBe(5);
    expect(medianNumeric([1, 10, 2])).toBe(2);
    expect(medianNumeric([100, 200])).toBe(150);
    expect(medianNumeric([])).toBeNull();
  });
});

describe("town-profile trend rollups", () => {
  const trends: TownFlatTypeTrendPoint[] = [
    {
      town: "X",
      flatType: "3 ROOM",
      month: "2024-01",
      medianPrice: 400_000,
      medianPricePerSqm: 4000,
      transactionCount: 5,
    },
    {
      town: "X",
      flatType: "3 ROOM",
      month: "2024-02",
      medianPrice: 420_000,
      medianPricePerSqm: 4200,
      transactionCount: 7,
    },
    {
      town: "X",
      flatType: "4 ROOM",
      month: "2024-02",
      medianPrice: 600_000,
      medianPricePerSqm: 6000,
      transactionCount: 2,
    },
    {
      town: "Y",
      flatType: "3 ROOM",
      month: "2024-02",
      medianPrice: 999,
      medianPricePerSqm: 9,
      transactionCount: 99,
    },
  ];

  it("filters and rolls up volumes with latest-month snapshots", () => {
    const range = { start: "2024-01", end: "2024-02" };
    const filtered = filterTownFlatTrendsInRange(trends, "X", range);
    expect(filtered.length).toBe(3);

    const rollups = rollupTownFlatTypesInRange(trends, "X", range);
    expect(rollups.map((row) => row.flatType)).toEqual(["3 ROOM", "4 ROOM"]);

    const three = rollups.find((row) => row.flatType === "3 ROOM")!;
    expect(three.windowTransactionVolume).toBe(12);
    expect(three.latestMonth).toBe("2024-02");
    expect(three.latestMedianPrice).toBe(420_000);
    expect(three.latestMedianPricePerSqm).toBe(4200);

    const four = rollups.find((row) => row.flatType === "4 ROOM")!;
    expect(four.windowTransactionVolume).toBe(2);

    expect(sumRollupVolume(rollups)).toBe(14);
  });

  it("computes weighted mean $/sqm using window volume × latest median $/sqm", () => {
    const rollups = rollupTownFlatTypesInRange(trends, "X", { start: "2024-01", end: "2024-02" });
    expect(volumeWeightedMeanLatestMedianPricePerSqm(rollups)).toBeCloseTo(
      (4200 * 12 + 6000 * 2) / 14,
    );
  });

  it("returns null weighted mean when no usable rows", () => {
    expect(volumeWeightedMeanLatestMedianPricePerSqm([])).toBeNull();
  });
});

describe("town-profile block selections", () => {
  const blocks: BlockSummary[] = [
    blockStub({
      addressKey: "z-a",
      medianPrice: 500_000,
      transactionCount: 2,
      leaseCommenceRange: [1977, 1977],
      block: "A",
      streetName: "ST 1",
    }),
    blockStub({
      addressKey: "z-b",
      medianPrice: 400_000,
      transactionCount: 20,
      leaseCommenceRange: [1987, 1987],
      block: "B",
      streetName: "ST 2",
    }),
    blockStub({
      addressKey: "z-c",
      medianPrice: 460_000,
      transactionCount: 5,
      leaseCommenceRange: [1982, 1982],
      block: "C",
      streetName: "ST 3",
    }),
  ];

  it("histogram buckets upper lease commencement by decade", () => {
    const hist = buildLeaseCommencementHistogram(blocks);
    expect(hist).toEqual([
      { decadeLabel: "1970s", decadeStart: 1970, blockCount: 1 },
      { decadeLabel: "1980s", decadeStart: 1980, blockCount: 2 },
    ]);
  });

  it("picks busiest blocks using deterministic ties", () => {
    expect(pickTopBlocksByTransactionCount(blocks, 1).map((b) => b.addressKey)).toEqual(["z-b"]);
    expect(pickTopBlocksByTransactionCount(blocks, 2).map((b) => b.addressKey)).toEqual([
      "z-b",
      "z-c",
    ]);
  });

  it("picks cheapest blocks strictly below median of block medians", () => {
    const median = medianNumeric(blocks.map((b) => b.medianPrice));
    expect(median).toBe(460_000);
    const bundle = pickBlocksBelowTownMedian(blocks, 5);
    expect(bundle.townMedian).toBe(460_000);
    expect(bundle.blocks.map((r) => r.addressKey)).toEqual(["z-b"]);
  });

  it("returns explicit null median when no block medians exist", () => {
    expect(pickBlocksBelowTownMedian([], 5)).toEqual({ townMedian: null, blocks: [] });
  });
});

describe("town-profile fixture parity", () => {
  it("validates fixtures/public-data/trends/town-flat-type.json against the artifact schema", () => {
    const rawJson = JSON.parse(
      readFileSync(
        join(process.cwd(), "tests/fixtures/public-data/trends/town-flat-type.json"),
        "utf8",
      ),
    );
    expect(townFlatTypeTrendPointSchema.array().safeParse(rawJson).success).toBe(true);
  });
});
