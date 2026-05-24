/**
 * E2E tests for the CPF Affordability filter (Phase 3).
 *
 * Relies on the global storage state seeded by global-setup.ts:
 *   monthlyIncome: 9000, cpfOABalance: 120_000, age: 35, coApplicantAge: 33,
 *   showAllBlocks: true
 *
 * All fixture blocks have medians ≈ 1.2 M which is far above the affordable
 * ceiling for that profile, so ?affordable=comfortable always yields 0 matches
 * against the BEDOK fixture blocks.
 *
 * Layout note: on desktop the FilterPanel (affordability toggle) and the
 * ResultsPane live in the same left panel but on separate tabs — only one is
 * visible at a time. Toggle assertions open the Filters tab; result/empty/sort
 * assertions open the Results tab. Filter chips render over the map and need no
 * tab.
 */
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial", timeout: 60_000 });

function desktopNavButton(page: Page, label: string) {
  return page.locator(".desktop-tab-bar").getByRole("button", { name: label });
}

async function waitForAppReady(page: Page) {
  await expect(
    page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
  ).toBeVisible({ timeout: 20_000 });
}

// The affordability toggle lives in the FilterPanel (Filters tab). On desktop
// the left panel defaults open on the Filters tab, so the toggle is visible on
// load — clicking "Filters" again would toggle the panel closed.
async function expectFiltersToggleVisible(page: Page) {
  await expect(page.getByTestId("affordability-filter-toggle")).toBeVisible();
}

// The results list / empty card / sort control live in the Results tab. The
// panel defaults to the Filters tab, so a single click switches (and opens) it.
async function openResultsTab(page: Page) {
  await desktopNavButton(page, "Results").click();
  await expect(page.getByTestId("results-pane")).toBeVisible();
}

test.describe("affordability filter — URL parameter wiring", () => {
  test("?affordable=comfortable is reflected in the affordability toggle", async ({ page }) => {
    await page.goto("/?affordable=comfortable");
    await waitForAppReady(page);
    await expectFiltersToggleVisible(page);

    const toggle = page.getByTestId("affordability-filter-toggle");
    await expect(toggle).toHaveAttribute("data-affordability-mode", "comfortable");
    // Profile is complete in the seeded state, so the toggle is enabled.
    await expect(toggle).toHaveAttribute("data-affordability-disabled", "false");
  });

  test("?affordable=stretch is reflected in the toggle", async ({ page }) => {
    await page.goto("/?affordable=stretch");
    await waitForAppReady(page);
    await expectFiltersToggleVisible(page);

    await expect(page.getByTestId("affordability-filter-toggle")).toHaveAttribute(
      "data-affordability-mode",
      "stretch",
    );
  });

  test("unknown affordable value falls back to 'all'", async ({ page }) => {
    await page.goto("/?affordable=invalid");
    await waitForAppReady(page);
    await expectFiltersToggleVisible(page);

    await expect(page.getByTestId("affordability-filter-toggle")).toHaveAttribute(
      "data-affordability-mode",
      "all",
    );
  });
});

test.describe("affordability filter — result count", () => {
  test("BEDOK without affordability filter shows all 3 fixture blocks", async ({ page }) => {
    await page.goto("/?town=BEDOK");
    await waitForAppReady(page);
    await openResultsTab(page);

    await expect(page.getByTestId("results-pane").getByText(/3 shown/i)).toBeVisible();
  });

  test("BEDOK + affordable=comfortable yields 0 results and shows the empty affordability card", async ({
    page,
  }) => {
    // All BEDOK blocks have medians ≈ 1.2 M, well above the test profile ceiling.
    await page.goto("/?town=BEDOK&affordable=comfortable");
    await waitForAppReady(page);
    await openResultsTab(page);

    const emptyCard = page.getByTestId("affordability-empty-card");
    await expect(emptyCard).toBeVisible();
    await expect(
      emptyCard.getByRole("button", { name: /clear affordability filter/i }),
    ).toBeVisible();
  });
});

test.describe("affordability filter — clearing via empty-state button", () => {
  test("clicking 'Clear affordability filter' removes the affordable param and restores results", async ({
    page,
  }) => {
    await page.goto("/?town=BEDOK&affordable=comfortable");
    await waitForAppReady(page);
    await openResultsTab(page);

    const emptyCard = page.getByTestId("affordability-empty-card");
    await emptyCard.getByRole("button", { name: /clear affordability filter/i }).click();

    await expect(page).not.toHaveURL(/affordable=/);
    await expect(page).toHaveURL(/town=BEDOK/);
    // The 3 BEDOK blocks reappear once affordability filtering is cleared.
    await expect(page.getByTestId("results-pane").getByText(/3 shown/i)).toBeVisible();
  });
});

test.describe("affordability filter — clearing via filter chip", () => {
  test("?affordable=comfortable emits a dismissible chip on the map", async ({ page }) => {
    await page.goto("/?affordable=comfortable");
    await waitForAppReady(page);

    // Chip aria-label follows the "filters.removeChip" i18n template:
    // "Remove filter: Affordable: comfortable"
    await expect(
      page.getByRole("button", { name: /remove filter: affordable: comfortable/i }),
    ).toBeVisible();
  });

  test("clicking the affordability chip removes affordable from the URL", async ({ page }) => {
    await page.goto("/?town=BEDOK&affordable=comfortable");
    await waitForAppReady(page);

    await page.getByRole("button", { name: /remove filter: affordable: comfortable/i }).click();

    await expect(page).not.toHaveURL(/affordable=/);
    await expect(page).toHaveURL(/town=BEDOK/);
  });

  test("?affordable=stretch emits a stretch chip", async ({ page }) => {
    await page.goto("/?affordable=stretch");
    await waitForAppReady(page);

    await expect(
      page.getByRole("button", { name: /remove filter: affordable: \+ stretch/i }),
    ).toBeVisible();
  });
});

test.describe("affordability filter — sort integration", () => {
  test("?sort=affordability is accepted and shown when the profile is complete", async ({
    page,
  }) => {
    // town=BEDOK provides result scope so the sort control renders; the seeded
    // profile is complete, so the affordability sort option is enabled.
    await page.goto("/?town=BEDOK&sort=affordability");
    await waitForAppReady(page);
    await openResultsTab(page);

    const sortTrigger = page.getByTestId("results-sort-trigger");
    await expect(sortTrigger).toBeVisible();
    await expect(sortTrigger).toContainText(/best affordability fit/i);
    await expect(page).toHaveURL(/sort=affordability/);
  });
});
