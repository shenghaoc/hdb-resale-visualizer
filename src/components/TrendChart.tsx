import { useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { formatCompactCurrency } from "@/lib/format";
import type { AddressTrendPoint } from "@/types/data";
import { useTheme } from "@/hooks/useTheme";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

type TrendChartProps = {
  points: AddressTrendPoint[];
};

export function TrendChart({ points }: TrendChartProps) {
  const { isDark } = useTheme();

  const option = useMemo(() => {
    const prices = points.map((p) => p.medianPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;

    // Use a baseline that highlights fluctuations while maintaining context
    const yMin = Math.floor(Math.max(0, minPrice - range * 0.5) / 10000) * 10000;

    // Theme-aware colors
    const colors = {
      primary: isDark ? "#79a6ff" : "#2563eb",
      chart2: isDark ? "#9bb7ff" : "#495c95",
      popover: isDark ? "#22262e" : "#ffffff",
      popoverForeground: isDark ? "#e0e0e0" : "#171c1f",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "#c3c6d7",
      splitLine: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(195, 198, 215, 0.5)",
      mutedForeground: isDark ? "#94a3b8" : "#434655",
    };

    return {
      animationDuration: 500,
      backgroundColor: "transparent",
      color: [colors.primary, colors.chart2],
      grid: {
        left: 12,
        right: 12,
        top: 20,
        bottom: 36,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.popover,
        borderColor: colors.border,
        borderWidth: 1,
        textStyle: {
          color: colors.popoverForeground,
        },
      },
      xAxis: {
        type: "category",
        data: points.map((point) => point.month),
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: colors.border,
          },
        },
        axisTick: { show: false },
        axisLabel: {
          color: colors.mutedForeground,
          formatter: (value: string) => value.slice(2),
        },
      },
      yAxis: [
        {
          type: "value",
          min: yMin,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: {
            lineStyle: {
              color: colors.splitLine,
            },
          },
          axisLabel: {
            color: colors.mutedForeground,
            formatter: (value: number) => formatCompactCurrency(value),
          },
        },
        {
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            color: colors.mutedForeground,
          },
        },
      ],
      series: [
        {
          name: "Median price",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 3,
            color: colors.primary,
          },
          areaStyle: {
            opacity: 0.1,
            color: colors.primary,
          },
          data: points.map((point) => point.medianPrice),
          tooltip: {
            valueFormatter: (value: number) => formatCompactCurrency(value),
          },
        },
        {
          name: "Transactions",
          type: "bar",
          yAxisIndex: 1,
          itemStyle: {
            opacity: 0.6,
            color: colors.chart2,
          },
          data: points.map((point) => point.transactionCount),
          tooltip: {
            valueFormatter: (value: number) => `${value} txns`,
          },
        },
      ],
    };
  }, [points, isDark]);


  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      option={option}
      style={{ height: 200, width: "100%" }}
    />
  );
}
