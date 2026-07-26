import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ResultsPane } from "@/components/ResultsPane";
import { formatCompactCurrency } from "@/shared/lib/format";
import { I18nProvider } from "@/shared/lib/i18n";
import type { BlockSummary, TownFlatTypeTrendPoint } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchTownFlatTypeTrends: vi.fn<() => Promise<TownFlatTypeTrendPoint[]>>(),
  fetchBlocksByTown: vi.fn<(town: string) => Promise<BlockSummary[]>>(),
}));

const exportMocks = vi.hoisted(() => ({
  downloadCsv: vi.fn(),
}));

vi.mock("@/shared/lib/data", () => ({
  fetchTownFlatTypeTrends: dataMocks.fetchTownFlatTypeTrends,
  fetchBlocksByTown: dataMocks.fetchBlocksByTown,
}));

vi.mock("@/shared/lib/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/export")>();
  return {
    ...actual,
    downloadCsv: exportMocks.downloadCsv,
  };
});

vi.mock("@/shared/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? "zh-SG" : null),
    setItem: () => {},
    removeItem: () => {},
  },
}));

const block: BlockSummary = {
  addressKey: "bedok-101-bedok-nth-ave-4",
  town: "BEDOK",
  block: "101",
  streetName: "BEDOK NTH AVE 4",
  displayName: "BEDOK NORTH GREEN",
  coordinates: { lat: 1.3339, lng: 103.9372 },
  medianPrice: 545000,
  pricePerSqmMedian: 5924,
  transactionCount: 3,
  floorAreaRange: [92, 92],
  leaseCommenceRange: [1983, 1983],
  latestMonth: "2026-02",
  availableDateRange: ["2026-02", "2026-02"],
  flatTypes: ["4 ROOM"],
  flatModels: ["MODEL A"],
  flatTypeCohorts: {
    "4 ROOM": {
      transactionCount: 3,
      latestMonth: "2026-02",
      floorAreaRange: [92, 92],
      flatModels: ["MODEL A"],
    },
  },
  nearestMrt: {
    stationName: "BEDOK NORTH MRT STATION",
    distanceMeters: 400,
    walkingTimeSeconds: 320,
  },
  nearbyMrts: [
    { stationName: "BEDOK NORTH MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
    { stationName: "BEDOK MRT STATION", distanceMeters: 800, walkingTimeSeconds: 640 },
    { stationName: "KAKI BUKIT MRT STATION", distanceMeters: 1200, walkingTimeSeconds: 960 },
  ],
};

const amkBlock: BlockSummary = {
  ...block,
  addressKey: "ang-mo-kio-406-ang-mo-kio-ave-10",
  town: "ANG MO KIO",
  block: "406",
  streetName: "ANG MO KIO AVE 10",
  medianPrice: 610000,
  transactionCount: 2,
};

const trendRows: TownFlatTypeTrendPoint[] = [
  {
    town: "BEDOK",
    flatType: "4 ROOM",
    month: "2024-01",
    medianPrice: 580000,
    medianPricePerSqm: 6105.26,
    transactionCount: 12,
  },
  {
    town: "ANG MO KIO",
    flatType: "4 ROOM",
    month: "2024-01",
    medianPrice: 610000,
    medianPricePerSqm: 6777.78,
    transactionCount: 9,
  },
];

describe("ResultsPane", () => {
  beforeEach(() => {
    dataMocks.fetchTownFlatTypeTrends.mockReset();
    dataMocks.fetchTownFlatTypeTrends.mockResolvedValue(trendRows);
    dataMocks.fetchBlocksByTown.mockReset();
    dataMocks.fetchBlocksByTown.mockResolvedValue([]);
    exportMocks.downloadCsv.mockReset();
  });

  it("localizes the compact-card town and block-wide price basis", () => {
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[block]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("勿洛 · BEDOK · 整座组屋中位价")).toBeInTheDocument();
  });

  it("keeps compact result labels, prices, and median sorting aligned with the active flat type", () => {
    const lowerOverallBlock: BlockSummary = {
      ...block,
      addressKey: "bedok-201-example-road",
      block: "201",
      streetName: "EXAMPLE RD",
      flatTypes: ["2 ROOM", "4 ROOM"],
      floorAreaRange: [50, 100],
      medianPrice: 400000,
      medianPriceByFlatType: { "2 ROOM": 400000, "4 ROOM": 800000 },
      flatTypeCohorts: {
        "2 ROOM": {
          transactionCount: 8,
          latestMonth: "2026-02",
          floorAreaRange: [50, 55],
          flatModels: ["IMPROVED"],
        },
        "4 ROOM": {
          transactionCount: 2,
          latestMonth: "2025-11",
          floorAreaRange: [90, 100],
          flatModels: ["MODEL A"],
        },
      },
    };
    const lowerFourRoomBlock: BlockSummary = {
      ...block,
      addressKey: "bedok-202-example-road",
      block: "202",
      streetName: "EXAMPLE RD",
      flatTypes: ["3 ROOM", "4 ROOM"],
      floorAreaRange: [80, 110],
      medianPrice: 600000,
      medianPriceByFlatType: { "3 ROOM": 600000, "4 ROOM": 700000 },
      flatTypeCohorts: {
        "3 ROOM": {
          transactionCount: 4,
          latestMonth: "2026-02",
          floorAreaRange: [80, 85],
          flatModels: ["IMPROVED"],
        },
        "4 ROOM": {
          transactionCount: 7,
          latestMonth: "2026-01",
          floorAreaRange: [80, 110],
          flatModels: ["MODEL A"],
        },
      },
    };

    render(
      <I18nProvider>
        <ResultsPane
          blocks={[lowerOverallBlock, lowerFourRoomBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
          flatType="4 ROOM"
        />
      </I18nProvider>,
    );

    const resultCards = screen.getAllByRole("option");
    expect(resultCards[0]).toHaveTextContent("202 EXAMPLE RD");
    expect(resultCards[0]).toHaveTextContent(formatCompactCurrency(700000, "zh-SG"));
    expect(resultCards[0]).toHaveTextContent("80–110 平米");
    expect(resultCards[1]).toHaveTextContent(formatCompactCurrency(800000, "zh-SG"));
    expect(screen.getAllByText("勿洛 · BEDOK · 四房式 · 4 ROOM")).toHaveLength(2);
    expect(screen.queryByText(/二房式 · 2 ROOM|三房式 · 3 ROOM/)).not.toBeInTheDocument();
  });

  it("sorts recent activity and labels record counts using the active flat-type cohort", () => {
    const newerBlockWideSale: BlockSummary = {
      ...block,
      addressKey: "bedok-301-newer-block-sale",
      block: "301",
      streetName: "NEWER BLOCK SALE",
      latestMonth: "2026-03",
      transactionCount: 20,
      flatTypeCohorts: {
        "4 ROOM": {
          transactionCount: 2,
          latestMonth: "2025-10",
          floorAreaRange: [90, 92],
          flatModels: ["MODEL A"],
        },
      },
    };
    const newerFourRoomSale: BlockSummary = {
      ...block,
      addressKey: "bedok-302-newer-four-room-sale",
      block: "302",
      streetName: "NEWER FOUR ROOM SALE",
      latestMonth: "2025-01",
      transactionCount: 3,
      flatTypeCohorts: {
        "4 ROOM": {
          transactionCount: 7,
          latestMonth: "2026-02",
          floorAreaRange: [92, 95],
          flatModels: ["MODEL A"],
        },
      },
    };

    render(
      <I18nProvider>
        <ResultsPane
          blocks={[newerBlockWideSale, newerFourRoomSale]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
          flatType="4 ROOM"
          sortMode="latest-desc"
        />
      </I18nProvider>,
    );

    const resultCards = screen.getAllByRole("option");
    expect(resultCards[0]).toHaveTextContent("302 NEWER FOUR ROOM SALE");
    expect(resultCards[0]).toHaveTextContent("7 笔该房型记录");
    expect(resultCards[1]).toHaveTextContent("2 笔该房型记录");
  });

  it("resets a controlled empty sort to lowest median instead of stale internal state", () => {
    const { rerender } = render(
      <I18nProvider>
        <ResultsPane
          blocks={[block, amkBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact
          sortMode="median-desc"
        />
      </I18nProvider>,
    );

    expect(screen.getAllByRole("option")[0]).toHaveTextContent("406 ANG MO KIO AVE 10");

    rerender(
      <I18nProvider>
        <ResultsPane
          blocks={[block, amkBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact
          sortMode=""
        />
      </I18nProvider>,
    );

    expect(screen.getAllByRole("option")[0]).toHaveTextContent("101 BEDOK NTH AVE 4");
    expect(screen.getByTestId("results-sort-trigger")).toHaveTextContent("价格由低到高");
  });

  it("shows a textual affordability status in compact results", () => {
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[block]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact
          searchProfile={{
            version: 3,
            mainFlatType: "4 ROOM",
            maxBudget: 700000,
            minimumRemainingLeaseYears: 60,
            age: 35,
            coApplicantAge: null,
            cpfOABalance: 300000,
            monthlyIncome: 20000,
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("option")).toHaveTextContent(/CPF估算/);
  });

  it("labels an unfiltered price as block-wide instead of borrowing a flat type", () => {
    const mixedBlock: BlockSummary = {
      ...block,
      flatTypes: ["2 ROOM", "4 ROOM"],
      medianPrice: 515000,
      medianPriceByFlatType: { "2 ROOM": 350000, "4 ROOM": 680000 },
    };

    render(
      <I18nProvider>
        <ResultsPane
          blocks={[mixedBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
        />
      </I18nProvider>,
    );

    const card = screen.getByRole("option");
    expect(card).toHaveTextContent("勿洛 · BEDOK · 整座组屋中位价");
    expect(card).toHaveTextContent(formatCompactCurrency(515000, "zh-SG"));
    expect(card).not.toHaveTextContent("二房式 · 2 ROOM");
  });

  it("labels the block-wide fallback when the active flat type has no median", () => {
    const missingTypeMedianBlock: BlockSummary = {
      ...block,
      flatTypes: ["2 ROOM", "4 ROOM"],
      medianPrice: 525000,
      medianPriceByFlatType: { "2 ROOM": 350000 },
      flatTypeCohorts: undefined,
    };

    render(
      <I18nProvider>
        <ResultsPane
          blocks={[missingTypeMedianBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
          flatType="4 ROOM"
        />
      </I18nProvider>,
    );

    const card = screen.getByRole("option");
    expect(card).toHaveTextContent("勿洛 · BEDOK · 整座组屋中位价");
    expect(card).toHaveTextContent(formatCompactCurrency(525000, "zh-SG"));
    expect(card).toHaveTextContent("整座组屋 92 平米");
    expect(card).not.toHaveTextContent(formatCompactCurrency(350000, "zh-SG"));
  });

  it("retains a legacy selected-type price while labelling unavailable attributes block-wide", () => {
    const legacyTypePriceBlock: BlockSummary = {
      ...block,
      flatTypes: ["2 ROOM", "4 ROOM"],
      medianPrice: 515000,
      medianPriceByFlatType: { "2 ROOM": 350000, "4 ROOM": 680000 },
      medianPricePerSqmByFlatType: { "2 ROOM": 5200, "4 ROOM": 7100 },
      flatTypeCohorts: undefined,
    };

    render(
      <I18nProvider>
        <ResultsPane
          blocks={[legacyTypePriceBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
          flatType="4 ROOM"
        />
      </I18nProvider>,
    );

    const card = screen.getByRole("option");
    expect(card).toHaveTextContent(formatCompactCurrency(680000, "zh-SG"));
    expect(card).not.toHaveTextContent(formatCompactCurrency(515000, "zh-SG"));
    expect(card).toHaveTextContent("整座组屋 92 平米");
  });

  it("exports type-specific price metrics only as a complete pair", async () => {
    const completeTypeMetrics: BlockSummary = {
      ...block,
      addressKey: "bedok-401-complete-rd",
      block: "401",
      streetName: "COMPLETE RD",
      flatTypes: ["2 ROOM", "4 ROOM"],
      medianPrice: 410000,
      pricePerSqmMedian: 5100,
      medianPriceByFlatType: { "4 ROOM": 810000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 9100 },
    };
    const missingTypePpsm: BlockSummary = {
      ...block,
      addressKey: "bedok-402-missing-ppsm-rd",
      block: "402",
      streetName: "MISSING PPSM RD",
      flatTypes: ["2 ROOM", "4 ROOM"],
      medianPrice: 620000,
      pricePerSqmMedian: 6200,
      medianPriceByFlatType: { "4 ROOM": 820000 },
      medianPricePerSqmByFlatType: { "2 ROOM": 5200 },
    };
    const missingTypePrice: BlockSummary = {
      ...block,
      addressKey: "bedok-403-missing-price-rd",
      block: "403",
      streetName: "MISSING PRICE RD",
      flatTypes: ["2 ROOM", "4 ROOM"],
      medianPrice: 630000,
      pricePerSqmMedian: 6300,
      medianPriceByFlatType: { "2 ROOM": 430000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 9300 },
    };
    const legacyTypePair: BlockSummary = {
      ...block,
      addressKey: "bedok-404-legacy-pair-rd",
      block: "404",
      streetName: "LEGACY PAIR RD",
      flatTypes: ["2 ROOM", "4 ROOM"],
      medianPrice: 640000,
      pricePerSqmMedian: 6400,
      medianPriceByFlatType: { "4 ROOM": 840000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 9400 },
      flatTypeCohorts: undefined,
    };

    render(
      <I18nProvider>
        <ResultsPane
          blocks={[completeTypeMetrics, missingTypePpsm, missingTypePrice, legacyTypePair]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
          flatType="4 ROOM"
          shareUrl="https://example.com/?flatType=4%20ROOM"
        />
      </I18nProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "导出 CSV" }));

    expect(exportMocks.downloadCsv).toHaveBeenCalledOnce();
    const [filename, csv] = exportMocks.downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toBe("hdb-results.csv");

    const rows = csv.split("\n");
    const completeRow = rows.find((row) => row.includes('"401 COMPLETE RD"'));
    const missingPpsmRow = rows.find((row) => row.includes('"402 MISSING PPSM RD"'));
    const missingPriceRow = rows.find((row) => row.includes('"403 MISSING PRICE RD"'));
    const legacyPairRow = rows.find((row) => row.includes('"404 LEGACY PAIR RD"'));

    expect(completeRow).toContain(",810000,9100,");
    expect(completeRow).toMatch(/,"4 ROOM"$/);

    expect(missingPpsmRow).toContain(",620000,6200,");
    expect(missingPpsmRow).not.toContain("820000");
    expect(missingPpsmRow).toContain('"4 ROOM（证据回退为整座组屋口径）"');

    expect(missingPriceRow).toContain(",630000,6300,");
    expect(missingPriceRow).not.toContain("9300");
    expect(missingPriceRow).toContain('"4 ROOM（证据回退为整座组屋口径）"');

    expect(legacyPairRow).toContain(",840000,9400,");
    expect(legacyPairRow).toContain('"4 ROOM价格；其他证据为整座组屋口径"');
  });

  it("explains when an unsaved result cannot be added to a full shortlist", () => {
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[block]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          shortlistFull={true}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
        />
      </I18nProvider>,
    );

    const button = screen.getByRole("button", { name: "候选列表已满" });
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute("tabindex", "0");
    expect(button.parentElement).toHaveAttribute(
      "aria-describedby",
      `shortlist-full-${block.addressKey}`,
    );
  });

  it("renders nearby MRT stations with distances in full mode", () => {
    const fullModeBlock: BlockSummary = {
      ...block,
      flatTypeCohorts: {
        "4 ROOM": {
          transactionCount: 6,
          latestMonth: "2026-02",
          floorAreaRange: [92, 92],
          flatModels: ["MODEL A"],
        },
      },
    };
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[fullModeBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={false}
          flatType="4 ROOM"
        />
      </I18nProvider>,
    );

    // Check that all 3 nearby MRT stations are displayed
    expect(screen.getByText("BEDOK NORTH MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("BEDOK MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("KAKI BUKIT MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("6 笔该房型记录")).toBeInTheDocument();
    expect(screen.getByText("所选房型的近期证据")).toBeInTheDocument();
  });

  it("keeps the shared town trend dataset loaded across town switches", async () => {
    const { rerender } = render(
      <I18nProvider>
        <ResultsPane
          blocks={[block]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
          profileTown="BEDOK"
          profileTownBlocks={[block]}
          profileDataWindow={{ minMonth: "2024-01", maxMonth: "2024-01" }}
        />
      </I18nProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "显示涵盖所有房型的全镇概览" }));

    await waitFor(() => {
      expect(screen.queryByText("正在载入镇区级趋势文件…")).not.toBeInTheDocument();
    });
    expect(dataMocks.fetchTownFlatTypeTrends).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider>
        <ResultsPane
          blocks={[amkBlock]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
          profileTown="ANG MO KIO"
          profileTownBlocks={[amkBlock]}
          profileDataWindow={{ minMonth: "2024-01", maxMonth: "2024-01" }}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("正在载入镇区级趋势文件…")).not.toBeInTheDocument();
    expect(dataMocks.fetchTownFlatTypeTrends).toHaveBeenCalledTimes(1);
  });

  it("ignores an older town-comparison response that resolves after the active town", async () => {
    let resolveAmk!: (blocks: BlockSummary[]) => void;
    let resolveTampines!: (blocks: BlockSummary[]) => void;
    const amkRequest = new Promise<BlockSummary[]>((resolve) => {
      resolveAmk = resolve;
    });
    const tampinesRequest = new Promise<BlockSummary[]>((resolve) => {
      resolveTampines = resolve;
    });
    dataMocks.fetchBlocksByTown.mockImplementation((town) =>
      town === "ANG MO KIO" ? amkRequest : tampinesRequest,
    );
    const tampinesBlock = {
      ...block,
      addressKey: "tampines-1-example",
      town: "TAMPINES",
      block: "1",
      streetName: "TAMPINES EXAMPLE",
    };

    const renderPane = (compareTown: string) => (
      <I18nProvider>
        <ResultsPane
          blocks={[block]}
          hasResultScope
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact
          profileTown="BEDOK"
          profileTownBlocks={[block]}
          profileDataWindow={{ minMonth: "2024-01", maxMonth: "2024-01" }}
          compareTown={compareTown}
          availableTowns={["BEDOK", "ANG MO KIO", "TAMPINES"]}
        />
      </I18nProvider>
    );
    const { rerender } = render(renderPane("ANG MO KIO"));
    await userEvent.click(screen.getByRole("button", { name: "显示涵盖所有房型的全镇概览" }));
    await waitFor(() => expect(dataMocks.fetchBlocksByTown).toHaveBeenCalledWith("ANG MO KIO"));

    rerender(renderPane("TAMPINES"));
    await waitFor(() => expect(dataMocks.fetchBlocksByTown).toHaveBeenCalledWith("TAMPINES"));
    resolveTampines([tampinesBlock]);
    await waitFor(() =>
      expect(screen.queryByText("正在载入镇区比较数据…")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("town-compare-column-compare")).toHaveTextContent("TAMPINES");

    resolveAmk([amkBlock]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("正在载入镇区比较数据…")).not.toBeInTheDocument();
    expect(screen.getByTestId("town-compare-column-compare")).toHaveTextContent("TAMPINES");
  });

  it("explains an unanswerable refinement instead of implying zero matches", async () => {
    const onClear = vi.fn();
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          refinementUnsupported={true}
          onClearUnsupportedRefinements={onClear}
        />
      </I18nProvider>,
    );

    const card = screen.getByTestId("refinement-unsupported-card");
    expect(card).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "清除房型、面积与时间筛选" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("keeps the plain no-match state when the search was answerable", () => {
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          refinementUnsupported={false}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId("refinement-unsupported-card")).toBeNull();
  });
});
