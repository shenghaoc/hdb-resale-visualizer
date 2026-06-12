import type { CSSProperties } from "react";
import { GraduationCap, MapPin, TrainFront } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import type { Translator } from "@/shared/lib/i18n";

type AmenityLayersControlProps = {
  mrtStationsEnabled: boolean;
  mrtExitsEnabled: boolean;
  schoolOverlayEnabled: boolean;
  schoolOverlayAvailable: boolean;
  schoolOverlayLoading: boolean;
  hasBlockSelection: boolean;
  onToggleMrtStations: () => void;
  onToggleMrtExits: () => void;
  onToggleSchoolOverlay: () => void;
  t: Translator;
  className?: string;
  style?: CSSProperties;
};

function LayerSwitch({
  enabled,
  disabled,
  ariaLabel,
  tooltip,
  onToggle,
}: {
  enabled: boolean;
  disabled: boolean;
  ariaLabel: string;
  tooltip?: string;
  onToggle: () => void;
}) {
  const active = enabled && !disabled;
  const switchButton = (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
        active ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] left-[3px] size-[18px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out",
          active ? "translate-x-4" : "translate-x-0",
        )}
        aria-hidden="true"
      />
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
  mrtStationsEnabled,
  mrtExitsEnabled,
  schoolOverlayEnabled,
  schoolOverlayAvailable,
  schoolOverlayLoading,
  hasBlockSelection,
  onToggleMrtStations,
  onToggleMrtExits,
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
        "pointer-events-auto flex flex-col gap-2 rounded-lg border bg-popover/90 p-2 text-[0.55rem] backdrop-blur-[20px] shadow-lg",
        className,
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <MapPin data-icon className="size-3" aria-hidden />
        <span className="font-bold uppercase tracking-[0.1em]">{t("amenity.label")}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <TrainFront
            data-icon
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 transition-colors duration-200",
              mrtStationsEnabled ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="flex-1 text-muted-foreground">{t("amenity.mrtStations")}</span>
          <LayerSwitch
            enabled={mrtStationsEnabled}
            disabled={false}
            ariaLabel={t("amenity.mrtStations")}
            onToggle={onToggleMrtStations}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <TrainFront
            data-icon
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 transition-colors duration-200",
              mrtExitsEnabled ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="flex-1 text-muted-foreground">{t("amenity.mrtExits")}</span>
          <LayerSwitch
            enabled={mrtExitsEnabled}
            disabled={false}
            ariaLabel={t("amenity.mrtExits")}
            onToggle={onToggleMrtExits}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <GraduationCap
            data-icon
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 transition-colors duration-200",
              schoolOverlayEnabled && schoolCanToggle ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "flex-1",
              schoolCanToggle ? "text-muted-foreground" : "text-muted-foreground/60",
            )}
          >
            {t("amenity.schools")}
            {!hasBlockSelection && (
              <span className="ml-1 text-[0.5rem] italic opacity-60">
                ({t("amenity.schoolsHint")})
              </span>
            )}
          </span>
          <LayerSwitch
            enabled={schoolOverlayEnabled}
            disabled={!schoolCanToggle}
            ariaLabel={schoolAriaLabel}
            tooltip={schoolAriaLabel}
            onToggle={onToggleSchoolOverlay}
          />
        </div>
      </div>
    </div>
  );
}
