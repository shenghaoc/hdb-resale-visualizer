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
      const filter = ["==", ["get", "address_key"], selectedAddressKey ?? ""];
      if (map.getLayer("selected-point")) {
        map.setFilter("selected-point", filter);
      }
      if (map.getLayer("selected-point-label")) {
        map.setFilter("selected-point-label", filter);
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
