import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { TrendChart } from "@/features/block-detail/TrendChart";

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  XAxis: () => null,
  ReferenceLine: () => null,
  YAxis: ({
    yAxisId,
    tickFormatter,
  }: {
    yAxisId: string;
    tickFormatter?: (value: number) => string;
  }) => (
    <div data-testid={`axis-${yAxisId}`}>
      {tickFormatter ? tickFormatter(1_250_000) : "count axis"}
    </div>
  ),
  Tooltip: ({ formatter }: { formatter: (value: number, name: string) => [string, string] }) => (
    <div data-testid="tooltip-price">{formatter(1_250_000, "中位价")[0]}</div>
  ),
}));

describe("TrendChart locale formatting", () => {
  it("uses zh-SG compact currency for the price axis and tooltip", () => {
    render(
      <TrendChart
        points={[
          {
            month: "2026-01",
            medianPrice: 1_250_000,
            medianPricePerSqm: 12_500,
            transactionCount: 3,
          },
        ]}
        t={(key) => (key === "trend.medianPrice" ? "中位价" : key)}
        locale="zh-SG"
      />,
    );

    expect(screen.getByTestId("axis-price")).toHaveTextContent("$125万");
    expect(screen.getByTestId("tooltip-price")).toHaveTextContent("$125万");
  });
});
