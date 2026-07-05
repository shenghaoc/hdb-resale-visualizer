import { describe, expect, it, vi } from "vite-plus/test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ShortlistDrawer } from "@/components/ShortlistDrawer";
import { DEFAULT_FILTERS, MAX_SHORTLIST_ITEMS } from "@/shared/lib/constants";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import type { BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";

const mockBlock: BlockSummary = {
  addressKey: "test-block",
  town: "Ang Mo Kio",
  block: "101",
  streetName: "Ang Mo Kio Ave 3",
  coordinates: { lat: 1.3521, lng: 103.8198 },
  medianPrice: 500000,
  pricePerSqmMedian: 6250,
  transactionCount: 10,
  floorAreaRange: [70, 90],
  leaseCommenceRange: [1990, 2000],
  latestMonth: "2024-01",
  availableDateRange: ["2023-01", "2024-01"],
  flatTypes: ["3 ROOM"],
  flatModels: ["Model A"],
  nearestMrt: {
    stationName: "Ang Mo Kio",
    distanceMeters: 500,
    walkingTimeSeconds: 400,
  },
};

const mockShortlistItem: ShortlistItem = {
  addressKey: "test-block",
  notes: "Test notes",
  targetPrice: 480000,
  addedAt: "2024-01-01T00:00:00Z",
};

const mockComparison: ComparisonArtifact = {
  addressKey: "test-block",
  town: "Ang Mo Kio",
  flatType: "3 ROOM",
  amenities: {
    primarySchoolsWithin1km: 2,
    primarySchoolsWithin2km: 5,
    nearestPrimarySchoolMeters: 300,
    nearestPrimarySchools: [
      {
        name: "ANG MO KIO PRIMARY SCHOOL",
        distanceMeters: 300,
      },
    ],
    hawkerCentresWithin1km: 1,
    nearestHawkerCentreMeters: 400,
    supermarketsWithin1km: 3,
    nearestSupermarketMeters: 200,
    parksWithin1km: 2,
    nearestParkMeters: 150,
  },
  percentileRanks: {
    pricePercentile: 25.5,
    pricePerSqmPercentile: 30.2,
    leasePercentile: 75.8,
    mrtDistancePercentile: 60.1,
    transactionCountPercentile: 45.3,
    recencyPercentile: 80.9,
  },
  generatedAt: "2024-01-01T00:00:00Z",
};

const mockRow = {
  item: mockShortlistItem,
  block: mockBlock,
  detailSummary: null,
  monthlyTrend: [],
  comparison: mockComparison,
};

const mockRowTwo = {
  item: {
    ...mockShortlistItem,
    addressKey: "test-block-2",
    addedAt: "2024-01-02T00:00:00Z",
  },
  block: {
    ...mockBlock,
    addressKey: "test-block-2",
    block: "202",
    streetName: "Bedok North St 1",
  },
  detailSummary: null,
  monthlyTrend: [],
  comparison: mockComparison
    ? {
        ...mockComparison,
        addressKey: "test-block-2",
      }
    : null,
};

describe("ShortlistDrawer", () => {
  it("displays comparison data when available", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    // Check that primary schools data is displayed
    expect(screen.getByText("Primary schools")).toBeInTheDocument();
    expect(screen.getByText("2 within 1km, 5 within 2km")).toBeInTheDocument();
    expect(screen.getByText("ANG MO KIO PRIMARY SCHOOL: 300 m")).toBeInTheDocument();

    // Check that amenities data is displayed
    expect(screen.getByText("Amenities")).toBeInTheDocument();
    expect(screen.getByText("1H • 3S • 2P")).toBeInTheDocument();

    // Check that percentile data is displayed
    expect(screen.getByText("Price percentile")).toBeInTheDocument();
    expect(screen.getByText("26th percentile")).toBeInTheDocument();

    // Check that location percentiles are displayed
    expect(screen.getByText("Location ranks")).toBeInTheDocument();
    expect(screen.getByText("MRT: 60th • Lease: 76th")).toBeInTheDocument();
    expect(screen.getByText("Strong data")).toBeInTheDocument();
    expect(screen.getByText("Recent block-level evidence")).toBeInTheDocument();
  });

  it("gracefully handles missing comparison data", () => {
    const rowWithoutComparison = {
      ...mockRow,
      comparison: null,
    };

    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[rowWithoutComparison]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    // Should not show loading state - comparison data sections are simply omitted
    expect(screen.queryByText("Loading comparison data…")).not.toBeInTheDocument();

    // Basic block info should still be displayed (address in title)
    expect(screen.getAllByText(/101 Ang Mo Kio Ave 3/i).length).toBeGreaterThan(0);

    // Compact v2 card should still expose the map action and target controls.
    expect(screen.getByText("View on map")).toBeInTheDocument();
    expect(screen.getByLabelText("Your target price")).toBeInTheDocument();
  });

  it("handles empty shortlist correctly", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Saved shortlist")).toBeInTheDocument();
    expect(
      screen.getByText(`Save up to ${MAX_SHORTLIST_ITEMS} blocks to compare.`),
    ).toBeInTheDocument();
  });

  it("edits target price and can select a saved block on the map", () => {
    const onUpdate = vi.fn();
    const onSelectAddress = vi.fn();

    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={onUpdate}
          onSelectAddress={onSelectAddress}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("Your target price"), {
      target: { value: "490000" },
    });
    expect(onUpdate).toHaveBeenCalledWith("test-block", { targetPrice: 490000 });

    fireEvent.click(screen.getByRole("button", { name: "View on map" }));
    expect(onSelectAddress).toHaveBeenCalledWith("test-block");
  });

  it("uses the same exact target copy in the card view as the comparison table", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          isOpen={true}
          rows={[
            {
              ...mockRow,
              item: { ...mockRow.item, targetPrice: mockRow.block.medianPrice },
            },
          ]}
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByText("On target").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0 below target")).not.toBeInTheDocument();
  });

  it("toggles between list and compare views and renders saved blocks in a table", () => {
    const onSelectAddress = vi.fn();

    render(
      <I18nProvider>
        <ShortlistDrawer
          isOpen={true}
          rows={[mockRow, mockRowTwo]}
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={onSelectAddress}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId("shortlist-comparison-table")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Show saved blocks as a comparison table" }),
    );

    const table = screen.getByTestId("shortlist-comparison-table");
    expect(table).toBeInTheDocument();
    expect(screen.getAllByTestId("shortlist-comparison-row")).toHaveLength(2);
    expect(screen.getByRole("table", { name: "Saved blocks comparison" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Address" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Town" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "$/sqm" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nearest MRT" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Notes" })).toBeInTheDocument();

    const tableRows = screen.getAllByTestId("shortlist-comparison-row");
    expect(tableRows[0]).toHaveTextContent("101 Ang Mo Kio Ave 3");
    expect(tableRows[1]).toHaveTextContent("202 Bedok North St 1");
    expect(tableRows[0]).toHaveTextContent("Ang Mo Kio");
    expect(tableRows[0]).toHaveTextContent("Test notes");
    expect(tableRows[1]).toHaveTextContent("Test notes");

    const compareTable = within(table).getByRole("table", { name: "Saved blocks comparison" });
    const compareButton = within(compareTable).getByRole("button", {
      name: "View 101 Ang Mo Kio Ave 3",
    });
    fireEvent.click(compareButton);
    expect(onSelectAddress).toHaveBeenCalledWith("test-block");

    fireEvent.click(screen.getByRole("button", { name: "Show saved blocks as cards" }));
    expect(screen.queryByTestId("shortlist-comparison-table")).not.toBeInTheDocument();
  });

  it("shows the nearest MRT station name and buyer notes in the mobile comparison card", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          isOpen={true}
          rows={[mockRow, mockRowTwo]}
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show saved blocks as a comparison table" }),
    );

    // The compare view renders both the desktop table and a stacked mobile card
    // per row (the table is CSS-hidden below `md`). The mobile card must show the
    // MRT station name alongside walking time — not the walking time alone — and
    // the buyer notes, matching the desktop table's information density.
    const cards = screen.getAllByTestId("shortlist-comparison-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(/Ang Mo Kio\s*·/); // station name + separator
    expect(cards[0]).toHaveTextContent("Test notes"); // buyer notes
  });

  it("keeps a valid card expanded when shortlist rows change", () => {
    const { rerender } = render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    const firstCardButton = screen.getByRole("button", { name: /101 Ang Mo Kio Ave 3/i });
    expect(firstCardButton).toHaveAttribute("aria-expanded", "true");

    rerender(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow, mockRowTwo]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /202 Bedok North St 1/i }));

    rerender(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /101 Ang Mo Kio Ave 3/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
