import { AxeBuilder } from "@axe-core/playwright";
import type { Result } from "axe-core";
import { expect, test, type Page } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

/**
 * MapLibre renders tiles on canvas; contrast rules do not apply to the basemap.
 * Exclude only the canvas and its wrapper — not the whole `.maplibregl-map` root —
 * so axe still audits the zoom controls and attribution link in
 * `.maplibregl-control-container`.
 */
const MAP_EXCLUDES = [".maplibregl-canvas-container", ".maplibregl-canvas"];

async function expectNoSeriousOrCriticalViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .exclude(MAP_EXCLUDES)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ""),
  );

  expect(blocking, formatAxeViolations(blocking)).toEqual([]);
}

function formatAxeViolations(violations: Result[]): string {
  if (violations.length === 0) {
    return "";
  }

  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map(
          (node) => `  - ${node.html}${node.failureSummary ? `\n    ${node.failureSummary}` : ""}`,
        )
        .join("\n");
      return `[${violation.impact}] ${violation.id}: ${violation.help}\n${nodes}`;
    })
    .join("\n\n");
}

test.describe("Accessibility (axe)", () => {
  test("main map view has no serious or critical WCAG violations", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
    ).toBeVisible();

    await expectNoSeriousOrCriticalViolations(page);
  });

  test.describe("Search profile wizard", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("welcome step has no serious or critical WCAG violations", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Set up your search profile" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();

      await expectNoSeriousOrCriticalViolations(page);
    });
  });
});
