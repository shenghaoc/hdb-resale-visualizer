import { expect, test, type Page } from "@playwright/test";

async function waitForAppLoad(page: Page) {
  await expect(
    page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
  ).toBeVisible({ timeout: 20_000 });
}

function desktopNavButton(page: Page, label: string) {
  return page.locator(".desktop-tab-bar").getByRole("button", { name: label });
}

test.describe("Global header location search", () => {
  test("desktop: header search filters results and stays synced with filters panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);

    await expect(page.getByTestId("global-header")).toBeVisible();
    const headerSearch = page.getByTestId("header-search-input");
    await headerSearch.fill("near bedok mrt");
    await expect(page).toHaveURL(/search=near\+bedok\+mrt/i);

    await desktopNavButton(page, "Results").click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    await expect(headerSearch).toHaveValue("near bedok mrt");

    const filtersSearch = page.getByTestId("filters-panel").locator("#search");
    await expect(filtersSearch).toHaveValue("near bedok mrt");

    await desktopNavButton(page, "Filters").click();
    await expect(filtersSearch).toBeVisible();
    await filtersSearch.fill("BEDOK");
    await expect(page).toHaveURL(/search=BEDOK/);
    await expect(headerSearch).toHaveValue("BEDOK");
  });

  test("mobile: magnifier overlay opens, syncs, and dismisses on Escape and scrim", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForAppLoad(page);

    await page.getByTestId("header-search-toggle").click();
    const overlay = page.getByTestId("header-search-overlay");
    await expect(overlay).toBeVisible();

    const overlayInput = page.getByTestId("header-search-overlay-input");
    await overlayInput.fill("BEDOK");
    await expect(page).toHaveURL(/search=BEDOK/);

    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);

    await page.getByTestId("header-search-toggle").click();
    await expect(overlayInput).toHaveValue("BEDOK");

    await overlay.locator('[data-slot="button"]').click();
    await expect(overlay).toHaveCount(0);

    await page.getByTestId("header-search-toggle").click();
    await expect(overlay).toBeVisible();
    await page.getByTestId("header-search-scrim").click();
    await expect(overlay).toHaveCount(0);

    await page.getByTestId("mobile-tab-bar").getByRole("button", { name: "Filters" }).click();
    await expect(page.getByTestId("filters-panel").locator("#search")).toHaveValue("BEDOK");
  });

  test("desktop: tab order moves from title chip to header search", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);

    const titleButton = page.getByTestId("global-header").locator("button").first();
    await titleButton.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("header-search-input")).toBeFocused();
  });
});
