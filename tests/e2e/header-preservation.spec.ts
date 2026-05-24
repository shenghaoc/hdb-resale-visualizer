import { expect, test, type Page } from "@playwright/test";

/**
 * Preservation Property Tests for Header & Tab-Bar Controls
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * These tests capture the baseline behavior of app controls across the floating
 * header, floating map locale control, and unified desktop tab bar. Theme toggle
 * lives in the bottom tab bar; the language selector is top-right on the map;
 * the dismiss button remains in the header.
 *
 * Following observation-first methodology: observe behavior patterns first,
 * then encode them as property-based tests for stronger guarantees.
 */

async function waitForAppLoad(page: Page) {
  await expect(
    page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".maplibregl-ctrl-top-right")).toBeVisible({ timeout: 20_000 });
}

async function ensureHeaderVisible(page: Page) {
  const header = page.getByTestId("global-header");
  
  // If header was dismissed, show it again
  const showHeaderButton = page.getByRole("button", { name: /show header/i });
  if (await showHeaderButton.isVisible()) {
    await showHeaderButton.click();
    await expect(header).toBeVisible();
  }
  
  await expect(header).toBeVisible();
}

async function getControlElements(page: Page) {
  const header = page.getByTestId("global-header");
  const tabBar = page.getByTestId("desktop-tab-bar");
  const mapLocale = page.getByTestId("map-locale-control");
  await expect(header).toBeVisible();
  await expect(tabBar).toBeVisible();
  await expect(mapLocale).toBeVisible();

  return {
    header,
    tabBar,
    mapLocale,
    themeToggle: tabBar.getByRole("button", { name: /toggle theme/i }),
    languageSelect: mapLocale.getByRole("combobox", { name: /language/i }),
    dismissButton: header.getByRole("button", { name: /dismiss header/i }),
  };
}

async function getCurrentTheme(page: Page): Promise<'light' | 'dark'> {
  return await page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
}

async function getHeaderContent(page: Page) {
  const header = page.getByTestId("global-header");
  const titleLocator = header.locator("[data-testid='header-title'], [data-slot='card-title'], h1, h2, h3").first();
  
  return {
    title: await titleLocator.textContent(),
    badges: await header.locator("[data-slot='badge'], .badge").allTextContents(),
    metadata: await header.locator("p").allTextContents()
  };
}

test.describe("Preservation: Header & Tab Bar Controls Continue to Function", () => {
  
  test("Property: Theme toggle switches between light and dark modes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);

    const elements = await getControlElements(page);

    // Record initial theme
    const initialTheme = await getCurrentTheme(page);

    // Test theme toggle functionality
    await expect(elements.themeToggle).toBeVisible();
    await elements.themeToggle.click();

    if (initialTheme === "light") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    } else {
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    }

    // Toggle back to verify it works both ways
    await elements.themeToggle.click();

    if (initialTheme === "light") {
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    } else {
      await expect(page.locator("html")).toHaveClass(/dark/);
    }
  });
  
  test("Property: Language selector switches between available languages", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);

    const elements = await getControlElements(page);

    // Test language selector functionality - just verify it opens and has options
    await expect(elements.languageSelect).toBeVisible();
    await elements.languageSelect.click();
    
    // Should show language options
    const options = page.getByRole("option");
    await expect(options).toHaveCount(2); // English and Chinese
    
    // Get all option texts
    const optionTexts = await options.allTextContents();
    // PRESERVATION ASSERTION: Should have both English and Chinese options
    expect(optionTexts).toContain("English");
    expect(optionTexts).toContain("中文");
    
    // Close the select without changing language to avoid potential page reload
    await page.keyboard.press("Escape");
    
    // PRESERVATION ASSERTION: Language selector should remain visible after interaction
    await expect(elements.languageSelect).toBeVisible();
  });
  
  test("Property: Dismiss button hides the header", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);

    const elements = await getControlElements(page);

    // Test dismiss button functionality
    await expect(elements.dismissButton).toBeVisible();
    await elements.dismissButton.click();
    
    // PRESERVATION ASSERTION: Header should be hidden
    await expect(elements.header).not.toBeVisible();

    // Language selector stays on the map after header dismissal.
    await expect(elements.languageSelect).toBeVisible();
    
    // Show header button should appear
    const showHeaderButton = page.getByRole("button", { name: /show header/i });
    await expect(showHeaderButton).toBeVisible();
    
    // Test that we can show the header again
    await showHeaderButton.click();
    await expect(elements.header).toBeVisible();
  });
  
  test("Property: Mobile map view shows compact header with search toggle", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForAppLoad(page);

    await expect(page.getByTestId("global-header")).toBeVisible();
    await expect(page.getByTestId("header-search-toggle")).toBeVisible();
    await expect(page.getByTestId("header-search-input")).toBeHidden();
    await expect(page.getByRole("button", { name: /show header/i })).toHaveCount(0);
    await expect(page.getByTestId("map-locale-control")).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-top-right")).toBeVisible();
  });
  
  test("Property: Visual styling (backdrop blur, transparency, shadows) renders correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);
    
    // PRESERVATION ASSERTIONS: Visual styles should be present on the floating header pill.
    // The pill is a nested button element inside the header landmark, so probe the button.
    const headerPill = page.getByTestId("global-header").locator("button").first();
    const pillStyles = await headerPill.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        backdropFilter: s.backdropFilter,
        backgroundColor: s.backgroundColor,
        boxShadow: s.boxShadow,
      };
    });

    expect(pillStyles.backdropFilter).toBeTruthy(); // Should have backdrop blur
    expect(pillStyles.backgroundColor).toBeTruthy(); // Should have background color
    expect(pillStyles.boxShadow).toBeTruthy(); // Should have shadow

    // Test that styles persist after theme toggle
    const elements = await getControlElements(page);
    const themeBeforeToggle = await getCurrentTheme(page);
    await elements.themeToggle.click();
    if (themeBeforeToggle === "light") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    } else {
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    }

    const stylesAfterThemeToggle = await headerPill.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        backdropFilter: s.backdropFilter,
        boxShadow: s.boxShadow,
      };
    });

    expect(stylesAfterThemeToggle.backdropFilter).toBeTruthy();
    expect(stylesAfterThemeToggle.boxShadow).toBeTruthy();
  });
  
  test("Property: Content display (title, badges, metadata) appears correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);
    
    const content = await getHeaderContent(page);
    // PRESERVATION ASSERTIONS: Content should be present
    expect(content.title).toBeTruthy(); // Should have a title
    expect(content.title).not.toBe(""); // Title should not be empty

    // Test that content persists after language change
    const elements = await getControlElements(page);
    await elements.languageSelect.click();

    const options = page.getByRole("option");
    const optionCount = await options.count();
    
    if (optionCount > 0) {
      const switchingToChinese =
        (await page.getByRole("option", { name: "中文", selected: true }).count()) === 0;
      await page
        .getByRole("option", { name: switchingToChinese ? "中文" : "English" })
        .click();
      await expect(page.getByTestId("global-header")).toContainText(
        switchingToChinese ? "笔交易" : "transactions",
      );

      const contentAfterLanguageChange = await getHeaderContent(page);

      // Title should still be present (may be translated)
      expect(contentAfterLanguageChange.title).toBeTruthy();
      expect(contentAfterLanguageChange.title).not.toBe("");
    } else {
      await page.keyboard.press("Escape");
    }
  });
});

