import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  addPriceHeatmapLayer,
  isHeatmapLayerPresent,
  removePriceHeatmapLayer,
  setHeatmapOpacity,
} from "@/lib/priceHeatmap";

type UseMapPriceHeatmapSyncProps = {
  map: MapLibreMap | null;
  geoJson: GeoJSON.FeatureCollection;
  priceHeatmapEnabled: boolean;
  priceHeatmapOpacity: number;
};

export function useMapPriceHeatmapSync({
  map,
  geoJson,
  priceHeatmapEnabled,
  priceHeatmapOpacity,
}: UseMapPriceHeatmapSyncProps) {
  useEffect(() => {
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      if (priceHeatmapEnabled) {
        addPriceHeatmapLayer(map, priceHeatmapOpacity, geoJson);
      } else {
        removePriceHeatmapLayer(map);
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
  }, [map, priceHeatmapEnabled, geoJson, priceHeatmapOpacity]);

  useEffect(() => {
    if (!map || !priceHeatmapEnabled) return;

    const applyOpacity = () => {
      if (!map.isStyleLoaded()) return;
      if (isHeatmapLayerPresent(map)) {
        setHeatmapOpacity(map, priceHeatmapOpacity);
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
