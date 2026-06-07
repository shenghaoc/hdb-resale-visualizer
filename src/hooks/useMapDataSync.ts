import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { isGeoJsonDataSourceLike } from "@/types/map";
import { PRIMARY_SCHOOL_LAYER_IDS, PRIMARY_SCHOOL_SOURCE_ID } from "@/shared/lib/constants";

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
  primarySchoolsGeoJson?: GeoJSON.FeatureCollection;
  schoolOverlayEnabled?: boolean;
};

export function useMapDataSync({
  map,
  geoJson,
  primarySchoolsGeoJson,
  schoolOverlayEnabled = false,
}: UseMapDataSyncProps) {
  const blocksSourceRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const blocksLayerSourceRef = useRef<unknown>(null);
  const schoolsSourceRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const schoolsLayerSourceRef = useRef<unknown>(null);
  const schoolsVisibilityRef = useRef<string | null>(null);

  // Sync main blocks source
  useEffect(() => {
    if (!map) return;

    const updateData = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("blocks");
      if (!isGeoJsonDataSourceLike(source)) return;

      if (source !== blocksLayerSourceRef.current || geoJson !== blocksSourceRef.current) {
        source.setData(geoJson);
        blocksLayerSourceRef.current = source;
        blocksSourceRef.current = geoJson;
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

  useEffect(() => {
    if (!map) return;

    let isActive = true;

    const applyPrimarySchools = (e?: { dataType?: string }) => {
      if (!isActive || !map.isStyleLoaded()) return;
      const source = map.getSource(PRIMARY_SCHOOL_SOURCE_ID);
      // Normalise undefined → null once so the ref comparison below doesn't read
      // `undefined !== null` (always true) and trigger a redundant setData on
      // every styledata event when the overlay prop is omitted.
      const normalisedSchoolGeoJson = primarySchoolsGeoJson ?? null;
      const shouldSetSchoolData =
        isGeoJsonDataSourceLike(source) &&
        (source !== schoolsLayerSourceRef.current ||
          normalisedSchoolGeoJson !== schoolsSourceRef.current);
      if (shouldSetSchoolData) {
        source.setData(normalisedSchoolGeoJson ?? { type: "FeatureCollection", features: [] });
        schoolsLayerSourceRef.current = source;
        schoolsSourceRef.current = normalisedSchoolGeoJson;
      }

      const hasSchoolFeatures = (normalisedSchoolGeoJson?.features.length ?? 0) > 0;
      const schoolVisibility =
        schoolOverlayEnabled && hasSchoolFeatures ? "visible" : "none";
      const visibilityChanged = schoolsVisibilityRef.current !== schoolVisibility;

      if (!visibilityChanged && !shouldSetSchoolData && !e) {
        return;
      }

      for (const layerId of PRIMARY_SCHOOL_LAYER_IDS) {
        if (!map.getLayer(layerId)) continue;
        if (visibilityChanged || map.getLayoutProperty(layerId, "visibility") !== schoolVisibility) {
          map.setLayoutProperty(layerId, "visibility", schoolVisibility);
        }
      }

      schoolsVisibilityRef.current = schoolVisibility;

      if (schoolVisibility === "visible") {
        if (!e || e.dataType !== "source" || shouldSetSchoolData) {
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
