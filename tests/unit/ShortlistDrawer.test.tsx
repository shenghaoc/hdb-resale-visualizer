import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShortlistDrawer } from "@/components/ShortlistDrawer";
import { I18nProvider } from "@/lib/i18n/provider";
import type { BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";

const mockBlock: BlockSummary = {
  addressKey: "test-block",
  town: "Ang Mo Kio",
  block: "101",
  streetName: "Ang Mo Kio Ave 3",
  coordinates: { lat: 1.3521, lng: 103.8198 },
  medianPrice: 500000,
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

describe("ShortlistDrawer", () => {
  it("displays comparison data when available", () => {
    render(
      <I18nProvider>
        <ShortlistDrawer
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>
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
  });

  it("gracefully handles missing comparison data", () => {
    const rowWithoutComparison = {
      ...mockRow,
      comparison: null,
    };

    render(
      <I18nProvider>
        <ShortlistDrawer
          isOpen={true}
          rows={[rowWithoutComparison]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>
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
          isOpen={true}
          rows={[]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nProvider>
    );

    expect(screen.getByText("Save up to four blocks to compare.")).toBeInTheDocument();
  });

  it("edits target price and can select a saved block on the map", () => {
    const onUpdate = vi.fn();
    const onSelectAddress = vi.fn();

    render(
      <I18nProvider>
        <ShortlistDrawer
          isOpen={true}
          rows={[mockRow]}
          onToggleOpen={() => {}}
          onRemove={() => {}}
          onUpdate={onUpdate}
          onSelectAddress={onSelectAddress}
        />
      </I18nProvider>
    );

    fireEvent.change(screen.getByLabelText("Your target price"), {
      target: { value: "490000" },
    });
    expect(onUpdate).toHaveBeenCalledWith("test-block", { targetPrice: 490000 });

    fireEvent.click(screen.getByRole("button", { name: "View on map" }));
    expect(onSelectAddress).toHaveBeenCalledWith("test-block");
  });
});
