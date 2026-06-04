import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatCompactCurrency } from "@/lib/format";
import type { AddressTrendPoint } from "@/types/data";
import type { Translator } from "@/lib/i18n/types";
import { useTheme } from "@/hooks/useTheme";
import { PRIMARY_BLUE } from "@/lib/constants";

type TrendChartProps = {
  points: AddressTrendPoint[];
  t: Translator;
  peakMonth?: string | null;
  height?: number;
};

export function TrendChart({ points, t, peakMonth, height = 200 }: TrendChartProps) {
  const { isDark } = useTheme();

  const { data, yMin, colors } = useMemo(() => {
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let hasValidPrice = false;

    for (let i = 0; i < points.length; i++) {
      const price = points[i].medianPrice;
      if (price != null && !Number.isNaN(price)) {
        hasValidPrice = true;
        if (price < minPrice) minPrice = price;
        if (price > maxPrice) maxPrice = price;
      }
    }

    if (!hasValidPrice) {
      minPrice = 0;
      maxPrice = 0;
    }
    const range = maxPrice - minPrice;
    const yMin = Math.floor(Math.max(0, minPrice - range * 0.5) / 10000) * 10000;

    return {
      data: points.map((p) => ({
        month: p.month,
        medianPrice: p.medianPrice,
        transactionCount: p.transactionCount,
      })),
      yMin,
      colors: {
        primary: isDark ? "#79a6ff" : PRIMARY_BLUE,
        chart2: isDark ? "#9bb7ff" : "#495c95",
        mutedForeground: isDark ? "#94a3b8" : "#434655",
        splitLine: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(195, 198, 215, 0.5)",
        peak: isDark ? "#f87171" : "#dc2626",
        popover: isDark ? "#22262e" : "#ffffff",
        popoverForeground: isDark ? "#e0e0e0" : "#171c1f",
        border: isDark ? "rgba(255, 255, 255, 0.08)" : "#c3c6d7",
      },
    };
  }, [points, isDark]);

  const priceLabel = t("trend.medianPrice");
  const txnLabel = t("trend.transactions");

  return (
    <div style={{ height, width: "100%" }} aria-label={t("trend.chartLabel")} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
          <XAxis
            dataKey="month"
            tickFormatter={(v: string) => v.slice(2)}
            tick={{ fill: colors.mutedForeground, fontSize: 12 }}
            axisLine={{ stroke: colors.border }}
            tickLine={false}
          />
          <YAxis
            yAxisId="price"
            domain={[yMin, "auto"]}
            tickFormatter={(v: number) => formatCompactCurrency(v)}
            tick={{ fill: colors.mutedForeground, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fill: colors.mutedForeground, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: colors.popover,
              border: `1px solid ${colors.border}`,
              color: colors.popoverForeground,
              borderRadius: 4,
              fontSize: 12,
            }}
            labelFormatter={(label) => String(label)}
            formatter={(value, name) => {
              const numValue = typeof value === "number" ? value : NaN;
              if (name === priceLabel) {
                return [isNaN(numValue) ? "–" : formatCompactCurrency(numValue), String(name)];
              }
              return [isNaN(numValue) ? "–" : t("stats.txns", { count: numValue }), String(name)];
            }}
          />
          {peakMonth ? (
            <ReferenceLine
              yAxisId="price"
              x={peakMonth}
              stroke={colors.peak}
              strokeDasharray="6 3"
              strokeWidth={1.5}
              strokeOpacity={0.7}
              label={{
                value: t("trend.peak"),
                fill: colors.peak,
                fontSize: 10,
                fontWeight: "bold",
                position: "insideTopRight",
              }}
            />
          ) : null}
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="medianPrice"
            name={priceLabel}
            stroke={colors.primary}
            strokeWidth={3}
            fill={colors.primary}
            fillOpacity={0.1}
            dot={false}
            activeDot={false}
            isAnimationActive={true}
            animationDuration={500}
          />
          <Bar
            yAxisId="count"
            dataKey="transactionCount"
            name={txnLabel}
            fill={colors.chart2}
            opacity={0.6}
            isAnimationActive={true}
            animationDuration={500}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
