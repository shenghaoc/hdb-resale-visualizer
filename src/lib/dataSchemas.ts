import { z } from "zod";

const coordinatesSchema = z.object({ lat: z.number(), lng: z.number() });
const nearestMrtSchema = z.object({ stationName: z.string(), distanceMeters: z.number() });

export const blockSummarySchema = z.object({
  addressKey: z.string(),
  town: z.string(),
  block: z.string(),
  streetName: z.string(),
  displayName: z.string().nullable().optional(),
  coordinates: coordinatesSchema,
  medianPrice: z.number(),
  transactionCount: z.number(),
  floorAreaRange: z.tuple([z.number(), z.number()]),
  leaseCommenceRange: z.tuple([z.number(), z.number()]),
  latestMonth: z.string(),
  availableDateRange: z.tuple([z.string(), z.string()]),
  flatTypes: z.array(z.string()),
  flatModels: z.array(z.string()),
  nearestMrt: nearestMrtSchema.nullable(),
  nearbyMrts: z.array(nearestMrtSchema).optional(),
  postalCode: z.string().nullable().optional(),
});

const addressDetailSummarySchema = blockSummarySchema.extend({
  priceIqr: z.tuple([z.number(), z.number()]),
  pricePerSqmMedian: z.number(),
  pricePerSqftMedian: z.number().nullable(),
});

const addressDetailTransactionSchema = z.object({
  id: z.string(),
  month: z.string(),
  flatType: z.string(),
  storeyRange: z.string(),
  floorAreaSqm: z.number(),
  flatModel: z.string(),
  leaseCommenceDate: z.number(),
  remainingLease: z.string(),
  resalePrice: z.number(),
  pricePerSqm: z.number(),
  pricePerSqft: z.number().nullable(),
});

const addressTrendPointSchema = z.object({
  month: z.string(),
  medianPrice: z.number(),
  transactionCount: z.number(),
  medianPricePerSqm: z.number(),
});

export const addressDetailSchema = z.object({
  summary: addressDetailSummarySchema,
  recentTransactions: z.array(addressDetailTransactionSchema),
  monthlyTrend: z.array(addressTrendPointSchema),
});

export const townFlatTypeTrendPointSchema = z.object({
  town: z.string(),
  flatType: z.string(),
  month: z.string(),
  medianPrice: z.number(),
  transactionCount: z.number(),
});

export const manifestSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  dataWindow: z.object({ minMonth: z.string(), maxMonth: z.string() }),
  sources: z.object({
    resaleCollectionId: z.string(),
    resaleDatasetIds: z.array(z.string()),
    propertyDatasetId: z.string(),
    mrtDatasetId: z.string(),
    moeSchoolDatasetId: z.string().optional(),
    neaHawkerDatasetId: z.string().optional(),
    sfaSupermarketDatasetId: z.string().optional(),
    nparksParksDatasetId: z.string().optional(),
    lastUpdatedAt: z.string(),
  }),
  filterOptions: z.object({
    towns: z.array(z.string()),
    flatTypes: z.array(z.string()),
    flatModels: z.array(z.string()),
  }),
  counts: z.object({
    blocks: z.number(),
    transactions: z.number(),
    towns: z.number(),
    mrtStations: z.number(),
    comparisons: z.number().optional(),
  }),
});

export const comparisonArtifactSchema = z.object({
  addressKey: z.string(),
  town: z.string(),
  flatType: z.string(),
  amenities: z.object({
    primarySchoolsWithin1km: z.number(),
    primarySchoolsWithin2km: z.number(),
    nearestPrimarySchoolMeters: z.number().nullable(),
    nearestPrimarySchools: z.array(z.object({ name: z.string(), distanceMeters: z.number() })),
    hawkerCentresWithin1km: z.number(),
    nearestHawkerCentreMeters: z.number().nullable(),
    supermarketsWithin1km: z.number(),
    nearestSupermarketMeters: z.number().nullable(),
    parksWithin1km: z.number(),
    nearestParkMeters: z.number().nullable(),
  }),
  percentileRanks: z.object({
    pricePercentile: z.number(),
    pricePerSqmPercentile: z.number(),
    leasePercentile: z.number(),
    mrtDistancePercentile: z.number(),
    transactionCountPercentile: z.number(),
    recencyPercentile: z.number(),
  }),
  generatedAt: z.string(),
});
