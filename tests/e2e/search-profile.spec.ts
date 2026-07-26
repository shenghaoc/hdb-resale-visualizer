import { expect, test } from "@playwright/test";

test.describe("Search Profile Wizard", () => {
  // Override global storage state so we start as a fresh user (no saved search profile)
  test.use({ storageState: { cookies: [], origins: [] } });

  test("runs through the search profile setup wizard to completion", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("button", { name: "Buyer setup" }).click();

    // 1. Flat Type Step — setup starts with a useful preference, not an intro screen.
    await expect(page.getByText("What type of flat?")).toBeVisible();
    const flatTypeBtn = page.getByRole("button", { name: "4 ROOM", exact: true });
    await flatTypeBtn.click();
    await page.getByRole("button", { name: "Next" }).click();

    // 2. Budget Step
    await expect(page.getByText("What's your budget?")).toBeVisible();
    const budgetBtn = page.getByRole("button", { name: "S$700K", exact: true });
    await budgetBtn.click();
    await page.getByRole("button", { name: "Next" }).click();

    // 3. Lease Step
    await expect(page.getByText("Minimum remaining lease?")).toBeVisible();
    await page.getByRole("button", { name: "70 yr", exact: true }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // 4. Affordability Step (CPF, age, income — all optional and local-only)
    await expect(page.getByText("Age and affordability?")).toBeVisible();
    await expect(page.getByText(/stored only in this browser/i)).toBeVisible();
    await page.getByLabel("Your age").fill("38");
    await page.getByLabel("Co-applicant age").fill("36");
    await page.getByLabel("CPF OA balance (SGD)").fill("120000");
    await page.getByLabel("Household monthly income (SGD)").fill("9500");
    await page.getByRole("button", { name: "Next" }).click();

    // 5. Review Step
    await expect(page.getByText("Profile ready")).toBeVisible();
    await expect(page.getByText("4 ROOM")).toBeVisible();
    await expect(page.getByText("S$700,000")).toBeVisible();
    await expect(page.getByText("70 years")).toBeVisible();

    const continueBtn = page.getByRole("button", { name: "Apply setup" });
    await continueBtn.click();

    // 8. Verify wizard is closed and main map prompt or content is visible
    await expect(page.getByText("Profile ready")).not.toBeVisible();

    // Verify local storage was populated correctly
    const profileJson = await page.evaluate(() =>
      localStorage.getItem("hdb_resale_search_profile_v3"),
    );
    expect(profileJson).not.toBeNull();
    const profile = JSON.parse(profileJson!);
    expect(profile).toEqual({
      version: 3,
      mainFlatType: "4 ROOM",
      maxBudget: 700000,
      minimumRemainingLeaseYears: 70,
      age: 38,
      coApplicantAge: 36,
      cpfOABalance: 120000,
      monthlyIncome: 9500,
    });
  });
});
