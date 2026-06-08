import { expect, test, type Page } from "@playwright/test";

test.describe.configure({
  timeout: 90_000,
});

// In the buyer-first homepage, the results list lives on the Results tab of the
// desktop left panel — it is hidden until that tab is opened. Reveal it after
// driving the header search so the filtered list (and its items) are present.
async function openResultsTab(page: Page) {
  await page.locator(".desktop-tab-bar").getByRole("button", { name: /results/i }).click();
  await expect(page.getByTestId("results-pane")).toBeVisible({ timeout: 5_000 });
}

test.describe("performance traces", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("filter typing responds within acceptable latency", async ({ page }) => {
    const searchInput = page.getByTestId("header-search-input");
    await searchInput.click();

    const start = Date.now();
    await searchInput.fill("BEDOK");

    await openResultsTab(page);
    await expect(
      page.locator("[data-testid='results-pane'] [data-slot='item']").first(),
    ).toBeVisible({ timeout: 5_000 });

    const elapsed = Date.now() - start;
    // Filter-to-first-result should be under 3s (generous for CI + WebKit build)
    expect(elapsed).toBeLessThan(3000);
  });

  test("map remains interactive during filter operations", async ({ page }) => {
    const mapContainer = page.getByRole("application", {
      name: /interactive map of singapore hdb resale blocks/i,
    });

    await page.getByTestId("header-search-input").fill("ANG MO KIO");
    await openResultsTab(page);

    // Pan the map while filter is active
    const box = await mapContainer.boundingBox();
    if (!box) return;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const panStart = Date.now();
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 100, centerY + 50, { steps: 10 });
    await page.mouse.up();
    const panElapsed = Date.now() - panStart;

    // Pan operation should complete without stalling (generous 2s for CI)
    expect(panElapsed).toBeLessThan(2000);

    // Map should still be visible and interactive after pan
    await expect(mapContainer).toBeVisible();
  });

  test("listing check verdict appears within acceptable latency", async ({
    page,
  }) => {
    // Navigate to a block and trigger listing check
    await page.getByTestId("header-search-input").fill("BEDOK");
    await openResultsTab(page);
    await expect(
      page.locator("[data-testid='results-pane'] [data-slot='item']").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click first result to open detail
    await page.locator("[data-testid='results-pane'] [data-slot='item']").first().click();
    await expect(page.getByTestId("detail-drawer")).toBeVisible({ timeout: 5_000 });

    // Look for listing check tab/button and interact
    const checkTab = page.getByRole("button", { name: /price check|listing check/i });
    if (await checkTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const start = Date.now();
      await checkTab.click();

      // Wait for verdict or input form to appear
      const verdictOrForm = page.locator(
        "[data-testid='listing-check-panel'], [data-testid='listing-check-verdict']",
      );
      await expect(verdictOrForm.first()).toBeVisible({ timeout: 5_000 });
      const elapsed = Date.now() - start;

      // Panel should load within 2s
      expect(elapsed).toBeLessThan(2000);
    }
  });
});

async function measureFilterLatency(
  page: Page,
  query: string,
): Promise<number> {
  const searchInput = page.getByTestId("header-search-input");
  await searchInput.fill("");
  const start = Date.now();
  await searchInput.fill(query);
  await expect(
    page.locator("[data-testid='results-pane'] [data-slot='item']").first(),
  ).toBeVisible({ timeout: 5_000 });
  return Date.now() - start;
}

test("filter latency remains stable across repeated queries", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
  ).toBeVisible({ timeout: 20_000 });

  await openResultsTab(page);

  // Queries must all resolve to ≥1 block in the e2e fixture (BEDOK / ANG MO KIO
  // towns only), otherwise the wait for a result item hangs.
  const latencies: number[] = [];
  for (const query of ["BEDOK", "ANG MO KIO", "LENGKONG TIGA"]) {
    const latency = await measureFilterLatency(page, query);
    latencies.push(latency);
  }

  // No single query should take more than 5s (generous for CI)
  for (const latency of latencies) {
    expect(latency).toBeLessThan(5000);
  }

  // Variance between queries should be reasonable (no query > 3x the fastest)
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  expect(max).toBeLessThan(min * 3 + 500);
});
