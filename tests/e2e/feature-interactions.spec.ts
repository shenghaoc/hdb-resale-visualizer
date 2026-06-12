import { expect, test, type Page } from "@playwright/test";
import { mockComparisonArtifacts } from "./fixtures";

test.describe.configure({
  timeout: 60_000,
});

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

test("feature interaction: search -> detail -> layers -> negotiate -> escape -> saved", async ({
  page,
}) => {
  await mockComparisonArtifacts(page);
  await page.goto("/");

  // 1. BEDOK search
  await page.getByTestId("header-search-input").fill("BEDOK");
  await expect(page).toHaveURL(/search=BEDOK/);

  // 2. Results
  const resultsTab = desktopNavButton(page, "Results");
  await resultsTab.click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  // 3. Select block -> Detail opens
  const firstResult = firstResultCard(page);
  const rowAddress = await resultCardAddressText(firstResult);
  await firstResult.click();

  const detailDrawer = page.getByTestId("detail-drawer");
  await expect(detailDrawer).toContainText(rowAddress ?? "");

  // 4. Schools toggle enables
  await expect(detailDrawer.getByRole("tab", { name: /overview/i })).toBeVisible();

  // Wait for comparison data to load and enable the schools switch
  const schoolsSwitch = page.getByRole("switch", { name: /school/i });
  await expect(schoolsSwitch).toBeEnabled({ timeout: 15_000 });

  // Click it
  await schoolsSwitch.click();
  await expect(schoolsSwitch).toHaveAttribute("aria-checked", "true");

  // 5. Negotiate tab
  const negotiateTab = detailDrawer.getByRole("tab", { name: /negotiate/i });
  await negotiateTab.click();

  // We use regex to find Asking Price Check ignoring case
  await expect(detailDrawer.getByText(/Asking Price Reality Check/i)).toBeVisible();

  // 6. Save the block. If button label is just "Save", we look for save ignoring case.
  // The app.spec.ts checks for "Add to shortlist" but the aria-label is t("detail.save").
  // Let's use a regex that handles both just in case, or stick to the icon if possible.
  // We'll use a broad selector
  const saveButton = detailDrawer.getByRole("button").filter({ hasText: /save|add to shortlist/i });
  await saveButton.click();

  // 7. Escape closes drawer
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail-drawer")).toHaveCount(0);

  // 8. Saved still works
  const savedTab = page.locator(".desktop-tab-bar button").filter({ hasText: /^Saved/ });
  await savedTab.click();
  await expect(page.getByTestId("shortlist-drawer")).toContainText(rowAddress ?? "");
});
