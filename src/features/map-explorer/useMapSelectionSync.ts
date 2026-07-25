import { useEffect, useRef } from "react";
import type { EaseToOptions, Map as MapLibreMap } from "maplibre-gl";
import type { BlockSummary } from "@/types/data";

type UseMapSelectionSyncProps = {
  map: MapLibreMap | null;
  selectedAddressKey: string | null;
  selectedBlock: BlockSummary | null;
  townFilter?: string | null;
  autoFitKey?: string | null;
  prefersReducedMotion: boolean;
};

function getFitRequestSignature(
  townFilter: string | null | undefined,
  autoFitKey: string | null | undefined,
): string {
  return `${townFilter ?? ""}\u0000${autoFitKey ?? ""}`;
}

function getSelectionPadding(map: MapLibreMap) {
  const width = map.getContainer().clientWidth;
  const isCompact = width > 0 && width < 768;

  if (isCompact) {
    return { top: 88, right: 24, bottom: 176, left: 24 };
  }

  return {
    top: 88,
    right: 72,
    bottom: 96,
    left: width > 0 ? Math.min(560, Math.max(320, Math.round(width * 0.4))) : 320,
  };
}

function getSelectionOffset(map: MapLibreMap): [number, number] {
  const padding = getSelectionPadding(map);
  return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
}

export function useMapSelectionSync({
  map,
  selectedAddressKey,
  selectedBlock,
  townFilter,
  autoFitKey,
  prefersReducedMotion,
}: UseMapSelectionSyncProps) {
  const fitRequestSignature = getFitRequestSignature(townFilter, autoFitKey);
  const previousSelectionRef = useRef<string | null>(null);
  const previousFitRequestRef = useRef<string | null>(
    townFilter || autoFitKey ? null : fitRequestSignature,
  );

  useEffect(() => {
    if (!map) return;

    const applySelectionFilter = () => {
      if (!map.isStyleLoaded()) return;
      if (map.getLayer("selected-point")) {
        map.setFilter("selected-point", ["==", ["get", "address_key"], selectedAddressKey ?? ""]);
      }
      if (map.getLayer("selected-point-label")) {
        map.setFilter("selected-point-label", [
          "==",
          ["get", "address_key"],
          selectedAddressKey ?? "",
        ]);
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

  useEffect(() => {
    if (!map) return;

    const selectionChanged = previousSelectionRef.current !== selectedAddressKey;
    const explicitFitChanged = previousFitRequestRef.current !== fitRequestSignature;
    const hasExplicitFitRequest = Boolean(townFilter || autoFitKey);
    previousFitRequestRef.current = fitRequestSignature;

    if (!selectedAddressKey) {
      previousSelectionRef.current = null;
      return;
    }
    if (!selectionChanged) return;

    previousSelectionRef.current = selectedAddressKey;
    if (explicitFitChanged && hasExplicitFitRequest) return;
    if (!selectedBlock) {
      if (!townFilter && !autoFitKey) {
        previousSelectionRef.current = null;
      }
      return;
    }

    const bringSelectionIntoView = () => {
      // MapLibre supports `offset` in its easing implementation, but its v5
      // EaseToOptions declaration currently omits the field. Using an offset
      // keeps the selected point clear of panels without retaining map padding.
      const cameraOptions: EaseToOptions & { offset: [number, number] } = {
        center: [selectedBlock.coordinates.lng, selectedBlock.coordinates.lat],
        zoom: Math.max(map.getZoom(), 14),
        offset: getSelectionOffset(map),
        duration: prefersReducedMotion ? 0 : 450,
      };
      map.easeTo(cameraOptions);
    };

    if (map.isStyleLoaded()) {
      bringSelectionIntoView();
      return;
    }

    void map.once("load", bringSelectionIntoView);
    return () => {
      map.off("load", bringSelectionIntoView);
    };
  }, [
    autoFitKey,
    fitRequestSignature,
    map,
    prefersReducedMotion,
    selectedAddressKey,
    selectedBlock,
    townFilter,
  ]);
}
