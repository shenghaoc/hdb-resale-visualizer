import { describe, expect, it } from "vite-plus/test";
import type { AddressDetail } from "@/types/data";
import type { ComparableTransaction, ListingComparableSet } from "../../shared/comparable-engine";
import {
  buildComparableRequestBody,
  buildDisplayComparables,
  buildListingAdjustmentMeta,
  deriveComparableQualityTag,
  deriveEvidenceCaveats,
  deriveListingCheckResult,
  type ListingAdjustmentMeta,
  type ListingComparableResponse,
} from "@/features/listing-check/listingCheckAnalysis";

function makeDetail(overrides: Partial<AddressDetail["summary"]> = {}): AddressDetail {
  return {
    summary: {
      addressKey: "ang-mo-kio-123a",
      town: "ANG MO KIO",
      block: "123A",
      streetName: "ANG MO KIO AVE 1",
      displayName: null,
      coordinates: { lat: 1.37, lng: 103.84 },
      medianPrice: 600000,
      pricePerSqmMedian: 6452,
      transactionCount: 4,
      floorAreaRange: [90, 96],
      leaseCommenceRange: [1990, 1990],
      latestMonth: "2026-04",
      availableDateRange: ["2023-04", "2026-04"],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: null,
      nearbyMrts: [],
      postalCode: null,
      priceIqr: [550000, 650000],
      pricePerSqftMedian: null,
      ...overrides,
    },
    recentTransactions: [
      {
        id: "tx-1",
        month: "2026-03",
        flatType: "4 ROOM",
        storeyRange: "07 TO 09",
        floorAreaSqm: 93,
        flatModel: "MODEL A",
        leaseCommenceDate: 1990,
        remainingLease: "63 years",
        resalePrice: 600000,
        pricePerSqm: 6452,
        pricePerSqft: null,
      },
    ],
    monthlyTrend: [],
  };
}

function makeComparable(overrides: Partial<ComparableTransaction> = {}): ComparableTransaction {
  return {
    transactionId: "cmp-1",
    month: "2026-02",
    town: "ANG MO KIO",
    block: "123A",
    streetName: "ANG MO KIO AVE 1",
    flatType: "4 ROOM",
    storeyRange: "07 TO 09",
    floorAreaSqm: 93,
    leaseCommenceDate: 1990,
    resalePrice: 580000,
    pricePerSqm: 6237,
    similarity: 0.95,
    matchReasons: ["Same flat type", "Similar floor area (±5%)", "Similar storey"],
    ...overrides,
  };
}

function makeComparableSet(
  overrides: Partial<ListingComparableSet> & {
    comparables?: ComparableTransaction[];
  } = {},
): ListingComparableSet {
  const { comparables: overrideComparables, caveats: overrideCaveats, ...rest } = overrides;
  const comparables = overrideComparables ?? [
    makeComparable(),
    makeComparable({
      transactionId: "cmp-2",
      month: "2026-01",
      block: "124",
      streetName: "ANG MO KIO AVE 1",
      resalePrice: 610000,
      pricePerSqm: 6559,
      matchReasons: ["Same flat type", "Similar floor area (±5%)"],
    }),
    makeComparable({
      transactionId: "cmp-3",
      month: "2025-12",
      block: "200",
      streetName: "ANG MO KIO AVE 3",
      town: "ANG MO KIO",
      resalePrice: 590000,
      pricePerSqm: 6344,
      matchReasons: ["Same flat type"],
    }),
  ];
  return {
    sameBlockCount: 1,
    sameStreetCount: 2,
    sameTownCount: 3,
    newestComparableAgeMonths: 2,
    widenedSearch: false,
    caveats: overrideCaveats ?? ["SAMPLE_API_CAVEAT"],
    ...rest,
    comparables,
  };
}

