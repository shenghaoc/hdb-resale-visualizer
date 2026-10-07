import { cloneElement, isValidElement, type ReactNode } from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { expect, vi } from "vite-plus/test";

const CHART_WIDTH = 400;
const CHART_HEIGHT = 200;

// Inside the plot area and nearest the last data point of the charts under test.
// The right-hand margin and axis take the last ~45px, where Recharts shows no tooltip.
const HOVER_X = 340;
const HOVER_Y = CHART_HEIGHT / 2;

/**
 * Recharts applies a hover on an animation frame, so the tooltip appears a
 * beat after the pointer event. Testing Library's 1000ms default is tight for
 * that when the full parallel suite loads the machine; give it more room.
 */
const TOOLTIP_WAIT_TIMEOUT_MS = 4000;

type SizedChartProps = { width: number; height: number };

/**
 * Stand-in for Recharts' `ResponsiveContainer`. jsdom has no layout, so the real
 * one measures zero and renders no chart; this gives its single chart child a
 * fixed size instead. Use it from a `vi.mock("recharts", ...)` factory.
 */
export function FixedSizeResponsiveContainer({ children }: { children: ReactNode }) {
  if (!isValidElement<SizedChartProps>(children)) return null;
  return cloneElement(children, { width: CHART_WIDTH, height: CHART_HEIGHT });
}

const CHART_BOX: DOMRect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: CHART_WIDTH,
  bottom: CHART_HEIGHT,
  width: CHART_WIDTH,
  height: CHART_HEIGHT,
  toJSON: () => ({}),
};

const EMPTY_BOX: DOMRect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
};

function isChartWrapper(element: Element): boolean {
  return element.classList.contains("recharts-wrapper");
}

/**
 * jsdom reports an empty box for every element, and Recharts maps pointer
 * events to chart coordinates through the chart wrapper's box. Only that
 * element gets a real size: a legend measured as chart-sized would claim the
 * whole plot area. Call `vi.restoreAllMocks()` after the test to undo it.
 */
export function stubChartLayout(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return isChartWrapper(this) ? CHART_BOX : EMPTY_BOX;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return isChartWrapper(this) ? CHART_WIDTH : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return isChartWrapper(this) ? CHART_HEIGHT : 0;
  });
}

/**
 * Moves the pointer over the right side of the chart, nearest its last data
 * point, and resolves with the tooltip's label once Recharts shows it.
 */
export async function hoverLastPointAndReadTooltipLabel(container: HTMLElement): Promise<string> {
  const chart = container.querySelector<HTMLElement>(".recharts-wrapper");
  if (!chart) throw new Error("No Recharts chart was rendered");

  fireEvent.mouseMove(chart, { clientX: HOVER_X, clientY: HOVER_Y });

  let label = "";
  await waitFor(
    () => {
      label = container.querySelector(".recharts-tooltip-label")?.textContent ?? "";
      expect(label).not.toBe("");
    },
    { timeout: TOOLTIP_WAIT_TIMEOUT_MS },
  );
  return label;
}
