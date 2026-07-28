import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import type { BlockSummary, Manifest } from "../../shared/data-types";
import { MAP_SEARCH_DEBOUNCE_MS } from "../../src/shared/lib/constants";
import { SEARCH_MATCH_LIMIT } from "../../src/features/search-profile/searchFuse";

const INTERACTION_RESPONSE_TIMEOUT_MS = 10_000;
export const PERFORMANCE_BLOCK_COUNT = 10_000;

const fixtureBlocks = JSON.parse(
  readFileSync(new URL("../fixtures/public-data/block-summaries.json", import.meta.url), "utf8"),
) as BlockSummary[];
const fixtureManifest = JSON.parse(
  readFileSync(new URL("../fixtures/public-data/manifest.json", import.meta.url), "utf8"),
) as Manifest;

/**
 * Search identities assigned across the synthetic corpus, largest group last.
 *
 * `shown` is what the UI reports for a whole-field query on the group, which is
 * the group size clamped by `SEARCH_MATCH_LIMIT` — WOODLANDS is deliberately
 * larger than the cap so the truncation stays visible in an end-to-end run
 * rather than only in unit tests.
 */
const SEARCH_GROUPS = [
  { town: "BEDOK", streetName: "BEDOK NORTH ROAD", displayName: "BEDOK PERFORMANCE", size: 300 },
  {
    town: "ANG MO KIO",
    streetName: "ANG MO KIO AVENUE 10",
    displayName: "ANG MO KIO PERFORMANCE",
    size: 200,
  },
  { town: "GEYLANG", streetName: "LENGKONG TIGA", displayName: "GEYLANG PERFORMANCE", size: 100 },
  {
    town: "WOODLANDS",
    streetName: "WOODLANDS RING ROAD",
    displayName: "WOODLANDS PERFORMANCE",
    size: PERFORMANCE_BLOCK_COUNT - 600,
  },
] as const;

export const PERFORMANCE_SHOWN = Object.fromEntries(
  SEARCH_GROUPS.map((group) => [group.town, Math.min(group.size, SEARCH_MATCH_LIMIT)]),
) as Record<(typeof SEARCH_GROUPS)[number]["town"], number>;

function searchIdentityFor(index: number) {
  let offset = 0;
  for (const group of SEARCH_GROUPS) {
    offset += group.size;
    if (index < offset) {
      return { town: group.town, streetName: group.streetName, displayName: group.displayName };
    }
  }
  throw new Error(`Search groups do not cover block index ${index}`);
}

const performanceBlocks = Array.from({ length: PERFORMANCE_BLOCK_COUNT }, (_, index) => {
  const template = fixtureBlocks[index % fixtureBlocks.length];
  if (!template) throw new Error("Performance fixture requires at least one block");
  const coordinateOffset = (index % 50) * 0.000_001;
  return {
    ...template,
    ...searchIdentityFor(index),
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

// Serialize once: re-encoding a 10,000-block payload inside the route handler
// would add test-process work to every request the measured run makes.
const performanceManifestBody = JSON.stringify(performanceManifest);
const performanceBlocksBody = JSON.stringify(performanceBlocks);

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
      body: performanceManifestBody,
    }),
  );
  await page.route("**/api/block-summaries", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: performanceBlocksBody,
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
