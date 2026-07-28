import { expect, test } from "@playwright/test";
import {
  checkDeepLink,
  highConfidenceSet,
  mockComparableTransactions,
} from "./listing-check.fixtures";
import {
  applySearchAndExpectResultCount,
  applySearchAndExpectSummary,
  openApp,
  openResultsTab,
  PERFORMANCE_BLOCK_COUNT,
  servePerformanceCorpus,
  waitForDebouncedMapWork,
} from "./performance-fixture";
import {
  armMapFrameMeasurement,
  measureClickToSelectorLatency,
  measureSearchDomLatency,
  percentile95,
  readMapFrameMeasurement,
  waitForSettledMapCanvas,
} from "./performance-metrics";

/**
 * Responsiveness traces for the buyer-first homepage.
 *
 * Functional waits use auto-retrying assertions with generous timeouts. Actual
 * performance budgets are measured inside the browser, from the input/click/
 * pointer event to the corresponding DOM or animation-frame effect.
 *
 * Do not time around Playwright driver calls here. Those durations include CDP
 * round-trips and runner contention, so they grade the harness rather than the
 * app and made the old 2s/3s checks intermittently red.
 */
const FILTER_P95_BUDGET_MS = 100;
const LISTING_VERDICT_BUDGET_MS = 500;
const MIN_MAP_INTERACTION_FPS = 30;
const MAX_MAP_FRAME_GAP_MS = 100;

test.describe.configure({
  mode: "serial",
  timeout: 90_000,
});

test.describe("performance traces", () => {
  test(`filter typing stays within its P95 budget on ${PERFORMANCE_BLOCK_COUNT.toLocaleString()} blocks`, async ({
    page,
  }) => {
    await servePerformanceCorpus(page);
    await openApp(page);
    await openResultsTab(page);

    // Warm the full-corpus fetch, Zod parsing, and structured-field index
    // before measuring query-to-query filtering. The target is the hot filter
    // path, not first-load network or schema-validation time.
    await applySearchAndExpectSummary(page, "BEDOK", 300);
    await waitForDebouncedMapWork(page);

    const samples: number[] = [];
    const measuredQueries = [
      ["ANG MO KIO", 200],
      ["LENGKONG TIGA", 100],
      ["BEDOK", 300],
      ["ANG MO KIOO", 200],
      ["LENGKONG TIGAA", 100],
      ["BEDOKK", 300],
    ] as const;
    // Twenty samples make nearest-rank P95 the second-slowest measurement,
    // rather than accidentally treating the maximum of a tiny sample as P95.
    for (let sample = 0; sample < 20; sample += 1) {
      const [query, expectedCount] = measuredQueries[sample % measuredQueries.length]!;
      samples.push(await measureSearchDomLatency(page, query, expectedCount));
      await waitForDebouncedMapWork(page);
    }

    const p95 = percentile95(samples);
    console.info(
      `[perf] filter P95=${p95.toFixed(1)}ms samples=${samples.map((value) => value.toFixed(1)).join(",")}`,
    );
    expect(p95).toBeLessThan(FILTER_P95_BUDGET_MS);
  });

  // Playwright supplies only the trusted pointer gesture while the page records
  // animation frames, excluding CDP round-trip time from the metric.
  test("map remains interactive during filter operations", async ({ page }) => {
    await openApp(page);
    const mapContainer = page.getByRole("application", {
      name: /interactive map of singapore hdb resale blocks/i,
    });

    await openResultsTab(page);
    await applySearchAndExpectResultCount(page, "ANG MO KIO", 1);

    // Let the filter-driven fitBounds animation and tile loads finish so only
    // the trusted pan gesture can repaint the canvas afterwards.
    const settledBeforePan = await waitForSettledMapCanvas(page, "before pan");

    const box = await mapContainer.boundingBox();
    expect(box, "map container should have a layout box to pan").not.toBeNull();
    if (!box) return;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const elementAtPanPoint = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.className ?? "",
      [centerX, centerY] as const,
    );
    expect(elementAtPanPoint, "pan point should be over the MapLibre canvas").toContain(
      "maplibregl-canvas",
    );
    await expect(page.locator(".maplibregl-canvas-container")).toHaveClass(
      /maplibregl-interactive/,
    );

    await armMapFrameMeasurement(page);
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 100, centerY + 50, { steps: 20 });
    await page.mouse.up();
    const frameStats = await readMapFrameMeasurement(page);
    console.info(
      `[perf] map fps=${frameStats.fps.toFixed(1)} maxGap=${frameStats.maxFrameGapMs.toFixed(1)}ms frames=${frameStats.frameCount}`,
    );
    expect(frameStats.fps).toBeGreaterThan(MIN_MAP_INTERACTION_FPS);
    expect(frameStats.maxFrameGapMs).toBeLessThan(MAX_MAP_FRAME_GAP_MS);

    const settledAfterPan = await waitForSettledMapCanvas(page, "after pan");
    expect(
      settledAfterPan.equals(settledBeforePan),
      "panning the map should have moved the camera to a different view",
    ).toBe(false);
    await expect(mapContainer).toBeVisible();
  });

  test("listing check verdict appears within acceptable latency", async ({ page }) => {
    await mockComparableTransactions(page, highConfidenceSet);
    await openApp(
      page,
      checkDeepLink({
        askingPrice: 1_200_000,
        floorAreaSqm: 150,
        flatType: "EXECUTIVE",
        storeyRange: "01 TO 03",
        leaseCommenceYear: 1989,
      }),
    );
    const checkPanel = page.locator("#desktop-check-content");
    const checkButton = checkPanel.getByRole("button", { name: /check this listing/i });
    await expect(checkButton).toBeVisible({ timeout: 15_000 });

    const verdictLatency = await measureClickToSelectorLatency(
      page,
      checkButton,
      "[data-testid='listing-check-verdict']",
    );
    console.info(`[perf] listing verdict=${verdictLatency.toFixed(1)}ms`);
    expect(verdictLatency).toBeLessThan(LISTING_VERDICT_BUDGET_MS);
    await expect(checkPanel.getByText(/in line with market/i).first()).toBeVisible();
  });

  test("filter results remain correct across repeated queries", async ({ page }) => {
    await openApp(page);
    await openResultsTab(page);

    for (const [query, expectedCount] of [
      ["BEDOK", 3],
      ["ANG MO KIO", 1],
      ["LENGKONG TIGA", 2],
      ["BEDOK", 3],
    ] as const) {
      await applySearchAndExpectResultCount(page, query, expectedCount);
    }
  });
});