describe("listingCheckAnalysis", () => {
  it("returns null without comparables", () => {
    const result = deriveListingCheckResult({
      comparableSet: null,
      detail: makeDetail(),
      askingPrice: 650000,
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      adjustmentMeta: null,
    });
    expect(result).toBeNull();
  });

  it("returns null without asking price", () => {
    const result = deriveListingCheckResult({
      comparableSet: makeComparableSet(),
      detail: makeDetail(),
      askingPrice: null,
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      adjustmentMeta: null,
    });
    expect(result).toBeNull();
  });

  it("uses time-adjusted comparable prices when adjustment was applied", () => {
    const comparableSet = makeComparableSet({
      comparables: [
        makeComparable({ transactionId: "adj-1", resalePrice: 500000, pricePerSqm: 5000 }),
        makeComparable({ transactionId: "adj-2", resalePrice: 520000, pricePerSqm: 5200 }),
        makeComparable({ transactionId: "adj-3", resalePrice: 540000, pricePerSqm: 5400 }),
      ],
    });
    const adjustmentMeta: ListingAdjustmentMeta = {
      adjustmentApplied: true,
      adjustmentCaveats: ["TIME_ADJUSTED"],
      adjustmentMap: new Map([
        [
          "adj-1",
          {
            adjustedResalePrice: 700000,
            adjustedPricePerSqm: 7000,
            adjustmentLabel: null,
          },
        ],
        [
          "adj-2",
          {
            adjustedResalePrice: 720000,
            adjustedPricePerSqm: 7200,
            adjustmentLabel: null,
          },
        ],
        [
          "adj-3",
          {
            adjustedResalePrice: 740000,
            adjustedPricePerSqm: 7400,
            adjustmentLabel: null,
          },
        ],
      ]),
    };

    const result = deriveListingCheckResult({
      comparableSet,
      detail: makeDetail(),
      askingPrice: 730000,
      floorAreaSqm: 100,
      leaseCommenceYear: 1990,
      adjustmentMeta,
    });

    expect(result).not.toBeNull();
    // Median of adjusted prices (700k, 720k, 740k) is 720k
    expect(result!.assessment.summary.medianPrice).toBe(720000);
  });

  it("keeps raw prices available on display comparables when adjustment applied", () => {
    const comparableSet = makeComparableSet({
      comparables: [
        makeComparable({ transactionId: "raw-1", resalePrice: 500000, pricePerSqm: 5000 }),
      ],
    });
    const adjustmentMeta: ListingAdjustmentMeta = {
      adjustmentApplied: true,
      adjustmentCaveats: [],
      adjustmentMap: new Map([
        [
          "raw-1",
          {
            adjustedResalePrice: 600000,
            adjustedPricePerSqm: 6000,
            adjustmentLabel: null,
          },
        ],
      ]),
    };

    const display = buildDisplayComparables(comparableSet, adjustmentMeta);
    expect(display).toHaveLength(1);
    expect(display[0]!.resalePrice).toBe(600000);
    expect(display[0]!.rawResalePrice).toBe(500000);
    expect(display[0]!.rawPricePerSqm).toBe(5000);
  });

  it("carries raw metadata for unadjusted rows when adjustment is only partial", () => {
    const comparableSet = makeComparableSet({
      comparables: [
        makeComparable({ transactionId: "has-adj", resalePrice: 500000, pricePerSqm: 5000 }),
        makeComparable({ transactionId: "no-adj", resalePrice: 510000, pricePerSqm: 5100 }),
      ],
    });
    const adjustmentMeta: ListingAdjustmentMeta = {
      adjustmentApplied: true,
      adjustmentCaveats: [],
      adjustmentMap: new Map([
        [
          "has-adj",
          {
            adjustedResalePrice: 600000,
            adjustedPricePerSqm: 6000,
            adjustmentLabel: null,
          },
        ],
      ]),
    };

    const display = buildDisplayComparables(comparableSet, adjustmentMeta);
    const unadjusted = display.find((c) => c.transactionId === "no-adj");
    expect(unadjusted?.resalePrice).toBe(510000);
    expect(unadjusted?.rawResalePrice).toBe(510000);
    expect(unadjusted?.rawPricePerSqm).toBe(5100);
  });

  it("preserves same-block/street/town and match-reason counts in confidence inputs", () => {
    const detail = makeDetail();
    const comparableSet = makeComparableSet();
    const result = deriveListingCheckResult({
      comparableSet,
      detail,
      askingPrice: 600000,
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      adjustmentMeta: null,
    });

    expect(result).not.toBeNull();
    expect(result!.confidence.input.comparableCount).toBe(3);
    expect(result!.confidence.input.sameBlockCount).toBe(1);
    expect(result!.confidence.input.sameStreetCount).toBe(2);
    expect(result!.confidence.input.sameTownCount).toBe(3);
    expect(result!.confidence.input.flatTypeMatchCount).toBe(3);
    expect(result!.confidence.input.floorAreaMatchCount).toBe(2);
    expect(result!.confidence.input.storeyMatchCount).toBe(1);
  });

  it("includes both API caveats and adjustment caveats", () => {
    const result = deriveListingCheckResult({
      comparableSet: makeComparableSet({
        caveats: ["Search widened to the same street due to sparse block data."],
      }),
      detail: makeDetail(),
      askingPrice: 600000,
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      adjustmentMeta: {
        adjustmentApplied: true,
        adjustmentCaveats: [
          "Time adjustment could not be applied for some transactions due to insufficient trend data.",
        ],
        adjustmentMap: new Map(),
      },
    });

    expect(result).not.toBeNull();
    const codes = result!.caveats.map((c) => c.code);
    expect(codes).toContain("WIDENED_TO_STREET");
    expect(codes).toContain("TIME_ADJUSTMENT_UNAVAILABLE");
  });

  it("feeds comparable lease years into lease caveats", () => {
    const result = deriveListingCheckResult({
      comparableSet: makeComparableSet({
        comparables: [
          makeComparable({ transactionId: "y1", leaseCommenceDate: 1975 }),
          makeComparable({ transactionId: "y2", leaseCommenceDate: 1976 }),
          makeComparable({ transactionId: "y3", leaseCommenceDate: 1977 }),
        ],
      }),
      detail: makeDetail(),
      askingPrice: 600000,
      floorAreaSqm: 93,
      leaseCommenceYear: 2015,
      adjustmentMeta: null,
    });

    expect(result).not.toBeNull();
    expect(result!.caveats.map((c) => c.code)).toContain("LEASE_MISMATCH");
  });

  it("quality tag receives confidence, widened-search, recency, and caveat information", () => {
    const comparableSet = makeComparableSet({
      widenedSearch: true,
      newestComparableAgeMonths: 2,
      caveats: [],
    });
    const result = deriveListingCheckResult({
      comparableSet,
      detail: makeDetail(),
      askingPrice: 600000,
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      adjustmentMeta: null,
    });

    const tag = deriveComparableQualityTag(result, comparableSet);
    expect(tag).toBe("widened");
  });

  it("does not mutate input API objects", () => {
    const comparableSet = makeComparableSet({
      comparables: [makeComparable({ transactionId: "mut-1", resalePrice: 500000 })],
    });
    const originalPrice = comparableSet.comparables[0]!.resalePrice;
    const originalCaveats = [...comparableSet.caveats];

    const response: ListingComparableResponse = {
      ...comparableSet,
      adjustmentApplied: true,
      adjustmentCaveats: ["X"],
      comparables: [
        {
          ...comparableSet.comparables[0]!,
          adjustedResalePrice: 600000,
          adjustedPricePerSqm: 6000,
          adjustmentLabel: null,
        },
      ],
    };

    const meta = buildListingAdjustmentMeta(response);
    buildDisplayComparables(comparableSet, meta);
    deriveListingCheckResult({
      comparableSet,
      detail: makeDetail(),
      askingPrice: 600000,
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      adjustmentMeta: meta,
    });

    expect(comparableSet.comparables[0]!.resalePrice).toBe(originalPrice);
    expect(comparableSet.caveats).toEqual(originalCaveats);
    expect(response.comparables![0]!.resalePrice).toBe(500000);
  });

  it("builds evidence caveats from result messages when available", () => {
    const comparableSet = makeComparableSet({ caveats: ["API_ONLY"] });
    const result = deriveListingCheckResult({
      comparableSet,
      detail: makeDetail(),
      askingPrice: 600000,
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      adjustmentMeta: null,
    });
    const evidence = deriveEvidenceCaveats(result, comparableSet, null);
    if (result && result.caveats.length > 0) {
      expect(evidence).toEqual(result.caveats.map((c) => c.message));
    } else {
      expect(evidence).toContain("API_ONLY");
    }
  });

  it("uses median floor-area midpoint when building request body without floor area", () => {
    const body = buildComparableRequestBody({
      detail: makeDetail({ floorAreaRange: [90, 96] }),
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      floorAreaSqm: null,
      leaseCommenceYear: 1990,
      referenceMonth: "2026-04",
    });
    expect(body).not.toBeNull();
    expect(body!.floorAreaSqm).toBe(93);
  });
});
