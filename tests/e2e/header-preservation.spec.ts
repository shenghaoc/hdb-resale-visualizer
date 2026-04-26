import { expect, test, type Page, type ElementHandle } from "@playwright/test";

/**
 * Preservation Property Tests for Header Controls
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 * 
 * These tests capture the baseline behavior of header controls on UNFIXED code.
 * They MUST PASS on unfixed code to establish the preservation requirements.
 * After the fix is implemented, these same tests must continue to pass,
 * ensuring no regressions in header functionality.
 * 
 * Following observation-first methodology: observe behavior patterns first,
 * then encode them as property-based tests for stronger guarantees.
 */

async function waitForAppLoad(page: Page) {
  // Wait for the app to be fully loaded
  await expect(page.getByTestId("map-view")).toBeVisible();
  await page.waitForTimeout(1000); // Allow for initialization
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

async function getHeaderElements(page: Page) {
  const header = page.getByTestId("global-header");
  await expect(header).toBeVisible();
  
  return {
    header,
    themeToggle: header.getByRole("button", { name: /toggle theme/i }),
    languageSelect: header.getByRole("combobox", { name: /language/i }),
    dismissButton: header.getByRole("button", { name: /dismiss header/i }),
    // Mobile info toggle might not always be visible, so we'll check conditionally
    mobileInfoToggle: header.getByRole("button", { name: /toggle metadata/i })
  };
}

async function getCurrentTheme(page: Page): Promise<'light' | 'dark'> {
  return await page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
}

async function getHeaderVisualStyles(page: Page) {
  const header = page.getByTestId("global-header");
  const handle = await header.elementHandle() as ElementHandle<HTMLElement>;
  
  return await page.evaluate((headerElement) => {
    if (!headerElement) return null;
    
    const styles = window.getComputedStyle(headerElement);
    return {
      backdropFilter: styles.backdropFilter,
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow,
      border: styles.border,
      opacity: styles.opacity
    };
  }, handle);
}

async function getHeaderContent(page: Page) {
  const header = page.getByTestId("global-header");
  
  return {
    title: await header.locator("h1, h2, h3, [data-slot='card-title']").first().textContent(),
    badges: await header.locator("[data-slot='badge'], .badge").allTextContents(),
    metadata: await header.locator("p").allTextContents()
  };
}

test.describe("Preservation: Header Controls Continue to Function", () => {
  
  test("Property: Theme toggle switches between light and dark modes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);
    
    const elements = await getHeaderElements(page);
    
    // Record initial theme
    const initialTheme = await getCurrentTheme(page);
    console.log("Initial theme:", initialTheme);
    
    // Test theme toggle functionality
    await expect(elements.themeToggle).toBeVisible();
    await elements.themeToggle.click();
    await page.waitForTimeout(200); // Allow for theme transition
    
    const themeAfterToggle = await getCurrentTheme(page);
    console.log("Theme after toggle:", themeAfterToggle);
    
    // PRESERVATION ASSERTION: Theme should have switched
    expect(themeAfterToggle).not.toBe(initialTheme);
    
    // Toggle back to verify it works both ways
    await elements.themeToggle.click();
    await page.waitForTimeout(200);
    
    const themeAfterSecondToggle = await getCurrentTheme(page);
    console.log("Theme after second toggle:", themeAfterSecondToggle);
    
    // Should be back to initial theme
    expect(themeAfterSecondToggle).toBe(initialTheme);
  });
  
  test("Property: Language selector switches between available languages", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);
    
    const elements = await getHeaderElements(page);
    
    // Test language selector functionality - just verify it opens and has options
    await expect(elements.languageSelect).toBeVisible();
    await elements.languageSelect.click();
    
    // Should show language options
    const options = page.getByRole("option");
    await expect(options).toHaveCount(2); // English and Chinese
    
    // Get all option texts
    const optionTexts = await options.allTextContents();
    console.log("Available language options:", optionTexts);
    
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
    
    const elements = await getHeaderElements(page);
    
    // Test dismiss button functionality
    await expect(elements.dismissButton).toBeVisible();
    await elements.dismissButton.click();
    
    // PRESERVATION ASSERTION: Header should be hidden
    await expect(elements.header).not.toBeVisible();
    
    // Show header button should appear
    const showHeaderButton = page.getByRole("button", { name: /show header/i });
    await expect(showHeaderButton).toBeVisible();
    
    // Test that we can show the header again
    await showHeaderButton.click();
    await expect(elements.header).toBeVisible();
  });
  
  test("Property: Mobile map view omits the header overlay", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForAppLoad(page);

    await expect(page.getByTestId("global-header")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /show header/i })).toHaveCount(0);
    await expect(page.locator(".maplibregl-ctrl-top-right")).toBeVisible();
  });
  
  test("Property: Visual styling (backdrop blur, transparency, shadows) renders correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);
    
    const initialStyles = await getHeaderVisualStyles(page);
    console.log("Header visual styles:", initialStyles);
    
    // PRESERVATION ASSERTIONS: Visual styles should be present
    expect(initialStyles).toBeTruthy();
    if (initialStyles) {
      expect(initialStyles.backdropFilter).toBeTruthy(); // Should have backdrop blur
      expect(initialStyles.backgroundColor).toBeTruthy(); // Should have background color
      expect(initialStyles.boxShadow).toBeTruthy(); // Should have shadow
    }
    
    // Test that styles persist after theme toggle
    const elements = await getHeaderElements(page);
    await elements.themeToggle.click();
    await page.waitForTimeout(200);
    
    const stylesAfterThemeToggle = await getHeaderVisualStyles(page);
    console.log("Header visual styles after theme toggle:", stylesAfterThemeToggle);
    
    // Backdrop blur and shadows should still be present
    if (stylesAfterThemeToggle) {
      expect(stylesAfterThemeToggle.backdropFilter).toBeTruthy();
      expect(stylesAfterThemeToggle.boxShadow).toBeTruthy();
    }
  });
  
  test("Property: Content display (title, badges, metadata) appears correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    await ensureHeaderVisible(page);
    
    const content = await getHeaderContent(page);
    console.log("Header content:", content);
    
    // PRESERVATION ASSERTIONS: Content should be present
    expect(content.title).toBeTruthy(); // Should have a title
    expect(content.title).not.toBe(""); // Title should not be empty
    
    // Test that content persists after language change
    const elements = await getHeaderElements(page);
    await elements.languageSelect.click();
    
    const options = page.getByRole("option");
    const optionCount = await options.count();
    
    if (optionCount > 0) {
      await options.first().click();
      await page.waitForTimeout(200);
      
      const contentAfterLanguageChange = await getHeaderContent(page);
      console.log("Header content after language change:", contentAfterLanguageChange);
      
      // Title should still be present (may be translated)
      expect(contentAfterLanguageChange.title).toBeTruthy();
      expect(contentAfterLanguageChange.title).not.toBe("");
    } else {
      await page.keyboard.press("Escape");
    }
  });
});

