import { Loader2, LocateFixed, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Translator } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ScopePromptProps = {
  showScopePrompt: boolean;
  geolocationError: string | null;
  isDesktop: boolean;
  isLocating: boolean;
  t: Translator;
  onUseCurrentLocation: () => void;
  onChooseTown: () => void;
};

// Tailwind v4's scanner only picks up class names that appear as complete
// literals in the source. Keep these strings whole — do NOT concatenate them
// from fragments or Tailwind will skip generating the arbitrary `bottom-[calc(...)]`
// CSS, and the absolute element will fall back to `top: 0; left: 0`, covering
// the map controls.
const DESKTOP_POSITION = "bottom-[5.75rem] left-6";
const MOBILE_PROMPT_POSITION =
  "bottom-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+2.9rem)] left-3 right-3";
const MOBILE_ERROR_POSITION =
  "bottom-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+0.75rem)] left-3 right-3";

export function ScopePrompt({
  showScopePrompt,
  geolocationError,
  isDesktop,
  isLocating,
  t,
  onUseCurrentLocation,
  onChooseTown,
}: ScopePromptProps) {
  if (showScopePrompt) {
    return (
      <div
        className={cn(
          "pointer-events-auto absolute z-25 max-w-[22rem] rounded-xl border border-border/20 bg-background/92 p-3 text-sm shadow-[0_8px_28px_rgba(23,28,31,0.10)] backdrop-blur-[20px] dark:border-primary/10 dark:bg-card/92 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_16px_48px_rgba(4,12,24,0.82)]",
          isDesktop ? DESKTOP_POSITION : MOBILE_PROMPT_POSITION,
        )}
      >
        <p className="v2-section-title">{t("app.scopePromptTitle")}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {t("app.scopePromptDescription")}
        </p>
        {geolocationError ? (
          <p className="mt-2 text-xs font-medium leading-snug text-destructive">
            {geolocationError}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="xs"
            className="h-8 rounded-lg px-2.5 text-[0.62rem] font-extrabold uppercase tracking-wider"
            onClick={onUseCurrentLocation}
            disabled={isLocating}
          >
            {isLocating ? (
              <Loader2 data-icon className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <LocateFixed data-icon className="size-3.5" aria-hidden="true" />
            )}
            {isLocating ? t("app.locating") : t("app.useCurrentLocation")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-8 rounded-lg px-2.5 text-[0.62rem] font-extrabold uppercase tracking-wider"
            onClick={onChooseTown}
          >
            <SlidersHorizontal data-icon className="size-3.5" aria-hidden="true" />
            {t("app.chooseTown")}
          </Button>
        </div>
      </div>
    );
  }

  if (geolocationError) {
    return (
      <div
        role="status"
        className={cn(
          "pointer-events-auto absolute z-25 rounded-lg border border-destructive/30 bg-background/95 px-3 py-2 text-xs font-medium leading-snug text-destructive shadow-[0_8px_28px_rgba(23,28,31,0.10)] backdrop-blur-[20px] dark:bg-card/95",
          isDesktop ? `${DESKTOP_POSITION} max-w-[22rem]` : MOBILE_ERROR_POSITION,
        )}
      >
        {geolocationError}
      </div>
    );
  }

  return null;
}
