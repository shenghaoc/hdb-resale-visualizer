import { describe, expect, it } from "vite-plus/test";
import {
  addressDetailSchema,
  comparisonArtifactSchema,
  manifestSchema,
} from "@/shared/lib/dataSchemas";
import { getMaxLeaseCommenceYear, MIN_LEASE_COMMENCE_YEAR } from "@/shared/lib/constants";

function validAddressDetail() {
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
      nearestMrt: {
        stationName: "ANG MO KIO MRT STATION",
        distanceMeters: 400,
        walkingTimeSeconds: 300,
      },
      nearbyMrts: [],
      postalCode: "560123",
      priceIqr: [550000, 650000],
      pricePerSqftMedian: 599,
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
        pricePerSqft: 599,
      },
    ],
    monthlyTrend: [
      {
        month: "2026-03",
        medianPrice: 600000,
        transactionCount: 1,
        medianPricePerSqm: 6452,
      },
    ],
  };
}

function validComparisonArtifact() {
  return {
    addressKey: "ang-mo-kio-123a",
    town: "ANG MO KIO",
    flatType: "4 ROOM",
    amenities: {
      primarySchoolsWithin1km: 2,
      primarySchoolsWithin2km: 5,
      nearestPrimarySchoolMeters: 300,
      nearestPrimarySchools: [
        {
          name: "ANG MO KIO PRIMARY SCHOOL",
          distanceMeters: 300,
          coordinates: { lat: 1.37, lng: 103.84 },
        },
      ],
      hawkerCentresWithin1km: 1,
      nearestHawkerCentreMeters: 500,
      supermarketsWithin1km: 3,
      nearestSupermarketMeters: 200,
      parksWithin1km: 2,
      nearestParkMeters: 150,
    },
    percentileRanks: {
      pricePercentile: 75,
      pricePerSqmPercentile: 80,
      leasePercentile: 60,
      mrtDistancePercentile: 45,
      transactionCountPercentile: 90,
      recencyPercentile: 85,
    },
    generatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("addressDetailSchema", () => {
  it("accepts a complete block-detail payload", () => {
    expect(addressDetailSchema.safeParse(validAddressDetail()).success).toBe(true);
  });

  it("rejects coordinates outside Singapore", () => {
    const payload = validAddressDetail();
    payload.summary.coordinates = { lat: 0, lng: 0 };
    expect(addressDetailSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a lease commence year below the HDB floor", () => {
    const payload = validAddressDetail();
    payload.summary.leaseCommenceRange = [MIN_LEASE_COMMENCE_YEAR - 1, 1990];
    expect(addressDetailSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a lease commence year beyond the allowed future offset", () => {
    const payload = validAddressDetail();
    const tooFar = getMaxLeaseCommenceYear() + 1;
    payload.summary.leaseCommenceRange = [1990, tooFar];
    payload.recentTransactions[0]!.leaseCommenceDate = tooFar;
    expect(addressDetailSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects calendar-invalid months", () => {
    const payload = validAddressDetail();
    payload.summary.latestMonth = "2026-13";
    expect(addressDetailSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects non-positive prices and areas", () => {
    const payload = validAddressDetail();
    payload.summary.medianPrice = 0;
    payload.recentTransactions[0]!.floorAreaSqm = -1;
    expect(addressDetailSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a missing recentTransactions array", () => {
    const { recentTransactions: _dropped, ...rest } = validAddressDetail();
    expect(addressDetailSchema.safeParse(rest).success).toBe(false);
  });
});

describe("comparisonArtifactSchema", () => {
  it("accepts a complete comparison artifact", () => {
    expect(comparisonArtifactSchema.safeParse(validComparisonArtifact()).success).toBe(true);
  });

  it("rejects school coordinates outside Singapore", () => {
    const payload = validComparisonArtifact();
    payload.amenities.nearestPrimarySchools[0]!.coordinates = { lat: 51.5, lng: -0.1 };
    expect(comparisonArtifactSchema.safeParse(payload).success).toBe(false);
  });
});

describe("manifestSchema", () => {
  it("rejects an inverted data window", () => {
    const parsed = manifestSchema.safeParse({
      schemaVersion: "2.0.0",
      dataWindow: { minMonth: "2026-01", maxMonth: "2020-01" },
      filterOptions: { towns: ["A"], flatTypes: ["4 ROOM"], flatModels: ["Model A"] },
      counts: { blocks: 1, transactions: 1, towns: 1, mrtStations: 1 },
    });
    expect(parsed.success).toBe(false);
  });
});
