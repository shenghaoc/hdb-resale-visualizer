import { expect, test } from "@playwright/test";

test("loads the market explorer and drives the shortlist flow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("stats-bar")).toBeVisible();
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  await page.getByPlaceholder("e.g. 447 or Bedok Reservoir").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);

  const firstResult = page
    .locator("[data-testid='results-pane'] [data-slot='item']")
    .filter({ has: page.locator(".result-address strong") })
    .first();
  const rowAddress = await firstResult.locator(".result-address strong").textContent();
  await firstResult
    .locator("button")
    .filter({ hasText: /Save|Saved/ })
    .first()
    .click({ force: true });

  await expect(page.getByTestId("shortlist-drawer")).toContainText(rowAddress ?? "");
  await expect(page.getByText(/1\/4 saved/)).toBeVisible();
});
