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
        grid: {
          left: 12,
          right: 12,
          top: 20,
          bottom: 36,
          containLabel: true,
        },
        tooltip: {
          trigger: "axis",
          valueFormatter: (value: number) => formatCompactCurrency(value),
        },
        xAxis: {
          type: "category",
          data: points.map((point) => point.month),
          boundaryGap: false,
          axisLabel: {
            formatter: (value: string) => value.slice(2),
          },
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              formatter: (value: number) => formatCompactCurrency(value),
            },
          },
          {
            type: "value",
            splitLine: { show: false },
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
              opacity: 0.15,
            },
            data: points.map((point) => point.medianPrice),
          },
          {
            name: "Transactions",
            type: "bar",
            yAxisIndex: 1,
            itemStyle: {
              opacity: 0.45,
            },
            data: points.map((point) => point.transactionCount),
          },
        ],
      }}
      style={{ height: 240, width: "100%" }}
    />
  );
}
