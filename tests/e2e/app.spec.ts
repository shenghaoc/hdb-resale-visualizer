import { expect, test, type Page } from "@playwright/test";

const comparisonFixture = {
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

async function mockComparisonArtifacts(page: Page) {
  await page.route("**/data/comparisons/*.json", async (route) => {
    const url = new URL(route.request().url());
    const fileName = url.pathname.split("/").pop() ?? "fixture-address.json";
    const addressKey = fileName.replace(/\.json$/, "");

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...comparisonFixture, addressKey }),
    });
  });
}

test("keeps selection in results and only shows shortlisted blocks in saved", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("global-header")).toBeVisible();
  await expect(page.getByTestId("map-view")).toBeVisible();

  await page.getByLabel("Location search").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);
  const resultsTab = page.getByRole("tab", { name: "Results" });
  const savedTab = page.getByRole("tab", { name: "Saved" });

  await resultsTab.click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  const firstResult = page
    .locator("[data-testid='results-pane'] [data-slot='item']")
    .filter({ has: page.locator(".result-address strong") })
    .first();
  const rowAddress = await firstResult.locator(".result-address strong").textContent();
  await firstResult.click();

  await expect(resultsTab).toHaveAttribute("data-state", "active");
  await expect(savedTab).toHaveAttribute("data-state", "inactive");
  await expect(page.getByTestId("detail-drawer")).toContainText(rowAddress ?? "");
  await expect(page.getByTestId("shortlist-drawer")).toHaveCount(0);

  await page.getByTestId("detail-drawer").getByRole("button", { name: /Add to shortlist/i }).click();

  await savedTab.click();
  await expect(page.getByTestId("shortlist-drawer")).toContainText(rowAddress ?? "");
  await expect(page.getByText(/1 saved/)).toBeVisible();
});

test("mobile selection stays in results until the user opens saved", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Location search").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);

  const resultsButton = page.getByRole("button", { name: "Results" });
  const savedButton = page.locator(".mobile-tab-bar button").filter({ hasText: /^Saved/ });

  await resultsButton.click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  const firstResult = page
    .locator("[data-testid='results-pane'] [data-slot='item']")
    .filter({ has: page.locator(".result-address strong") })
    .first();
  const rowAddress = await firstResult.locator(".result-address strong").textContent();
  await firstResult.click();

  await expect(resultsButton).toHaveAttribute("data-active", "true");
  await expect(savedButton).toHaveAttribute("data-active", "false");
  await expect(page.getByTestId("detail-drawer")).toContainText(rowAddress ?? "");

  await page.getByTestId("detail-drawer").getByRole("button", { name: /Add to shortlist/i }).click();
  await savedButton.click();
  await expect(page.getByTestId("shortlist-drawer")).toContainText(rowAddress ?? "");
});

test("comparison data binds into detail and shortlist views", async ({ page }) => {
  await mockComparisonArtifacts(page);
  await page.goto("/");

  await page.getByLabel("Location search").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);

  const resultsTab = page.getByRole("tab", { name: "Results" });
  const savedTab = page.getByRole("tab", { name: "Saved" });

  await resultsTab.click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  const firstResult = page
    .locator("[data-testid='results-pane'] [data-slot='item']")
    .filter({ has: page.locator(".result-address strong") })
    .first();
  const rowAddress = await firstResult.locator(".result-address strong").textContent();
  await firstResult.click();

  const detailDrawer = page.getByTestId("detail-drawer");

  await expect(detailDrawer).toContainText(rowAddress ?? "");
  await expect(detailDrawer).toContainText("Nearby Amenities");
  await expect(detailDrawer).toContainText("Schools");
  await expect(detailDrawer).toContainText("3 within 1km");
  await expect(detailDrawer).toContainText("8 within 2km");
  await expect(detailDrawer).toContainText("Hawkers");
  await expect(detailDrawer).toContainText("2 within 1km");
  await expect(detailDrawer).toContainText("Supermarkets");
  await expect(detailDrawer).toContainText("1 within 1km");
  await expect(detailDrawer).toContainText("Parks");
  await expect(detailDrawer).toContainText("4 within 1km");
  await expect(detailDrawer).toContainText("Market Percentiles");
  await expect(detailDrawer).toContainText("Price Rank");
  await expect(detailDrawer).toContainText("65%");
  await expect(detailDrawer).toContainText("Price/sqm Rank");
  await expect(detailDrawer).toContainText("70%");
  await expect(detailDrawer).toContainText("MRT Access Rank");
  await expect(detailDrawer).toContainText("80%");

  await page.getByTestId("detail-drawer").getByRole("button", { name: /Add to shortlist/i }).click();

  await savedTab.click();
  await expect(page.getByTestId("shortlist-drawer")).toBeVisible();

  const shortlistDrawer = page.getByTestId("shortlist-drawer");

  await expect(shortlistDrawer).toContainText(rowAddress ?? "");
  await expect(shortlistDrawer).toContainText("Primary schools");
  await expect(shortlistDrawer).toContainText("3 within 1km, 8 within 2km");
  await expect(shortlistDrawer).toContainText("BEDOK PRIMARY SCHOOL: 250 m");
  await expect(shortlistDrawer).toContainText("Amenities");
  await expect(shortlistDrawer).toContainText("2H • 1S • 4P");
  await expect(shortlistDrawer).toContainText("Price percentile");
  await expect(shortlistDrawer).toContainText("65th percentile");
  await expect(shortlistDrawer).toContainText("Location ranks");
  await expect(shortlistDrawer).toContainText("MRT: 80th • Lease: 45th");
});
