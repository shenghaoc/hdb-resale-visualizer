import { Loader2, LocateFixed, Scale, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Translator } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

type ScopePromptProps = {
  showScopePrompt: boolean;
  geolocationError: string | null;
  isDesktop: boolean;
  isLocating: boolean;
  t: Translator;
  onUseCurrentLocation: () => void;
  onChooseTown: () => void;
  onCheckListing?: () => void;
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
  onCheckListing,
}: ScopePromptProps) {
  if (showScopePrompt) {
    return (
      <div
        className={cn(
          "pointer-events-auto absolute z-25 max-w-[22rem] rounded-xl border bg-popover/95 p-3 text-sm shadow-lg backdrop-blur-[20px]",
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
          {onCheckListing ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-8 rounded-lg px-2.5 text-[0.62rem] font-extrabold uppercase tracking-wider"
              onClick={onCheckListing}
            >
              <Scale data-icon className="size-3.5" aria-hidden="true" />
              {t("check.primaryAction")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (geolocationError) {
    return (
      <div
        role="status"
        className={cn(
          "pointer-events-auto absolute z-25 rounded-lg border border-destructive/30 bg-popover/95 px-3 py-2 text-xs font-medium leading-snug text-destructive shadow-lg backdrop-blur-[20px]",
          isDesktop ? `${DESKTOP_POSITION} max-w-[22rem]` : MOBILE_ERROR_POSITION,
        )}
      >
        {geolocationError}
      </div>
    );
  }

  return null;
}
