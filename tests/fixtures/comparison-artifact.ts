import type { ComparisonArtifact } from "@/types/data";

const DEFAULT_PERCENTILES: ComparisonArtifact["percentileRanks"] = {
  pricePercentile: 65,
  pricePerSqmPercentile: 70,
  leasePercentile: 45,
  mrtDistancePercentile: 80,
  transactionCountPercentile: 55,
  recencyPercentile: 90,
};

/** Minimal comparison artifact for local dev / tests (includes school map coordinates). */
export function createFixtureComparison(
  input: Pick<ComparisonArtifact, "addressKey" | "town" | "flatType"> & {
    schools: ComparisonArtifact["amenities"]["nearestPrimarySchools"];
    primarySchoolsWithin1km?: number;
    primarySchoolsWithin2km?: number;
    nearestPrimarySchoolMeters?: number | null;
  },
): ComparisonArtifact {
  const nearest = input.nearestPrimarySchoolMeters ?? input.schools[0]?.distanceMeters ?? null;
  return {
    addressKey: input.addressKey,
    town: input.town,
    flatType: input.flatType,
    amenities: {
      primarySchoolsWithin1km: input.primarySchoolsWithin1km ?? 2,
      primarySchoolsWithin2km: input.primarySchoolsWithin2km ?? 5,
      nearestPrimarySchoolMeters: nearest,
      nearestPrimarySchools: input.schools,
      hawkerCentresWithin1km: 2,
      nearestHawkerCentreMeters: 180,
      supermarketsWithin1km: 1,
      nearestSupermarketMeters: 320,
      parksWithin1km: 4,
      nearestParkMeters: 150,
    },
    percentileRanks: DEFAULT_PERCENTILES,
    generatedAt: "2026-04-22T00:00:00.000Z",
  };
}
