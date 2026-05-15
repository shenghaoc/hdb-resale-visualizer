import { type CSSProperties, useId } from "react";
import { GraduationCap, TrainFront, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Translator } from "@/lib/i18n";

type AmenityLayersControlProps = {
  mrtStationsEnabled: boolean;
  mrtExitsEnabled: boolean;
  schoolsEnabled: boolean;
  onToggleMrtStations: () => void;
  onToggleMrtExits: () => void;
  onToggleSchools: () => void;
  t: Translator;
  className?: string;
  style?: CSSProperties;
};

export function AmenityLayersControl({
  mrtStationsEnabled,
  mrtExitsEnabled,
  schoolsEnabled,
  onToggleMrtStations,
  onToggleMrtExits,
  onToggleSchools,
  t,
  className,
  style,
}: AmenityLayersControlProps) {
  const mrtStationId = useId();
  const mrtExitId = useId();
  const schoolId = useId();

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col gap-1.5 rounded-lg border border-border/20 bg-background/90 p-2 text-[0.55rem] backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.06)] dark:border-primary/10 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_4px_20px_rgba(4,12,24,0.7)]",
        className,
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <MapPin data-icon className="size-3" aria-hidden />
        <span className="font-bold uppercase tracking-[0.1em]">{t("amenity.label")}</span>
      </div>

      <label className="flex items-center gap-1.5" htmlFor={mrtStationId}>
        <TrainFront className="size-3 text-primary/70" aria-hidden />
        <span className="flex-1">{t("amenity.mrtStations")}</span>
        <input
          id={mrtStationId}
          type="checkbox"
          checked={mrtStationsEnabled}
          onChange={onToggleMrtStations}
          className="accent-primary"
          aria-label={t("amenity.mrtStations")}
        />
      </label>

      <label className="flex items-center gap-1.5" htmlFor={mrtExitId}>
        <TrainFront className="size-3 text-primary/70" aria-hidden />
        <span className="flex-1">{t("amenity.mrtExits")}</span>
        <input
          id={mrtExitId}
          type="checkbox"
          checked={mrtExitsEnabled}
          onChange={onToggleMrtExits}
          className="accent-primary"
          aria-label={t("amenity.mrtExits")}
        />
      </label>

      <label className="flex items-center gap-1.5" htmlFor={schoolId}>
        <GraduationCap className="size-3 text-primary/70" aria-hidden />
        <span className="flex-1">{t("amenity.schools")}</span>
        <input
          id={schoolId}
          type="checkbox"
          checked={schoolsEnabled}
          onChange={onToggleSchools}
          className="accent-primary"
          aria-label={t("amenity.schools")}
        />
      </label>
    </div>
  );
}
