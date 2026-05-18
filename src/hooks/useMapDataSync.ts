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
  const orderedLayerIds = map.getStyle().layers.map((layer) => layer.id);
  const lastLayerId = layerIds[layerIds.length - 1];
  if (!lastLayerId) return true;

  const currentGroupOrder = orderedLayerIds.filter((id) => layerIds.includes(id));
  if (
    currentGroupOrder.length !== layerIds.length ||
    currentGroupOrder.some((id, index) => id !== layerIds[index])
  ) {
    return false;
  }

  const lastLayerIndex = orderedLayerIds.indexOf(lastLayerId);
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

    const applyPrimarySchools = () => {
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
        moveLayersBeforeTargetIfNeeded(
          map,
          PRIMARY_SCHOOL_LAYER_IDS,
          map.getLayer("selected-point") ? "selected-point" : undefined,
        );
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
