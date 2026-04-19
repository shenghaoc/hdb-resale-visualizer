import { useEffect, useRef } from "react";
import maplibregl, { LngLatBoundsLike, Map, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ONEMAP_ATTRIBUTION, ONEMAP_TILE_URL } from "@/lib/constants";
import { formatCompactCurrency } from "@/lib/format";
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

type PopupProperties = {
  address?: string;
  town?: string;
  median_price?: number;
  transaction_count?: number;
};

type GeoJsonSourceLike = {
  setData(data: ReturnType<typeof toGeoJson>): void;
  getClusterExpansionZoom(clusterId: number): Promise<number>;
};

function isPopupFeature(feature: unknown): feature is GeoJSON.Feature<
  GeoJSON.Point,
  PopupProperties
> {
  if (!feature || typeof feature !== "object") {
    return false;
  }

  const candidate = feature as GeoJSON.Feature;
  return candidate.geometry?.type === "Point";
}

function isGeoJsonSourceLike(source: unknown): source is GeoJsonSourceLike {
  return (
    !!source &&
    typeof source === "object" &&
    "setData" in source &&
    "getClusterExpansionZoom" in source
  );
}

export function MapView({ blocks, selectedAddressKey, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const popupRef = useRef<Popup | null>(null);

  // Keep onSelect ref fresh without triggering map recreation
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map ONCE on mount
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

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "map-popup",
    });
    popupRef.current = popup;

    map.on("load", () => {
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
          "circle-color": "#4b3b31",
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
          "text-color": "#fffdf8",
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
            "#d7d0c5",
            600000,
            "#b59f87",
            900000,
            "#8b694e",
            1200000,
            "#5a3e2d",
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
          "circle-stroke-color": "#fffdf8",
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
          "circle-stroke-color": "#231914",
        },
      });

      map.on("click", "unclustered-point", (event) => {
        const feature = event.features?.[0];
        const properties = feature?.properties;
        if (properties && typeof properties.address_key === "string") {
          onSelectRef.current(properties.address_key);
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

        const source = map.getSource("blocks");
        if (!isGeoJsonSourceLike(source)) {
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

      // Hover popup for unclustered points
      map.on("mouseenter", "unclustered-point", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!isPopupFeature(feature)) {
          return;
        }

        const props = feature.properties ?? {};
        const address = props.address ?? "";
        const town = props.town ?? "";
        const medianPrice = props.median_price ?? 0;
        const txnCount = props.transaction_count ?? 0;

        const [lng, lat] = feature.geometry.coordinates;

        popup
          .setLngLat([lng, lat])
          .setHTML(
            `<strong>${address}</strong><br/>${town}<br/>${formatCompactCurrency(medianPrice)} median · ${txnCount} txns`
          )
          .addTo(map);
      });

      map.on("mouseleave", "unclustered-point", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  // Update the GeoJSON source data when blocks change — WITHOUT recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const mapInstance = map;

    function updateData() {
      const source = mapInstance.getSource("blocks");
      if (isGeoJsonSourceLike(source)) {
        source.setData(toGeoJson(blocks));
      }
    }

    if (mapInstance.isStyleLoaded()) {
      updateData();
    } else {
      void mapInstance.once("load", updateData);
    }
  }, [blocks]);

  // Update the selected-point filter when selection changes
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
