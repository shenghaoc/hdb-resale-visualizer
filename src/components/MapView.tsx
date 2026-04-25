import { useEffect, useMemo, useRef } from "react";
import maplibregl, { LngLatBoundsLike, Map as MapLibreMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ONEMAP_ATTRIBUTION, ONEMAP_TILE_URL } from "@/lib/constants";
import { formatCompactCurrency } from "@/lib/format";
import { toGeoJson } from "@/lib/map";
import {
  DEFAULT_STATION_COLOR,
  MRT_LINE_CODES,
  MRT_LINE_COLORS,
  MRT_LINE_FALLBACK_COLOR,
  type MrtLineCode,
} from "@/lib/mrt-colors";
import { MRT_LINE_SEQUENCES } from "@/lib/mrt-line-sequences";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { BlockSummary } from "@/types/data";
import type { Translator } from "@/lib/i18n";

type MapViewProps = {
  blocks: BlockSummary[];
  selectedAddressKey: string | null;
  townFilter?: string | null;
  autoFitKey?: string | null;
  showBlockMarkers?: boolean;
  onSelect: (addressKey: string) => void;
  onMapInteract?: (interactionType?: "background" | "feature") => void;
  t: Translator;
};

const SINGAPORE_BOUNDS: LngLatBoundsLike = [
  [103.55, 1.15],
  [104.13, 1.5],
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

type MrtExitPopupProperties = {
  STATION_NA?: string;
  EXIT_CODE?: string;
};

type GeoJsonSourceLike = {
  setData(data: ReturnType<typeof toGeoJson>): void;
  getClusterExpansionZoom(clusterId: number): Promise<number>;
};

type GeoJsonDataSourceLike = {
  setData(data: GeoJSON.FeatureCollection | GeoJSON.Feature): void;
};

type MrtStationsGeoJson = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { stationName?: string; lines?: string[] }
>;

function normalizeStationName(stationName: string): string {
  return stationName
    .toUpperCase()
    .replace(/\s+(MRT|LRT)\s+STATION$/u, "")
    .trim();
}

function toMrtExitPopupProperties(properties: unknown): MrtExitPopupProperties {
  if (!properties || typeof properties !== "object") {
    return {};
  }

  const record = properties as Record<string, unknown>;
  return {
    STATION_NA: typeof record.STATION_NA === "string" ? record.STATION_NA : undefined,
    EXIT_CODE: typeof record.EXIT_CODE === "string" ? record.EXIT_CODE : undefined,
  };
}

function buildMrtLineFeatures(
  stationsGeoJson: MrtStationsGeoJson,
): GeoJSON.FeatureCollection<GeoJSON.LineString, { lineCode: MrtLineCode }> {
  const stationCoordinates = new Map<string, [number, number]>();
  for (const feature of stationsGeoJson.features) {
    if (!feature.geometry || feature.geometry.type !== "Point") {
      continue;
    }

    const stationName = feature.properties?.stationName;
    if (!stationName) {
      continue;
    }

    const [lng, lat] = feature.geometry.coordinates;
    if (typeof lng !== "number" || typeof lat !== "number") {
      continue;
    }

    stationCoordinates.set(normalizeStationName(stationName), [lng, lat]);
  }

  const features: GeoJSON.Feature<GeoJSON.LineString, { lineCode: MrtLineCode }>[] = [];
  for (const lineCode of MRT_LINE_CODES) {
    const branches = MRT_LINE_SEQUENCES[lineCode];
    for (const branch of branches) {
      for (let index = 0; index < branch.length - 1; index += 1) {
        const from = stationCoordinates.get(branch[index]);
        const to = stationCoordinates.get(branch[index + 1]);
        if (!from || !to) {
          continue;
        }

        features.push({
          type: "Feature",
          properties: { lineCode },
          geometry: {
            type: "LineString",
            coordinates: [from, to],
          },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

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

function isGeoJsonDataSourceLike(source: unknown): source is GeoJsonDataSourceLike {
  return !!source && typeof source === "object" && "setData" in source;
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

export function MapView({
  blocks,
  selectedAddressKey,
  townFilter,
  autoFitKey,
  showBlockMarkers = false,
  onSelect,
  onMapInteract,
  t,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const onMapInteractRef = useRef(onMapInteract);
  const tRef = useRef(t);
  const popupRef = useRef<Popup | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const hasInitialFitRef = useRef(false);
  const previousTownFilterRef = useRef<string | null>(null);
  const previousAutoFitKeyRef = useRef<string | null>(null);

  // Memoize GeoJSON to avoid rebuilding the object on every render
  const geoJson = useMemo(() => toGeoJson(blocks), [blocks]);

  // Debounce fitting bounds to avoid jumping when search tokens are typed rapidly
  const debouncedTownFilter = useDebouncedValue(townFilter, 400);
  const debouncedShowBlockMarkers = useDebouncedValue(showBlockMarkers, 200);
  const shouldShowBlockMarkers = Boolean(debouncedShowBlockMarkers);

  // Keep callbacks and t refs fresh without triggering map recreation
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onMapInteractRef.current = onMapInteract;
  }, [onMapInteract]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Create the map ONCE on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let isMapMounted = true;
    prefersReducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = new maplibregl.Map({
      container: containerRef.current,
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
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          onemap: {
            type: "raster",
            tiles: [ONEMAP_TILE_URL],
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
    map.doubleClickZoom.disable();

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

      map.addSource("mrt-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource("mrt-exits", {
        type: "geojson",
        data: "/data/mrt-exits.geojson",
      });

      void fetch("/data/mrt-stations.geojson")
        .then((response) => response.json() as Promise<MrtStationsGeoJson>)
        .then((stationsGeoJson) => {
          if (!isMapMounted || mapRef.current !== map) {
            return;
          }

          const source = map.getSource("mrt-lines");
          if (!isGeoJsonDataSourceLike(source)) {
            return;
          }

          source.setData(buildMrtLineFeatures(stationsGeoJson));
        });

      map.addLayer({
        id: "mrt-lines",
        type: "line",
        source: "mrt-lines",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": [
            "match",
            ["get", "lineCode"],
            "NSL",
            MRT_LINE_COLORS.NSL,
            "EWL",
            MRT_LINE_COLORS.EWL,
            "NEL",
            MRT_LINE_COLORS.NEL,
            "CCL",
            MRT_LINE_COLORS.CCL,
            "DTL",
            MRT_LINE_COLORS.DTL,
            "TEL",
            MRT_LINE_COLORS.TEL,
            MRT_LINE_FALLBACK_COLOR,
          ],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 4, 18, 6],
          "line-opacity": 0.75,
        },
      });

      map.addLayer({
        id: "mrt-icons",
        type: "circle",
        source: "mrt-stations",
        paint: {
          "circle-radius": ["case", ["==", ["get", "isInterchange"], true], 8, 7],
          "circle-color": [
            "case",
            ["==", ["get", "isInterchange"], true],
            "#fff",
            ["coalesce", ["get", "color"], DEFAULT_STATION_COLOR],
          ],
          "circle-stroke-width": ["case", ["==", ["get", "isInterchange"], true], 2.5, 1.5],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "isInterchange"], true],
            "#111827",
            "#fff",
          ],
        },
      });

      map.addLayer({
        id: "mrt-exits",
        type: "circle",
        source: "mrt-exits",
        minzoom: 16,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 2.5, 18, 4.5],
          "circle-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0f172a",
          "circle-opacity": 0.95,
        },
      });

      map.addLayer({
        id: "mrt-exit-labels",
        type: "symbol",
        source: "mrt-exits",
        minzoom: 17,
        layout: {
          "text-field": ["get", "EXIT_CODE"],
          "text-size": 10,
          "text-offset": [0, 1],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.25,
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
          "text-color": ["case", ["==", ["get", "isInterchange"], true], "#111827", "#fff"],
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
            ["coalesce", ["get", "color"], "#1e40af"],
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
            ["concat", ["at", 0, ["get", "lines"]], "/", ["at", 1, ["get", "lines"]]],
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
          "circle-radius": ["interpolate", ["linear"], ["get", "transaction_count"], 1, 6, 10, 10, 25, 16],
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

      map.on("click", "unclustered-point", (event) => {
        onMapInteractRef.current?.("feature");
        const feature = event.features?.[0];
        const properties = feature?.properties;
        if (properties && typeof properties.address_key === "string") {
          onSelectRef.current(properties.address_key);
        }
      });

      map.on("click", "clusters", (event) => {
        onMapInteractRef.current?.("feature");
        const feature = event.features?.[0];
        const properties = feature?.properties;
        const clusterId =
          properties && typeof properties.cluster_id === "number" ? properties.cluster_id : null;

        if (
          clusterId === null ||
          !feature ||
          !feature.geometry ||
          feature.geometry.type !== "Point"
        ) {
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

      map.on("click", (event) => {
        const clickedFeatures = map.queryRenderedFeatures(event.point, {
          layers: ["unclustered-point", "clusters"],
        });

        if (clickedFeatures.length > 0) {
          return;
        }

        onMapInteractRef.current?.("background");
      });

      map.on("dblclick", (event) => {
        onMapInteractRef.current?.("feature");
        map.easeTo({
          center: [event.lngLat.lng, event.lngLat.lat],
          zoom: Math.min(map.getZoom() + 2.2, 20),
          duration: prefersReducedMotionRef.current ? 0 : 260,
        });
      });

      map.on("movestart", (event) => {
        if (event.originalEvent) {
          onMapInteractRef.current?.("background");
        }
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
        infoEl.textContent = `${tRef.current("map.median", { value: formatCompactCurrency(medianPrice) })} · ${tRef.current("map.txns", { count: txnCount })}`;
        container.appendChild(infoEl);

        popup.setLngLat([lng, lat]).setDOMContent(container).addTo(map);
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
        const stationName = props.stationName ?? tRef.current("map.mrtStation");
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

        popup.setLngLat([lng, lat]).setDOMContent(container).addTo(map);
      });

      map.on("mouseleave", "mrt-icons", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("mouseenter", "mrt-exits", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || !feature.geometry || feature.geometry.type !== "Point") return;

        const props = toMrtExitPopupProperties(feature.properties);
        const stationName = props.STATION_NA ?? "MRT Station";
        const exitCode = props.EXIT_CODE;
        const [lng, lat] = feature.geometry.coordinates;

        const container = document.createElement("div");
        const nameEl = document.createElement("strong");
        nameEl.textContent = stationName;
        container.appendChild(nameEl);

        if (exitCode) {
          const exitEl = document.createElement("p");
          exitEl.className = "opacity-80 mt-1";
          exitEl.textContent = exitCode;
          container.appendChild(exitEl);
        }

        popup.setLngLat([lng, lat]).setDOMContent(container).addTo(map);
      });

      map.on("mouseleave", "mrt-exits", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    mapRef.current = map;

    return () => {
      isMapMounted = false;
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const applyVisibility = () => {
      const visibility = shouldShowBlockMarkers ? "visible" : "none";
      for (const layerId of ["clusters", "cluster-count", "unclustered-point"]) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility);
        }
      }
    };

    if (map.isStyleLoaded()) {
      applyVisibility();
      return;
    }

    void map.once("load", applyVisibility);
  }, [shouldShowBlockMarkers]);

  // Update the GeoJSON source data when blocks change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const mapInstance = map;

    function updateData() {
      const source = mapInstance.getSource("blocks");
      if (isGeoJsonSourceLike(source)) {
        source.setData(geoJson);
      }
    }

    if (mapInstance.isStyleLoaded()) {
      updateData();
    } else {
      void mapInstance.once("load", updateData);
    }
  }, [geoJson]);

  // Fit bounds when townFilter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || blocks.length === 0) return;

    const nextTownFilter = debouncedTownFilter ?? null;
    const nextAutoFitKey = autoFitKey ?? null;
    const shouldFit =
      !hasInitialFitRef.current ||
      previousTownFilterRef.current !== nextTownFilter ||
      previousAutoFitKeyRef.current !== nextAutoFitKey;

    previousTownFilterRef.current = nextTownFilter;
    previousAutoFitKeyRef.current = nextAutoFitKey;

    if (!shouldFit) {
      return;
    }

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

    // Default Singapore bounds if min/max collapsed or neither townFilter nor autoFitKey is present
    if (minLng === Infinity || (!debouncedTownFilter && !autoFitKey)) {
      map.fitBounds(SINGAPORE_BOUNDS, {
        padding: 40,
        duration: prefersReducedMotionRef.current ? 0 : 1200,
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
        duration: prefersReducedMotionRef.current ? 0 : 1200,
      },
    );
  }, [autoFitKey, blocks, debouncedTownFilter]);

  // Update the selected-point filters when selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("selected-point")) {
      return;
    }

    map.setFilter("selected-point", ["==", ["get", "address_key"], selectedAddressKey ?? ""]);
    map.setFilter("selected-point-label", ["==", ["get", "address_key"], selectedAddressKey ?? ""]);
  }, [selectedAddressKey]);

  return <div className="map-view" data-testid="map-view" ref={containerRef} />;
}
