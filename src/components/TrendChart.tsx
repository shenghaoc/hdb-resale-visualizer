import ReactECharts from "echarts-for-react";
import { formatCompactCurrency } from "@/lib/format";
import type { AddressTrendPoint } from "@/types/data";

type TrendChartProps = {
  points: AddressTrendPoint[];
};

export function TrendChart({ points }: TrendChartProps) {
  return (
    <ReactECharts
      notMerge
      option={{
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
          valueFormatter: (value: number) => formatCompactCurrency(value),
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
          },
          {
            name: "Transactions",
            type: "bar",
            yAxisIndex: 1,
            itemStyle: {
              opacity: 0.55,
            },
            data: points.map((point) => point.transactionCount),
          },
        ],
      }}
      style={{ height: 200, width: "100%" }}
    />
  );
}
