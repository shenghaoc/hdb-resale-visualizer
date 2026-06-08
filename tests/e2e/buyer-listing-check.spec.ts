import { expect, test, type Page } from "@playwright/test";
import {
  checkDeepLink,
  highConfidenceSet,
  lowSampleSet,
  mockComparableTransactions,
} from "./listing-check.fixtures";

/**
 * Buyer-first listing-price-check workflow coverage.
 *
 * These tests protect the buyer journey that does NOT start on the map: a buyer
 * arrives with a listing's facts and an asking price, gets a verdict +
 * confidence + fair range + comparable evidence, and can save the result to
 * their shortlist. The comparable-transactions API is mocked (see
 * `listing-check.fixtures.ts`) so the verdict, confidence tier, and sample size
 * are deterministic and no live D1 is touched.
 */

test.describe.configure({ timeout: 60_000 });

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function desktopCheckPanel(page: Page) {
  return page.locator("#desktop-check-content");
}

function desktopSavedTab(page: Page) {
  return page.locator(".desktop-tab-bar button").filter({ hasText: /^Saved/ });
}

// ── 1. Start a listing check without using the map ───────────────────────────

test("a first-time buyer can start a listing price check from the Check tab without using the map", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });

  // Open the Check tab straight from the primary nav — no map interaction.
  await page.locator(".desktop-tab-bar").getByRole("button", { name: "Check" }).click();

  const check = desktopCheckPanel(page);
  await expect(check.getByRole("button", { name: /check a listing price/i })).toBeVisible();
  await expect(check.getByPlaceholder(/search for a block/i)).toBeVisible();
  await expect(check.getByText(/search and select a block/i)).toBeVisible();
  await expect(check.getByRole("button", { name: /try sample listing check/i })).toBeVisible();
});

// ── 2–4, 6, 7. Happy path: enter facts → verdict → evidence → save ───────────

test("a buyer enters listing facts and asking price and sees a verdict, confidence, fair range, and comparables", async ({
  page,
}) => {
  await mockComparableTransactions(page, highConfidenceSet);

  // Deep-link the listing facts (this is the buyer arriving from a shared
  // listing); the asking price is entered by hand below.
  await page.goto(
    checkDeepLink({
      floorAreaSqm: 150,
      flatType: "EXECUTIVE",
      storeyRange: "01 TO 03",
      leaseCommenceYear: 1989,
    }),
  );

  const check = desktopCheckPanel(page);
  await expect(check.getByText(/106 LENGKONG TIGA/i)).toBeVisible({ timeout: 15_000 });

  // (2) Listing facts are captured and editable; the entered floor area shows.
  await expect(check.getByRole("spinbutton", { name: /floor area/i })).toHaveValue("150");

  // (2) Buyer enters the asking price.
  await check.getByRole("spinbutton", { name: /asking price/i }).fill("1200000");

  // (3) Verdict, confidence, fair range, and comparable count are all surfaced.
  await expect(check.getByText(/in line with market/i)).toBeVisible({ timeout: 10_000 });
  await expect(check.getByText(/confidence:/i)).toBeVisible();
  await expect(check.getByText(/fair range/i)).toBeVisible();
  await expect(check.getByText(/8 comparable transactions/i)).toBeVisible();

  // (4) Comparable evidence shows the actual transaction rows.
  await expect(check.getByText(/why these comparables/i)).toBeVisible();
  await expect(check.getByRole("columnheader", { name: /similarity/i })).toBeVisible();
  await expect(check.getByText("Same flat type").first()).toBeVisible();

  // (6) Save the listing check to the shortlist.
  await check.getByRole("button", { name: /save to shortlist/i }).click();
  await expect(check.getByRole("button", { name: /saved/i })).toBeVisible();

  // (7) The saved shortlist item is present and preserves the asking price as
  // the buyer's target price (the single item auto-expands the offer editor).
  await desktopSavedTab(page).click();
  const drawer = page.getByTestId("shortlist-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/106 LENGKONG TIGA/i)).toBeVisible({ timeout: 10_000 });
  await expect(drawer.getByRole("spinbutton", { name: /your target price/i })).toHaveValue(
    "1200000",
  );
});

// ── Low-confidence / low-sample state ────────────────────────────────────────

test("a buyer sees a low-confidence verdict and a caveat when only a few comparables exist", async ({
  page,
}) => {
  await mockComparableTransactions(page, lowSampleSet);

  await page.goto(
    checkDeepLink({
      askingPrice: 1_200_000,
      floorAreaSqm: 150,
      flatType: "EXECUTIVE",
      storeyRange: "04 TO 06",
      leaseCommenceYear: 1989,
    }),
  );

  const check = desktopCheckPanel(page);
  await expect(check.getByText(/2 comparable transactions/i)).toBeVisible({ timeout: 15_000 });
  await expect(check.getByText(/confidence: low/i)).toBeVisible();
  await expect(check.getByText(/directional only/i).first()).toBeVisible();
});

// ── 8. Mobile listing-check flow without horizontal scroll ───────────────────

test.describe("mobile", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("a buyer completes the listing check on a phone without horizontal scrolling", async ({
    page,
  }) => {
    await mockComparableTransactions(page, highConfidenceSet);

    await page.goto(
      checkDeepLink({
        askingPrice: 1_200_000,
        floorAreaSqm: 150,
        flatType: "EXECUTIVE",
        storeyRange: "01 TO 03",
        leaseCommenceYear: 1989,
      }),
    );

    const check = page.locator("#mobile-check-content");
    await expect(check.getByText(/in line with market/i)).toBeVisible({ timeout: 15_000 });
    await expect(check.getByText(/8 comparable transactions/i)).toBeVisible();

    // Comparable evidence renders as cards on mobile.
    await expect(check.getByText("Same flat type").first()).toBeVisible();

    // The main flow must not introduce horizontal scrolling (1px tolerance for
    // sub-pixel rounding).
    const overflowBefore = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowBefore).toBeLessThanOrEqual(1);

    // Save to shortlist completes the flow on mobile.
    await check.getByRole("button", { name: /save to shortlist/i }).click();
    await expect(check.getByRole("button", { name: /saved/i })).toBeVisible();

    const overflowAfter = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowAfter).toBeLessThanOrEqual(1);
  });
});
