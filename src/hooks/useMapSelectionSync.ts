import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

type UseMapSelectionSyncProps = {
  map: MapLibreMap | null;
  selectedAddressKey: string | null;
};

export function useMapSelectionSync({ map, selectedAddressKey }: UseMapSelectionSyncProps) {
  useEffect(() => {
    if (!map) return;

    const applySelectionFilter = () => {
      if (!map.isStyleLoaded()) return;
      if (map.getLayer("selected-point")) {
        map.setFilter("selected-point", ["==", ["get", "address_key"], selectedAddressKey ?? ""]);
      }
      if (map.getLayer("selected-point-label")) {
        map.setFilter("selected-point-label", ["==", ["get", "address_key"], selectedAddressKey ?? ""]);
      }
    };

    if (map.isStyleLoaded()) {
      applySelectionFilter();
    } else {
      void map.once("load", applySelectionFilter);
    }
    map.on("styledata", applySelectionFilter);

    return () => {
      map.off("load", applySelectionFilter);
      map.off("styledata", applySelectionFilter);
    };
  }, [map, selectedAddressKey]);
}
