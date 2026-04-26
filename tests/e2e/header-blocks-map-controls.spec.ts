import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Bug Condition Exploration Test for Header Blocks Map Controls
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * The test encodes the expected behavior: map controls should remain interactive
 * when the GlobalHeader is visible and positioned over them.
 * 
 * When this test passes after the fix, it confirms the bug is resolved.
 */

async function waitForMapLoad(page: Page) {
  // Wait for map to be visible and loaded
  await expect(page.getByTestId("map-view")).toBeVisible();
  
  // Wait for map controls to be rendered
  await page.waitForSelector(".maplibregl-ctrl-top-right", { timeout: 10000 });
  
  // Wait a bit more for map to fully initialize
  await page.waitForTimeout(1000);
}

async function ensureHeaderVisible(page: Page) {
  const header = page.getByTestId("global-header");
  await expect(header).toBeVisible();
  
  // If header was dismissed, show it again
  const showHeaderButton = page.getByRole("button", { name: /show header/i });
  if (await showHeaderButton.isVisible()) {
    await showHeaderButton.click();
    await expect(header).toBeVisible();
  }
}

async function getMapControlsInfo(page: Page) {
  // Get map controls container
  const controlsContainer = page.locator(".maplibregl-ctrl-top-right");
  await expect(controlsContainer).toBeVisible();
  
  // Get individual control buttons
  const zoomInButton = controlsContainer.getByRole("button", { name: "Zoom in" });
  const zoomOutButton = controlsContainer.getByRole("button", { name: "Zoom out" });
  const compassButton = controlsContainer.locator(".maplibregl-ctrl-compass");
  const geolocateButton = controlsContainer.locator(".maplibregl-ctrl-geolocate");
  
  return {
    container: controlsContainer,
    zoomIn: zoomInButton,
    zoomOut: zoomOutButton,
    compass: compassButton,
    geolocate: geolocateButton
  };
}

async function expectControlReceivesPointer(
  control: Locator,
  label: string,
) {
  await expect(control).toBeVisible();

  const hitInfo = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const point = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const hit = document.elementFromPoint(point.x, point.y);

    return {
      point,
      hitTag: hit?.tagName ?? null,
      hitClass: hit instanceof HTMLElement ? hit.className : null,
      hitLabel: hit instanceof HTMLElement ? hit.getAttribute("aria-label") : null,
      receivesPointer: hit === element || element.contains(hit),
    };
  });

  expect(
    hitInfo.receivesPointer,
    `${label} should be the top hit target at ${Math.round(hitInfo.point.x)},${Math.round(hitInfo.point.y)}; got ${hitInfo.hitTag} ${hitInfo.hitLabel ?? hitInfo.hitClass ?? ""}`,
  ).toBe(true);
}

async function checkControlsOverlapWithHeader(page: Page) {
  const header = page.getByTestId("global-header");
  const controlsContainer = page.locator(".maplibregl-ctrl-top-right");
  
  const headerBox = await header.boundingBox();
  const controlsBox = await controlsContainer.boundingBox();
  
  if (!headerBox || !controlsBox) {
    throw new Error("Could not get bounding boxes for header or controls");
  }
  
  // Check if header overlaps with controls (header extends into controls area)
  const overlaps = headerBox.x + headerBox.width > controlsBox.x && 
                   headerBox.y < controlsBox.y + controlsBox.height &&
                   headerBox.y + headerBox.height > controlsBox.y;
  
  return {
    overlaps,
    headerBox,
    controlsBox
  };
}

test.describe("Bug Condition: Map Controls Blocked by Header", () => {
  test("Desktop - Map controls should receive pointer events when header is visible", async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    
    await waitForMapLoad(page);
    await ensureHeaderVisible(page);
    
    const controls = await getMapControlsInfo(page);
    const overlapInfo = await checkControlsOverlapWithHeader(page);
    
    console.log("Desktop overlap info:", overlapInfo);
    
    await expectControlReceivesPointer(controls.zoomIn, "Desktop zoom in");
    await controls.zoomIn.click({ force: false });

    await expectControlReceivesPointer(controls.zoomOut, "Desktop zoom out");
    await controls.zoomOut.click({ force: false });

    await expectControlReceivesPointer(controls.compass, "Desktop compass");
    await controls.compass.click({ force: false });

    await expectControlReceivesPointer(controls.geolocate, "Desktop geolocate");
  });
  
  test("Mobile - Map controls should receive pointer events when header is visible", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    
    await waitForMapLoad(page);
    await ensureHeaderVisible(page);
    
    const controls = await getMapControlsInfo(page);
    const overlapInfo = await checkControlsOverlapWithHeader(page);
    
    console.log("Mobile overlap info:", overlapInfo);
    
    // On mobile, controls should have z-index: 30 but may still be blocked by header
    const controlsZIndex = await page.evaluate(() => {
      const controlsElement = document.querySelector('.maplibregl-ctrl-top-right');
      return controlsElement ? window.getComputedStyle(controlsElement).zIndex : null;
    });
    
    console.log("Mobile controls z-index:", controlsZIndex);
    
    await expectControlReceivesPointer(controls.zoomIn, "Mobile zoom in");
    await controls.zoomIn.click({ force: false });

    await expectControlReceivesPointer(controls.zoomOut, "Mobile zoom out");
    await controls.zoomOut.click({ force: false });

    await expectControlReceivesPointer(controls.compass, "Mobile compass");
    await controls.compass.click({ force: false });

    await expectControlReceivesPointer(controls.geolocate, "Mobile geolocate");
  });
  
  test("Header controls should remain functional (preservation check)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    
    await waitForMapLoad(page);
    await ensureHeaderVisible(page);
    
    const header = page.getByTestId("global-header");
    
    // Test theme toggle
    const themeToggle = header.getByRole("button", { name: /toggle theme/i });
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    
    // Verify theme changed (this should work even on unfixed code)
    await page.waitForTimeout(200);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    console.log("Theme is dark after toggle:", isDark);
    
    // Test language selector
    const languageSelect = header.getByRole("combobox", { name: /language/i });
    await expect(languageSelect).toBeVisible();
    await languageSelect.click();
    
    // Should show language options
    await expect(page.getByRole("option")).toHaveCount(2);
    
    // Close the select
    await page.keyboard.press("Escape");
    
    // Test dismiss button
    const dismissButton = header.getByRole("button", { name: /dismiss header/i });
    await expect(dismissButton).toBeVisible();
    await dismissButton.click();
    
    // Header should be hidden
    await expect(header).not.toBeVisible();
    
    // Show header button should appear
    await expect(page.getByRole("button", { name: /show header/i })).toBeVisible();
  });
});
