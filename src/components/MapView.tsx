import { useEffect, useMemo, useRef, useState } from "react";
import { Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { toGeoJson } from "@/lib/map";
import {
  addPriceHeatmapLayer,
  removePriceHeatmapLayer,
  setHeatmapOpacity,
  isHeatmapLayerPresent,
} from "@/lib/priceHeatmap";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMapTheme } from "@/hooks/useMapTheme";
import { useMapRadiusLayer } from "@/hooks/useMapRadiusLayer";
import { useMapInitialization } from "@/hooks/useMapInitialization";
import { useMapLayers } from "@/hooks/useMapLayers";
import { useMapFitBounds } from "@/hooks/useMapFitBounds";
import { useMapDataSync } from "@/hooks/useMapDataSync";
import { useMapInteractions } from "@/hooks/useMapInteractions";
import type { BlockSummary, Coordinates } from "@/types/data";
import type { Translator } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
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
  geographicIntent,
  onSelect,
  onMapInteract,
  onGeolocate,
  t,
  locale,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [popupInstance, setPopupInstance] = useState<Popup | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const mapInstance = useMapInitialization({
    containerRef,
    isDarkMode,
    onGeolocate,
  });

  useEffect(() => {
    setPrefersReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "map-popup",
    });
    setPopupInstance(popup);
    return () => {
      popup.remove();
    };
  }, []);

  const geoJson = useMemo(() => toGeoJson(blocks), [blocks]);
  const blocksByKey = useMemo(() => {
    const map = new Map<string, BlockSummary>();
    for (const b of blocks) map.set(b.addressKey, b);
    return map;
  }, [blocks]);

  const debouncedTownFilter = useDebouncedValue(townFilter, 400);

  useMapLayers(mapInstance);
  useMapDataSync({ map: mapInstance, geoJson, priceHeatmapEnabled });
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

  // Selected point filter sync
  useEffect(() => {
    if (!mapInstance || !mapInstance.getLayer("selected-point")) return;
    mapInstance.setFilter("selected-point", ["==", ["get", "address_key"], selectedAddressKey ?? ""]);
    mapInstance.setFilter("selected-point-label", ["==", ["get", "address_key"], selectedAddressKey ?? ""]);
  }, [mapInstance, selectedAddressKey]);

  // Marker visibility sync
  useEffect(() => {
    if (!mapInstance) return;
    const applyVisibility = () => {
      const visibility = showBlockMarkers ? "visible" : "none";
      for (const layerId of ["clusters", "cluster-count", "unclustered-point"]) {
        if (mapInstance.getLayer(layerId)) {
          mapInstance.setLayoutProperty(layerId, "visibility", visibility);
        }
      }
    };
    if (mapInstance.isStyleLoaded()) {
      applyVisibility();
    } else {
      mapInstance.once("load", applyVisibility);
    }
  }, [mapInstance, showBlockMarkers]);

  // Heatmap layer management
  useEffect(() => {
    if (!mapInstance) return;
    const apply = () => {
      if (priceHeatmapEnabled) {
        addPriceHeatmapLayer(mapInstance, priceHeatmapOpacity, geoJson);
      } else {
        removePriceHeatmapLayer(mapInstance);
      }
    };
    if (mapInstance.isStyleLoaded()) {
      apply();
    } else {
      mapInstance.once("load", apply);
    }
  }, [mapInstance, priceHeatmapEnabled, geoJson, priceHeatmapOpacity]);

  // Heatmap opacity sync
  useEffect(() => {
    if (!mapInstance || !priceHeatmapEnabled) return;
    const applyOpacity = () => {
      if (isHeatmapLayerPresent(mapInstance)) {
        setHeatmapOpacity(mapInstance, priceHeatmapOpacity);
      }
    };
    if (mapInstance.isStyleLoaded()) {
      applyOpacity();
    } else {
      mapInstance.once("load", applyOpacity);
    }
  }, [mapInstance, priceHeatmapOpacity, priceHeatmapEnabled]);

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
