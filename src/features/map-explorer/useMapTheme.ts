import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ONEMAP_DEFAULT_TILE_URL, ONEMAP_NIGHT_TILE_URL } from "@/shared/lib/constants";

type RasterSourceLike = { setTiles(tiles: string[]): void };

export function useMapTheme(map: MapLibreMap | null, isDarkMode: boolean) {
  const lastAppliedThemeRef = useRef<boolean>(isDarkMode);
  const pendingThemeLoadListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!map || lastAppliedThemeRef.current === isDarkMode) return;

    const applyTiles = () => {
      const source = map.getSource("onemap") as RasterSourceLike | undefined;
      if (!source || typeof source.setTiles !== "function") return;
      source.setTiles([isDarkMode ? ONEMAP_NIGHT_TILE_URL : ONEMAP_DEFAULT_TILE_URL]);
      lastAppliedThemeRef.current = isDarkMode;
    };

    if (map.isStyleLoaded()) {
      applyTiles();
      return;
    }

    if (pendingThemeLoadListenerRef.current) {
      map.off("load", pendingThemeLoadListenerRef.current);
      pendingThemeLoadListenerRef.current = null;
    }

    const onLoad = () => {
      pendingThemeLoadListenerRef.current = null;
      applyTiles();
    };
    pendingThemeLoadListenerRef.current = onLoad;
    void map.once("load", onLoad);

    return () => {
      if (pendingThemeLoadListenerRef.current) {
        map.off("load", pendingThemeLoadListenerRef.current);
        pendingThemeLoadListenerRef.current = null;
      }
    };
  }, [isDarkMode, map]);
}
