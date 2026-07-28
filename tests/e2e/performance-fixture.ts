import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import type { BlockSummary, Manifest } from "../../shared/data-types";
import { MAP_SEARCH_DEBOUNCE_MS } from "../../src/shared/lib/constants";

const INTERACTION_RESPONSE_TIMEOUT_MS = 10_000;
export const PERFORMANCE_BLOCK_COUNT = 10_000;

const fixtureBlocks = JSON.parse(
  readFileSync(new URL("../fixtures/public-data/block-summaries.json", import.meta.url), "utf8"),
) as BlockSummary[];
const fixtureManifest = JSON.parse(
  readFileSync(new URL("../fixtures/public-data/manifest.json", import.meta.url), "utf8"),
) as Manifest;

const performanceBlocks = Array.from({ length: PERFORMANCE_BLOCK_COUNT }, (_, index) => {
  const template = fixtureBlocks[index % fixtureBlocks.length];
  if (!template) throw new Error("Performance fixture requires at least one block");
  const coordinateOffset = (index % 50) * 0.000_001;
  const searchIdentity =
    index < 300
      ? { town: "BEDOK", streetName: "BEDOK NORTH ROAD", displayName: "BEDOK PERFORMANCE" }
      : index < 500
        ? {
            town: "ANG MO KIO",
            streetName: "ANG MO KIO AVENUE 10",
            displayName: "ANG MO KIO PERFORMANCE",
          }
        : index < 600
          ? {
              town: "GEYLANG",
              streetName: "LENGKONG TIGA",
              displayName: "KEMBANGAN PERFORMANCE",
            }
          : {
              town: "WOODLANDS",
              streetName: "WOODLANDS RING ROAD",
              displayName: "NORTH COAST PERFORMANCE",
            };
  return {
    ...template,
    ...searchIdentity,
    addressKey: `${template.addressKey}-perf-${index}`,
    block: `${template.block}-${index}`,
    coordinates: {
      lat: template.coordinates.lat + coordinateOffset,
      lng: template.coordinates.lng + coordinateOffset,
    },
  };
});

const performanceManifest: Manifest = {
  ...fixtureManifest,
  counts: {
    ...fixtureManifest.counts,
    blocks: PERFORMANCE_BLOCK_COUNT,
  },
};

export async function openApp(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("global-header")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("application", { name: /interactive map of singapore hdb resale blocks/i }),
  ).toBeVisible({ timeout: 20_000 });
}

export async function servePerformanceCorpus(page: Page): Promise<void> {
  await page.route("**/api/manifest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(performanceManifest),
    }),
  );
  await page.route("**/api/block-summaries", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(performanceBlocks),
    }),
  );
}

// The results list lives on the desktop Results tab and is hidden until opened.
export async function openResultsTab(page: Page): Promise<void> {
  await page
    .locator(".desktop-tab-bar")
    .getByRole("button", { name: /results/i })
    .click();
  await expect(page.getByTestId("results-pane")).toBeVisible({ timeout: 5_000 });
}

function resultItems(page: Page) {
  return page.locator("[data-testid='results-pane'] [data-slot='item']");
}

export async function applySearchAndExpectResultCount(
  page: Page,
  query: string,
  expectedCount: number,
): Promise<void> {
  await page.getByTestId("header-search-input").fill(query);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("search"), {
      timeout: INTERACTION_RESPONSE_TIMEOUT_MS,
    })
    .toBe(query);
  await expect(resultItems(page)).toHaveCount(expectedCount, {
    timeout: INTERACTION_RESPONSE_TIMEOUT_MS,
  });
}

export async function applySearchAndExpectSummary(
  page: Page,
  query: string,
  expectedCount: number,
): Promise<void> {
  await page.getByTestId("header-search-input").fill(query);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("search"), {
      timeout: INTERACTION_RESPONSE_TIMEOUT_MS,
    })
    .toBe(query);
  await expect(page.getByTestId("results-pane")).toContainText(`${expectedCount} shown`, {
    timeout: INTERACTION_RESPONSE_TIMEOUT_MS,
  });
}

export async function waitForDebouncedMapWork(page: Page): Promise<void> {
  await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 25);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(() => resolve(), { timeout: 1_000 });
          return;
        }
        window.setTimeout(resolve, 0);
      }),
  );
}
