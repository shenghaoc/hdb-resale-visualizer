import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";
import {
  useBlockDetailController,
  type UseBlockDetailControllerOptions,
} from "@/features/block-detail/useBlockDetailController";
import type {
  AddressDetail,
  AddressDetailTransaction,
  BlockSummary,
  ComparisonArtifact,
  FilterState,
} from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import { DEFAULT_SEARCH_PROFILE } from "@/features/search-profile/searchProfile";

function makeBlock(addressKey: string, overrides: Partial<BlockSummary> = {}): BlockSummary {
  return {
    addressKey,
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 545_000,
    pricePerSqmMedian: 5924,
    transactionCount: 10,
    floorAreaRange: [92, 92],
    leaseCommenceRange: [1980, 1990],
    latestMonth: "2026-01",
    availableDateRange: ["2024-01", "2026-01"],
    flatTypes: ["4 ROOM", "5 ROOM"],
    flatModels: ["MODEL A"],
    flatTypeCohorts: {
      "4 ROOM": {
        transactionCount: 4,
        latestMonth: "2026-01",
        floorAreaRange: [90, 95],
        flatModels: ["MODEL A"],
      },
      "5 ROOM": {
        transactionCount: 6,
        latestMonth: "2025-11",
        floorAreaRange: [110, 120],
        flatModels: ["IMPROVED"],
      },
    },
    nearestMrt: {
      stationName: "BEDOK NORTH MRT STATION",
      distanceMeters: 400,
      walkingTimeSeconds: 320,
    },
    nearbyMrts: [
      { stationName: "BEDOK NORTH MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
    ],
    ...overrides,
  };
}

function makeTransaction(
  id: string,
  resalePrice: number,
  flatType = "4 ROOM",
): AddressDetailTransaction {
  return {
    id,
    month: "2025-01",
    flatType,
    storeyRange: "10 TO 12",
    floorAreaSqm: 93,
    flatModel: "MODEL A",
    leaseCommenceDate: 1980,
    remainingLease: "53 years 0 months",
    resalePrice,
    pricePerSqm: resalePrice / 93,
    pricePerSqft: resalePrice / (93 * 10.7639),
  };
}

function makeDetail(summary: BlockSummary): AddressDetail {
  const monthlyTrend = Array.from({ length: 25 }, (_, index) => {
    const year = 2024 + Math.floor(index / 12);
    const month = (index % 12) + 1;
    const monthLabel = `${year}-${String(month).padStart(2, "0")}`;
    return {
      month: monthLabel,
      medianPrice: 500_000 + index * 2_000,
      transactionCount: 5,
      medianPricePerSqm: 5_000 + index * 20,
    };
  });

  return {
    summary: {
      ...summary,
      priceIqr: [500_000, 580_000],
      pricePerSqftMedian: 550,
    },
    recentTransactions: [
      makeTransaction("a", 500_000),
      makeTransaction("b", 510_000),
      makeTransaction("c", 520_000),
      makeTransaction("d", 530_000),
      makeTransaction("e", 540_000),
      makeTransaction("high", 900_000),
      makeTransaction("five-room", 700_000, "5 ROOM"),
    ],
    monthlyTrend,
  };
}

const sourceBlock = makeBlock("source");
const similarBlock = makeBlock("similar", {
  block: "102",
  medianPrice: 552_000,
  transactionCount: 8,
});
const detail = makeDetail(sourceBlock);
const comparison: ComparisonArtifact = {
  addressKey: "source",
  town: "BEDOK",
  flatType: "4 ROOM",
  amenities: {
    primarySchoolsWithin1km: 2,
    primarySchoolsWithin2km: 5,
    nearestPrimarySchoolMeters: 300,
    nearestPrimarySchools: [],
    hawkerCentresWithin1km: 1,
    nearestHawkerCentreMeters: 500,
    supermarketsWithin1km: 1,
    nearestSupermarketMeters: 400,
    parksWithin1km: 1,
    nearestParkMeters: 700,
  },
  percentileRanks: {
    pricePercentile: 40,
    pricePerSqmPercentile: 45,
    leasePercentile: 50,
    mrtDistancePercentile: 50,
    transactionCountPercentile: 60,
    recencyPercentile: 70,
  },
  generatedAt: "2026-01-01T00:00:00.000Z",
};

const searchProfile: SearchProfile = {
  ...DEFAULT_SEARCH_PROFILE,
  age: 35,
  coApplicantAge: 33,
  cpfOABalance: 120_000,
  monthlyIncome: 9_000,
};

const filters: FilterState = {
  ...DEFAULT_FILTERS,
  town: "BEDOK",
  selectedAddressKey: "source",
  budgetMin: 400_000,
  budgetMax: 600_000,
  remainingLeaseMin: 50,
  mrtMax: 500,
};

type TestOptions = UseBlockDetailControllerOptions;

function renderController(options: TestOptions) {
  return renderHook(() => useBlockDetailController(options));
}

function makeOptions(overrides: Partial<TestOptions> = {}): TestOptions {
  return {
    selectedBlock: sourceBlock,
    detail,
    comparison,
    allBlocks: [sourceBlock, similarBlock],
    remainingLeaseMin: filters.remainingLeaseMin,
    referenceMonth: "2026-01",
    filters,
    searchProfile,
    ...overrides,
  };
}

function installClipboard(result: "resolve" | "reject" = "resolve") {
  const writeText =
    result === "resolve"
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("useBlockDetailController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/");
    installClipboard();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "startViewTransition");
  });

  it("returns the current-summary fallback, open state, exact share URL, and analyses", () => {
    const { result } = renderController(makeOptions({ detail: null }));

    expect(result.current.currentSummary).toBe(sourceBlock);
    expect(result.current.isDrawerOpen).toBe(true);
    expect(result.current.dataQualityTag).toBe("strong");
    expect(result.current.blockShareUrl).toBe(
      `${window.location.origin}/?town=BEDOK&selected=source&v=1`,
    );
  });

  it("keeps selected-flat-type detail metrics and fallback provenance explicit", () => {
    const typeSpecificBlock = makeBlock("typed", {
      medianPriceByFlatType: { "4 ROOM": 480_000 },
      medianPricePerSqmByFlatType: { "4 ROOM": 6_200 },
    });
    const typeFilters = {
      ...filters,
      flatType: "4 ROOM",
      selectedAddressKey: "typed",
    };
    const { result, rerender } = renderHook(
      ({ selectedBlock }: { selectedBlock: BlockSummary }) =>
        useBlockDetailController(
          makeOptions({
            selectedBlock,
            detail: null,
            comparison: null,
            allBlocks: [selectedBlock],
            filters: typeFilters,
          }),
        ),
      { initialProps: { selectedBlock: typeSpecificBlock } },
    );

    expect(result.current.effectiveMedianPrice).toBe(480_000);
    expect(result.current.effectivePricePerSqmMedian).toBe(6_200);
    expect(result.current.medianPriceResolution).toMatchObject({
      flatType: "4 ROOM",
      isTypeSpecific: true,
    });
    expect(result.current.pricePerSqmResolution).toMatchObject({
      flatType: "4 ROOM",
      isTypeSpecific: true,
    });
    expect(result.current.cohortResolution).toMatchObject({
      flatType: "4 ROOM",
      isTypeSpecific: true,
      transactionCount: 4,
      latestMonth: "2026-01",
      floorAreaRange: [90, 95],
      flatModels: ["MODEL A"],
    });

    const fallbackBlock = makeBlock("fallback", {
      medianPriceByFlatType: undefined,
      medianPricePerSqmByFlatType: undefined,
    });
    rerender({ selectedBlock: fallbackBlock });

    expect(result.current.effectiveMedianPrice).toBe(fallbackBlock.medianPrice);
    expect(result.current.medianPriceResolution?.isTypeSpecific).toBe(false);
    expect(result.current.pricePerSqmResolution?.isTypeSpecific).toBe(false);
  });

  it("uses the selected flat-type cohort for the detail quality tag", () => {
    const lowEvidenceType = makeBlock("typed-low-evidence", {
      transactionCount: 20,
      latestMonth: "2026-01",
      flatTypeCohorts: {
        "4 ROOM": {
          transactionCount: 1,
          latestMonth: "2026-01",
          floorAreaRange: [90, 95],
          flatModels: ["MODEL A"],
        },
      },
    });
    const { result } = renderController(
      makeOptions({
        selectedBlock: lowEvidenceType,
        detail: null,
        comparison: null,
        allBlocks: [lowEvidenceType],
        filters: {
          ...filters,
          flatType: "4 ROOM",
          selectedAddressKey: lowEvidenceType.addressKey,
        },
      }),
    );

    expect(result.current.dataQualityTag).toBe("weak");
  });

  it("owns derived block analysis without changing the existing algorithms", () => {
    const { result } = renderController(
      makeOptions({
        detail: makeDetail({ ...sourceBlock, leaseCommenceRange: [1970, 1970] }),
      }),
    );

    expect(result.current.explanationCodes).toEqual([
      "high-transaction-volume",
      "below-town-median-price",
      "within-mrt-threshold",
      "within-budget",
    ]);
    expect(result.current.nearbyStations).toHaveLength(1);
    expect(result.current.similarBlocks.map((block) => block.addressKey)).toEqual(["similar"]);
    expect(result.current.comparableRange).toMatchObject({
      minPrice: 552_000,
      maxPrice: 552_000,
      sampleSize: 1,
    });
    expect(result.current.affordabilityVerdict?.status).not.toBe("unknown");
    expect(result.current.trajectory?.direction).toBe("up");
    expect(result.current.leaseSignals.map((signal) => signal.key)).toEqual([
      "lease.signal.short",
      "lease.signal.oldCommence",
      "lease.signal.belowFilter",
    ]);
    expect(result.current.leaseFinancing?.status).toBe("prorated");
    expect(result.current.flatTypeLadder.map((entry) => entry.flatType)).toEqual([
      "4 ROOM",
      "5 ROOM",
    ]);
    expect(result.current.recentTransactionOutliers.get("high")?.direction).toBe("high");
    expect(result.current.peakMonthInView).toBe("2026-01");
  });

  it("keeps peer evidence available from loaded detail when the filtered corpus drops selection", () => {
    const { result } = renderController(
      makeOptions({
        selectedBlock: null,
        detail,
        comparison: null,
        allBlocks: [sourceBlock, similarBlock],
      }),
    );

    expect(result.current.currentSummary).toEqual(detail.summary);
    expect(result.current.similarBlocks.map((block) => block.addressKey)).toEqual(["similar"]);
    expect(result.current.comparableRange).toMatchObject({
      minPrice: 552_000,
      maxPrice: 552_000,
      medianPrice: 552_000,
      sampleSize: 1,
    });
  });

  it("does not let the selected block price choose its own benchmark peers or range", () => {
    const peerA = makeBlock("peer-a", {
      block: "102",
      medianPrice: 520_000,
      pricePerSqmMedian: 5_700,
      leaseCommenceRange: [1982, 1982],
    });
    const peerB = makeBlock("peer-b", {
      block: "103",
      medianPrice: 580_000,
      pricePerSqmMedian: 6_100,
      leaseCommenceRange: [1988, 1988],
    });
    const repricedSource = {
      ...sourceBlock,
      medianPrice: 950_000,
      pricePerSqmMedian: 10_200,
    };
    const { result, rerender } = renderHook(
      ({ selectedBlock }: { selectedBlock: BlockSummary }) =>
        useBlockDetailController(
          makeOptions({
            selectedBlock,
            detail: null,
            comparison: null,
            allBlocks: [selectedBlock, peerA, peerB],
          }),
        ),
      { initialProps: { selectedBlock: sourceBlock } },
    );
    const initialRange = result.current.comparableRange;
    expect(initialRange).not.toBeNull();
    if (!initialRange) {
      throw new Error("Expected benchmark range before repricing");
    }

    rerender({ selectedBlock: repricedSource });

    expect(result.current.comparableRange).toMatchObject({
      minPrice: initialRange.minPrice,
      maxPrice: initialRange.maxPrice,
      medianPrice: initialRange.medianPrice,
      sampleSize: initialRange.sampleSize,
    });
  });

  it("does not show an affordability verdict for a partial finance profile", () => {
    const { result } = renderController(
      makeOptions({
        searchProfile: {
          ...DEFAULT_SEARCH_PROFILE,
          monthlyIncome: 9_000,
          cpfOABalance: null,
          age: null,
        },
      }),
    );

    expect(result.current.affordabilityVerdict).toBeNull();
  });

  it("keeps default tab/range and slices trend points through the controller", () => {
    const { result } = renderController(makeOptions());

    expect(result.current.activeTab).toBe("overview");
    expect(result.current.trendRange).toBe("5y");
    expect(result.current.trendPoints).toHaveLength(25);

    act(() => {
      result.current.setTrendRange("2y");
    });
    expect(result.current.trendRange).toBe("2y");
    expect(result.current.trendPoints).toHaveLength(24);
    expect(result.current.peakMonthInView).toBe("2026-01");
  });

  it("preserves the View Transitions branch and fallback tab command", () => {
    const { result } = renderController(makeOptions());

    act(() => {
      result.current.handleTabChange("trends");
    });
    expect(result.current.activeTab).toBe("trends");

    const startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return {};
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });

    act(() => {
      result.current.handleTabChange("history");
    });
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(result.current.activeTab).toBe("history");
  });

  it("copies the address, replaces the copied timeout, handles failure, and cleans up", async () => {
    const writeText = installClipboard();
    const { result, unmount } = renderController(makeOptions());

    await act(async () => {
      result.current.handleCopyAddress();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("101 BEDOK NTH AVE 4 Singapore");
    expect(result.current.isCopied).toBe(true);

    await act(async () => {
      result.current.handleCopyAddress();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.isCopied).toBe(false);

    installClipboard("reject");
    await act(async () => {
      result.current.handleCopyAddress();
      await Promise.resolve();
    });
    expect(result.current.isCopied).toBe(false);

    installClipboard();
    act(() => {
      result.current.handleCopyAddress();
    });
    unmount();
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isCopied).toBe(false);
  });

  it("uses no financing result when the lease commencement year is missing", () => {
    const malformed = makeBlock("malformed", {
      leaseCommenceRange: [] as unknown as [number, number],
    });
    const { result } = renderController(
      makeOptions({
        selectedBlock: malformed,
        detail: null,
        comparison: null,
        allBlocks: [malformed],
        filters: { ...DEFAULT_FILTERS, selectedAddressKey: "malformed" },
      }),
    );

    expect(result.current.leaseFinancing).toBeNull();
  });
});
