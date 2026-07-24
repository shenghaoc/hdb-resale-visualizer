import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

const MARKER_LAYER_IDS = ["clusters", "cluster-count", "unclustered-point"] as const;

type UseMapMarkerVisibilityProps = {
  map: MapLibreMap | null;
  showBlockMarkers: boolean;
};

export function useMapMarkerVisibility({ map, showBlockMarkers }: UseMapMarkerVisibilityProps) {
  useEffect(() => {
    if (!map) return;

    const applyVisibility = () => {
      if (!map.isStyleLoaded()) return;
      const visibility = showBlockMarkers ? "visible" : "none";
      for (const layerId of MARKER_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility);
        }
      }
    };

    if (map.isStyleLoaded()) {
      applyVisibility();
    } else {
      void map.once("load", applyVisibility);
    }
    map.on("styledata", applyVisibility);

    return () => {
      map.off("load", applyVisibility);
      map.off("styledata", applyVisibility);
    };
  }, [map, showBlockMarkers]);
}
