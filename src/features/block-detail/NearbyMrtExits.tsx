import { useEffect, useId, useState } from "react";
import { TrainFront } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMeters } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import {
  fetchNearbyMrtExits,
  getNearbySpatialAvailable,
  NEARBY_MRT_RADIUS_METERS,
  toNearbyMrtStations,
  type NearbyMrtStation,
} from "./nearbyMrtExitsApi";

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; places: NearbyMrtStation[] };

/**
 * An opt-in supplement to the existing MRT walking-time panel.
 * Only the capability probe runs before a user opens the exit list.
 */
export function NearbyMrtExits({ lat, lng }: { lat: number; lng: number }) {
  const { locale, t } = useI18n();
  const panelId = useId();
  const [available, setAvailable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [result, setResult] = useState<ResultState>({ status: "idle" });

  useEffect(() => {
    let mounted = true;
    void getNearbySpatialAvailable().then((enabled) => {
      if (mounted) setAvailable(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pending indicator for the async fetch this effect performs
    setResult({ status: "loading" });
    void fetchNearbyMrtExits(lat, lng, controller.signal)
      .then((places) => {
        if (!controller.signal.aborted)
          setResult({ status: "ready", places: toNearbyMrtStations(places) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ status: "error" });
      });
    return () => controller.abort();
  }, [expanded, lat, lng, retryToken]);

  if (!available) return null;

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
          {result.status === "loading" || result.status === "idle" ? (
            <p className="text-xs text-muted-foreground">{t("detail.spatialExits.loading")}</p>
          ) : result.status === "error" ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("detail.spatialExits.error")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRetryToken((value) => value + 1)}
              >
                {t("detail.spatialExits.retry")}
              </Button>
            </div>
          ) : result.places.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("detail.spatialExits.empty", {
                distance: formatMeters(NEARBY_MRT_RADIUS_METERS, t, locale),
              })}
            </p>
          ) : (
            <ul className="flex flex-col gap-1" aria-label={t("detail.spatialExits.show")}>
              {result.places.map((place) => (
                <li key={place.exitId} className="flex justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{place.stationName}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                    {place.exitLabel} · {formatMeters(place.distanceMeters, t, locale)}
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
