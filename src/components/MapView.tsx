import { useEffect, useRef } from "react";
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ONEMAP_ATTRIBUTION, ONEMAP_TILE_URL } from "@/lib/constants";
import { toGeoJson } from "@/lib/map";
import type { BlockSummary } from "@/types/data";

type MapViewProps = {
  blocks: BlockSummary[];
  selectedAddressKey: string | null;
  onSelect: (addressKey: string) => void;
};

const SINGAPORE_BOUNDS: LngLatBoundsLike = [
  [103.605, 1.239],
  [104.043, 1.474],
];

export function MapView({ blocks, selectedAddressKey, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  function getBlockSource(map: Map | null) {
    if (!map) {
      return null;
    }

    const source = map.getSource("blocks");
    if (!source || !("setData" in source) || !("getClusterExpansionZoom" in source)) {
      return null;
    }

    return source as GeoJSONSource;
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [103.8198, 1.3521],
      zoom: 10.2,
      minZoom: 9,
      maxBounds: SINGAPORE_BOUNDS,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          onemap: {
            type: "raster",
            tiles: [ONEMAP_TILE_URL],
            tileSize: 256,
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

    map.on("load", () => {
      map.addSource("blocks", {
        type: "geojson",
        data: toGeoJson(blocks),
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
          "circle-color": "#0d9488",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            10,
            20,
            30,
            28,
            100,
            36,
          ],
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
          "text-color": "#f8fafc",
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "blocks",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "median_price"],
            300000,
            "#38bdf8",
            600000,
            "#14b8a6",
            900000,
            "#f59e0b",
            1200000,
            "#ef4444",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "transaction_count"],
            1,
            6,
            10,
            10,
            25,
            16,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#e2e8f0",
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "selected-point",
        type: "circle",
        source: "blocks",
        filter: ["==", ["get", "address_key"], ""],
        paint: {
          "circle-radius": 22,
          "circle-color": "rgba(248,250,252,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#f8fafc",
        },
      });

      map.on("click", "unclustered-point", (event) => {
        const feature = event.features?.[0];
        const properties = feature?.properties;
        if (properties && typeof properties.address_key === "string") {
          onSelect(properties.address_key);
        }
      });

      map.on("click", "clusters", (event) => {
        const feature = event.features?.[0];
        const properties = feature?.properties;
        const clusterId =
          properties && typeof properties.cluster_id === "number"
            ? properties.cluster_id
            : null;

        if (clusterId === null || !feature || !feature.geometry || feature.geometry.type !== "Point") {
          return;
        }

        const source = getBlockSource(map);
        if (!source) {
          return;
        }

        const [lng, lat] = feature.geometry.coordinates;

        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({
            center: [lng, lat],
            zoom,
          });
        });
      });

      for (const layerId of ["clusters", "unclustered-point"]) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [blocks, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    const source = getBlockSource(map);
    if (!source) {
      return;
    }

    source.setData(toGeoJson(blocks));
  }, [blocks]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("selected-point")) {
      return;
    }

    map.setFilter("selected-point", [
      "==",
      ["get", "address_key"],
      selectedAddressKey ?? "",
    ]);
  }, [selectedAddressKey]);

  return <div className="map-view" data-testid="map-view" ref={containerRef} />;
}
