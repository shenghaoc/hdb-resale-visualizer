import { useEffect, useMemo, useRef } from "react";
import { Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { toGeoJson } from "./map";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMapTheme } from "./useMapTheme";
import { useMapRadiusLayer } from "./useMapRadiusLayer";
import { useMapInitialization } from "./useMapInitialization";
import { useMapLayers } from "./useMapLayers";
import { useMapFitBounds } from "./useMapFitBounds";
import { useMapDataSync } from "./useMapDataSync";
import { useMapInteractions } from "./useMapInteractions";
import { useMapSelectionSync } from "./useMapSelectionSync";
import { useMapMarkerVisibility } from "./useMapMarkerVisibility";
import { useMapPriceHeatmapSync } from "./useMapPriceHeatmapSync";
import { useAmenityGeoSync } from "./useAmenityGeoSync";
import { primarySchoolsToGeoJson, type PrimarySchoolWithBand } from "./school-proximity";
import type { HeatmapMode } from "./usePriceHeatmap";
import type { BlockSummary, Coordinates } from "@/types/data";
import type { Locale, Translator } from "@/shared/lib/i18n";
import type { GeographicSearchIntent } from "@/shared/lib/filtering";

type MapViewProps = {
  blocks: BlockSummary[];
  selectedAddressKey: string | null;
  townFilter?: string | null;
  flatType?: string;
  autoFitKey?: string | null;
  showBlockMarkers?: boolean;
  isDarkMode: boolean;
  priceHeatmapEnabled?: boolean;
  priceHeatmapOpacity?: number;
  mrtEnabled?: boolean;
  heatmapMode?: HeatmapMode;
  primarySchools?: PrimarySchoolWithBand[];
  schoolOverlayEnabled?: boolean;
  geographicIntent?: GeographicSearchIntent | null;
  onSelect: (addressKey: string) => void;
  onMapInteract?: (interactionType?: "background" | "feature") => void;
  onGeolocate?: (coords: Coordinates) => void;
  t: Translator;
  locale: Locale;
};

export function MapView({
  blocks,
  selectedAddressKey,
  townFilter,
  flatType = "",
  autoFitKey,
  showBlockMarkers = false,
  isDarkMode,
  priceHeatmapEnabled = false,
  priceHeatmapOpacity = 0.7,
  mrtEnabled = false,
  heatmapMode = "price",
  primarySchools = [],
  schoolOverlayEnabled = false,
  geographicIntent,
  onSelect,
  onMapInteract,
  onGeolocate,
  t,
  locale,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useMemo(
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    [],
  );
  const popupInstance = useMemo(
    () =>
      new Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        className: "map-popup",
      }),
    [],
  );

  const { mapInstance, mapError } = useMapInitialization({
    containerRef,
    isDarkMode,
    onGeolocate,
  });

  useEffect(
    () => () => {
      popupInstance.remove();
    },
    [popupInstance],
  );

  const geoJson = useMemo(() => toGeoJson(blocks, flatType), [blocks, flatType]);
  const primarySchoolsGeoJson = useMemo(
    () => primarySchoolsToGeoJson(primarySchools),
    [primarySchools],
  );
  const blocksByKey = useMemo(() => {
    const map = new Map<string, BlockSummary>();
    for (const b of blocks) map.set(b.addressKey, b);
    return map;
  }, [blocks]);
  const selectedBlock = selectedAddressKey ? (blocksByKey.get(selectedAddressKey) ?? null) : null;

  const debouncedTownFilter = useDebouncedValue(townFilter, 400);

  useMapLayers(mapInstance);
  useMapDataSync({
    map: mapInstance,
    geoJson,
    primarySchoolsGeoJson,
    schoolOverlayEnabled,
  });
  useMapFitBounds({
    map: mapInstance,
    blocks,
    townFilter: debouncedTownFilter,
    autoFitKey,
    prefersReducedMotion,
  });
  useMapInteractions({
    map: mapInstance,
    popup: popupInstance,
    onSelect,
    onMapInteract,
    t,
    locale,
    prefersReducedMotion,
  });

  useMapSelectionSync({
    map: mapInstance,
    selectedAddressKey,
    selectedBlock,
    townFilter,
    autoFitKey,
    prefersReducedMotion,
  });
  useMapMarkerVisibility({ map: mapInstance, showBlockMarkers });
  useMapPriceHeatmapSync({
    map: mapInstance,
    geoJson,
    priceHeatmapEnabled,
    priceHeatmapOpacity,
    heatmapMode,
  });

  const amenityStatus = useAmenityGeoSync({
    map: mapInstance,
    mrtEnabled,
  });

  useMapTheme(mapInstance, isDarkMode);
  useMapRadiusLayer(mapInstance, geographicIntent, selectedAddressKey, blocksByKey);

  const mrtStatusMessage = !mrtEnabled
    ? null
    : amenityStatus.isLoading
      ? t("amenity.mrtLoading")
      : amenityStatus.stationsFailed && amenityStatus.exitsFailed
        ? t("amenity.mrtUnavailable")
        : amenityStatus.stationsFailed
          ? t("amenity.mrtStationsUnavailable")
          : amenityStatus.exitsFailed
            ? t("amenity.mrtExitsUnavailable")
            : null;
  const mrtLoadFailed =
    !amenityStatus.isLoading && (amenityStatus.stationsFailed || amenityStatus.exitsFailed);

  return (
    <div
      className="map-view bg-background transition-colors duration-300"
      data-testid="map-view"
      data-theme={isDarkMode ? "dark" : "light"}
      ref={containerRef}
      role="application"
      aria-label={t("map.ariaLabel")}
    >
      {mapError ? (
        <div
          className="flex h-full min-h-[280px] items-center justify-center px-6 text-center"
          role="status"
        >
          <div className="flex max-w-sm flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">{t("map.unavailableTitle")}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("map.unavailableDescription")}
            </p>
          </div>
        </div>
      ) : null}
      {!mapError && mrtStatusMessage ? (
        <div
          className="pointer-events-none absolute left-1/2 top-20 z-10 max-w-[min(90%,24rem)] -translate-x-1/2 border border-border bg-popover px-3 py-2 text-center text-xs text-popover-foreground shadow-sm"
          data-testid="mrt-layer-status"
          role={mrtLoadFailed ? "alert" : "status"}
        >
          {mrtStatusMessage}
        </div>
      ) : null}
    </div>
  );
}
