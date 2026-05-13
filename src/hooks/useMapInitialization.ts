import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import {
  MAP_GLYPHS_URL,
  ONEMAP_ATTRIBUTION,
  ONEMAP_DEFAULT_TILE_URL,
  ONEMAP_NIGHT_TILE_URL,
  SINGAPORE_BOUNDS,
} from "@/lib/constants";

type UseMapInitializationProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDarkMode: boolean;
  onGeolocate?: (coords: { lat: number; lng: number }) => void;
};

export function useMapInitialization({
  containerRef,
  isDarkMode,
  onGeolocate,
}: UseMapInitializationProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const onGeolocateRef = useRef(onGeolocate);
  const isDarkModeRef = useRef(isDarkMode);
  isDarkModeRef.current = isDarkMode;

  useEffect(() => {
    onGeolocateRef.current = onGeolocate;
  }, [onGeolocate]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const tileUrl = isDarkModeRef.current ? ONEMAP_NIGHT_TILE_URL : ONEMAP_DEFAULT_TILE_URL;

    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: false,
      center: [103.8198, 1.3521],
      zoom: 10.2,
      minZoom: 9,
      maxZoom: 20,
      maxBounds: SINGAPORE_BOUNDS,
      renderWorldCopies: false,
      dragRotate: false,
      touchPitch: false,
      style: {
        version: 8,
        glyphs: MAP_GLYPHS_URL,
        sources: {
          onemap: {
            type: "raster",
            tiles: [tileUrl],
            tileSize: 256,
            maxzoom: 18,
            attribution: ONEMAP_ATTRIBUTION,
          },
        },
        layers: [
          {
            id: "onemap-base",
            type: "raster",
            source: "onemap",
          },
        ],
      },
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserLocation: true,
    });

    geolocate.on("geolocate", (position: GeolocationPosition) => {
      onGeolocateRef.current?.({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    });

    map.addControl(geolocate, "top-right");
    map.doubleClickZoom.disable();

    mapRef.current = map;
    setMapInstance(map);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [containerRef]);

  return mapInstance;
}
