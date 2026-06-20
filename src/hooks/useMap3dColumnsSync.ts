import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import {
  addColumns3dLayer,
  COLUMNS_3D_PITCH,
  COLUMNS_3D_SOURCE_ID,
  isColumns3dLayerPresent,
  pointsToColumnPolygons,
  removeColumns3dLayer,
} from "@/features/map-explorer/map3dColumns";
import { isGeoJsonDataSourceLike } from "@/types/map";
import type { HeatmapMode } from "@/hooks/usePriceHeatmap";

type UseMap3dColumnsSyncProps = {
  map: MapLibreMap | null;
  geoJson: FeatureCollection;
  enabled: boolean;
  mode: HeatmapMode;
  prefersReducedMotion?: boolean;
};

/**
 * Drives the 3D price-column extrusion: it owns the layer lifecycle, keeps the
 * extruded geometry in sync with the visible blocks, and tilts the camera into
 * a perspective view while the mode is active.
 *
 * The 2D experience deliberately locks rotation/pitch off, so this hook is also
 * the sole place that enables drag-rotate and touch-pitch — and it restores the
 * flat top-down view when 3D mode is turned off.
 */
export function useMap3dColumnsSync({
  map,
  geoJson,
  enabled,
  mode,
  prefersReducedMotion = false,
}: UseMap3dColumnsSyncProps) {
  const configuredModeRef = useRef<HeatmapMode | null>(null);
  const columnsSourceRef = useRef<unknown>(null);
  const columnsDataRef = useRef<FeatureCollection | null>(null);

  // Layer lifecycle: add when enabled, update paint on mode change, remove when
  // disabled. Mirrors the styledata/load resilience of the other sync hooks so
  // the layer survives basemap (light/dark) style swaps.
  useEffect(() => {
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;

      if (!enabled) {
        if (isColumns3dLayerPresent(map)) {
          removeColumns3dLayer(map);
        }
        configuredModeRef.current = null;
        columnsSourceRef.current = null;
        columnsDataRef.current = null;
        return;
      }

      const source = map.getSource(COLUMNS_3D_SOURCE_ID);
      const layerPresent = isColumns3dLayerPresent(map);
      const sourceReady = isGeoJsonDataSourceLike(source);
      if (layerPresent && sourceReady && configuredModeRef.current === mode) return;

      const polygons = pointsToColumnPolygons(geoJson);
      addColumns3dLayer(map, polygons, mode);
      configuredModeRef.current = mode;
      columnsSourceRef.current = map.getSource(COLUMNS_3D_SOURCE_ID);
      columnsDataRef.current = geoJson;
    };

    if (map.isStyleLoaded()) apply();
    else void map.once("load", apply);
    map.on("styledata", apply);

    return () => {
      map.off("load", apply);
      map.off("styledata", apply);
    };
  }, [map, enabled, mode, geoJson]);

  // Keep the extruded geometry in sync with the visible blocks while enabled.
  useEffect(() => {
    if (!map || !enabled) return;

    const syncData = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource(COLUMNS_3D_SOURCE_ID);
      if (
        isGeoJsonDataSourceLike(source) &&
        (source !== columnsSourceRef.current || geoJson !== columnsDataRef.current)
      ) {
        source.setData(pointsToColumnPolygons(geoJson));
        columnsSourceRef.current = source;
        columnsDataRef.current = geoJson;
      }
    };

    if (map.isStyleLoaded()) syncData();
    else void map.once("load", syncData);
    map.on("styledata", syncData);

    return () => {
      map.off("load", syncData);
      map.off("styledata", syncData);
    };
  }, [map, enabled, geoJson]);

  // Camera + interaction: enabling 3D tilts the view and unlocks rotate/pitch
  // gestures; disabling restores the locked flat top-down view.
  useEffect(() => {
    if (!map) return;
    const duration = prefersReducedMotion ? 0 : 600;

    if (enabled) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.touchPitch.enable();
      map.keyboard.enableRotation();
      if (map.getPitch() !== COLUMNS_3D_PITCH) {
        map.easeTo({ pitch: COLUMNS_3D_PITCH, duration });
      }
      return;
    }

    map.easeTo({ pitch: 0, bearing: 0, duration });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    map.keyboard.disableRotation();
  }, [map, enabled, prefersReducedMotion]);
}
