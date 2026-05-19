import { expect, test } from "@playwright/test";

/**
 * Guards the Safari/WebKit production boot path. Intentionally does not import
 * temporal-polyfill here — the browser must get Temporal only from index.html.
 */
test.describe("Production bootstrap (WebKit mobile)", () => {
  test("exposes Temporal and renders the shell without page errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");

    await expect
      .poll(async () => page.evaluate(() => typeof globalThis.Temporal !== "undefined"))
      .toBe(true);
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
    await expect(page.getByTestId("mobile-tab-bar")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
