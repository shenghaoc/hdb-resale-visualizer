import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { isGeoJsonDataSourceLike } from "@/types/map";
import { HEATMAP_SOURCE_ID } from "@/lib/priceHeatmap";
import { PRIMARY_SCHOOL_LAYER_IDS, PRIMARY_SCHOOL_SOURCE_ID } from "@/lib/constants";

function areLayersAlreadyBeforeTarget(
  map: MapLibreMap,
  layerIds: readonly string[],
  beforeLayerId: string | undefined,
): boolean {
  if (layerIds.length === 0) return true;

  const style = map.getStyle();
  if (!style || !style.layers) return false;

  const orderedLayerIds = style.layers.map((layer) => layer.id);

  const firstLayerIndex = orderedLayerIds.indexOf(layerIds[0]);
  if (firstLayerIndex === -1) return false;

  for (let i = 0; i < layerIds.length; i++) {
    if (orderedLayerIds[firstLayerIndex + i] !== layerIds[i]) {
      return false;
    }
  }

  const lastLayerIndex = firstLayerIndex + layerIds.length - 1;

  if (beforeLayerId === undefined) {
    return lastLayerIndex === orderedLayerIds.length - 1;
  }

  const beforeLayerIndex = orderedLayerIds.indexOf(beforeLayerId);
  return beforeLayerIndex !== -1 && lastLayerIndex === beforeLayerIndex - 1;
}

function moveLayersBeforeTargetIfNeeded(
  map: MapLibreMap,
  layerIds: readonly string[],
  beforeLayerId: string | undefined,
): void {
  if (areLayersAlreadyBeforeTarget(map, layerIds, beforeLayerId)) return;

  for (const layerId of layerIds) {
    if (!map.getLayer(layerId)) continue;
    map.moveLayer(layerId, beforeLayerId);
  }
}

type UseMapDataSyncProps = {
  map: MapLibreMap | null;
  geoJson: GeoJSON.FeatureCollection;
  priceHeatmapEnabled: boolean;
  primarySchoolsGeoJson?: GeoJSON.FeatureCollection;
  schoolOverlayEnabled?: boolean;
};

export function useMapDataSync({
  map,
  geoJson,
  priceHeatmapEnabled,
  primarySchoolsGeoJson,
  schoolOverlayEnabled = false,
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

    const applyPrimarySchools = (e?: { dataType?: string }) => {
      if (!isActive || !map.isStyleLoaded()) return;
      const source = map.getSource(PRIMARY_SCHOOL_SOURCE_ID);
      if (primarySchoolsGeoJson && isGeoJsonDataSourceLike(source)) {
        source.setData(primarySchoolsGeoJson);
      }

      const hasSchoolFeatures = (primarySchoolsGeoJson?.features.length ?? 0) > 0;
      const schoolVisibility =
        schoolOverlayEnabled && hasSchoolFeatures ? "visible" : "none";

      for (const layerId of PRIMARY_SCHOOL_LAYER_IDS) {
        if (!map.getLayer(layerId)) continue;
        map.setLayoutProperty(layerId, "visibility", schoolVisibility);
      }

      if (schoolVisibility === "visible") {
        if (!e || e.dataType !== "source") {
          moveLayersBeforeTargetIfNeeded(
            map,
            PRIMARY_SCHOOL_LAYER_IDS,
            map.getLayer("selected-point") ? "selected-point" : undefined,
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
  }, [map, primarySchoolsGeoJson, schoolOverlayEnabled]);
}
