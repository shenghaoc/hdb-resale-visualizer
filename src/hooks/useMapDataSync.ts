import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { isGeoJsonDataSourceLike } from "@/types/map";
import { HEATMAP_SOURCE_ID } from "@/lib/priceHeatmap";

type UseMapDataSyncProps = {
  map: MapLibreMap | null;
  geoJson: GeoJSON.FeatureCollection;
  priceHeatmapEnabled: boolean;
};

export function useMapDataSync({ map, geoJson, priceHeatmapEnabled }: UseMapDataSyncProps) {
  // Sync main blocks source
  useEffect(() => {
    if (!map) return;

    const updateData = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("blocks");
      if (isGeoJsonDataSourceLike(source)) {
        source.setData(geoJson);
      }
    };

    if (map.isStyleLoaded()) {
      updateData();
    } else {
      void map.once("load", updateData);
    }
    map.on("styledata", updateData);

    return () => {
      map.off("load", updateData);
      map.off("styledata", updateData);
    };
  }, [map, geoJson]);

  // Sync heatmap source if active
  useEffect(() => {
    if (!map || !priceHeatmapEnabled) return;

    const applyData = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource(HEATMAP_SOURCE_ID);
      if (isGeoJsonDataSourceLike(source)) {
        source.setData(geoJson);
      }
    };

    if (map.isStyleLoaded()) {
      applyData();
    } else {
      void map.once("load", applyData);
    }
    map.on("styledata", applyData);

    return () => {
      map.off("load", applyData);
      map.off("styledata", applyData);
    };
  }, [map, geoJson, priceHeatmapEnabled]);
}
