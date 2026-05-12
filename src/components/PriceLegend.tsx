import { MEDIAN_PRICE_LEGEND_GRADIENT } from "@/lib/constants";
import { cn } from "@/lib/utils";

type PriceLegendProps = {
  isDesktop: boolean;
  isVisible: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function PriceLegend({ isDesktop, isVisible, className, style }: PriceLegendProps) {
  if (!isVisible) return null;

  return (
    <div
      role="img"
      aria-label="Map legend: median price colour ramp from S$400K (low) to S$1.3M+ (high)"
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
        Median S$
      </p>
      <div
        aria-hidden="true"
        className="h-1.5 w-20 rounded-full"
        style={{ background: MEDIAN_PRICE_LEGEND_GRADIENT }}
      />
      <div
        aria-hidden="true"
        className="mt-0.5 flex justify-between text-[0.55rem] font-medium text-muted-foreground"
      >
        <span>400K</span>
        <span>1.3M</span>
      </div>
    </div>
  );
}
