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
  const option = useMemo(() => {
    const prices = points.map((p) => p.medianPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;

    // Use a baseline that highlights fluctuations while maintaining context
    // We aim for the bottom of the chart to be around 80% of the minimum price,
    // or slightly less if the range is very small.
    const yMin = Math.floor(Math.max(0, minPrice - range * 0.5) / 10000) * 10000;

    return {
      animationDuration: 500,
      backgroundColor: "transparent",
      color: ["#3a2d24", "#c5b7a4"],
      grid: {
        left: 12,
        right: 12,
        top: 20,
        bottom: 36,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#ffffff",
        borderColor: "#e7ddd0",
        borderWidth: 1,
        textStyle: {
          color: "#2d2621",
        },
      },
      xAxis: {
        type: "category",
        data: points.map((point) => point.month),
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: "#e7ddd0",
          },
        },
        axisTick: { show: false },
        axisLabel: {
          color: "#7a6f62",
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
              color: "#ece7de",
            },
          },
          axisLabel: {
            color: "#7a6f62",
            formatter: (value: number) => formatCompactCurrency(value),
          },
        },
        {
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            color: "#7a6f62",
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
          },
          areaStyle: {
            opacity: 0.08,
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
            opacity: 0.55,
          },
          data: points.map((point) => point.transactionCount),
          tooltip: {
            valueFormatter: (value: number) => `${value} txns`,
          },
        },
      ],
    };
  }, [points]);


  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      option={option}
      style={{ height: 200, width: "100%" }}
    />
  );
}
