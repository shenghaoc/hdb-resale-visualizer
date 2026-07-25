import type { CSSProperties } from "react";
import { GraduationCap, MapPin, TrainFront } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import type { Translator } from "@/shared/lib/i18n";

type AmenityLayersControlProps = {
  mrtEnabled: boolean;
  schoolOverlayEnabled: boolean;
  schoolOverlayAvailable: boolean;
  schoolOverlayLoading: boolean;
  hasBlockSelection: boolean;
  onToggleMrt: () => void;
  onToggleSchoolOverlay: () => void;
  t: Translator;
  className?: string;
  style?: CSSProperties;
};

function LayerSwitch({
  enabled,
  disabled,
  busy = false,
  ariaLabel,
  tooltip,
  onToggle,
}: {
  enabled: boolean;
  disabled: boolean;
  busy?: boolean;
  ariaLabel: string;
  tooltip?: string;
  onToggle: () => void;
}) {
  const switchButton = (
    <button
      type="button"
      role="switch"
      data-touch-target
      aria-checked={enabled}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className="flex h-7 w-11 shrink-0 items-center justify-center bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors duration-300",
          enabled ? "bg-primary" : "bg-muted-foreground/30",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "absolute left-[3px] top-[3px] size-[18px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out",
            enabled ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );

  if (!tooltip) {
    return switchButton;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">{switchButton}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function AmenityLayersControl({
  mrtEnabled,
  schoolOverlayEnabled,
  schoolOverlayAvailable,
  schoolOverlayLoading,
  hasBlockSelection,
  onToggleMrt,
  onToggleSchoolOverlay,
  t,
  className,
  style,
}: AmenityLayersControlProps) {
  const schoolCanToggle = schoolOverlayAvailable && !schoolOverlayLoading;
  const schoolAriaLabel = schoolOverlayLoading
    ? t("schoolOverlay.loading")
    : schoolOverlayAvailable
      ? schoolOverlayEnabled
        ? t("schoolOverlay.disable")
        : t("schoolOverlay.enable")
      : hasBlockSelection
        ? t("schoolOverlay.noSchoolsNearby")
        : t("schoolOverlay.unavailable");

  return (
    <div
      className={cn(
        "v2-chrome pointer-events-auto flex flex-col gap-2 p-2 text-[length:var(--text-xs)]",
        className,
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <MapPin data-icon className="size-3" aria-hidden />
        <span className="font-bold uppercase tracking-[var(--tracking-label)]">
          {t("amenity.label")}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <TrainFront
            data-icon
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 transition-colors duration-200",
              mrtEnabled ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="flex-1 text-muted-foreground">{t("amenity.mrt")}</span>
          <LayerSwitch
            enabled={mrtEnabled}
            disabled={false}
            ariaLabel={t("amenity.mrt")}
            onToggle={onToggleMrt}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <GraduationCap
            data-icon
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 transition-colors duration-200",
              schoolOverlayEnabled ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="flex-1 text-muted-foreground">
            {t("amenity.schools")}
            {!hasBlockSelection && (
              <span className="ml-1 text-[length:var(--text-xs)] italic">
                ({t("amenity.schoolsHint")})
              </span>
            )}
          </span>
          <LayerSwitch
            enabled={schoolOverlayEnabled}
            disabled={!schoolCanToggle}
            busy={schoolOverlayLoading}
            ariaLabel={schoolAriaLabel}
            tooltip={schoolAriaLabel}
            onToggle={onToggleSchoolOverlay}
          />
        </div>
      </div>
    </div>
  );
}
