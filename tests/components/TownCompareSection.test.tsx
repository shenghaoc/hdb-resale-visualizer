import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TownCompareSection } from "@/components/TownCompareSection";
import { I18nProvider } from "@/lib/i18n";
import type { BlockSummary, TownFlatTypeTrendPoint } from "@/types/data";

const PRIMARY_BLOCKS: BlockSummary[] = [
  {
    addressKey: "bedok-101-bedok-nth-ave-4",
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    displayName: null,
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 540_000,
    pricePerSqmMedian: 5800,
    transactionCount: 4,
    floorAreaRange: [92, 92],
    leaseCommenceRange: [1985, 1985],
    latestMonth: "2024-01",
    availableDateRange: ["2020-01", "2024-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: {
      stationName: "BEDOK NORTH MRT STATION",
      distanceMeters: 400,
      walkingTimeSeconds: 320,
    },
  },
];

const COMPARE_BLOCKS: BlockSummary[] = [
  {
    addressKey: "ang-mo-kio-406-ang-mo-kio-ave-10",
    town: "ANG MO KIO",
    block: "406",
    streetName: "ANG MO KIO AVE 10",
    displayName: null,
    coordinates: { lat: 1.372, lng: 103.846 },
    medianPrice: 700_000,
    pricePerSqmMedian: 7400,
    transactionCount: 3,
    floorAreaRange: [92, 92],
    leaseCommenceRange: [1985, 1985],
    latestMonth: "2024-01",
    availableDateRange: ["2020-01", "2024-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: {
      stationName: "ANG MO KIO MRT STATION",
      distanceMeters: 800,
      walkingTimeSeconds: 640,
    },
  },
];

const TRENDS: TownFlatTypeTrendPoint[] = [
  {
    town: "BEDOK",
    flatType: "4 ROOM",
    month: "2024-01",
    medianPrice: 580_000,
    medianPricePerSqm: 6105.26,
    transactionCount: 12,
  },
  {
    town: "ANG MO KIO",
    flatType: "4 ROOM",
    month: "2024-01",
    medianPrice: 700_000,
    medianPricePerSqm: 7400,
    transactionCount: 9,
  },
];

const RANGE = { start: "2024-01", end: "2024-01" };
const AVAILABLE_TOWNS = ["ANG MO KIO", "BEDOK", "TAMPINES"];

function renderSection(overrides: Partial<React.ComponentProps<typeof TownCompareSection>> = {}) {
  return render(
    <I18nProvider>
      <TownCompareSection
        locale="en-SG"
        t={(key) => key}
        primaryTown="BEDOK"
        compareTown=""
        monthRange={RANGE}
        primaryBlocks={PRIMARY_BLOCKS}
        compareBlocks={[]}
        trends={TRENDS}
        availableTowns={AVAILABLE_TOWNS}
        trendsLoading={false}
        trendsFailed={false}
        compareBlocksLoading={false}
        compareBlocksFailed={false}
        onChangeCompareTown={() => {}}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe("TownCompareSection", () => {
  it("shows the empty-state hint when no compareTown is set", () => {
    renderSection();
    expect(screen.getByTestId("town-compare-empty")).toBeInTheDocument();
    // The two column scaffolds should not exist yet.
    expect(screen.queryByTestId("town-compare-column-primary")).toBeNull();
    expect(screen.queryByTestId("town-compare-column-compare")).toBeNull();
  });

  it("renders both town columns and at least one delta badge when a compareTown is set", () => {
    renderSection({ compareTown: "ANG MO KIO", compareBlocks: COMPARE_BLOCKS });
    const primary = screen.getByTestId("town-compare-column-primary");
    const compare = screen.getByTestId("town-compare-column-compare");
    expect(within(primary).getByText("BEDOK")).toBeInTheDocument();
    expect(within(compare).getByText("ANG MO KIO")).toBeInTheDocument();
    // Delta badges only appear in the compare column.
    expect(within(compare).getAllByTestId("town-compare-delta").length).toBeGreaterThan(0);
    expect(within(primary).queryByTestId("town-compare-delta")).toBeNull();
  });
});
