/**
 * E2E tests for the CPF Affordability filter (Phase 3).
 *
 * Relies on the global storage state seeded by global-setup.ts:
 *   monthlyIncome: 9000, cpfOABalance: 120_000, age: 35, coApplicantAge: 33
 *
 * All fixture blocks have medians ≈ 1.2 M which is far above the affordable
 * ceiling for that profile, so ?affordable=comfortable always yields 0 matches
 * against the BEDOK fixture blocks.
 */
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial", timeout: 60_000 });

async function waitForResultsPane(page: Page) {
  await expect(page.getByTestId("results-pane")).toBeVisible();
}

// Navigate to the Results tab on desktop so the list is visible.
async function openResultsTab(page: Page) {
  const resultsBtn = page.locator(".desktop-tab-bar").getByRole("button", { name: "Results" });
  if (await resultsBtn.isVisible()) {
    await resultsBtn.click();
  }
  await waitForResultsPane(page);
}

test.describe("affordability filter — URL parameter wiring", () => {
  test("?affordable=comfortable is recognised and reflected in the affordability toggle", async ({
    page,
  }) => {
    await page.goto("/?affordable=comfortable");
    await openResultsTab(page);

    // The affordability ButtonGroup should show mode=comfortable.
    const toggle = page.getByTestId("affordability-filter-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("data-affordability-mode", "comfortable");
  });

  test("?affordable=stretch is recognised", async ({ page }) => {
    await page.goto("/?affordable=stretch");
    await openResultsTab(page);

    const toggle = page.getByTestId("affordability-filter-toggle");
    await expect(toggle).toHaveAttribute("data-affordability-mode", "stretch");
  });

  test("unknown affordable value is ignored (falls back to 'all')", async ({ page }) => {
    await page.goto("/?affordable=invalid");
    await openResultsTab(page);

    const toggle = page.getByTestId("affordability-filter-toggle");
    await expect(toggle).toHaveAttribute("data-affordability-mode", "all");
  });
});

test.describe("affordability filter — result count", () => {
  test("BEDOK without affordability filter shows all 3 fixture blocks", async ({ page }) => {
    await page.goto("/?town=BEDOK");
    await openResultsTab(page);

    // The count badge reads "3 shown" for the 3 BEDOK fixture blocks.
    const badge = page.getByTestId("results-pane").getByText(/3 shown/i);
    await expect(badge).toBeVisible();
  });

  test("BEDOK + affordable=comfortable yields 0 results and shows empty affordability card", async ({
    page,
  }) => {
    // All BEDOK blocks have medians ≈ 1.2 M, well above the test profile ceiling.
    await page.goto("/?town=BEDOK&affordable=comfortable");
    await openResultsTab(page);

    const emptyCard = page.getByTestId("affordability-empty-card");
    await expect(emptyCard).toBeVisible();

    // The card should contain the clear button.
    const clearBtn = emptyCard.getByRole("button", { name: /clear affordability filter/i });
    await expect(clearBtn).toBeVisible();
  });
});

test.describe("affordability filter — clearing via empty-state button", () => {
  test("clicking 'Clear affordability filter' in empty state removes affordable param from URL", async ({
    page,
  }) => {
    await page.goto("/?town=BEDOK&affordable=comfortable");
    await openResultsTab(page);

    const emptyCard = page.getByTestId("affordability-empty-card");
    const clearBtn = emptyCard.getByRole("button", { name: /clear affordability filter/i });
    await clearBtn.click();

    await expect(page).not.toHaveURL(/affordable=/);
    // Town filter should remain intact.
    await expect(page).toHaveURL(/town=BEDOK/);
  });

  test("after clearing, the 3 BEDOK blocks reappear", async ({ page }) => {
    await page.goto("/?town=BEDOK&affordable=comfortable");
    await openResultsTab(page);

    const emptyCard = page.getByTestId("affordability-empty-card");
    await emptyCard.getByRole("button", { name: /clear affordability filter/i }).click();

    const badge = page.getByTestId("results-pane").getByText(/3 shown/i);
    await expect(badge).toBeVisible();
  });
});

test.describe("affordability filter — clearing via filter chip", () => {
  test("?affordable=comfortable emits a dismissible chip", async ({ page }) => {
    await page.goto("/?affordable=comfortable");
    await openResultsTab(page);

    // Chip aria-label follows "filters.removeChip" i18n template:
    // "Remove filter: Affordable: comfortable"
    const chip = page.getByRole("button", {
      name: /remove filter: affordable: comfortable/i,
    });
    await expect(chip).toBeVisible();
  });

  test("clicking the affordability chip removes affordable from URL", async ({ page }) => {
    await page.goto("/?town=BEDOK&affordable=comfortable");
    await openResultsTab(page);

    const chip = page.getByRole("button", {
      name: /remove filter: affordable: comfortable/i,
    });
    await chip.click();

    await expect(page).not.toHaveURL(/affordable=/);
    await expect(page).toHaveURL(/town=BEDOK/);
  });

  test("?affordable=stretch emits a stretch chip", async ({ page }) => {
    await page.goto("/?affordable=stretch");
    await openResultsTab(page);

    const chip = page.getByRole("button", {
      name: /remove filter: affordable: \+ stretch/i,
    });
    await expect(chip).toBeVisible();
  });
});

test.describe("affordability filter — sort integration", () => {
  test("?sort=affordability is accepted when profile is complete", async ({ page }) => {
    // The storage state has a complete profile, so affordability sort is enabled.
    await page.goto("/?sort=affordability");
    await openResultsTab(page);

    // The sort trigger should be present.
    const sortTrigger = page.getByTestId("results-sort-trigger");
    await expect(sortTrigger).toBeVisible();
    // The URL should still contain sort=affordability.
    await expect(page).toHaveURL(/sort=affordability/);
  });
});
