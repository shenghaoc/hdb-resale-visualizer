import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ShortlistDrawer } from "@/features/shortlist/ShortlistDrawer";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import type { BlockSummary, ShortlistItem } from "@/types/data";
import { hoverLastPointAndReadTooltipLabel, stubChartLayout } from "../helpers/rechartsHover";

// Real Recharts, so the label comes from its tooltip rather than from a stand-in.
// Only the container is replaced, because jsdom cannot measure one.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const { FixedSizeResponsiveContainer } = await import("../helpers/rechartsHover");
  return { ...actual, ResponsiveContainer: FixedSizeResponsiveContainer };
});

function makeBlock(block: string, streetName: string): BlockSummary {
  return {
    addressKey: `${block}-${streetName}`,
    town: "Ang Mo Kio",
    block,
    streetName,
    coordinates: { lat: 1.35, lng: 103.82 },
    medianPrice: 500000,
    pricePerSqmMedian: 6250,
    transactionCount: 10,
    floorAreaRange: [70, 90],
    leaseCommenceRange: [1990, 2000],
    latestMonth: "2024-03",
    availableDateRange: ["2024-01", "2024-03"],
    flatTypes: ["3 ROOM"],
    flatModels: ["Model A"],
    nearestMrt: { stationName: "Ang Mo Kio", distanceMeters: 500, walkingTimeSeconds: 400 },
  };
}

function makeItem(addressKey: string): ShortlistItem {
  return { addressKey, notes: "", targetPrice: null, addedAt: "2024-01-01T00:00:00Z" };
}

describe("ShortlistDrawer compare chart tooltip", () => {
  beforeEach(() => {
    stubChartLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("labels the hovered point with its month", async () => {
    const rows = [
      {
        item: makeItem("blk-a"),
        block: makeBlock("100A", "Ang Mo Kio Ave 3"),
        detailSummary: null,
        comparison: null,
        monthlyTrend: [
          { month: "2024-01", medianPrice: 500000, transactionCount: 3, medianPricePerSqm: 6250 },
          { month: "2024-03", medianPrice: 520000, transactionCount: 2, medianPricePerSqm: 6500 },
        ],
      },
      {
        item: makeItem("blk-b"),
        block: makeBlock("200B", "Ang Mo Kio Ave 5"),
        detailSummary: null,
        comparison: null,
        monthlyTrend: [
          { month: "2024-02", medianPrice: 480000, transactionCount: 1, medianPricePerSqm: 6000 },
          { month: "2024-03", medianPrice: 490000, transactionCount: 2, medianPricePerSqm: 6125 },
        ],
      },
    ];

    const { container } = render(
      <I18nProvider>
        <ShortlistDrawer
          isOpen={true}
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          rows={rows}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
          onUpdate={vi.fn()}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(await hoverLastPointAndReadTooltipLabel(container)).toBe("2024-03");
  });
});
