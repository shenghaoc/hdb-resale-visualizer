import { useId, useState } from "react";
import { TrainFront } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMeters } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import type { PrecomputedMrtExit } from "@shared/data-types";

/** The publish-time PostGIS query uses this radius and stores the closest five. */
const PRECOMPUTED_MRT_RADIUS_METERS = 1500;

/**
 * The optional block-detail artifact carries nearest MRT exits. No capability
 * probe, runtime spatial request, database connection or background fetch.
 * Undefined = older publication; [] = an authoritative published empty result.
 */
export function NearbyMrtExits({ exits }: { exits?: readonly PrecomputedMrtExit[] }) {
  const { locale, t } = useI18n();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  if (exits === undefined) return null;

  return (
    <div className="mt-2 border-t border-border/40 pt-2" data-testid="nearby-mrt-exits">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <TrainFront data-icon className="size-3.5" aria-hidden="true" />
        {t(expanded ? "detail.spatialExits.hide" : "detail.spatialExits.show")}
      </Button>
      {expanded ? (
        <div id={panelId} className="pt-2" aria-live="polite">
          {exits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("detail.spatialExits.empty", {
                distance: formatMeters(PRECOMPUTED_MRT_RADIUS_METERS, t, locale),
              })}
            </p>
          ) : (
            <ul className="flex flex-col gap-1" aria-label={t("detail.spatialExits.show")}>
              {exits.map((exit) => (
                <li key={exit.exitId} className="flex justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{exit.stationName}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                    {exit.exitLabel} · {formatMeters(exit.distanceMeters, t, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[length:var(--text-xs)] text-muted-foreground">
            {t("detail.spatialExits.caveat")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
