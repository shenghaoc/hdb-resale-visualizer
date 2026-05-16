import type { CSSProperties } from "react";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Translator } from "@/lib/i18n";

type SchoolOverlayControlProps = {
  isEnabled: boolean;
  hasSchools: boolean;
  onToggle: () => void;
  t: Translator;
  className?: string;
  style?: CSSProperties;
};

export function SchoolOverlayControl({
  isEnabled,
  hasSchools,
  onToggle,
  t,
  className,
  style,
}: SchoolOverlayControlProps) {
  const label = isEnabled ? t("schoolOverlay.disable") : t("schoolOverlay.enable");

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-lg border border-border/20 bg-background/90 p-2 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.06)] dark:border-primary/10 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_4px_20px_rgba(4,12,24,0.7)]",
        className,
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5">
        <GraduationCap
          data-icon
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-colors duration-200",
            isEnabled && hasSchools ? "text-primary" : "text-muted-foreground",
          )}
        />
        <p className="flex-1 text-[0.55rem] leading-none font-bold tracking-[0.1em] text-muted-foreground uppercase">
          {t("schoolOverlay.label")}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled && hasSchools}
          aria-label={hasSchools ? label : t("schoolOverlay.unavailable")}
          title={hasSchools ? label : t("schoolOverlay.unavailable")}
          disabled={!hasSchools}
          onClick={onToggle}
          className={cn(
            "relative h-4 w-7 shrink-0 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
            isEnabled && hasSchools ? "bg-primary shadow-[0_0_8px_rgba(8,145,178,0.3)]" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-[2px] left-[2px] size-3 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out",
              isEnabled && hasSchools ? "translate-x-3" : "translate-x-0",
            )}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
