import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailDrawer } from "@/components/DetailDrawer";
import { I18nProvider } from "@/lib/i18n";
import type { BlockSummary, ComparisonArtifact } from "@/types/data";

const mockBlock: BlockSummary = {
  addressKey: "test-block",
  town: "BEDOK",
  block: "101",
  streetName: "BEDOK NTH AVE 4",
  displayName: "BEDOK NORTH GREEN",
  coordinates: { lat: 1.3339, lng: 103.9372 },
  medianPrice: 545000,
  transactionCount: 1,
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
};

const mockComparison: ComparisonArtifact = {
  addressKey: "test-block",
  town: "BEDOK",
  flatType: "4 ROOM",
  amenities: {
    primarySchoolsWithin1km: 3,
    primarySchoolsWithin2km: 8,
    nearestPrimarySchoolMeters: 250,
    nearestPrimarySchools: [
      {
        name: "BEDOK PRIMARY SCHOOL",
        distanceMeters: 250,
      },
    ],
    hawkerCentresWithin1km: 2,
    nearestHawkerCentreMeters: 180,
    supermarketsWithin1km: 1,
    nearestSupermarketMeters: 320,
    parksWithin1km: 4,
    nearestParkMeters: 150,
  },
  percentileRanks: {
    pricePercentile: 65,
    pricePerSqmPercentile: 70,
    leasePercentile: 45,
    mrtDistancePercentile: 80,
    transactionCountPercentile: 55,
    recencyPercentile: 90,
  },
  generatedAt: "2026-04-22T00:00:00.000Z",
};

describe("DetailDrawer", () => {
  it("renders amenity sections when comparison data is available", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={mockComparison}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
        />
      </I18nProvider>
    );

    // Check that amenity sections are rendered
    expect(screen.getByText("Nearby Amenities")).toBeInTheDocument();
    expect(screen.getByText("Schools")).toBeInTheDocument();
    expect(screen.getByText("3 within 1km")).toBeInTheDocument();
    expect(screen.getByText("8 within 2km")).toBeInTheDocument();
    expect(screen.getByText("BEDOK PRIMARY SCHOOL: 250 m")).toBeInTheDocument();
    
    expect(screen.getByText("Hawkers")).toBeInTheDocument();
    expect(screen.getByText("2 within 1km")).toBeInTheDocument();
    
    expect(screen.getByText("Supermarkets")).toBeInTheDocument();
    expect(screen.getByText("1 within 1km")).toBeInTheDocument();
    
    expect(screen.getByText("Parks")).toBeInTheDocument();
    expect(screen.getByText("4 within 1km")).toBeInTheDocument();
  });

  it("renders percentile sections when comparison data is available", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={mockComparison}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
        />
      </I18nProvider>
    );

    // Check that percentile sections are rendered
    expect(screen.getByText("Market Percentiles")).toBeInTheDocument();
    expect(screen.getByText("Price Rank")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    
    expect(screen.getByText("Price/sqm Rank")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    
    expect(screen.getByText("Lease Rank")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    
    expect(screen.getByText("MRT Access Rank")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    
    expect(screen.getByText("Liquidity Rank")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    
    expect(screen.getByText("Recency Rank")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows loading state when comparison data is loading", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={null}
          isLoading={false}
          isComparisonLoading={true}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
        />
      </I18nProvider>
    );

    // Check that loading skeletons are shown
    expect(screen.getByText("Nearby Amenities")).toBeInTheDocument();
    expect(screen.getByText("Market Percentiles")).toBeInTheDocument();
    
    // Should show loading skeletons (animated divs)
    const loadingSkeletons = screen.getAllByRole("generic").filter(el => 
      el.className.includes("animate-pulse")
    );
    expect(loadingSkeletons.length).toBeGreaterThan(0);
  });

  it("shows fallback message when comparison data is not available", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={null}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
        />
      </I18nProvider>
    );

    // Check that fallback messages are shown
    expect(screen.getByText("Amenity comparison data not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Market percentile data not available yet.")).toBeInTheDocument();
  });
});
