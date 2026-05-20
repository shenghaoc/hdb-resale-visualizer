import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsPane } from "@/components/ResultsPane";
import { I18nProvider } from "@/lib/i18n";
import type { BlockSummary, TownFlatTypeTrendPoint } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchTownFlatTypeTrends: vi.fn<() => Promise<TownFlatTypeTrendPoint[]>>(),
}));

vi.mock("@/lib/data", () => ({
  fetchTownFlatTypeTrends: dataMocks.fetchTownFlatTypeTrends,
}));

vi.mock("@/lib/storage", () => ({
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
  nearestMrt: {
    stationName: "BEDOK NORTH MRT STATION",
    distanceMeters: 400,
  },
  nearbyMrts: [
    { stationName: "BEDOK NORTH MRT STATION", distanceMeters: 400 },
    { stationName: "BEDOK MRT STATION", distanceMeters: 800 },
    { stationName: "KAKI BUKIT MRT STATION", distanceMeters: 1200 },
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
  });

  it("localizes compact-card town and flat type labels", () => {
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

    expect(screen.getByText("勿洛 · BEDOK · 四房式 · 4 ROOM")).toBeInTheDocument();
  });

  it("renders nearby MRT stations with distances in full mode", () => {
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[block]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={false}
        />
      </I18nProvider>,
    );

    // Check that all 3 nearby MRT stations are displayed
    expect(screen.getByText("BEDOK NORTH MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("BEDOK MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("KAKI BUKIT MRT STATION")).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: "显示镇区概览图表与亮点" }));

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
});
