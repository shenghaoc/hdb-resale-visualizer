import { expect, type Locator, type Page } from "@playwright/test";

const INTERACTION_RESPONSE_TIMEOUT_MS = 10_000;
const MAP_SETTLE_TIMEOUT_MS = 20_000;
const MAP_SETTLE_SAMPLE_INTERVAL_MS = 120;
const MAP_SETTLE_STABLE_SAMPLES = 2;
const MAP_CANVAS_VISIBLE_TIMEOUT_MS = 20_000;

export async function measureSearchDomLatency(
  page: Page,
  query: string,
  expectedCount: number,
): Promise<number> {
  return page.evaluate(
    ({ nextQuery, nextCount, timeoutMs }) =>
      new Promise<number>((resolve, reject) => {
        const input = document.querySelector<HTMLInputElement>(
          "[data-testid='header-search-input']",
        );
        const resultsPane = document.querySelector<HTMLElement>("[data-testid='results-pane']");
        if (!input || !resultsPane) {
          reject(new Error("Search input and results pane must exist before measuring latency"));
          return;
        }

        // Resolution needs BOTH the committed query and the new result summary.
        // The summary alone is not enough: callers must order their queries so
        // consecutive expected counts differ, otherwise the summary already
        // reads the expected value on entry and this degrades into timing the
        // URL write instead of the filter. The query alone is not enough
        // either, since the URL commits before the list re-renders.
        const expectedSummary = `${nextCount} shown`;
        let observer: MutationObserver | null = null;
        const timeout = window.setTimeout(() => {
          observer?.disconnect();
          reject(new Error(`Search results did not update to "${expectedSummary}"`));
        }, timeoutMs);
        const startedAt = performance.now();

        const finishIfUpdated = () => {
          const currentQuery = new URL(window.location.href).searchParams.get("search");
          if (currentQuery === nextQuery && resultsPane.textContent?.includes(expectedSummary)) {
            window.clearTimeout(timeout);
            observer?.disconnect();
            resolve(performance.now() - startedAt);
          }
        };

        observer = new MutationObserver(finishIfUpdated);
        observer.observe(resultsPane, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (!valueSetter) {
          window.clearTimeout(timeout);
          observer.disconnect();
          reject(new Error("Native input value setter is unavailable"));
          return;
        }

        valueSetter.call(input, nextQuery);
        input.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: nextQuery,
          }),
        );
        finishIfUpdated();
      }),
    {
      nextQuery: query,
      nextCount: expectedCount,
      timeoutMs: INTERACTION_RESPONSE_TIMEOUT_MS,
    },
  );
}

export function percentile95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

/**
 * Reported alongside P95 and used for the assertions.
 *
 * Nearest-rank P95 over 20 samples is the second-slowest sample by definition,
 * so it tracks whichever two samples the runner happened to deschedule. The
 * median moves only when the whole distribution moves, which is what a
 * regression looks like. Measured across five consecutive local runs, P95 for
 * the same unchanged code ranged 40.9–137.0 ms while medians stayed clustered.
 */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.POSITIVE_INFINITY;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export async function measureClickToSelectorLatency(
  page: Page,
  trigger: Locator,
  resultSelector: string,
): Promise<number> {
  await trigger.evaluate(
    (element, { selector, timeoutMs }) => {
      const performanceWindow = window as Window & {
        __clickToSelectorLatency?: Promise<number>;
      };
      performanceWindow.__clickToSelectorLatency = new Promise<number>((resolve, reject) => {
        let observer: MutationObserver | null = null;
        const timeout = window.setTimeout(() => {
          observer?.disconnect();
          reject(new Error(`Timed out waiting for ${selector}`));
        }, timeoutMs);

        element.addEventListener(
          "click",
          () => {
            const startedAt = performance.now();
            const finishIfVisible = () => {
              const result = document.querySelector<HTMLElement>(selector);
              if (result && result.getClientRects().length > 0) {
                window.clearTimeout(timeout);
                observer?.disconnect();
                resolve(performance.now() - startedAt);
              }
            };
            observer = new MutationObserver(finishIfVisible);
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
            });
            finishIfVisible();
          },
          { capture: true, once: true },
        );
      });
    },
    { selector: resultSelector, timeoutMs: INTERACTION_RESPONSE_TIMEOUT_MS },
  );

  await trigger.click();
  return page.evaluate(() => {
    const performanceWindow = window as Window & {
      __clickToSelectorLatency?: Promise<number>;
    };
    if (!performanceWindow.__clickToSelectorLatency) {
      throw new Error("Click-to-selector latency measurement was not armed");
    }
    return performanceWindow.__clickToSelectorLatency;
  });
}

