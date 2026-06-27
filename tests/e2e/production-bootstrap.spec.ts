import { expect, test } from "@playwright/test";

/** Guards the production boot path without injecting runtime shims. */
test.describe("Production bootstrap (mobile)", () => {
  test("renders the shell without page errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");

    await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
    await expect(page.getByTestId("mobile-tab-bar")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
