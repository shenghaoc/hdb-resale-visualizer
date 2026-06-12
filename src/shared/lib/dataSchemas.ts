import { z } from "zod";
import {
  getMaxLeaseCommenceYear,
  MIN_LEASE_COMMENCE_YEAR,
  SG_LAT_MAX,
  SG_LAT_MIN,
  SG_LNG_MAX,
  SG_LNG_MIN,
} from "./constants";

const coordinatesSchema = z.object({
  lat: z.number().min(SG_LAT_MIN).max(SG_LAT_MAX),
  lng: z.number().min(SG_LNG_MIN).max(SG_LNG_MAX),
});

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const nearestMrtSchema = z.object({
  stationName: z.string(),
  distanceMeters: z.number().nonnegative(),
  walkingTimeSeconds: z.number().nonnegative(),
});

export const blockSummarySchema = z.object({
  addressKey: z.string(),
  town: z.string(),
  block: z.string(),
  streetName: z.string(),
  displayName: z.string().nullable().optional(),
  coordinates: coordinatesSchema,
  medianPrice: z.number().positive(),
  pricePerSqmMedian: z.number().positive(),
  transactionCount: z.number().nonnegative(),
  floorAreaRange: z.tuple([z.number().positive(), z.number().positive()]),
  leaseCommenceRange: z.tuple([
    z.number().int().min(MIN_LEASE_COMMENCE_YEAR),
    z
      .number()
      .int()
      .refine((val) => val <= getMaxLeaseCommenceYear(), {
        message: "Lease commence year cannot be in the future",
      }),
  ]),
  latestMonth: monthSchema,
  availableDateRange: z.tuple([monthSchema, monthSchema]),
  flatTypes: z.array(z.string()),
  flatModels: z.array(z.string()),
  nearestMrt: nearestMrtSchema.nullable(),
  nearbyMrts: z.array(nearestMrtSchema).optional(),
  postalCode: z.string().nullable().optional(),
});

const addressDetailSummarySchema = blockSummarySchema.extend({
  priceIqr: z.tuple([z.number().positive(), z.number().positive()]),
  pricePerSqftMedian: z.number().positive().nullable(),
});

const addressDetailTransactionSchema = z.object({
  id: z.string(),
  month: monthSchema,
  flatType: z.string(),
  storeyRange: z.string(),
  floorAreaSqm: z.number().positive(),
  flatModel: z.string(),
  leaseCommenceDate: z
    .number()
    .int()
    .min(MIN_LEASE_COMMENCE_YEAR)
    .refine((val) => val <= getMaxLeaseCommenceYear(), {
      message: "Lease commence year cannot be in the future",
    }),
  remainingLease: z.string(),
  resalePrice: z.number().positive(),
  pricePerSqm: z.number().positive(),
  pricePerSqft: z.number().positive().nullable(),
});

const addressTrendPointSchema = z.object({
  month: monthSchema,
  medianPrice: z.number().positive(),
  transactionCount: z.number().nonnegative(),
  medianPricePerSqm: z.number().positive(),
});

export const addressDetailSchema = z.object({
  summary: addressDetailSummarySchema,
  recentTransactions: z.array(addressDetailTransactionSchema),
  monthlyTrend: z.array(addressTrendPointSchema),
});

export const townFlatTypeTrendPointSchema = z.object({
  town: z.string(),
  flatType: z.string(),
  month: monthSchema,
  medianPrice: z.number().positive(),
  medianPricePerSqm: z.number().positive(),
  transactionCount: z.number().nonnegative(),
});

export const manifestSchema = z
  .object({
    schemaVersion: z.string(),
    generatedAt: z.string().optional(),
    dataWindow: z.object({ minMonth: monthSchema, maxMonth: monthSchema }),
    sources: z
      .object({
        resaleCollectionId: z.string().optional(),
        resaleDatasetIds: z.array(z.string()).optional(),
        propertyDatasetId: z.string().optional(),
        mrtDatasetId: z.string().optional(),
        moeSchoolDatasetId: z.string().optional(),
        neaHawkerDatasetId: z.string().optional(),
        sfaSupermarketDatasetId: z.string().optional(),
        nparksParksDatasetId: z.string().optional(),
        lastUpdatedAt: z.string().optional(),
      })
      .default({}),
    filterOptions: z.object({
      towns: z.array(z.string()),
      flatTypes: z.array(z.string()),
      flatModels: z.array(z.string()),
    }),
    counts: z.object({
      blocks: z.number().nonnegative(),
      transactions: z.number().nonnegative(),
      towns: z.number().nonnegative(),
      mrtStations: z.number().nonnegative(),
      comparisons: z.number().nonnegative().optional(),
    }),
  })
  .refine((m) => m.dataWindow.minMonth <= m.dataWindow.maxMonth, {
    message: "minMonth must be less than or equal to maxMonth",
  });

export const comparisonArtifactSchema = z.object({
  addressKey: z.string(),
  town: z.string(),
  flatType: z.string(),
  amenities: z.object({
    primarySchoolsWithin1km: z.number(),
    primarySchoolsWithin2km: z.number(),
    nearestPrimarySchoolMeters: z.number().nullable(),
    nearestPrimarySchools: z.array(
      z.object({
        name: z.string(),
        distanceMeters: z.number(),
        coordinates: coordinatesSchema.optional(),
      }),
    ),
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

export const searchResponseSchema = z.object({
  blocks: z.array(blockSummarySchema),
  truncated: z.boolean(),
  limit: z.number().int().positive(),
});

const townSuggestionSchema = z.object({
  group: z.literal("town"),
  label: z.string(),
  town: z.string(),
});

const streetSuggestionSchema = z.object({
  group: z.literal("street"),
  label: z.string(),
  search: z.string(),
});

const blockSuggestionSchema = z.object({
  group: z.literal("block"),
  label: z.string(),
  addressKey: z.string(),
});

const mrtSuggestionSchema = z.object({
  group: z.literal("mrt"),
  label: z.string(),
  stationName: z.string(),
});

const postalSuggestionSchema = z.object({
  group: z.literal("postal"),
  label: z.string(),
  search: z.string(),
});

export const suggestionSchema = z.discriminatedUnion("group", [
  townSuggestionSchema,
  streetSuggestionSchema,
  blockSuggestionSchema,
  mrtSuggestionSchema,
  postalSuggestionSchema,
]);

export const suggestResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
});
