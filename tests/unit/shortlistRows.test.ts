import { describe, expect, it } from "vite-plus/test";
import {
  buildShortlistRows,
  type BuildShortlistRowsInput,
} from "@/features/shortlist/shortlistRows";
import type { AddressDetail, BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";

function makeBlock(addressKey: string, medianPrice = 500_000): BlockSummary {
  return {
    addressKey,
    town: "BEDOK",
    block: addressKey,
    streetName: "BEDOK NTH AVE 1",
    coordinates: { lat: 1.33, lng: 103.92 },
    medianPrice,
    pricePerSqmMedian: 5556,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2026-01",
    availableDateRange: ["2023-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
  };
}

function makeItem(
  addressKey: string,
  targetPrice: number | null = null,
  addedAt = "2026-01-01T00:00:00Z",
): ShortlistItem {
  return { addressKey, notes: "", targetPrice, addedAt };
}

function makeDetail(
  addressKey: string,
  monthlyTrend: AddressDetail["monthlyTrend"] = [],
): AddressDetail {
  return {
    summary: {
      ...makeBlock(addressKey),
      priceIqr: [450_000, 550_000],
      pricePerSqftMedian: 520,
    },
    recentTransactions: [],
    monthlyTrend,
  };
}

function makeComparison(addressKey: string): ComparisonArtifact {
  return {
    addressKey,
    town: "BEDOK",
    flatType: "4 ROOM",
    amenities: {} as ComparisonArtifact["amenities"],
    percentileRanks: {} as ComparisonArtifact["percentileRanks"],
    generatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeInput(overrides: Partial<BuildShortlistRowsInput> = {}): BuildShortlistRowsInput {
  return {
    blocks: [],
    items: [],
    savedVisible: true,
    detailsByAddressKey: {},
    comparisonsByAddressKey: {},
    selectedDetail: null,
    selectedComparison: null,
    ...overrides,
  };
}

describe("buildShortlistRows", () => {
  it("returns no rows while Saved is hidden", () => {
    const result = buildShortlistRows(
      makeInput({
        blocks: [makeBlock("addr-a")],
        items: [makeItem("addr-a")],
        savedVisible: false,
      }),
    );

    expect(result).toEqual([]);
  });

  it("keeps item participation order and omits items without a matching block", () => {
    const result = buildShortlistRows(
      makeInput({
        blocks: [makeBlock("addr-a"), makeBlock("addr-b")],
        items: [makeItem("addr-a"), makeItem("addr-ghost"), makeItem("addr-b")],
      }),
    );

    expect(result.map((row) => row.item.addressKey)).toEqual(["addr-a", "addr-b"]);
  });

  it("prefers fetched detail and comparison artifacts over selected fallbacks", () => {
    const fetchedDetail = makeDetail("addr-a", [
      { month: "2026-01", medianPrice: 510_000, transactionCount: 2, medianPricePerSqm: 6000 },
    ]);
    const selectedDetail = makeDetail("addr-a", [
      { month: "2025-12", medianPrice: 490_000, transactionCount: 1, medianPricePerSqm: 5800 },
    ]);
    const fetchedComparison = makeComparison("addr-a");
    const selectedComparison = makeComparison("addr-a");

    const [row] = buildShortlistRows(
      makeInput({
        blocks: [makeBlock("addr-a")],
        items: [makeItem("addr-a")],
        detailsByAddressKey: { "addr-a": fetchedDetail },
        comparisonsByAddressKey: { "addr-a": fetchedComparison },
        selectedDetail,
        selectedComparison,
      }),
    );

    expect(row?.detailSummary).toBe(fetchedDetail.summary);
    expect(row?.monthlyTrend).toBe(fetchedDetail.monthlyTrend);
    expect(row?.comparison).toBe(fetchedComparison);
  });

  it("uses selected detail and comparison when fetched artifacts are absent", () => {
    const selectedDetail = makeDetail("addr-a");
    const selectedComparison = makeComparison("addr-a");
    const [row] = buildShortlistRows(
      makeInput({
        blocks: [makeBlock("addr-a")],
        items: [makeItem("addr-a")],
        selectedDetail,
        selectedComparison,
      }),
    );

    expect(row?.detailSummary).toBe(selectedDetail.summary);
    expect(row?.monthlyTrend).toBe(selectedDetail.monthlyTrend);
    expect(row?.comparison).toBe(selectedComparison);
  });

  it("sorts by target gap, puts no-target items last, and breaks ties by addedAt", () => {
    const result = buildShortlistRows(
      makeInput({
        blocks: [
          makeBlock("addr-late-tie", 500_000),
          makeBlock("addr-no-target", 500_000),
          makeBlock("addr-close", 500_000),
          makeBlock("addr-early-tie", 500_000),
        ],
        items: [
          makeItem("addr-late-tie", 510_000, "2026-01-03T00:00:00Z"),
          makeItem("addr-no-target", null, "2026-01-01T00:00:00Z"),
          makeItem("addr-close", 501_000, "2026-01-04T00:00:00Z"),
          makeItem("addr-early-tie", 510_000, "2026-01-02T00:00:00Z"),
        ],
      }),
    );

    expect(result.map((row) => row.item.addressKey)).toEqual([
      "addr-close",
      "addr-early-tie",
      "addr-late-tie",
      "addr-no-target",
    ]);
  });

  it("does not mutate any input collection", () => {
    const blocks = [makeBlock("addr-b"), makeBlock("addr-a")];
    const items = [
      makeItem("addr-b", 510_000, "2026-01-02T00:00:00Z"),
      makeItem("addr-a", 490_000, "2026-01-01T00:00:00Z"),
    ];
    const blocksBefore = [...blocks];
    const itemsBefore = [...items];

    buildShortlistRows(makeInput({ blocks, items }));

    expect(blocks).toEqual(blocksBefore);
    expect(items).toEqual(itemsBefore);
  });
});
