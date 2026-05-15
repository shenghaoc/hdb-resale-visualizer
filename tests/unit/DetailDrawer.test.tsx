import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  nearbyMrts: [
    { stationName: "BEDOK NORTH MRT STATION", distanceMeters: 400 },
    { stationName: "BEDOK MRT STATION", distanceMeters: 800 },
    { stationName: "BEDOK SOUTH MRT STATION", distanceMeters: 1200 },
  ],
};

const similarBlock: BlockSummary = {
  ...mockBlock,
  addressKey: "similar-block",
  block: "102",
  medianPrice: 552000,
  transactionCount: 6,
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
      {
        name: "BEDOK GREEN PRIMARY SCHOOL",
        distanceMeters: 450,
      },
      {
        name: "OPERA ESTATE PRIMARY SCHOOL",
        distanceMeters: 600,
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
  const writeText = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
          remainingLeaseMin={null}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
        />
      </I18nProvider>
    );

    // Check that amenity sections are rendered
    expect(screen.getByText("Nearby Amenities")).toBeInTheDocument();
    expect(screen.getByText("Primary schools")).toBeInTheDocument();
    expect(screen.getByText("3 within 1km")).toBeInTheDocument();
    expect(screen.getByText("8 within 2km")).toBeInTheDocument();
    expect(screen.getByText("BEDOK PRIMARY SCHOOL")).toBeInTheDocument();
    expect(screen.getAllByText("Within 1km").length).toBeGreaterThan(0);
    expect(screen.getByText("250 m")).toBeInTheDocument();
    
    expect(screen.getByText("Hawkers")).toBeInTheDocument();
    expect(screen.getByText("2 within 1km")).toBeInTheDocument();
    
    expect(screen.getByText("Supermarkets")).toBeInTheDocument();
    expect(screen.getByText("1 within 1km")).toBeInTheDocument();
    
    expect(screen.getByText("Parks")).toBeInTheDocument();
    expect(screen.getByText("4 within 1km")).toBeInTheDocument();
  });

  it("renders MRT connectivity section with nearby stations", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={mockComparison}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          remainingLeaseMin={null}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
        />
      </I18nProvider>
    );

    // Check that MRT connectivity card is rendered (label is inside the card)
    expect(screen.getByText("Connectivity")).toBeInTheDocument();
    expect(screen.getByText("BEDOK NORTH MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("400 m")).toBeInTheDocument();
    expect(screen.getByText("BEDOK MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("800 m")).toBeInTheDocument();
    expect(screen.getByText("BEDOK SOUTH MRT STATION")).toBeInTheDocument();
    expect(screen.getByText("1.2 km")).toBeInTheDocument();
  });

  it("renders all 3 nearby schools with names and distances", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={mockComparison}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          remainingLeaseMin={null}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
        />
      </I18nProvider>
    );

    // Check that all 3 schools are displayed with their distances
    expect(screen.getByText("BEDOK PRIMARY SCHOOL")).toBeInTheDocument();
    expect(screen.getByText("250 m")).toBeInTheDocument();
    expect(screen.getByText("BEDOK GREEN PRIMARY SCHOOL")).toBeInTheDocument();
    expect(screen.getByText("450 m")).toBeInTheDocument();
    expect(screen.getByText("OPERA ESTATE PRIMARY SCHOOL")).toBeInTheDocument();
    expect(screen.getByText("600 m")).toBeInTheDocument();
  });

  it("renders percentile sections when comparison data is available", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          remainingLeaseMin={null}
          selectedBlock={mockBlock}
          detail={null}
          comparison={mockComparison}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
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
          remainingLeaseMin={null}
          selectedBlock={mockBlock}
          detail={null}
          comparison={null}
          isLoading={false}
          isComparisonLoading={true}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
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
          remainingLeaseMin={null}
          selectedBlock={mockBlock}
          detail={null}
          comparison={null}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
        />
      </I18nProvider>
    );

    // Check that fallback messages are shown
    expect(screen.getByText("Amenity comparison data not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Market percentile data not available yet.")).toBeInTheDocument();
  });

  it("renders similar blocks empty state when no candidates are available", () => {
    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={mockComparison}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          remainingLeaseMin={null}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
        />
      </I18nProvider>
    );

    expect(screen.getByText("Similar Blocks")).toBeInTheDocument();
    expect(
      screen.getByText("Nearby or comparable alternatives based on flat type, price, lease, and MRT access."),
    ).toBeInTheDocument();
    expect(screen.getByText("No similar blocks found.")).toBeInTheDocument();
  });

  it("renders similar block cards and selects a block when clicked", () => {
    const onSelectBlock = vi.fn();

    render(
      <I18nProvider>
        <DetailDrawer
          selectedBlock={mockBlock}
          detail={null}
          comparison={mockComparison}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          remainingLeaseMin={null}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[mockBlock, similarBlock]}
          onSelectBlock={onSelectBlock}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "View block 102 BEDOK NTH AVE 4" }));
    expect(onSelectBlock).toHaveBeenCalledWith("similar-block");
  });

  it("shows copied feedback only after clipboard write succeeds", async () => {
    render(
      <I18nProvider>
        <DetailDrawer
          remainingLeaseMin={null}
          selectedBlock={mockBlock}
          detail={null}
          comparison={null}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
        />
      </I18nProvider>
    );

    const copyButton = screen.getByRole("button", { name: "Copy address to clipboard" });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("101 BEDOK NTH AVE 4 Singapore");
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: "Address copied to clipboard" })
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByRole("button", { name: "Copy address to clipboard" })
    ).toBeInTheDocument();
  });

  it("keeps copy feedback hidden when clipboard write fails", async () => {
    writeText.mockRejectedValueOnce(new Error("Clipboard blocked"));

    render(
      <I18nProvider>
        <DetailDrawer
          remainingLeaseMin={null}
          selectedBlock={mockBlock}
          detail={null}
          comparison={null}
          isLoading={false}
          isComparisonLoading={false}
          isSaved={false}
          onClose={() => {}}
          onToggleShortlist={() => {}}
          allBlocks={[]}
          onSelectBlock={() => {}}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy address to clipboard" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("101 BEDOK NTH AVE 4 Singapore");
    expect(
      screen.queryByRole("button", { name: "Address copied to clipboard" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy address to clipboard" })
    ).toBeInTheDocument();
  });
});
