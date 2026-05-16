import type { GridComponentOption } from "echarts";

/** ECharts 6+ replacement for deprecated `grid.containLabel: true`. */
export const ECHARTS_GRID_CONTAIN_AXIS_LABELS = {
  outerBoundsMode: "same" as const,
  outerBoundsContain: "axisLabel" as const,
} satisfies Pick<GridComponentOption, "outerBoundsMode" | "outerBoundsContain">;
