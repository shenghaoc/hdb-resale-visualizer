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
  townFilter?: string | null;
  onSelect: (addressKey: string) => void;
};

const SINGAPORE_BOUNDS: LngLatBoundsLike = [
  [103.605, 1.239],
  [104.043, 1.474],
];

type PopupProperties = {
  address?: string;
  display_name?: string | null;
  town?: string;
  median_price?: number;
  transaction_count?: number;
};

type MrtPopupProperties = {
  stationName?: string;
  lines?: string | string[];
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

function parseMrtLines(lines: MrtPopupProperties["lines"]): string[] {
  if (Array.isArray(lines)) {
    return lines.filter((line): line is string => typeof line === "string");
  }

  if (typeof lines !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(lines);
    return Array.isArray(parsed)
      ? parsed.filter((line): line is string => typeof line === "string")
      : [];
  } catch {
    return [];
  }
}

function toMrtPopupProperties(properties: unknown): MrtPopupProperties {
  if (!properties || typeof properties !== "object") {
    return {};
  }

  const record = properties as Record<string, unknown>;
  const stationName =
    typeof record.stationName === "string" ? record.stationName : undefined;
  const lines =
    typeof record.lines === "string" || Array.isArray(record.lines)
      ? record.lines
      : undefined;

  return { stationName, lines };
}

export function MapView({ blocks, selectedAddressKey, townFilter, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const popupRef = useRef<Popup | null>(null);
  const hasInitialFitRef = useRef(false);
  const previousTownFilterRef = useRef<string | null>(null);

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
      maxZoom: 20,
      maxBounds: SINGAPORE_BOUNDS,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          onemap: {
            type: "raster",
            tiles: [ONEMAP_TILE_URL],
            tileSize: 256,
            // OneMap tiles are only published up to zoom 18; MapLibre will
            // upscale them for zoom 19 rather than fetching nonexistent tiles.
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

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "map-popup",
    });
    popupRef.current = popup;

    map.on("load", () => {
      map.addSource("mrt-stations", {
        type: "geojson",
        data: "/data/mrt-stations.geojson",
      });

      map.addLayer({
        id: "mrt-icons",
        type: "circle",
        source: "mrt-stations",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "isInterchange"], true],
            8,
            7,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "isInterchange"], true],
            "#fff",
            ["coalesce", ["get", "color"], "#2563eb"]
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "isInterchange"], true],
            2.5,
            1.5,
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "isInterchange"], true],
            "#111827",
            "#fff"
          ],
        },
      });

      map.addLayer({
        id: "mrt-symbol",
        type: "symbol",
        source: "mrt-stations",
        layout: {
          "text-field": "M",
          "text-size": 9,
          "text-font": ["Noto Sans Bold"],
        },
        paint: {
          "text-color": [
            "case",
            ["==", ["get", "isInterchange"], true],
            "#111827",
            "#fff"
          ],
        },
      });

      map.addLayer({
        id: "mrt-labels",
        type: "symbol",
        source: "mrt-stations",
        minzoom: 14,
        layout: {
          "text-field": ["get", "stationName"],
          "text-size": 10,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": [
            "case",
            ["==", ["get", "isInterchange"], true],
            "#111827",
            ["coalesce", ["get", "color"], "#1e40af"]
          ],
          "text-halo-color": "#fff",
          "text-halo-width": 1.5,
        },
      });

      map.addLayer({
        id: "mrt-interchange-lines",
        type: "symbol",
        source: "mrt-stations",
        minzoom: 12,
        filter: ["==", ["get", "isInterchange"], true],
        layout: {
          "text-field": [
            "case",
            [">=", ["length", ["get", "lines"]], 3],
            [
              "concat",
              ["at", 0, ["get", "lines"]],
              "/",
              ["at", 1, ["get", "lines"]],
              "/",
              ["at", 2, ["get", "lines"]],
            ],
            [">=", ["length", ["get", "lines"]], 2],
            [
              "concat",
              ["at", 0, ["get", "lines"]],
              "/",
              ["at", 1, ["get", "lines"]],
            ],
            ["at", 0, ["get", "lines"]],
          ],
          "text-size": 9,
          "text-offset": [0, -1.3],
          "text-anchor": "bottom",
        },
        paint: {
          "text-color": "#111827",
          "text-halo-color": "#fff",
          "text-halo-width": 1.5,
        },
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
          "circle-color": "#2563eb",
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
          "text-color": "#eff6ff",
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
            "#a9ccff",
            600000,
            "#60a5fa",
            900000,
            "#3b82f6",
            1200000,
            "#1d4ed8",
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
          "circle-stroke-color": "#eff6ff",
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "selected-point",
        type: "circle",
        source: "blocks",
        filter: ["==", ["get", "address_key"], ""],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            12,
            14,
            24,
            18,
            36,
          ],
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
        const displayName = props.display_name ?? "";
        const town = props.town ?? "";
        const medianPrice = props.median_price ?? 0;
        const txnCount = props.transaction_count ?? 0;

        const [lng, lat] = feature.geometry.coordinates;

        const container = document.createElement("div");

        const addressEl = document.createElement("strong");
        addressEl.textContent = address;
        container.appendChild(addressEl);

        if (displayName) {
          const nameEl = document.createElement("p");
          nameEl.textContent = displayName;
          container.appendChild(nameEl);
        }

        const townEl = document.createElement("p");
        townEl.textContent = town;
        container.appendChild(townEl);

        const infoEl = document.createElement("p");
        infoEl.textContent = `${formatCompactCurrency(medianPrice)} median · ${txnCount} txns`;
        container.appendChild(infoEl);

        popup
          .setLngLat([lng, lat])
          .setDOMContent(container)
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

      map.on("mouseenter", "mrt-icons", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || !feature.geometry || feature.geometry.type !== "Point") return;

        const props = toMrtPopupProperties(feature.properties);
        const stationName = props.stationName ?? "MRT Station";
        const lines = parseMrtLines(props.lines);
        const [lng, lat] = feature.geometry.coordinates;

        const container = document.createElement("div");

        const nameEl = document.createElement("strong");
        nameEl.textContent = stationName;
        container.appendChild(nameEl);

        if (lines.length) {
          const linesEl = document.createElement("p");
          linesEl.className = "whitespace-nowrap opacity-80 mt-1";
          linesEl.textContent = lines.join(" • ");
          container.appendChild(linesEl);
        }

        popup
          .setLngLat([lng, lat])
          .setDOMContent(container)
          .addTo(map);
      });

      map.on("mouseleave", "mrt-icons", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
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

  // Fit bounds when townFilter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || blocks.length === 0) return;

    const nextTownFilter = townFilter ?? null;
    const shouldFit =
      !hasInitialFitRef.current || previousTownFilterRef.current !== nextTownFilter;

    previousTownFilterRef.current = nextTownFilter;

    if (!shouldFit) {
      return;
    }

    hasInitialFitRef.current = true;

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const b of blocks) {
       minLng = Math.min(minLng, b.coordinates.lng);
       maxLng = Math.max(maxLng, b.coordinates.lng);
       minLat = Math.min(minLat, b.coordinates.lat);
       maxLat = Math.max(maxLat, b.coordinates.lat);
    }

    // Default Singapore bounds if min/max collapsed or townFilter is missing
    if (minLng === Infinity || !townFilter) {
      map.fitBounds(SINGAPORE_BOUNDS, { padding: 40, duration: 1200 });
      return;
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat]
      ],
      { padding: 60, maxZoom: 15, duration: 1200 }
    );
  }, [blocks, townFilter]);

  // Update the selected-point filters when selection changes
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
    map.setFilter("selected-point-label", [
      "==",
      ["get", "address_key"],
      selectedAddressKey ?? "",
    ]);
  }, [selectedAddressKey]);

  return <div className="map-view" data-testid="map-view" ref={containerRef} />;
}
