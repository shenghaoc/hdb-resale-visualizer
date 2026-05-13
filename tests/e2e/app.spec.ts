import "temporal-polyfill/global";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({
  mode: "serial",
  timeout: 60_000,
});

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

function firstResultCard(page: Page) {
  return page.locator("[data-testid='results-pane'] [data-slot='item']").first();
}

async function resultCardAddressText(card: ReturnType<Page["locator"]>) {
  const desktopAddress = card.locator(".result-address strong");
  if ((await desktopAddress.count()) > 0) {
    return await desktopAddress.first().textContent();
  }
  return await card.locator("strong").first().textContent();
}

function desktopNavButton(page: Page, label: string) {
  return page.locator(".desktop-tab-bar").getByRole("button", { name: label });
}

test("keeps selection in results and only shows shortlisted blocks in saved", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Location search").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);
  const resultsTab = desktopNavButton(page, "Results");
  const savedTab = page.locator(".desktop-tab-bar button").filter({ hasText: /^Saved/ });

  await resultsTab.click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  const firstResult = firstResultCard(page);
  const rowAddress = await resultCardAddressText(firstResult);
  await firstResult.click();

  await expect(resultsTab).toHaveAttribute("data-active", "true");
  await expect(savedTab).toHaveAttribute("data-active", "false");
  await expect(page.getByTestId("detail-drawer")).toContainText(rowAddress ?? "");
  await expect(page.getByTestId("shortlist-drawer")).toHaveCount(0);

  await page.getByTestId("detail-drawer").getByRole("button", { name: /Add to shortlist/i }).click();

  await savedTab.click();
  await expect(page.getByTestId("shortlist-drawer")).toContainText(rowAddress ?? "");
  await expect(page.getByTestId("shortlist-drawer")).toContainText("Saved properties");
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

  const firstResult = firstResultCard(page);
  const rowAddress = await resultCardAddressText(firstResult);
  await firstResult.click();

  await expect(resultsButton).toHaveAttribute("data-active", "true");
  await expect(savedButton).toHaveAttribute("data-active", "false");
  await expect(page.getByTestId("detail-drawer")).toContainText(rowAddress ?? "");

  await page.getByTestId("detail-drawer").getByRole("button", { name: /Add to shortlist/i }).click();
  await savedButton.click();
  await expect(page.getByTestId("shortlist-drawer")).toContainText(rowAddress ?? "");
});

test("mobile saved tab preserves autodetected dark theme and exposes display controls", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-color-scheme: dark"),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const mapView = page.getByTestId("map-view");
  await expect(mapView).toBeVisible({ timeout: 20_000 });
  await expect(mapView).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);

  const mobileNav = page.locator(".mobile-tab-bar");
  await expect(mobileNav.getByRole("button", { name: /toggle theme/i })).toBeVisible();
  const languageSelect = mobileNav.getByRole("combobox", { name: /language/i });
  await expect(languageSelect).toBeVisible();

  await languageSelect.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Escape");

  await mobileNav.getByRole("button", { name: /saved/i }).click();
  await expect(page.getByTestId("shortlist-drawer")).toBeVisible();
  await expect(mapView).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("comparison data binds into detail and shortlist views", async ({ page }) => {
  await mockComparisonArtifacts(page);
  await page.goto("/");

  await page.getByLabel("Location search").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);

  const resultsTab = desktopNavButton(page, "Results");
  const savedTab = page.locator(".desktop-tab-bar button").filter({ hasText: /^Saved/ });

  await resultsTab.click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  const firstResult = firstResultCard(page);
  const rowAddress = await resultCardAddressText(firstResult);
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

test("shortlist items from prior sessions are visible without adding a new one", async ({ page }) => {
  const shortlistKey = "hdb_resale_shortlist_v1";
  const shortlistData = [
    {
      addressKey: "ang-mo-kio-104a-ang-mo-kio-st-11",
      notes: "Prior session note",
      targetPrice: 500000,
      addedAt: Temporal.Now.instant().toString(),
    },
  ];

  await page.goto("/");

  // Set localStorage and reload to simulate a returning user
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: shortlistKey, data: shortlistData },
  );

  await page.reload();

  await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });

  // Click on "Saved" tab
  const savedTab = page.locator(".desktop-tab-bar button").filter({ hasText: /^Saved/ });
  await savedTab.click();

  // Expect the shortlisted item to be visible
  await expect(page.getByTestId("shortlist-drawer")).toContainText("104A ANG MO KIO ST 11", {
    timeout: 10_000,
  });
  await expect(page.getByTestId("shortlist-drawer")).toContainText("Prior session note");
});
