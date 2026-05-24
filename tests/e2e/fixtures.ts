import type { Page } from "@playwright/test";

export const comparisonFixture = {
  addressKey: "fixture-address",
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
        coordinates: { lat: 1.324, lng: 103.933 },
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

export async function mockComparisonArtifacts(page: Page) {
  await page.route("**/api/comparisons/*", async (route) => {
    const url = new URL(route.request().url());
    const fileName = url.pathname.split("/").pop() || "fixture-address.json";
    const addressKey = fileName.replace(/\.json$/, "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...comparisonFixture, addressKey }),
    });
  });
}
