import { describe, expect, it, vi } from "vite-plus/test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ShortlistDrawer } from "@/features/shortlist/ShortlistDrawer";
import { DEFAULT_FILTERS, MAX_SHORTLIST_ITEMS } from "@/shared/lib/constants";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import type { ShortlistSync } from "@/features/shortlist/useShortlistSync";
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

function expandRow(name: RegExp) {
  const button = screen.getByRole("button", { name, expanded: false });
  fireEvent.click(button);
  return button;
}

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
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expandRow(/101 Ang Mo Kio Ave 3/i);

    // Check that primary schools data is displayed
    expect(screen.getByText("Primary schools")).toBeInTheDocument();
    expect(screen.getByText("2 within 1km, 5 within 2km")).toBeInTheDocument();
    expect(screen.getByText("ANG MO KIO PRIMARY SCHOOL: 300 m")).toBeInTheDocument();

    // Check that amenities data is displayed
    expect(screen.getByText("Amenities")).toBeInTheDocument();
    expect(screen.getByText("1H • 3S • 2P")).toBeInTheDocument();

    expect(screen.queryByText("Market position")).not.toBeInTheDocument();
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
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expandRow(/101 Ang Mo Kio Ave 3/i);

    // Should not show loading state - comparison data sections are simply omitted
    expect(screen.queryByText("Loading comparison data…")).not.toBeInTheDocument();

    // Basic block info should still be displayed (address in title)
    expect(screen.getAllByText(/101 Ang Mo Kio Ave 3/i).length).toBeGreaterThan(0);

    // Compact v2 card should still expose the detail action and target controls.
    expect(screen.getByText("View details")).toBeInTheDocument();
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
          onRestore={() => true}
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

  it("shows loading instead of a false empty state while saved rows resolve", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[]}
          unresolvedItems={[mockShortlistItem]}
          isResolvingRows={true}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByTestId("shortlist-resolving")).toHaveTextContent("Loading saved homes");
    expect(
      screen.getByText("Matching your saved addresses to the latest block data."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Saved shortlist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shortlist-unresolved")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shortlist-utilities")).not.toBeInTheDocument();
  });

  it("renders unavailable saved items with complete export paths so they can be removed or retained", () => {
    const unresolvedItem = {
      ...mockShortlistItem,
      addressKey: "retired-block",
    };
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => true);

    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[]}
          unresolvedItems={[unresolvedItem]}
          onToggleOpen={() => {}}
          onRemove={onRemove}
          onRestore={onRestore}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByTestId("shortlist-unresolved")).toHaveTextContent(
      "Some saved homes are unavailable",
    );
    expect(screen.getByTestId("shortlist-unresolved-item")).toHaveTextContent("retired-block");
    expect(screen.getByTestId("shortlist-drawer")).toHaveTextContent("1");
    expect(screen.getByTestId("shortlist-utilities")).toBeInTheDocument();
    expect(screen.getByTestId("shortlist-export-unresolved-notice")).toHaveTextContent(
      "Exports and share links include unavailable homes by their saved address key",
    );
    expect(screen.getByRole("button", { name: "Copy share link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export as CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy summary" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove retired-block from shortlist",
      }),
    );

    expect(onRemove).toHaveBeenCalledWith("retired-block");
    expect(screen.getByRole("status")).toHaveTextContent("Removed: retired-block");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onRestore).toHaveBeenCalledWith(unresolvedItem, 0);
  });

  it("delegates removal to an external undo owner without showing a local undo bar", () => {
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => true);

    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          removalMode="external"
          onToggleOpen={() => {}}
          onRemove={onRemove}
          onRestore={onRestore}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove 101 Ang Mo Kio Ave 3 from shortlist",
      }),
    );

    expect(onRemove).toHaveBeenCalledWith("test-block");
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("hides view and sort controls until two resolved homes are visible in an open drawer", () => {
    const { rerender } = render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId("shortlist-view-toggle")).not.toBeInTheDocument();
    expect(screen.queryByText("Sort by")).not.toBeInTheDocument();

    rerender(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={false}
          rows={[mockRow, mockRowTwo]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId("shortlist-view-toggle")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show saved blocks as a comparison table" }),
    ).not.toBeInTheDocument();
  });

  it("edits target price and can open a saved block's details", () => {
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
          onRestore={() => true}
          onUpdate={onUpdate}
          onSelectAddress={onSelectAddress}
        />
      </I18nProvider>,
    );

    expandRow(/101 Ang Mo Kio Ave 3/i);

    fireEvent.change(screen.getByLabelText("Your target price"), {
      target: { value: "490000" },
    });
    expect(onUpdate).toHaveBeenCalledWith("test-block", { targetPrice: 490000 });

    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(onSelectAddress).toHaveBeenCalledWith("test-block");
  });

  it("restores the exact removed shortlist item through the explicit restore path", () => {
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => true);
    const itemWithBuyerData: ShortlistItem = {
      ...mockShortlistItem,
      askingPrice: 612345,
      buyerNotes: "Keep exact buyer data",
      fairRangeMedian: 590000,
      decisionStatus: "viewing booked",
    };

    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[{ ...mockRow, item: itemWithBuyerData }]}
          onToggleOpen={() => {}}
          onRemove={onRemove}
          onRestore={onRestore}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove 101 Ang Mo Kio Ave 3 from shortlist",
      }),
    );

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("test-block");
    expect(screen.getByRole("status")).toHaveTextContent("Removed: 101 Ang Mo Kio Ave 3");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onRestore).toHaveBeenCalledWith(itemWithBuyerData, 0);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("keeps Undo available and explains when shortlist capacity blocks restore", () => {
    const onRestore = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={onRestore}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove 101 Ang Mo Kio Ave 3 from shortlist",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Shortlist is full. Remove another saved home, then try Undo again.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onRestore).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
          onRestore={() => true}
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
          onRestore={() => true}
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
    expect(screen.getByRole("columnheader", { name: "Block $/sqm" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Recent block records" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nearest MRT" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Notes" })).toBeInTheDocument();

    const tableRows = screen.getAllByTestId("shortlist-comparison-row");
    expect(tableRows[0]).toHaveTextContent("202 Bedok North St 1");
    expect(tableRows[1]).toHaveTextContent("101 Ang Mo Kio Ave 3");
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
          onRestore={() => true}
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
    expect(cards[0]).toHaveTextContent("10 recent block records");
  });

  it("keeps newly saved cards collapsed until the buyer opens one", () => {
    const { rerender } = render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
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
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    const firstCardButton = screen.getByRole("button", {
      name: /101 Ang Mo Kio Ave 3/i,
      expanded: false,
    });
    expect(firstCardButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(firstCardButton);
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
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("button", { name: /101 Ang Mo Kio Ave 3/i, expanded: true }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /202 Bedok North St 1/i, expanded: false }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show comparative superlatives for a single saved home", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("Best value")).not.toBeInTheDocument();
    expect(screen.queryByText("Longest lease")).not.toBeInTheDocument();
    expect(screen.queryByText("Closest MRT")).not.toBeInTheDocument();
  });

  it("shows one offer ceiling and one buyer-notes field", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>,
    );

    expandRow(/101 Ang Mo Kio Ave 3/i);

    expect(screen.getAllByLabelText("Suggested offer ceiling")).toHaveLength(1);
    expect(screen.queryByLabelText("Offer ceiling", { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Buyer notes")).toHaveLength(1);
    expect(screen.queryByLabelText("Notes", { exact: true })).not.toBeInTheDocument();
  });

  it("renders saved homes before export and sync utilities", () => {
    const sync: ShortlistSync = {
      code: null,
      status: "local",
      enable: vi.fn().mockResolvedValue(undefined),
      link: vi.fn().mockResolvedValue(undefined),
      disable: vi.fn(),
    };

    render(
      <I18nProvider>
        <ShortlistDrawer
          filters={DEFAULT_FILTERS}
          remainingLeaseMin={null}
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onRestore={() => true}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
          sync={sync}
        />
      </I18nProvider>,
    );

    const savedHome = screen.getByRole("listitem");
    const utilities = screen.getByTestId("shortlist-utilities");
    const syncSection = screen.getByTestId("shortlist-sync");

    expect(
      savedHome.compareDocumentPosition(utilities) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      savedHome.compareDocumentPosition(syncSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
