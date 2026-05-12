import { useEffect, useRef, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ONEMAP_DEFAULT_TILE_URL, ONEMAP_NIGHT_TILE_URL } from "@/lib/constants";

type RasterSourceLike = { setTiles(tiles: string[]): void };

export function useMapTheme(mapRef: RefObject<MapLibreMap | null>, isDarkMode: boolean) {
  const lastAppliedThemeRef = useRef<boolean>(isDarkMode);
  const pendingThemeLoadListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lastAppliedThemeRef.current === isDarkMode) return;

    const applyTiles = () => {
      const source = map.getSource("onemap") as RasterSourceLike | undefined;
      if (!source || typeof source.setTiles !== "function") return;
      source.setTiles([isDarkMode ? ONEMAP_NIGHT_TILE_URL : ONEMAP_DEFAULT_TILE_URL]);
      lastAppliedThemeRef.current = isDarkMode;
    };

    if (map.isStyleLoaded()) return applyTiles();

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
  }, [isDarkMode, mapRef]);
}
