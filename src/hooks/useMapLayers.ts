import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  MEDIAN_PRICE_COLOR_EXPRESSION,
  PRIMARY_BLUE,
  SCHOOL_LABEL_COLOR,
  SCHOOL_LABEL_HALO_COLOR,
  SCHOOL_MARKER_COLOR,
  PRIMARY_SCHOOL_LAYER_IDS,
  PRIMARY_SCHOOL_SOURCE_ID,
} from "@/shared/lib/constants";
import { getAmenityMinZoom } from "@/features/map-explorer/amenity-visibility";
import { MRT_LINE_FALLBACK_COLOR } from "@shared/mrt-colors";

export function useMapLayers(map: MapLibreMap | null) {
  useEffect(() => {
    if (!map) return;

    const addLayers = () => {
      if (!map.isStyleLoaded()) return;
      if (map.getSource("blocks")) return;

      map.addSource("radius", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: {
          "fill-color": PRIMARY_BLUE,
          "fill-opacity": 0.05,
        },
      });

      map.addLayer({
        id: "radius-outline",
        type: "line",
        source: "radius",
        paint: {
          "line-color": PRIMARY_BLUE,
          "line-width": 1,
          "line-dasharray": [3, 3],
          "line-opacity": 0.25,
        },
      });

      map.addSource(PRIMARY_SCHOOL_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource("blocks", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 36,
        clusterMaxZoom: 13,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "blocks",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": PRIMARY_BLUE,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 28, 100, 36],
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "blocks",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#eff6ff",
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "blocks",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": MEDIAN_PRICE_COLOR_EXPRESSION,
          "circle-radius": ["interpolate", ["linear"], ["get", "transaction_count"], 1, 6, 10, 10, 25, 16],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.9)",
          "circle-opacity": 0.92,
        },
      });

      map.addLayer({
        id: PRIMARY_SCHOOL_LAYER_IDS[0],
        type: "circle",
        source: PRIMARY_SCHOOL_SOURCE_ID,
        layout: {
          visibility: "none",
        },
        paint: {
          "circle-color": SCHOOL_MARKER_COLOR,
          "circle-radius": ["case", ["==", ["get", "distance_band"], "within1km"], 7, 6],
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.95)",
          "circle-opacity": 0.95,
        },
      });

      map.addLayer({
        id: PRIMARY_SCHOOL_LAYER_IDS[1],
        type: "symbol",
        source: PRIMARY_SCHOOL_SOURCE_ID,
        layout: {
          visibility: "none",
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-max-width": 12,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": SCHOOL_LABEL_COLOR,
          "text-halo-color": SCHOOL_LABEL_HALO_COLOR,
          "text-halo-width": 1.5,
        },
      });

      map.addSource("mrt-stations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource("mrt-exits", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "mrt-exits-points",
        type: "circle",
        source: "mrt-exits",
        minzoom: getAmenityMinZoom('mrt-exit'),
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["coalesce", ["get", "color"], MRT_LINE_FALLBACK_COLOR],
          "circle-radius": 3,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "mrt-stations-points",
        type: "circle",
        source: "mrt-stations",
        minzoom: getAmenityMinZoom('mrt-station'),
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["coalesce", ["get", "color"], MRT_LINE_FALLBACK_COLOR],
          "circle-radius": 5,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "mrt-stations-labels",
        type: "symbol",
        source: "mrt-stations",
        minzoom: getAmenityMinZoom('mrt-station'),
        layout: {
          visibility: "none",
          "text-field": ["get", "stationName"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": ["coalesce", ["get", "color"], MRT_LINE_FALLBACK_COLOR],
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      map.addLayer({
        id: "selected-point",
        type: "circle",
        source: "blocks",
        filter: ["==", ["get", "address_key"], ""],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 12, 14, 24, 18, 36],
          "circle-color": "rgba(29, 78, 216, 0.18)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#1e3a8a",
        },
      });

      map.addLayer({
        id: "selected-point-label",
        type: "symbol",
        source: "blocks",
        filter: ["==", ["get", "address_key"], ""],
        layout: {
          "text-field": [
            "format",
            ["get", "address"],
            { "font-scale": 1 },
            ["case", ["has", "display_name"], "\n", ""],
            {},
            ["coalesce", ["get", "display_name"], ""],
            { "font-scale": 0.82 },
          ],
          "text-size": 12,
          "text-offset": [0, -2.2],
          "text-anchor": "bottom",
          "text-max-width": 16,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#1e3a8a",
          "text-halo-color": "#eff6ff",
          "text-halo-width": 2,
        },
      });
    };

    const handleStyleData = () => {
      addLayers();
    };

    map.on("styledata", handleStyleData);

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      void map.once("load", addLayers);
    }

    return () => {
      map.off("styledata", handleStyleData);
      map.off("load", addLayers);
    };
  }, [map]);
}
