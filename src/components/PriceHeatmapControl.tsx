import { type CSSProperties, useId } from "react";
import { Flame } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import type { Translator } from "@/shared/lib/i18n";
import type { HeatmapMode } from "@/hooks/usePriceHeatmap";

type PriceHeatmapControlProps = {
  isEnabled: boolean;
  opacity: number;
  mode: HeatmapMode;
  onToggle: () => void;
  onOpacityChange: (value: number) => void;
  onModeChange: (mode: HeatmapMode) => void;
  hasScope: boolean;
  t: Translator;
  className?: string;
  style?: CSSProperties;
};

/**
 * Floating control panel that lets users toggle the price heatmap on/off
 * and adjust its opacity via a native range slider.
 *
 * Designed to sit in the bottom-right corner of the map alongside the
 * existing colour-ramp legend. Surfaces use workbench chrome (opaque, squared).
 */
export function PriceHeatmapControl({
  isEnabled,
  opacity,
  mode,
  onToggle,
  onOpacityChange,
  onModeChange,
  hasScope,
  t,
  className,
  style,
}: PriceHeatmapControlProps) {
  const sliderId = useId();
  const toggleId = useId();
  const toggleHint = hasScope
    ? isEnabled
      ? t("heatmap.disable")
      : t("heatmap.enable")
    : t("heatmap.disabledHint");

  return (
    <div
      className={cn("v2-chrome pointer-events-auto flex flex-col gap-2 p-2", className)}
      style={style}
    >
      {/* Header row: icon + label + toggle */}
      <div className="flex items-center gap-1.5">
        <Flame
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-colors duration-200",
            isEnabled ? "text-primary" : "text-muted-foreground",
          )}
        />
        <p className="text-[length:var(--text-xs)] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground leading-none flex-1">
          {t("heatmap.label")}
        </p>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="switch"
              data-touch-target
              aria-checked={isEnabled && hasScope}
              aria-label={t("heatmap.label")}
              id={toggleId}
              disabled={!hasScope}
              onClick={onToggle}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center bg-transparent",
                !hasScope && "cursor-not-allowed opacity-50",
                hasScope &&
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              )}
            >
              <span
                className={cn(
                  "relative h-4 w-7 rounded-full transition-[background-color] duration-300",
                  isEnabled && hasScope ? "bg-primary" : "bg-muted-foreground/30",
                )}
                aria-hidden="true"
              >
                <span
                  className={cn(
                    "absolute left-[2px] top-[2px] size-3 rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out",
                    isEnabled && hasScope ? "translate-x-3" : "translate-x-0",
                  )}
                />
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{toggleHint}</TooltipContent>
        </Tooltip>
      </div>

      {/* Mode toggle and Opacity slider — only shown when heatmap is active */}
      {isEnabled && hasScope && (
        <div className="flex flex-col gap-2">
          <div
            role="radiogroup"
            aria-label={t("heatmap.modeLabel")}
            className="flex items-center gap-1"
          >
            <button
              type="button"
              role="radio"
              data-touch-target
              aria-checked={mode === "price"}
              tabIndex={mode === "price" ? 0 : -1}
              onClick={() => onModeChange("price")}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") onModeChange("perSqm");
              }}
              className={cn(
                "flex-1 rounded-none py-1 text-[length:var(--text-xs)] font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                mode === "price"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t("heatmap.modePrice")}
            </button>
            <button
              type="button"
              role="radio"
              data-touch-target
              aria-checked={mode === "perSqm"}
              tabIndex={mode === "perSqm" ? 0 : -1}
              onClick={() => onModeChange("perSqm")}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") onModeChange("price");
              }}
              className={cn(
                "flex-1 rounded-none py-1 text-[length:var(--text-xs)] font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                mode === "perSqm"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t("heatmap.modePerSqm")}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={sliderId}
              className="whitespace-nowrap text-[length:var(--text-xs)] font-medium uppercase leading-none tracking-wider text-muted-foreground"
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
              className="heatmap-opacity-slider h-1 w-16 cursor-pointer appearance-none rounded-full accent-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}
