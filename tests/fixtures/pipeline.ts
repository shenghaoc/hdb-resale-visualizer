import { buildArtifacts, makeAddressKey, type GeocodeEntry, type MrtExit, type PropertyInfo, type ResaleTransaction } from "../../scripts/lib/pipeline";

const alphaKey = makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10");
const betaKey = makeAddressKey("BEDOK", "101", "BEDOK NTH AVE 4");

export const fixtureTransactions: ResaleTransaction[] = [
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

export const fixturePropertyInfo: PropertyInfo[] = [
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

export const fixtureMrtExits: MrtExit[] = [
  {
    stationName: "ANG MO KIO MRT STATION",
    lat: 1.3691,
    lng: 103.8491,
  },
  {
    stationName: "ANG MO KIO MRT STATION",
    lat: 1.3705,
    lng: 103.8506,
  },
  {
    stationName: "BEDOK NORTH MRT STATION",
    lat: 1.3347,
    lng: 103.9188,
  },
];

export const fixtureGeocodes: Record<string, GeocodeEntry> = {
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

export function buildFixtureArtifacts() {
  return buildArtifacts({
    transactions: fixtureTransactions,
    propertyInfo: fixturePropertyInfo,
    mrtExits: fixtureMrtExits,
    geocodes: fixtureGeocodes,
    schools: undefined,
    hawkers: undefined,
    supermarkets: undefined,
    parks: undefined,
    metadata: {
      resaleCollectionId: "189",
      resaleDatasetIds: ["fixture"],
      propertyDatasetId: "fixture-property",
      mrtDatasetId: "fixture-mrt",
      lastUpdatedAt: "2026-04-19T02:10:00+08:00",
    },
  });
}
