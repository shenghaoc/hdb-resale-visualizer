import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  MAP_GLYPHS_URL,
  ONEMAP_ATTRIBUTION,
  ONEMAP_DEFAULT_TILE_URL,
  ONEMAP_NIGHT_TILE_URL,
  SINGAPORE_BOUNDS,
} from "@/shared/lib/constants";

type UseMapInitializationProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDarkMode: boolean;
  onGeolocate?: (coords: { lat: number; lng: number }) => void;
};

type MapInitializationResult = {
  mapInstance: MapLibreMap | null;
  mapError: string | null;
};

type MapErrorEvent = {
  error?: unknown;
};

const MAP_INITIALIZATION_ERROR = "Map failed to initialize";

export function useMapInitialization({
  containerRef,
  isDarkMode,
  onGeolocate,
}: UseMapInitializationProps): MapInitializationResult {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const onGeolocateRef = useRef(onGeolocate);
  const isDarkModeRef = useRef(isDarkMode);

  useEffect(() => {
    onGeolocateRef.current = onGeolocate;
    isDarkModeRef.current = isDarkMode;
  }, [onGeolocate, isDarkMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || mapError) return;

    const tileUrl = isDarkModeRef.current ? ONEMAP_NIGHT_TILE_URL : ONEMAP_DEFAULT_TILE_URL;

    let map: MapLibreMap | null = null;
    let mapRemoved = false;
    let handleFatalMapError: ((event: MapErrorEvent) => void) | null = null;

    const disposeMap = () => {
      if (!map || mapRemoved) return;

      mapRemoved = true;
      if (handleFatalMapError) {
        map.off("error", handleFatalMapError);
      }
      map.remove();
    };

    const handleFatalRendererError = (error: unknown): boolean => {
      const errorMessage = getMapErrorMessage(error);
      if (!isFatalMapRendererError(errorMessage)) return false;

      disposeMap();
      mapRef.current = null;
      setMapInstance(null);
      setMapError(errorMessage);
      return true;
    };

    try {
      map = new maplibregl.Map({
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

      handleFatalMapError = (event: MapErrorEvent) => {
        handleFatalRendererError(event.error);
      };
      map.on("error", handleFatalMapError);
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
    } catch (error) {
      disposeMap();
      mapRef.current = null;
      const errorMessage =
        error instanceof Error && error.message ? error.message : MAP_INITIALIZATION_ERROR;
      queueMicrotask(() => {
        setMapError(errorMessage);
      });
      return;
    }

    mapRef.current = map;
    setMapInstance(map);
    setMapError(null);

    return () => {
      disposeMap();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
      setMapInstance(null);
    };
  }, [containerRef, mapError]);

  return { mapInstance, mapError };
}

function getMapErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return MAP_INITIALIZATION_ERROR;
}

function isFatalMapRendererError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("webgl") ||
    lowerMessage.includes("shader") ||
    lowerMessage.includes("context")
  );
}
