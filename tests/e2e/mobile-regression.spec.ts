import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockComparisonArtifacts } from "./fixtures";

test.describe.configure({
  timeout: 60_000,
});

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const MOBILE_VIEWPORT_COMPACT = { width: 360, height: 640 };

function mobileTabBar(page: Page) {
  return page.getByTestId("mobile-tab-bar");
}

function firstResultCard(page: Page) {
  return page.locator("[data-testid='results-pane'] [data-slot='item']").first();
}

async function expectNoHorizontalOverflow(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => locator.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
}

async function runMobileListingCheckFlow(page: Page) {
  await page.goto("/?search=BEDOK");

  // Keep map visible, but use dedicated workflow to ensure the user does
  // not need explicit map interaction to complete a check.
  await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("mobile-tab-bar")).toBeVisible();

  await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
  await expect(page.getByTestId("results-pane")).toBeVisible();

  const firstResult = firstResultCard(page);
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  await firstResult.click();

  const detailDrawer = page.getByTestId("detail-drawer");
  await expect(detailDrawer).toBeVisible();
  await detailDrawer.getByRole("tab", { name: /negotiate/i }).click();
  await expect(detailDrawer.getByText(/Asking Price Reality Check/i)).toBeVisible();

  const askingPriceInput = detailDrawer.getByLabel(/asking price/i);
  const floorAreaInput = detailDrawer.getByLabel(/floor area/i);
  await askingPriceInput.click();
  await askingPriceInput.pressSequentially("500000");
  await floorAreaInput.click();
  await floorAreaInput.pressSequentially("90");

  // Assessment is reactive — verdict or no-comparables hint appears automatically
  const verdict = detailDrawer.getByTestId("listing-check-verdict");
  const noComparablesHint = detailDrawer.getByText(/no comparable transactions/i);
  const hasVerdict = await verdict
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (hasVerdict) {
    // AskingPriceCheck (detail drawer) uses the v1 engine which does not
    // compute confidence — only the main ListingCheckPanel shows the
    // confidence badge and summary. Assert verdict and evidence only.
    const evidence = detailDrawer.getByTestId("listing-check-evidence");
    await expect(evidence).toBeVisible({ timeout: 25_000 });

    await expectNoHorizontalOverflow(verdict);
    await expectNoHorizontalOverflow(evidence);

    const verdictTop = await verdict.evaluate((element) => element.getBoundingClientRect().top);
    const evidenceTop = await evidence.evaluate((element) => element.getBoundingClientRect().top);
    expect(verdictTop).toBeLessThan(evidenceTop);
  } else {
    // No verdict means no comparables — the hint should be visible as confirmation
    await expect(noComparablesHint).toBeVisible({ timeout: 10_000 });
  }

  const saveButton = detailDrawer.getByRole("button", { name: /add to shortlist/i });
  await expect(saveButton).toBeVisible();
  await saveButton.click();
  // Button switches to "Saved to Shortlist" — verify the saved state via the tab bar badge
  await expect(mobileTabBar(page).locator("[data-slot='badge']")).toContainText("1");

  await page.keyboard.press("Escape");
  await expect(detailDrawer).toHaveCount(0);

  await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
  const shortlistDrawer = page.getByTestId("shortlist-drawer");
  await expect(shortlistDrawer).toBeVisible();

  // First shortlist item is expanded by default — cockpit inputs should be visible
  const offerCeilingInput = shortlistDrawer.getByLabel(/offer ceiling/i);
  const notesInput = shortlistDrawer.getByLabel("Notes", { exact: true });
  await expect(offerCeilingInput).toBeVisible({ timeout: 10_000 });
  await offerCeilingInput.fill("490000");
  await notesInput.fill("Mobile shortlist note");
  await expect(offerCeilingInput).toHaveValue("490000");
  await expect(notesInput).toHaveValue("Mobile shortlist note");
}

async function runShortlistMobileComparisonFlow(page: Page) {
  await mockComparisonArtifacts(page);

  const shortlistData = [
    {
      addressKey: "bedok-10d-bedok-sth-ave-2",
      notes: "",
      targetPrice: null,
      addedAt: new Date().toISOString(),
    },
    {
      addressKey: "bedok-106-lengkong-tiga",
      notes: "",
      targetPrice: null,
      addedAt: new Date(Date.now() - 60000).toISOString(),
    },
  ];

  await page.goto("/");
  await page.evaluate(
    ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
    { data: shortlistData },
  );
  await page.reload();

  // Navigate to saved tab
  await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
  await expect(page.getByTestId("shortlist-drawer")).toBeVisible();

  // Shortlist items should be visible (street names from fixture data)
  await expect(
    page.getByTestId("shortlist-drawer").getByText(/BEDOK STH AVE 2/i).first(),
  ).toBeVisible({ timeout: 10_000 });

  const viewToggle = page.getByTestId("shortlist-view-toggle");
  await viewToggle.getByRole("button", { name: /comparison table/i }).click();

  // Mobile renders the stacked card layout instead of the scrollable desktop
  // table, and neither layout should overflow horizontally.
  const comparisonTable = page.getByTestId("shortlist-comparison-table");
  await expect(comparisonTable).toBeVisible();
  await expectNoHorizontalOverflow(comparisonTable);
  await expect(comparisonTable.getByTestId("shortlist-comparison-card")).toHaveCount(2);
}