type MapFrameStats = {
  fps: number;
  maxFrameGapMs: number;
  frameCount: number;
};

export async function armMapFrameMeasurement(page: Page): Promise<void> {
  await page.locator(".maplibregl-canvas").evaluate((canvas, timeoutMs) => {
    const performanceWindow = window as Window & {
      __mapFrameStats?: Promise<MapFrameStats>;
    };
    performanceWindow.__mapFrameStats = new Promise<MapFrameStats>((resolve, reject) => {
      let animationFrame = 0;
      let frames: number[] = [];
      let started = false;
      const timeout = window.setTimeout(() => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        reject(new Error("Timed out while measuring map interaction frames"));
      }, timeoutMs);

      const sample = (timestamp: number) => {
        frames.push(timestamp);
        animationFrame = requestAnimationFrame(sample);
      };

      canvas.addEventListener(
        "pointerdown",
        () => {
          started = true;
          frames = [];
          animationFrame = requestAnimationFrame(sample);
        },
        { once: true },
      );

      const handlePointerUp = () => {
        document.removeEventListener("pointerup", handlePointerUp, true);
        // A gesture that never landed on the canvas would otherwise leave this
        // promise pending until the generic timeout, reporting "too few frames"
        // for what is really a mis-targeted pan.
        if (!started) {
          window.clearTimeout(timeout);
          reject(
            new Error(
              "Pointer gesture completed without a pointerdown on the map canvas; " +
                "the pan never reached MapLibre",
            ),
          );
          return;
        }
        requestAnimationFrame((timestamp) => {
          window.clearTimeout(timeout);
          if (animationFrame) cancelAnimationFrame(animationFrame);
          frames.push(timestamp);
          if (frames.length < 2) {
            reject(new Error("Map interaction produced too few animation frames"));
            return;
          }
          const frameGaps = frames.slice(1).map((frame, index) => frame - frames[index]!);
          const duration = frames.at(-1)! - frames[0]!;
          resolve({
            // Identical timestamps would divide by zero and report Infinity,
            // which would pass a "faster than" assertion for free.
            fps: duration > 0 ? ((frames.length - 1) * 1000) / duration : 0,
            maxFrameGapMs: Math.max(...frameGaps),
            frameCount: frames.length,
          });
        });
      };

      document.addEventListener("pointerup", handlePointerUp, true);
    });
  }, INTERACTION_RESPONSE_TIMEOUT_MS);
}

export async function readMapFrameMeasurement(page: Page): Promise<MapFrameStats> {
  return page.evaluate(() => {
    const performanceWindow = window as Window & {
      __mapFrameStats?: Promise<MapFrameStats>;
    };
    if (!performanceWindow.__mapFrameStats) {
      throw new Error("Map frame measurement was not armed");
    }
    return performanceWindow.__mapFrameStats;
  });
}

// MapLibre paints into a WebGL canvas, so camera state is not readable from the
// DOM. Sampling until byte-identical captures recur provides an observable idle
// condition without sleeping for a guessed animation duration.
export async function waitForSettledMapCanvas(page: Page, label: string): Promise<Buffer> {
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible({ timeout: MAP_CANVAS_VISIBLE_TIMEOUT_MS });

  const deadline = Date.now() + MAP_SETTLE_TIMEOUT_MS;
  let previous = await canvas.screenshot();
  let stableSamples = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(MAP_SETTLE_SAMPLE_INTERVAL_MS);
    const next = await canvas.screenshot();
    stableSamples = next.equals(previous) ? stableSamples + 1 : 0;
    previous = next;
    if (stableSamples >= MAP_SETTLE_STABLE_SAMPLES) return previous;
  }

  throw new Error(
    `Map canvas never stopped repainting while waiting for it to settle (${label}). ` +
      `Expected ${MAP_SETTLE_STABLE_SAMPLES} identical captures ` +
      `${MAP_SETTLE_SAMPLE_INTERVAL_MS}ms apart within ${MAP_SETTLE_TIMEOUT_MS}ms.`,
  );
}
