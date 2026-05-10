import { type CSSProperties, useId } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Translator } from "@/lib/i18n";

type PriceHeatmapControlProps = {
  isEnabled: boolean;
  opacity: number;
  onToggle: () => void;
  onOpacityChange: (value: number) => void;
  t: Translator;
  className?: string;
  style?: CSSProperties;
};

/**
 * Floating control panel that lets users toggle the price heatmap on/off
 * and adjust its opacity via a native range slider.
 *
 * Designed to sit in the bottom-right corner of the map alongside the
 * existing colour-ramp legend, sharing the same glassmorphism styling used
 * throughout the UI.
 */
export function PriceHeatmapControl({
  isEnabled,
  opacity,
  onToggle,
  onOpacityChange,
  t,
  className,
  style,
}: PriceHeatmapControlProps) {
  const sliderId = useId();

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col gap-2 rounded-lg border border-border/20 bg-background/90 p-2 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.06)] dark:border-primary/10 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_4px_20px_rgba(4,12,24,0.7)]",
        className,
      )}
      style={style}
    >
      {/* Header row: icon + label + toggle */}
      <div className="flex items-center gap-1.5">
        <Flame
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-colors duration-200",
            isEnabled ? "text-orange-500 dark:text-orange-400" : "text-muted-foreground",
          )}
        />
        <p className="text-[0.55rem] font-bold uppercase tracking-[0.1em] text-muted-foreground leading-none flex-1">
          {t("heatmap.label")}
        </p>

        {/* Custom toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={isEnabled ? t("heatmap.disable") : t("heatmap.enable")}
          id="heatmap-toggle"
          onClick={onToggle}
          className={cn(
            "relative h-3.5 w-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            isEnabled
              ? "bg-orange-500 dark:bg-orange-400"
              : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-[1px] size-2.5 rounded-full bg-white shadow-sm transition-transform duration-200",
              isEnabled ? "translate-x-[calc(100%-1px)]" : "translate-x-[1px]",
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Opacity slider — only shown when heatmap is active */}
      {isEnabled && (
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={sliderId}
            className="text-[0.5rem] font-medium uppercase tracking-[0.08em] text-muted-foreground leading-none whitespace-nowrap"
          >
            {t("heatmap.opacity")}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            aria-label={t("heatmap.opacityLabel")}
            className="heatmap-opacity-slider h-1 w-16 cursor-pointer appearance-none rounded-full accent-orange-500 dark:accent-orange-400"
          />
        </div>
      )}
    </div>
  );
}
