import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  addPriceHeatmapLayer,
  HEATMAP_SOURCE_ID,
  isHeatmapLayerPresent,
  removePriceHeatmapLayer,
  setHeatmapOpacity,
} from "@/features/map-explorer/priceHeatmap";
import { isGeoJsonDataSourceLike } from "@/types/map";
import type { HeatmapMode } from "@/hooks/usePriceHeatmap";

type UseMapPriceHeatmapSyncProps = {
  map: MapLibreMap | null;
  geoJson: GeoJSON.FeatureCollection;
  priceHeatmapEnabled: boolean;
  priceHeatmapOpacity: number;
  heatmapMode: HeatmapMode;
};

export function useMapPriceHeatmapSync({
  map,
  geoJson,
  priceHeatmapEnabled,
  priceHeatmapOpacity,
  heatmapMode,
}: UseMapPriceHeatmapSyncProps) {
  // Opacity is intentionally excluded: it is owned by a dedicated lightweight
  // effect (setHeatmapOpacity) and must not trigger layer recreation here.
  const configuredLayerRef = useRef<{
    enabled: boolean;
    mode: HeatmapMode;
  } | null>(null);
  const heatmapSourceRef = useRef<unknown>(null);
  const heatmapDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const heatmapOpacityRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource(HEATMAP_SOURCE_ID);
      const sourceIsHeatmapReady = isGeoJsonDataSourceLike(source);
      const desiredConfig = {
        enabled: priceHeatmapEnabled,
        mode: heatmapMode,
        opacity: priceHeatmapOpacity,
      };
      const layerIsPresent = isHeatmapLayerPresent(map);
      const config = configuredLayerRef.current;
      const configChanged =
        !config ||
        config.enabled !== desiredConfig.enabled ||
        config.mode !== desiredConfig.mode ||
        !layerIsPresent;

      if (!configChanged && layerIsPresent && sourceIsHeatmapReady) {
        return;
      }

      if (priceHeatmapEnabled) {
        if (!layerIsPresent || configChanged) {
          addPriceHeatmapLayer(map, priceHeatmapOpacity, geoJson, heatmapMode);
          configuredLayerRef.current = desiredConfig;
          heatmapDataRef.current = geoJson;
          heatmapSourceRef.current = map.getSource(HEATMAP_SOURCE_ID);
          return;
        }

        if (!sourceIsHeatmapReady) {
          addPriceHeatmapLayer(map, priceHeatmapOpacity, geoJson, heatmapMode);
          configuredLayerRef.current = desiredConfig;
          heatmapDataRef.current = geoJson;
          heatmapSourceRef.current = map.getSource(HEATMAP_SOURCE_ID);
        }
      } else {
        if (isHeatmapLayerPresent(map)) {
          removePriceHeatmapLayer(map);
          configuredLayerRef.current = desiredConfig;
          heatmapDataRef.current = null;
          heatmapSourceRef.current = null;
        }
      }

      if (!priceHeatmapEnabled) {
        configuredLayerRef.current = desiredConfig;
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      void map.once("load", apply);
    }
    map.on("styledata", apply);

    return () => {
      map.off("load", apply);
      map.off("styledata", apply);
    };
  // priceHeatmapOpacity is included here only for initial layer creation; ongoing opacity
  // updates are owned exclusively by the second effect via setHeatmapOpacity.
  }, [map, priceHeatmapEnabled, geoJson, priceHeatmapOpacity, heatmapMode]);

  // Sync heatmap source data when geoJson changes while the heatmap is active.
  // addPriceHeatmapLayer only calls setData during initial source creation, so
  // this effect is the sole owner of data updates for the heatmap source.
  useEffect(() => {
    if (!map || !priceHeatmapEnabled) return;

    const syncData = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource(HEATMAP_SOURCE_ID);
      if (
        isGeoJsonDataSourceLike(source) &&
        (source !== heatmapSourceRef.current || geoJson !== heatmapDataRef.current)
      ) {
        source.setData(geoJson);
        heatmapSourceRef.current = source;
        heatmapDataRef.current = geoJson;
      }
    };

    if (map.isStyleLoaded()) {
      syncData();
    } else {
      void map.once("load", syncData);
    }
    map.on("styledata", syncData);

    return () => {
      map.off("load", syncData);
      map.off("styledata", syncData);
    };
  }, [map, priceHeatmapEnabled, geoJson]);

  useEffect(() => {
    if (!map || !priceHeatmapEnabled) return;

    const applyOpacity = () => {
      if (!map.isStyleLoaded()) return;
      if (isHeatmapLayerPresent(map) && heatmapOpacityRef.current !== priceHeatmapOpacity) {
        setHeatmapOpacity(map, priceHeatmapOpacity);
        heatmapOpacityRef.current = priceHeatmapOpacity;
      }
    };

    if (map.isStyleLoaded()) {
      applyOpacity();
    } else {
      void map.once("load", applyOpacity);
    }

    map.on("styledata", applyOpacity);

    return () => {
      map.off("load", applyOpacity);
      map.off("styledata", applyOpacity);
    };
  }, [map, priceHeatmapOpacity, priceHeatmapEnabled]);
}
