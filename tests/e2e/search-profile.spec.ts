import "temporal-polyfill/global";
import { expect, test } from "@playwright/test";

test.describe("Search Profile Wizard", () => {
  // Override global storage state so we start as a fresh user (no saved search profile)
  test.use({ storageState: { cookies: [], origins: [] } });

  test("runs through the search profile setup wizard to completion", async ({ page }) => {
    await page.goto("/");

    // 1. Welcome Step
    const title = page.getByRole("heading", { name: "Set up your search profile" });
    await expect(title).toBeVisible();

    const getStartedBtn = page.getByRole("button", { name: "Get started" });
    await expect(getStartedBtn).toBeVisible();
    await getStartedBtn.click();

    // 2. Flat Type Step
    await expect(page.getByText("What type of flat?")).toBeVisible();
    const flatTypeBtn = page.getByRole("button", { name: "4 ROOM", exact: true });
    await flatTypeBtn.click();
    await page.getByRole("button", { name: "Next" }).click();

    // 3. Budget Step
    await expect(page.getByText("What's your budget?")).toBeVisible();
    const budgetBtn = page.getByRole("button", { name: "S$700K", exact: true });
    await budgetBtn.click();
    await page.getByRole("button", { name: "Next" }).click();

    // 4. Commute Step
    await expect(page.getByText("Where do you commute?")).toBeVisible();
    await page.getByPlaceholder("e.g. Raffles Place MRT").fill("Raffles Place");

    // Open MRT picker
    const pickerTrigger = page.getByRole("button", { name: "Select MRT station" });
    await pickerTrigger.click();

    // Search and select station
    await page.getByPlaceholder("Search MRT station").fill("RAFFLES PLACE");
    const option = page.getByRole("option", { name: "Raffles Place", exact: true });
    await expect(option).toBeVisible();
    await option.click();

    // Select commute time preset
    await page.getByRole("button", { name: "30 min", exact: true }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // 5. Lease Step
    await expect(page.getByText("Minimum remaining lease?")).toBeVisible();
    await page.getByRole("button", { name: "70 yr", exact: true }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // 6. Affordability Step (CPF, age, income — all optional)
    await expect(page.getByText("Age and affordability?")).toBeVisible();
    await page.getByLabel("Your age").fill("38");
    await page.getByLabel("Co-applicant age").fill("36");
    await page.getByLabel("CPF OA balance (SGD)").fill("120000");
    await page.getByLabel("Household monthly income (SGD)").fill("9500");
    await page.getByRole("button", { name: "Next" }).click();

    // 7. Review Step
    await expect(page.getByText("Profile ready")).toBeVisible();
    await expect(page.getByText("4 ROOM")).toBeVisible();
    await expect(page.getByText("S$700,000")).toBeVisible();
    await expect(page.getByText("Raffles Place")).toBeVisible();
    await expect(page.getByText("30 min")).toBeVisible();
    await expect(page.getByText("70 years")).toBeVisible();

    const continueBtn = page.getByRole("button", { name: "Continue to map" });
    await continueBtn.click();

    // 8. Verify wizard is closed and main map prompt or content is visible
    await expect(title).not.toBeVisible();

    // Verify local storage was populated correctly
    const profileJson = await page.evaluate(() => localStorage.getItem("hdb_resale_search_profile_v1"));
    expect(profileJson).not.toBeNull();
    const profile = JSON.parse(profileJson!);
    expect(profile.mainFlatType).toBe("4 ROOM");
    expect(profile.maxBudget).toBe(700000);
    expect(profile.commuteAnchorLabel).toBe("Raffles Place");
    expect(profile.commuteAnchorMrt).toBe("RAFFLES PLACE MRT STATION");
    expect(profile.maxComfortableCommuteMinutes).toBe(30);
    expect(profile.minimumRemainingLeaseYears).toBe(70);
    expect(profile.age).toBe(38);
    expect(profile.coApplicantAge).toBe(36);
    expect(profile.cpfOABalance).toBe(120000);
    expect(profile.monthlyIncome).toBe(9500);

    const dismissed = await page.evaluate(() => localStorage.getItem("hdb_resale_search_profile_wizard_dismissed_v1"));
    expect(dismissed).toBe("1");
  });
});
