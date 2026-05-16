import {
  MEDIAN_PRICE_LEGEND_GRADIENT,
  PRICE_PER_SQM_COLOR_STOPS,
  PRICE_PER_SQM_LEGEND_GRADIENT,
} from "@/lib/constants";
import type { Translator } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { HeatmapMode } from "@/hooks/usePriceHeatmap";

type PriceLegendProps = {
  isDesktop: boolean;
  isVisible: boolean;
  mode?: HeatmapMode;
  t: Translator;
  className?: string;
  style?: React.CSSProperties;
};

export function PriceLegend({ isDesktop, isVisible, mode = "price", t, className, style }: PriceLegendProps) {
  if (!isVisible) return null;

  const perSqmLowLabel = `${PRICE_PER_SQM_COLOR_STOPS[0].price / 1000}k`;
  const perSqmHighLabel = `${PRICE_PER_SQM_COLOR_STOPS[PRICE_PER_SQM_COLOR_STOPS.length - 1].price / 1000}k`;

  return (
    <div
      role="img"
      aria-label={mode === "perSqm" ? t("heatmap.ariaLabelSqm") : t("map.legend.ariaLabel")}
      className={cn(
        "pointer-events-none absolute z-25 rounded-lg border border-border/20 bg-background/90 p-2 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.06)] dark:border-primary/10 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_4px_20px_rgba(4,12,24,0.7)]",
        className
      )}
      style={{
        bottom: isDesktop ? "4rem" : "8rem",
        right: isDesktop ? "4.5rem" : "0.75rem",
        ...style,
      }}
    >
      <p className="mb-1 text-[0.55rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {mode === "perSqm" ? t("heatmap.labelSqm") : t("map.legend.heading")}
      </p>
      <div
        aria-hidden="true"
        className="h-1.5 w-20 rounded-full"
        style={{ background: mode === "perSqm" ? PRICE_PER_SQM_LEGEND_GRADIENT : MEDIAN_PRICE_LEGEND_GRADIENT }}
      />
      <div
        aria-hidden="true"
        className="mt-0.5 flex justify-between text-[0.55rem] font-medium text-muted-foreground"
      >
        <span>{mode === "perSqm" ? perSqmLowLabel : t("map.legend.priceLow")}</span>
        <span>{mode === "perSqm" ? perSqmHighLabel : t("map.legend.priceHigh")}</span>
      </div>
    </div>
  );
}
