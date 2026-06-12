import { expect, test } from "@playwright/test";

test.describe.configure({
  mode: "serial",
  timeout: 60_000,
});

test("deep-links into the side-by-side town compare view", async ({ page }) => {
  await page.goto("/?town=BEDOK&compareTown=ANG+MO+KIO");

  await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });

  // Open the Results pane.
  const resultsTab = page.locator(".desktop-tab-bar").getByRole("button", { name: "Results" });
  await resultsTab.click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  // Switch to the TOWN OVERVIEW view which hosts the compare section.
  await page.getByRole("button", { name: /Show town overview/i }).click();

  const section = page.getByTestId("town-compare-section");
  await expect(section).toBeVisible();

  // Both column headers should be rendered side by side.
  const primaryColumn = page.getByTestId("town-compare-column-primary");
  const compareColumn = page.getByTestId("town-compare-column-compare");
  await expect(primaryColumn).toContainText("BEDOK");
  await expect(compareColumn).toContainText("ANG MO KIO");

  // At least one diff badge should be present in the compare column.
  await expect(compareColumn.getByTestId("town-compare-delta").first()).toBeVisible();
});
