import { describe, expect, it } from "vitest";
import { buildArtifacts, makeAddressKey } from "../../scripts/lib/pipeline";
import type { AmenityLocation, SchoolLocation } from "../../scripts/lib/pipeline";

describe("comparison artifacts", () => {
  const alphaKey = makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10");
  const betaKey = makeAddressKey("BEDOK", "101", "BEDOK NTH AVE 4");

  const transactions = [
    {
      id: "alpha-1",
      month: "2026-01",
      town: "ANG MO KIO",
      flatType: "3 ROOM",
      block: "406",
      streetName: "ANG MO KIO AVE 10",
      storeyRange: "10 TO 12",
      floorAreaSqm: 67,
      flatModel: "IMPROVED",
      leaseCommenceDate: 1979,
      remainingLease: "52 years",
      resalePrice: 372000,
      pricePerSqm: 5552.24,
      pricePerSqft: 515.82,
      addressKey: alphaKey,
    },
    {
      id: "alpha-2",
      month: "2026-02",
      town: "ANG MO KIO",
      flatType: "3 ROOM",
      block: "406",
      streetName: "ANG MO KIO AVE 10",
      storeyRange: "07 TO 09",
      floorAreaSqm: 67,
      flatModel: "IMPROVED",
      leaseCommenceDate: 1979,
      remainingLease: "52 years",
      resalePrice: 380000,
      pricePerSqm: 5671.64,
      pricePerSqft: 526.92,
      addressKey: alphaKey,
    },
    {
      id: "beta-1",
      month: "2026-02",
      town: "BEDOK",
      flatType: "4 ROOM",
      block: "101",
      streetName: "BEDOK NTH AVE 4",
      storeyRange: "04 TO 06",
      floorAreaSqm: 92,
      flatModel: "MODEL A",
      leaseCommenceDate: 1983,
      remainingLease: "56 years",
      resalePrice: 545000,
      pricePerSqm: 5923.91,
      pricePerSqft: 550.35,
      addressKey: betaKey,
    },
  ];

  const propertyInfo = [
    {
      addressKey: alphaKey,
      block: "406",
      streetName: "ANG MO KIO AVE 10",
      maxFloorLevel: 12,
      yearCompleted: 1979,
      totalDwellingUnits: 142,
    },
    {
      addressKey: betaKey,
      block: "101",
      streetName: "BEDOK NTH AVE 4",
      maxFloorLevel: 13,
      yearCompleted: 1983,
      totalDwellingUnits: 128,
    },
  ];

  const mrtExits = [
    {
      stationName: "ANG MO KIO MRT STATION",
      lat: 1.3691,
      lng: 103.8491,
    },
    {
      stationName: "BEDOK NORTH MRT STATION",
      lat: 1.3347,
      lng: 103.9188,
    },
  ];

  const geocodes = {
    [alphaKey]: {
      lat: 1.3692,
      lng: 103.8492,
      postalCode: "560406",
      displayName: "BLK 406 ANG MO KIO AVE 10",
      searchValue: "406 ANG MO KIO AVE 10 SINGAPORE",
    },
    [betaKey]: {
      lat: 1.3339,
      lng: 103.9372,
      postalCode: "460101",
      displayName: "BEDOK NORTH GREEN",
      searchValue: "101 BEDOK NTH AVE 4 SINGAPORE",
    },
  };

  const schools: SchoolLocation[] = [
    {
      name: "ANG MO KIO PRIMARY SCHOOL",
      lat: 1.3700,
      lng: 103.8500,
      mainLevelCode: "PRIMARY",
    },
    {
      name: "ANDERSON PRIMARY SCHOOL",
      lat: 1.3693,
      lng: 103.8493,
      mainLevelCode: "PRIMARY",
    },
    {
      name: "BEDOK PRIMARY SCHOOL",
      lat: 1.3340,
      lng: 103.9380,
      mainLevelCode: "PRIMARY",
    },
  ];

  const hawkers: AmenityLocation[] = [
    {
      name: "ANG MO KIO HAWKER CENTRE",
      lat: 1.3695,
      lng: 103.8495,
    },
  ];

  const supermarkets: AmenityLocation[] = [
    {
      name: "NTUC FAIRPRICE ANG MO KIO",
      lat: 1.3690,
      lng: 103.8490,
    },
  ];

  const parks: AmenityLocation[] = [
    {
      name: "ANG MO KIO PARK",
      lat: 1.3700,
      lng: 103.8500,
    },
  ];

  it("generates comparison artifacts with amenity data", () => {
    const artifacts = buildArtifacts({
      transactions,
      propertyInfo,
      mrtExits,
      geocodes,
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    expect(artifacts.comparisons).toBeDefined();
    expect(artifacts.comparisons).toHaveProperty(alphaKey);
    expect(artifacts.comparisons).toHaveProperty(betaKey);
  });

  it("calculates amenity counts within distance thresholds", () => {
    const artifacts = buildArtifacts({
      transactions,
      propertyInfo,
      mrtExits,
      geocodes,
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    const alphaComparison = artifacts.comparisons?.[alphaKey];
    expect(alphaComparison).toBeDefined();
    expect(alphaComparison?.amenities.primarySchoolsWithin1km).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.amenities.primarySchoolsWithin2km).toBeGreaterThanOrEqual(
      alphaComparison?.amenities.primarySchoolsWithin1km ?? 0,
    );
    expect(alphaComparison?.amenities.hawkerCentresWithin1km).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.amenities.supermarketsWithin1km).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.amenities.parksWithin1km).toBeGreaterThanOrEqual(0);
  });

  it("calculates nearest amenity distances", () => {
    const artifacts = buildArtifacts({
      transactions,
      propertyInfo,
      mrtExits,
      geocodes,
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    const alphaComparison = artifacts.comparisons?.[alphaKey];
    // Amenities are close to alpha location, so distances should be small numbers
    expect(alphaComparison?.amenities.nearestPrimarySchoolMeters).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.amenities.nearestPrimarySchools[0]).toMatchObject({
      name: "ANDERSON PRIMARY SCHOOL",
    });
    expect(alphaComparison?.amenities.nearestHawkerCentreMeters).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.amenities.nearestSupermarketMeters).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.amenities.nearestParkMeters).toBeGreaterThanOrEqual(0);
  });

  it("generates percentile ranks for price, lease, and MRT distance", () => {
    const artifacts = buildArtifacts({
      transactions,
      propertyInfo,
      mrtExits,
      geocodes,
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    const alphaComparison = artifacts.comparisons?.[alphaKey];
    expect(alphaComparison?.percentileRanks.pricePercentile).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.percentileRanks.pricePercentile).toBeLessThanOrEqual(100);
    expect(alphaComparison?.percentileRanks.pricePerSqmPercentile).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.percentileRanks.pricePerSqmPercentile).toBeLessThanOrEqual(100);
    expect(alphaComparison?.percentileRanks.leasePercentile).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.percentileRanks.leasePercentile).toBeLessThanOrEqual(100);
    expect(alphaComparison?.percentileRanks.mrtDistancePercentile).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.percentileRanks.mrtDistancePercentile).toBeLessThanOrEqual(100);
    expect(alphaComparison?.percentileRanks.transactionCountPercentile).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.percentileRanks.transactionCountPercentile).toBeLessThanOrEqual(100);
    expect(alphaComparison?.percentileRanks.recencyPercentile).toBeGreaterThanOrEqual(0);
    expect(alphaComparison?.percentileRanks.recencyPercentile).toBeLessThanOrEqual(100);
  });

  it("includes town and flat type in comparison artifacts", () => {
    const artifacts = buildArtifacts({
      transactions,
      propertyInfo,
      mrtExits,
      geocodes,
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    const alphaComparison = artifacts.comparisons?.[alphaKey];
    expect(alphaComparison?.town).toBe("ANG MO KIO");
    expect(alphaComparison?.flatType).toBe("3 ROOM");

    const betaComparison = artifacts.comparisons?.[betaKey];
    expect(betaComparison?.town).toBe("BEDOK");
    expect(betaComparison?.flatType).toBe("4 ROOM");
  });

  it("derives comparison cohort from the latest sorted transaction", () => {
    const mixedKey = makeAddressKey("ANG MO KIO", "500", "ANG MO KIO AVE 5");
    const artifacts = buildArtifacts({
      transactions: [
        {
          ...transactions[0],
          id: "mixed-old",
          month: "2026-01",
          flatType: "5 ROOM",
          block: "500",
          streetName: "ANG MO KIO AVE 5",
          floorAreaSqm: 110,
          resalePrice: 820000,
          pricePerSqm: 7454.55,
          pricePerSqft: 692.09,
          addressKey: mixedKey,
        },
        {
          ...transactions[0],
          id: "mixed-new",
          month: "2026-03",
          flatType: "3 ROOM",
          block: "500",
          streetName: "ANG MO KIO AVE 5",
          resalePrice: 395000,
          pricePerSqm: 5895.52,
          pricePerSqft: 547.25,
          addressKey: mixedKey,
        },
        ...transactions,
      ],
      propertyInfo: [
        ...propertyInfo,
        {
          addressKey: mixedKey,
          block: "500",
          streetName: "ANG MO KIO AVE 5",
          maxFloorLevel: 12,
          yearCompleted: 1980,
          totalDwellingUnits: 120,
        },
      ],
      mrtExits,
      geocodes: {
        ...geocodes,
        [mixedKey]: {
          lat: 1.3693,
          lng: 103.8493,
          postalCode: "560500",
          displayName: "BLK 500 ANG MO KIO AVE 5",
          searchValue: "500 ANG MO KIO AVE 5 SINGAPORE",
        },
      },
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    expect(artifacts.comparisons?.[mixedKey]?.flatType).toBe("3 ROOM");
  });

  it("treats missing geocodes as worst-case MRT distance in cohort percentiles", () => {
    const missingGeocodeKey = makeAddressKey("ANG MO KIO", "999", "ANG MO KIO AVE 9");
    const artifacts = buildArtifacts({
      transactions: [
        transactions[0],
        {
          ...transactions[0],
          id: "missing-geocode",
          block: "999",
          streetName: "ANG MO KIO AVE 9",
          resalePrice: 410000,
          pricePerSqm: 6119.4,
          pricePerSqft: 568.51,
          addressKey: missingGeocodeKey,
        },
      ],
      propertyInfo,
      mrtExits,
      geocodes: {
        [alphaKey]: geocodes[alphaKey],
      },
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    expect(artifacts.comparisons?.[alphaKey]?.percentileRanks.mrtDistancePercentile).toBe(50);
  });

  it("does not generate comparisons without amenity data", () => {
    const artifacts = buildArtifacts({
      transactions,
      propertyInfo,
      mrtExits,
      geocodes,
      schools: undefined,
      hawkers: undefined,
      supermarkets: undefined,
      parks: undefined,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    expect(artifacts.comparisons).toBeUndefined();
  });

  it("includes comparison count in manifest", () => {
    const artifacts = buildArtifacts({
      transactions,
      propertyInfo,
      mrtExits,
      geocodes,
      schools,
      hawkers,
      supermarkets,
      parks,
      metadata: {
        resaleCollectionId: "189",
        resaleDatasetIds: ["test"],
        propertyDatasetId: "test-property",
        mrtDatasetId: "test-mrt",
        moeSchoolDatasetId: "test-schools",
        neaHawkerDatasetId: "test-hawkers",
        sfaSupermarketDatasetId: "test-supermarkets",
        nparksParksDatasetId: "test-parks",
        lastUpdatedAt: "2026-04-19T02:10:00+08:00",
      },
    });

    expect(artifacts.manifest.counts.comparisons).toBe(2);
  });
});
