import { expect, test } from "@playwright/test";

test("loads the market explorer and drives the shortlist flow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("stats-bar")).toBeVisible();
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  await page.getByPlaceholder("e.g. 447 or Bedok Reservoir").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);

  const firstRow = page
    .locator("[data-testid='results-pane'] tbody tr")
    .filter({ has: page.locator(".result-address strong") })
    .first();
  const rowAddress = await firstRow.locator(".result-address strong").textContent();
  await firstRow.getByRole("button", { name: /Save|Saved/ }).click({ force: true });

  await expect(firstRow.getByRole("button", { name: /Saved/ })).toBeVisible();
  await expect(page.getByTestId("shortlist-drawer")).toContainText(rowAddress ?? "");
});
