import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TrendChart } from "@/features/block-detail/TrendChart";
import { hoverLastPointAndReadTooltipLabel, stubChartLayout } from "../helpers/rechartsHover";

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ isDark: false }),
}));

// Real Recharts, so the label comes from its tooltip rather than from a stand-in.
// Only the container is replaced, because jsdom cannot measure one.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const { FixedSizeResponsiveContainer } = await import("../helpers/rechartsHover");
  return { ...actual, ResponsiveContainer: FixedSizeResponsiveContainer };
});

describe("TrendChart tooltip", () => {
  beforeEach(() => {
    stubChartLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("labels the hovered point with its month", async () => {
    const { container } = render(
      <TrendChart
        points={[
          { month: "2026-01", medianPrice: 500_000, medianPricePerSqm: 5_000, transactionCount: 2 },
          { month: "2026-02", medianPrice: 520_000, medianPricePerSqm: 5_200, transactionCount: 3 },
          { month: "2026-03", medianPrice: 540_000, medianPricePerSqm: 5_400, transactionCount: 1 },
        ]}
        t={(key) => key}
        locale="en-SG"
      />,
    );

    expect(await hoverLastPointAndReadTooltipLabel(container)).toBe("2026-03");
  });
});
