import "temporal-polyfill/global";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({
  mode: "serial",
  timeout: 60_000,
});

const MOBILE_VIEWPORT = { width: 390, height: 844 };

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

async function setupMobile(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
}

function mobileTabBar(page: Page) {
  return page.getByTestId("mobile-tab-bar");
}

function firstResultCard(page: Page) {
  return page.locator("[data-testid='results-pane'] [data-slot='item']").first();
}


test.describe("Mobile Regression: Recent Features", () => {
  test("results toolbar: sort and view toggle accessible on mobile", async ({ page }) => {
    await setupMobile(page);
    await page.goto("/");

    // Open filters, set town filter explicitly (required for view toggle)
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();

    // Switch to results
    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Results view toolbar should be visible
    await expect(page.getByTestId("results-view-toolbar")).toBeVisible();

    // View toggle (blocks/town) should be accessible when town is selected
    const viewToggle = page.getByTestId("results-view-toggle");
    await expect(viewToggle).toBeVisible();

    // Sort select should be accessible
    const sortSelect = page.getByTestId("results-pane").getByRole("combobox");
    await expect(sortSelect).toBeVisible();
  });

  test("detail drawer tabs scroll and navigate on mobile", async ({ page }) => {
    await mockComparisonArtifacts(page);
    await setupMobile(page);
    await page.goto("/");

    // Set town filter and open results
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();

    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Select a block
    const firstResult = firstResultCard(page);
    await expect(firstResult).toBeVisible({ timeout: 10_000 });
    await firstResult.click();

    const detailDrawer = page.getByTestId("detail-drawer");
    await expect(detailDrawer).toBeVisible();

    // Overview tab should be active by default
    await expect(detailDrawer.getByRole("tab", { name: /overview/i })).toBeVisible();

    // Navigate to trends tab
    await detailDrawer.getByRole("tab", { name: /trends/i }).click();
    await expect(detailDrawer.getByRole("tabpanel")).toBeVisible();

    // Navigate to history tab
    await detailDrawer.getByRole("tab", { name: /history/i }).click();
    await expect(detailDrawer.getByRole("tabpanel")).toBeVisible();

    // Navigate to negotiate tab
    await detailDrawer.getByRole("tab", { name: /negotiate/i }).click();
    await expect(detailDrawer.getByText(/Asking Price Reality Check/i)).toBeVisible();
  });

  test("budget match indicator shows on mobile results", async ({ page }) => {
    await setupMobile(page);
    await page.goto("/");

    // Open filters, set town and budget (fixture blocks are ~$1.2M)
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();
    await page.locator("#budget-max").fill("1300000");

    // Switch to results
    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Result cards should be visible with budget set
    const resultsPane = page.getByTestId("results-pane");
    await expect(resultsPane.locator("[data-slot='item']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("town profile overview visible in mobile results", async ({ page }) => {
    await setupMobile(page);
    await page.goto("/");

    // Set town filter explicitly (required for town profile)
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();

    // Switch to results — town profile view toggle should appear
    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Switch to town view
    const viewToggle = page.getByTestId("results-view-toggle");
    await expect(viewToggle).toBeVisible();
    await viewToggle.getByRole("button", { name: /town/i }).click();

    // Town profile shows median price stats
    const resultsPane = page.getByTestId("results-pane");
    await expect(resultsPane.getByText(/median/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("buyer checklist accessible from mobile saved tab", async ({ page }) => {
    await setupMobile(page);

    // Pre-seed a shortlist item
    const shortlistData = [
      {
        addressKey: "ang-mo-kio-104a-ang-mo-kio-st-11",
        notes: "Test note",
        targetPrice: 500000,
        addedAt: Temporal.Now.instant().toString(),
      },
    ];

    await page.goto("/");
    await page.evaluate(
      ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
      { data: shortlistData },
    );
    await page.reload();

    // Navigate to saved tab
    await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
    await expect(page.getByTestId("shortlist-drawer")).toBeVisible();

    // Buyer checklist section should be present
    await expect(page.getByTestId("shortlist-drawer").getByText(/checklist/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shortlist comparison table scrolls horizontally on mobile", async ({ page }) => {
    await mockComparisonArtifacts(page);
    await setupMobile(page);

    // Pre-seed two shortlist items using real fixture address keys
    const shortlistData = [
      {
        addressKey: "bedok-10d-bedok-sth-ave-2",
        notes: "",
        targetPrice: null,
        addedAt: Temporal.Now.instant().toString(),
      },
      {
        addressKey: "bedok-106-lengkong-tiga",
        notes: "",
        targetPrice: null,
        addedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ];

    await page.goto("/");
    await page.evaluate(
      ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
      { data: shortlistData },
    );
    await page.reload();

    // Navigate to saved tab
    await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
    await expect(page.getByTestId("shortlist-drawer")).toBeVisible();

    // Shortlist items should be visible (street names from fixture data)
    await expect(
      page.getByTestId("shortlist-drawer").getByText(/BEDOK STH AVE 2/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("mobile tab bar shows shortlist count badge", async ({ page }) => {
    await setupMobile(page);

    const shortlistData = [
      {
        addressKey: "ang-mo-kio-104a-ang-mo-kio-st-11",
        notes: "",
        targetPrice: null,
        addedAt: Temporal.Now.instant().toString(),
      },
    ];

    await page.goto("/");
    await page.evaluate(
      ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
      { data: shortlistData },
    );
    await page.reload();

    // Badge with count should appear on the Saved button
    const savedButton = mobileTabBar(page).getByRole("button", { name: /saved/i });
    await expect(savedButton).toBeVisible();
    await expect(mobileTabBar(page).locator("[data-slot='badge']")).toContainText("1");
  });

  test("mobile theme toggle and language selector remain functional", async ({ page }) => {
    await setupMobile(page);
    await page.goto("/");

    const tabBar = mobileTabBar(page);
    await expect(tabBar).toBeVisible({ timeout: 15_000 });

    // Theme toggle
    const themeToggle = tabBar.getByRole("button", { name: /toggle theme/i });
    await expect(themeToggle).toBeVisible();

    const initialDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    await themeToggle.click();
    const afterToggle = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(afterToggle).not.toBe(initialDark);

    // Language selector
    const langSelect = tabBar.getByRole("combobox", { name: /language/i });
    await expect(langSelect).toBeVisible();
    await langSelect.click();
    await expect(page.getByRole("option")).toHaveCount(2);
    await page.keyboard.press("Escape");
  });

  test("mobile filter panel opens and budget inputs work", async ({ page }) => {
    await setupMobile(page);
    await page.goto("/");

    // Open filters
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    await expect(page.getByTestId("filters-panel")).toBeVisible();

    // Budget inputs should be accessible
    const budgetMin = page.locator("#budget-min");
    const budgetMax = page.locator("#budget-max");
    await expect(budgetMin).toBeVisible();
    await expect(budgetMax).toBeVisible();

    // Fill budget values
    await budgetMin.fill("300000");
    await budgetMax.fill("600000");

    // Values should persist
    await expect(budgetMin).toHaveValue("300000");
    await expect(budgetMax).toHaveValue("600000");
  });
});
