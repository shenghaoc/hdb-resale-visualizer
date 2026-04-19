import { expect, test } from "@playwright/test";

test("loads the market explorer and drives the shortlist flow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("stats-bar")).toBeVisible();
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  await page.getByPlaceholder("e.g. 447 or Bedok Reservoir").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);

  const firstRow = page.locator("[data-testid='results-pane'] tbody tr").first();
  await firstRow.click();

  await expect(page.getByTestId("detail-drawer")).toContainText(/BEDOK|ANG MO KIO/);
  await page.getByRole("button", { name: /Add to shortlist|Remove from shortlist/ }).click();
  await expect(page.getByTestId("shortlist-drawer")).toBeVisible();
});
