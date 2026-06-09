import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShortlistDrawer } from "@/components/ShortlistDrawer";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import type { BlockSummary, ShortlistItem } from "@/types/data";

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

function renderDrawer(
  rows: Parameters<typeof ShortlistDrawer>[0]["rows"],
) {
  return render(
    <I18nProvider>
      <ShortlistDrawer
        isOpen={true}
        filters={DEFAULT_FILTERS}
        remainingLeaseMin={null}
        rows={rows}
        onToggleOpen={() => {}}
        onRemove={() => {}}
        onUpdate={vi.fn()}
        onSelectAddress={() => {}}
      />
    </I18nProvider>,
  );
}

describe("ShortlistDrawer — compareChart aggregation", () => {
  it("renders the price trend chart when two or more rows have monthly trend data", () => {
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

    renderDrawer(rows);
    expect(screen.getByRole("img", { name: "Price trend overlay" })).toBeInTheDocument();
  });

  it("does not render the chart when fewer than two rows have monthly trend data", () => {
    const rows = [
      {
        item: makeItem("blk-a"),
        block: makeBlock("100A", "Ang Mo Kio Ave 3"),
        detailSummary: null,
        comparison: null,
        monthlyTrend: [
          { month: "2024-01", medianPrice: 500000, transactionCount: 3, medianPricePerSqm: 6250 },
        ],
      },
    ];

    renderDrawer(rows);
    expect(screen.queryByRole("img", { name: "Price trend overlay" })).not.toBeInTheDocument();
  });

  it("renders the chart without crashing when a trend point has a NaN medianPrice", () => {
    const rows = [
      {
        item: makeItem("blk-a"),
        block: makeBlock("100A", "Ang Mo Kio Ave 3"),
        detailSummary: null,
        comparison: null,
        monthlyTrend: [
          { month: "2024-01", medianPrice: NaN, transactionCount: 1, medianPricePerSqm: 0 },
          { month: "2024-02", medianPrice: 500000, transactionCount: 2, medianPricePerSqm: 6250 },
        ],
      },
      {
        item: makeItem("blk-b"),
        block: makeBlock("200B", "Ang Mo Kio Ave 5"),
        detailSummary: null,
        comparison: null,
        monthlyTrend: [
          { month: "2024-01", medianPrice: 480000, transactionCount: 1, medianPricePerSqm: 6000 },
          { month: "2024-02", medianPrice: 490000, transactionCount: 2, medianPricePerSqm: 6125 },
        ],
      },
    ];

    renderDrawer(rows);
    expect(screen.getByRole("img", { name: "Price trend overlay" })).toBeInTheDocument();
  });

  it("renders the chart when trend rows have months provided out of order", () => {
    const rows = [
      {
        item: makeItem("blk-a"),
        block: makeBlock("100A", "Ang Mo Kio Ave 3"),
        detailSummary: null,
        comparison: null,
        monthlyTrend: [
          { month: "2024-03", medianPrice: 520000, transactionCount: 1, medianPricePerSqm: 6500 },
          { month: "2024-01", medianPrice: 500000, transactionCount: 2, medianPricePerSqm: 6250 },
        ],
      },
      {
        item: makeItem("blk-b"),
        block: makeBlock("200B", "Ang Mo Kio Ave 5"),
        detailSummary: null,
        comparison: null,
        monthlyTrend: [
          { month: "2024-02", medianPrice: 480000, transactionCount: 1, medianPricePerSqm: 6000 },
        ],
      },
    ];

    renderDrawer(rows);
    expect(screen.getByRole("img", { name: "Price trend overlay" })).toBeInTheDocument();
  });
});
