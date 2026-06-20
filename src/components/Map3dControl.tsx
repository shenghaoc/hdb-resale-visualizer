import { type CSSProperties, useId } from "react";
import { Box } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import type { Translator } from "@/shared/lib/i18n";
import type { HeatmapMode } from "@/hooks/usePriceHeatmap";

type Map3dControlProps = {
  isEnabled: boolean;
  mode: HeatmapMode;
  onToggle: () => void;
  onModeChange: (mode: HeatmapMode) => void;
  hasScope: boolean;
  t: Translator;
  className?: string;
  style?: CSSProperties;
};

/**
 * Floating control that toggles the 3D price-column view and, while active,
 * lets the user switch the metric driving column height (total price vs $/sqm).
 *
 * Shares the glassmorphism styling and compact density of `PriceHeatmapControl`
 * so the map's right-hand control stack stays visually consistent.
 */
export function Map3dControl({
  isEnabled,
  mode,
  onToggle,
  onModeChange,
  hasScope,
  t,
  className,
  style,
}: Map3dControlProps) {
  const toggleId = useId();
  const toggleHint = hasScope
    ? isEnabled
      ? t("map3d.disable")
      : t("map3d.enable")
    : t("map3d.disabledHint");

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col gap-2 rounded-lg border bg-popover/90 p-2 backdrop-blur-[20px] shadow-lg",
        className,
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5">
        <Box
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-colors duration-200",
            isEnabled ? "text-sky-500 dark:text-sky-400" : "text-muted-foreground",
          )}
        />
        <p className="text-[0.55rem] font-bold uppercase tracking-[0.1em] text-muted-foreground leading-none flex-1">
          {t("map3d.label")}
        </p>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled && hasScope}
              aria-label={t("map3d.label")}
              id={toggleId}
              disabled={!hasScope}
              onClick={onToggle}
              className={cn(
                "relative h-4 w-7 shrink-0 rounded-full transition-all duration-300",
                !hasScope && "cursor-not-allowed opacity-50",
                hasScope &&
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                isEnabled && hasScope ? "bg-sky-500" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-[2px] left-[2px] size-3 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out",
                  isEnabled && hasScope ? "translate-x-3" : "translate-x-0",
                )}
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{toggleHint}</TooltipContent>
        </Tooltip>
      </div>

      {isEnabled && hasScope && (
        <div
          role="radiogroup"
          aria-label={t("map3d.modeLabel")}
          className="flex items-center gap-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === "price"}
            tabIndex={mode === "price" ? 0 : -1}
            onClick={() => onModeChange("price")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") onModeChange("perSqm");
            }}
            className={cn(
              "flex-1 rounded py-1 text-[0.55rem] font-medium uppercase tracking-wider transition-colors",
              mode === "price"
                ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t("map3d.modePrice")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "perSqm"}
            tabIndex={mode === "perSqm" ? 0 : -1}
            onClick={() => onModeChange("perSqm")}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") onModeChange("price");
            }}
            className={cn(
              "flex-1 rounded py-1 text-[0.55rem] font-medium uppercase tracking-wider transition-colors",
              mode === "perSqm"
                ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t("map3d.modePerSqm")}
          </button>
        </div>
      )}
    </div>
  );
}
