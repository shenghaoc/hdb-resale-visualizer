import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { BlockSummary } from "@/types/data";
import { SINGAPORE_BOUNDS } from "@/shared/lib/constants";

type UseMapFitBoundsProps = {
  map: MapLibreMap | null;
  blocks: BlockSummary[];
  townFilter: string | null | undefined;
  autoFitKey: string | null | undefined;
  prefersReducedMotion: boolean;
};

export function useMapFitBounds({
  map,
  blocks,
  townFilter,
  autoFitKey,
  prefersReducedMotion,
}: UseMapFitBoundsProps) {
  const hasInitialFitRef = useRef(false);
  const previousTownFilterRef = useRef<string | null>(null);
  const previousAutoFitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || blocks.length === 0) return;

    const nextTownFilter = townFilter ?? null;
    const nextAutoFitKey = autoFitKey ?? null;
    const shouldFit =
      !hasInitialFitRef.current ||
      previousTownFilterRef.current !== nextTownFilter ||
      previousAutoFitKeyRef.current !== nextAutoFitKey;

    previousTownFilterRef.current = nextTownFilter;
    previousAutoFitKeyRef.current = nextAutoFitKey;

    if (!shouldFit) return;

    hasInitialFitRef.current = true;

    let minLng = Infinity,
      maxLng = -Infinity;
    let minLat = Infinity,
      maxLat = -Infinity;
    for (const b of blocks) {
      minLng = Math.min(minLng, b.coordinates.lng);
      maxLng = Math.max(maxLng, b.coordinates.lng);
      minLat = Math.min(minLat, b.coordinates.lat);
      maxLat = Math.max(maxLat, b.coordinates.lat);
    }

    if (minLng === Infinity || (!townFilter && !autoFitKey)) {
      map.fitBounds(SINGAPORE_BOUNDS, {
        padding: 40,
        duration: prefersReducedMotion ? 0 : 1200,
      });
      return;
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: 60,
        maxZoom: 15,
        duration: prefersReducedMotion ? 0 : 1200,
      },
    );
  }, [map, blocks, townFilter, autoFitKey, prefersReducedMotion]);
}