test.describe("Property-Based Preservation Tests", () => {
  
  test("Property: Header controls work across different viewport sizes", async ({ page }) => {
    await page.goto("/");
    await waitForAppLoad(page);
    
    // Property-based test: Generate desktop/tablet viewport sizes where the header is present
    const viewportSizes = [
      { width: 1920, height: 1080 }, // Large desktop
      { width: 1280, height: 720 },  // Standard desktop
      { width: 1024, height: 768 }   // Minimum desktop shell
    ];
    
    for (const viewport of viewportSizes) {
      console.log(`Testing viewport: ${viewport.width}x${viewport.height}`);
      
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300); // Allow for responsive layout changes
      await ensureHeaderVisible(page);
      
      const elements = await getHeaderElements(page);
      
      // PRESERVATION ASSERTION: Core controls should be visible and functional
      await expect(elements.themeToggle).toBeVisible();
      await expect(elements.languageSelect).toBeVisible();
      await expect(elements.dismissButton).toBeVisible();
      
      // Test theme toggle works at this viewport size
      const initialTheme = await getCurrentTheme(page);
      await elements.themeToggle.click();
      await page.waitForTimeout(200);
      const themeAfterToggle = await getCurrentTheme(page);
      
      expect(themeAfterToggle).not.toBe(initialTheme);
      
      // Reset theme for next iteration
      await elements.themeToggle.click();
      await page.waitForTimeout(200);
    }
  });

  test("Property: Header stays absent across mobile viewport sizes", async ({ page }) => {
    await page.goto("/");
    await waitForAppLoad(page);

    const viewportSizes = [
      { width: 768, height: 1024 }, // Tablet below desktop shell
      { width: 390, height: 844 },  // Mobile
      { width: 320, height: 568 }   // Small mobile
    ];

    for (const viewport of viewportSizes) {
      console.log(`Testing mobile viewport: ${viewport.width}x${viewport.height}`);

      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);

      await expect(page.getByTestId("global-header")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /show header/i })).toHaveCount(0);
      await expect(page.locator(".maplibregl-ctrl-top-right")).toBeVisible();
    }
  });
  
  test("Property: Header state transitions work correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await waitForAppLoad(page);
    
    // Test the complete header visibility cycle multiple times
    for (let i = 0; i < 3; i++) {
      console.log(`Testing header visibility cycle ${i + 1}`);
      
      // Ensure header is visible
      await ensureHeaderVisible(page);
      const elements = await getHeaderElements(page);
      
      // Dismiss header
      await elements.dismissButton.click();
      await expect(elements.header).not.toBeVisible();
      
      // Show header again
      const showHeaderButton = page.getByRole("button", { name: /show header/i });
      await expect(showHeaderButton).toBeVisible();
      await showHeaderButton.click();
      await expect(elements.header).toBeVisible();
      
      // Verify controls still work after show/hide cycle
      const initialTheme = await getCurrentTheme(page);
      const newElements = await getHeaderElements(page);
      await newElements.themeToggle.click();
      await page.waitForTimeout(200);
      const themeAfterToggle = await getCurrentTheme(page);
      
      // PRESERVATION ASSERTION: Controls should work after visibility cycle
      expect(themeAfterToggle).not.toBe(initialTheme);
      
      // Reset theme
      await newElements.themeToggle.click();
      await page.waitForTimeout(200);
    }
  });
});
