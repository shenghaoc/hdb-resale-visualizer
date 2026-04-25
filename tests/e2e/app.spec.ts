import { expect, test } from "@playwright/test";

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
