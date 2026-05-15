import { useEffect, useMemo, useRef } from "react";
import { Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { toGeoJson } from "@/lib/map";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMapTheme } from "@/hooks/useMapTheme";
import { useMapRadiusLayer } from "@/hooks/useMapRadiusLayer";
import { useMapInitialization } from "@/hooks/useMapInitialization";
import { useMapLayers } from "@/hooks/useMapLayers";
import { useMapFitBounds } from "@/hooks/useMapFitBounds";
import { useMapDataSync } from "@/hooks/useMapDataSync";
import { useMapInteractions } from "@/hooks/useMapInteractions";
import { useMapSelectionSync } from "@/hooks/useMapSelectionSync";
import { useMapMarkerVisibility } from "@/hooks/useMapMarkerVisibility";
import { useMapPriceHeatmapSync } from "@/hooks/useMapPriceHeatmapSync";
import { primarySchoolsToGeoJson, type PrimarySchoolWithBand } from "@/lib/school-proximity";
import type { BlockSummary, Coordinates } from "@/types/data";
import type { Locale, Translator } from "@/lib/i18n";
import type { GeographicSearchIntent } from "@/lib/filtering";

type MapViewProps = {
  blocks: BlockSummary[];
  selectedAddressKey: string | null;
  townFilter?: string | null;
  autoFitKey?: string | null;
  showBlockMarkers?: boolean;
  isDarkMode: boolean;
  priceHeatmapEnabled?: boolean;
  priceHeatmapOpacity?: number;
  heatmapMode?: import("@/hooks/usePriceHeatmap").HeatmapMode;
  primarySchools?: PrimarySchoolWithBand[];
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
  autoFitKey,
  showBlockMarkers = false,
  isDarkMode,
  priceHeatmapEnabled = false,
  priceHeatmapOpacity = 0.7,
  primarySchools = [],
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

  const mapInstance = useMapInitialization({
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

  const geoJson = useMemo(() => toGeoJson(blocks), [blocks]);
  const primarySchoolsGeoJson = useMemo(
    () => primarySchoolsToGeoJson(primarySchools),
    [primarySchools],
  );
  const blocksByKey = useMemo(() => {
    const map = new Map<string, BlockSummary>();
    for (const b of blocks) map.set(b.addressKey, b);
    return map;
  }, [blocks]);

  const debouncedTownFilter = useDebouncedValue(townFilter, 400);

  useMapLayers(mapInstance);
  useMapDataSync({
    map: mapInstance,
    geoJson,
    priceHeatmapEnabled,
    primarySchoolsGeoJson,
    showPrimarySchools: primarySchools.length > 0,
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

  useMapSelectionSync({ map: mapInstance, selectedAddressKey });
  useMapMarkerVisibility({ map: mapInstance, showBlockMarkers });
  useMapPriceHeatmapSync({
    map: mapInstance,
    geoJson,
    priceHeatmapEnabled,
    priceHeatmapOpacity,
  });

  useMapTheme(mapInstance, isDarkMode);
  useMapRadiusLayer(mapInstance, geographicIntent, selectedAddressKey, blocksByKey);

  return (
    <div
      className="map-view bg-background transition-colors duration-300"
      data-testid="map-view"
      data-theme={isDarkMode ? "dark" : "light"}
      ref={containerRef}
      role="application"
      aria-label={t("map.ariaLabel")}
    />
  );
}