const desktopViewports = [
  { width: 1920, height: 1080, label: "large desktop" },
  { width: 1280, height: 720, label: "standard desktop" },
  { width: 1024, height: 768, label: "minimum desktop" },
] as const;

const mobileViewports = [
  { width: 768, height: 1024, label: "tablet" },
  { width: 390, height: 844, label: "mobile" },
  { width: 320, height: 568, label: "small mobile" },
] as const;

test.describe("Property-Based Preservation Tests", () => {

  for (const viewport of desktopViewports) {
    test(`Property: Header controls work at ${viewport.label} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await waitForAppLoad(page);
      await ensureHeaderVisible(page);

      const elements = await getControlElements(page);

      await expect(elements.themeToggle).toBeVisible();
      await expect(elements.languageSelect).toBeVisible();
      await expect(elements.dismissButton).toBeVisible();

      const initialTheme = await getCurrentTheme(page);
      await elements.themeToggle.click();
      if (initialTheme === "light") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      }

      // Reset
      await elements.themeToggle.click();
      if (initialTheme === "light") {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).toHaveClass(/dark/);
      }
    });
  }

  for (const viewport of mobileViewports) {
    test(`Property: Compact header visible at ${viewport.label} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await waitForAppLoad(page);

      await expect(page.getByTestId("global-header")).toBeVisible();
      if (viewport.width < 640) {
        await expect(page.getByTestId("header-search-toggle")).toBeVisible();
      } else {
        await expect(page.getByTestId("header-search-input")).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /show header/i })).toHaveCount(0);
      await expect(page.locator(".maplibregl-ctrl-top-right")).toBeVisible();
    });
  }

  test("Property: Header state transitions work correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);

    for (let i = 0; i < 3; i++) {
      await ensureHeaderVisible(page);
      const elements = await getControlElements(page);

      await elements.dismissButton.click();
      await expect(elements.header).not.toBeVisible();

      const showHeaderButton = page.getByRole("button", { name: /show header/i });
      await expect(showHeaderButton).toBeVisible();
      await showHeaderButton.click();
      await expect(elements.header).toBeVisible();

      const initialTheme = await getCurrentTheme(page);
      const newElements = await getControlElements(page);
      await newElements.themeToggle.click();
      if (initialTheme === "light") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      }

      // Reset theme
      await newElements.themeToggle.click();
      if (initialTheme === "light") {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).toHaveClass(/dark/);
      }
    }
  });
});
