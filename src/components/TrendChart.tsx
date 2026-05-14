import { useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/esm/core";
import { formatCompactCurrency } from "@/lib/format";
import type { AddressTrendPoint } from "@/types/data";
import type { Translator } from "@/lib/i18n/types";
import { useTheme } from "@/hooks/useTheme";
import { PRIMARY_BLUE } from "@/lib/constants";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

type TrendChartProps = {
  points: AddressTrendPoint[];
  t: Translator;
  peakMonth?: string | null;
  height?: number;
};

export function TrendChart({ points, t, peakMonth, height = 200 }: TrendChartProps) {
  const { isDark } = useTheme();

  const option = useMemo(() => {
    const prices = points.map((p) => p.medianPrice);
    const filteredPrices = prices.filter((p) => !Number.isNaN(p));
    const minPrice = filteredPrices.length > 0 ? Math.min(...filteredPrices) : 0;
    const maxPrice = filteredPrices.length > 0 ? Math.max(...filteredPrices) : 0;
    const range = maxPrice - minPrice;

    const yMin = Math.floor(Math.max(0, minPrice - range * 0.5) / 10000) * 10000;

    const colors = {
      primary: isDark ? "#79a6ff" : PRIMARY_BLUE,
      chart2: isDark ? "#9bb7ff" : "#495c95",
      popover: isDark ? "#22262e" : "#ffffff",
      popoverForeground: isDark ? "#e0e0e0" : "#171c1f",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "#c3c6d7",
      splitLine: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(195, 198, 215, 0.5)",
      mutedForeground: isDark ? "#94a3b8" : "#434655",
      peak: isDark ? "#f87171" : "#dc2626",
    };

    const peakMarkLine = peakMonth
      ? {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: colors.peak, width: 1.5, opacity: 0.7 },
          label: {
            show: true,
            formatter: () => t("trend.peak"),
            position: "insideEndTop",
            color: colors.peak,
            fontSize: 10,
            fontWeight: "bold",
          },
          data: [{ xAxis: peakMonth }],
        }
      : undefined;

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
        textStyle: { color: colors.popoverForeground },
      },
      xAxis: {
        type: "category",
        data: points.map((point) => point.month),
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.border } },
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
          splitLine: { lineStyle: { color: colors.splitLine } },
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
          axisLabel: { color: colors.mutedForeground },
        },
      ],
      series: [
        {
          name: t("trend.medianPrice"),
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3, color: colors.primary },
          areaStyle: { opacity: 0.1, color: colors.primary },
          data: points.map((point) => point.medianPrice),
          tooltip: {
            valueFormatter: (value: number) =>
              isNaN(value) ? "–" : formatCompactCurrency(value),
          },
          ...(peakMarkLine ? { markLine: peakMarkLine } : {}),
        },
        {
          name: t("trend.transactions"),
          type: "bar",
          yAxisIndex: 1,
          itemStyle: { opacity: 0.6, color: colors.chart2 },
          data: points.map((point) => point.transactionCount),
          tooltip: {
            valueFormatter: (value: number) =>
              isNaN(value) ? "–" : t("stats.txns", { count: value }),
          },
        },
      ],
    };
  }, [points, isDark, t, peakMonth]);

  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      option={option}
      style={{ height, width: "100%" }}
      aria-label={t("trend.chartLabel")}
      role="img"
    />
  );
}