test.describe("Mobile Regression: Recent Features", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("results toolbar: sort and view toggle accessible on mobile", async ({ page }) => {
    await page.goto("/");

    // Open filters, set town filter explicitly (required for view toggle)
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();

    // Switch to results
    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Results view toolbar should be visible
    await expect(page.getByTestId("results-view-toolbar")).toBeVisible();

    // View toggle (blocks/town) should be accessible when town is selected
    const viewToggle = page.getByTestId("results-view-toggle");
    await expect(viewToggle).toBeVisible();

    // Sort select should be accessible
    const sortSelect = page.getByTestId("results-pane").getByRole("combobox");
    await expect(sortSelect).toBeVisible();
  });

  test("detail drawer tabs scroll and navigate on mobile", async ({ page }) => {
    await mockComparisonArtifacts(page);
    await page.goto("/");

    // Set town filter and open results
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();

    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Select a block
    const firstResult = firstResultCard(page);
    await expect(firstResult).toBeVisible({ timeout: 10_000 });
    await firstResult.click();

    const detailDrawer = page.getByTestId("detail-drawer");
    await expect(detailDrawer).toBeVisible();

    // Overview tab should be active by default
    await expect(detailDrawer.getByRole("tab", { name: /overview/i })).toBeVisible();

    // Navigate to trends tab
    await detailDrawer.getByRole("tab", { name: /trends/i }).click();
    await expect(detailDrawer.getByText(/Price History/i)).toBeVisible();

    // Navigate to history tab
    await detailDrawer.getByRole("tab", { name: /history/i }).click();
    await expect(detailDrawer.getByText(/Recent Transactions/i)).toBeVisible();

    // Navigate to negotiate tab
    await detailDrawer.getByRole("tab", { name: /negotiate/i }).click();
    await expect(detailDrawer.getByText(/Asking Price Reality Check/i)).toBeVisible();
  });

  test("budget match indicator shows on mobile results", async ({ page }) => {
    await page.goto("/");

    // Open filters, set town and budget (fixture blocks are ~$1.2M)
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();
    await page.locator("#budget-max").fill("1300000");

    // Switch to results
    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Result cards should render the budget-match badge with budget set
    const resultCard = firstResultCard(page);
    await expect(resultCard).toBeVisible({ timeout: 10_000 });
    await expect(resultCard.getByText(/Within selected budget/i)).toBeVisible();
  });

  test("town profile overview visible in mobile results", async ({ page }) => {
    await page.goto("/");

    // Set town filter explicitly (required for town profile)
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    const townSelect = page.getByTestId("filters-panel").getByRole("combobox", { name: /town/i });
    await townSelect.click();
    await page.getByRole("option", { name: "BEDOK" }).click();

    // Switch to results — town profile view toggle should appear
    await mobileTabBar(page).getByRole("button", { name: /results/i }).click();
    await expect(page.getByTestId("results-pane")).toBeVisible();

    // Switch to town view
    const viewToggle = page.getByTestId("results-view-toggle");
    await expect(viewToggle).toBeVisible();
    await viewToggle.getByRole("button", { name: /town/i }).click();

    // Town profile shows median price stats
    const resultsPane = page.getByTestId("results-pane");
    await expect(resultsPane.getByText(/median/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("buyer checklist accessible from mobile saved tab", async ({ page }) => {

    // Pre-seed a shortlist item
    const shortlistData = [
      {
        addressKey: "ang-mo-kio-104a-ang-mo-kio-st-11",
        notes: "Test note",
        targetPrice: 500000,
        addedAt: new Date().toISOString(),
      },
    ];

    await page.goto("/");
    await page.evaluate(
      ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
      { data: shortlistData },
    );
    await page.reload();

    // Navigate to saved tab
    await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
    await expect(page.getByTestId("shortlist-drawer")).toBeVisible();

    // Buyer checklist section should be present
    await expect(page.getByTestId("shortlist-drawer").getByText(/checklist/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shortlist comparison renders card layout on mobile", async ({ page }) => {
    await mockComparisonArtifacts(page);

    // Pre-seed two shortlist items using real fixture address keys
    const shortlistData = [
      {
        addressKey: "bedok-10d-bedok-sth-ave-2",
        notes: "",
        targetPrice: null,
        addedAt: new Date().toISOString(),
      },
      {
        addressKey: "bedok-106-lengkong-tiga",
        notes: "",
        targetPrice: null,
        addedAt: new Date(Date.now() - 60000).toISOString(),
      },
    ];

    await page.goto("/");
    await page.evaluate(
      ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
      { data: shortlistData },
    );
    await page.reload();

    // Navigate to saved tab
    await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
    await expect(page.getByTestId("shortlist-drawer")).toBeVisible();

    // Shortlist items should be visible (street names from fixture data)
    await expect(
      page.getByTestId("shortlist-drawer").getByText(/BEDOK STH AVE 2/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    const viewToggle = page.getByTestId("shortlist-view-toggle");
    await viewToggle.getByRole("button", { name: /comparison table/i }).click();

    const comparisonTable = page.getByTestId("shortlist-comparison-table");
    await expect(comparisonTable).toBeVisible();
    // Mobile renders card layout instead of a scrollable table
    await expect(comparisonTable.getByTestId("shortlist-comparison-card")).toHaveCount(2);
  });

  test("shortlist offer board fields editable on mobile", async ({ page }) => {
    const shortlistData = [
      {
        addressKey: "ang-mo-kio-104a-ang-mo-kio-st-11",
        notes: "",
        targetPrice: null,
        addedAt: new Date().toISOString(),
      },
    ];

    await page.goto("/");
    await page.evaluate(
      ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
      { data: shortlistData },
    );
    await page.reload();

    await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
    const drawer = page.getByTestId("shortlist-drawer");
    await expect(drawer).toBeVisible();

    // Single item auto-expands; wait for the asking price field to be visible
    const askingInput = page.getByRole("spinbutton", { name: /asking price/i });
    await expect(askingInput).toBeVisible({ timeout: 10_000 });

    // Fill asking price
    await askingInput.fill("550000");
    await expect(askingInput).toHaveValue("550000");

    // Change decision status
    const statusSelect = drawer.getByRole("combobox", { name: /decision status/i });
    await statusSelect.scrollIntoViewIfNeeded();
    await statusSelect.click();
    await page.getByRole("option", { name: /considering/i }).click();
    await expect(statusSelect).toContainText(/considering/i);

    // Verify persistence after reload
    await page.reload();
    await mobileTabBar(page).getByRole("button", { name: /saved/i }).click();
    await expect(drawer).toBeVisible();

    // Wait for auto-expanded item
    await expect(page.getByRole("spinbutton", { name: /asking price/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("spinbutton", { name: /asking price/i })).toHaveValue("550000");
    await expect(drawer.getByRole("combobox", { name: /decision status/i })).toContainText(
      /considering/i,
    );
  });

  test("mobile tab bar shows shortlist count badge", async ({ page }) => {

    const shortlistData = [
      {
        addressKey: "ang-mo-kio-104a-ang-mo-kio-st-11",
        notes: "",
        targetPrice: null,
        addedAt: new Date().toISOString(),
      },
    ];

    await page.goto("/");
    await page.evaluate(
      ({ data }) => localStorage.setItem("hdb_resale_shortlist_v1", JSON.stringify(data)),
      { data: shortlistData },
    );
    await page.reload();

    // Badge with count should appear on the Saved button
    const savedButton = mobileTabBar(page).getByRole("button", { name: /saved/i });
    await expect(savedButton).toBeVisible();
    await expect(mobileTabBar(page).locator("[data-slot='badge']")).toContainText("1");
  });

  test("mobile theme toggle and language selector remain functional", async ({ page }) => {
    await page.goto("/");

    const tabBar = mobileTabBar(page);
    await expect(tabBar).toBeVisible({ timeout: 15_000 });

    // Theme toggle
    const themeToggle = tabBar.getByRole("button", { name: /toggle theme/i });
    await expect(themeToggle).toBeVisible();

    const initialDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    await themeToggle.click();
    const afterToggle = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(afterToggle).not.toBe(initialDark);

    // Language selector (top-right map control)
    const langSelect = page
      .getByTestId("map-locale-control")
      .getByRole("combobox", { name: /language/i });
    await expect(langSelect).toBeVisible();
    await langSelect.click();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await page.keyboard.press("Escape");
  });

  test("mobile filter panel opens and budget inputs work", async ({ page }) => {
    await page.goto("/");

    // Open filters
    await mobileTabBar(page).getByRole("button", { name: /filters/i }).click();
    await expect(page.getByTestId("filters-panel")).toBeVisible();

    // Budget inputs should be accessible
    const budgetMin = page.getByRole("spinbutton", { name: /minimum budget/i });
    const budgetMax = page.getByRole("spinbutton", { name: /maximum budget/i });
    await expect(budgetMin).toBeVisible();
    await expect(budgetMax).toBeVisible();

    // Fill budget values
    await budgetMin.fill("300000");
    await budgetMax.fill("600000");

    // Values should persist
    await expect(budgetMin).toHaveValue("300000");
    await expect(budgetMax).toHaveValue("600000");
  });

  test("mobile listing check works without opening map and is editable in shortlist", async ({ page }) => {
    await runMobileListingCheckFlow(page);
  });
});

test.describe("Mobile Regression: Compact Phone Viewport", () => {
  test.use({ viewport: MOBILE_VIEWPORT_COMPACT });

  test("shortlist comparison uses mobile cards on compact width", async ({ page }) => {
    await runShortlistMobileComparisonFlow(page);
  });

  test("mobile listing check and shortlist edit works at compact width", async ({ page }) => {
    await runMobileListingCheckFlow(page);
  });
});
