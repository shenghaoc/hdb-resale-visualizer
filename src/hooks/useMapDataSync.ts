import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { isGeoJsonDataSourceLike } from "@/types/map";
import { HEATMAP_SOURCE_ID } from "@/lib/priceHeatmap";
import { PRIMARY_SCHOOL_LAYER_IDS, PRIMARY_SCHOOL_SOURCE_ID } from "@/lib/constants";

type UseMapDataSyncProps = {
  map: MapLibreMap | null;
  geoJson: GeoJSON.FeatureCollection;
  priceHeatmapEnabled: boolean;
  primarySchoolsGeoJson?: GeoJSON.FeatureCollection;
  showPrimarySchools?: boolean;
};

export function useMapDataSync({
  map,
  geoJson,
  priceHeatmapEnabled,
  primarySchoolsGeoJson,
  showPrimarySchools = false,
}: UseMapDataSyncProps) {
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

  useEffect(() => {
    if (!map) return;

    let isActive = true;

    const applyPrimarySchools = () => {
      if (!isActive || !map.isStyleLoaded()) return;
      const source = map.getSource(PRIMARY_SCHOOL_SOURCE_ID);
      if (primarySchoolsGeoJson && isGeoJsonDataSourceLike(source)) {
        source.setData(primarySchoolsGeoJson);
      }

      for (const layerId of PRIMARY_SCHOOL_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            showPrimarySchools ? "visible" : "none",
          );
        }
      }
    };
    const applyPrimarySchoolsOnLoad = () => {
      map.off("load", applyPrimarySchoolsOnLoad);
      applyPrimarySchools();
    };

    if (map.isStyleLoaded()) {
      applyPrimarySchools();
    } else {
      map.on("load", applyPrimarySchoolsOnLoad);
    }
    map.on("styledata", applyPrimarySchools);

    return () => {
      isActive = false;
      map.off("load", applyPrimarySchoolsOnLoad);
      map.off("styledata", applyPrimarySchools);
    };
  }, [map, primarySchoolsGeoJson, showPrimarySchools]);
}
