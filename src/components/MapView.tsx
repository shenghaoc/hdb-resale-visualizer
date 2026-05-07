import { useEffect, useMemo, useRef } from "react";
import maplibregl, { LngLatBoundsLike, Map as MapLibreMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  MEDIAN_PRICE_COLOR_EXPRESSION,
  ONEMAP_ATTRIBUTION,
  ONEMAP_DEFAULT_TILE_URL,
  ONEMAP_NIGHT_TILE_URL,
  PRIMARY_BLUE,
} from "@/lib/constants";
import { formatCompactCurrency } from "@/lib/format";
import { toGeoJson } from "@/lib/map";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { BlockSummary, Coordinates } from "@/types/data";
import type { Translator } from "@/lib/i18n";
import { localizeTownName } from "@/lib/i18n/domain";
import type { Locale } from "@/lib/i18n";

type MapViewProps = {
  blocks: BlockSummary[];
  selectedAddressKey: string | null;
  townFilter?: string | null;
  autoFitKey?: string | null;
  showBlockMarkers?: boolean;
  isDarkMode: boolean;
  onSelect: (addressKey: string) => void;
  onMapInteract?: (interactionType?: "background" | "feature") => void;
  onGeolocate?: (coords: Coordinates) => void;
  t: Translator;
  locale: Locale;
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

type GeoJsonSourceLike = {
  setData(data: ReturnType<typeof toGeoJson>): void;
  getClusterExpansionZoom(clusterId: number): Promise<number>;
};

type GeoJsonDataSourceLike = {
  setData(data: GeoJSON.FeatureCollection | GeoJSON.Feature): void;
};

type RasterSourceLike = {
  setTiles(tiles: string[]): void;
};

function createCircleGeoJson(
  center: Coordinates,
  radiusKm: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const points = 64;
  const coords = [];
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLng = 111.32 * Math.cos((center.lat * Math.PI) / 180);

  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points;
    const rad = (angle * Math.PI) / 180;
    const dx = radiusKm * Math.cos(rad);
    const dy = radiusKm * Math.sin(rad);
    coords.push([center.lng + dx / kmPerDegreeLng, center.lat + dy / kmPerDegreeLat]);
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
    properties: {
      radius: radiusKm,
    },
  };
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

export function MapView({
  blocks,
  selectedAddressKey,
  townFilter,
  autoFitKey,
  showBlockMarkers = false,
  isDarkMode,
  onSelect,
  onMapInteract,
  onGeolocate,
  t,
  locale,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const onMapInteractRef = useRef(onMapInteract);
  const onGeolocateRef = useRef(onGeolocate);
  const tRef = useRef(t);
  const localeRef = useRef(locale);
  const popupRef = useRef<Popup | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const initialIsDarkModeRef = useRef(isDarkMode);
  const hasInitialFitRef = useRef(false);
  const previousTownFilterRef = useRef<string | null>(null);
  const previousAutoFitKeyRef = useRef<string | null>(null);
  const lastAppliedThemeRef = useRef<boolean>(isDarkMode);
  const pendingThemeLoadListenerRef = useRef<(() => void) | null>(null);

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
    onGeolocateRef.current = onGeolocate;
  });

  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  // Create the map ONCE on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    prefersReducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const initialIsDark = initialIsDarkModeRef.current;
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
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          onemap: {
            type: "raster",
            tiles: [initialIsDark ? ONEMAP_NIGHT_TILE_URL : ONEMAP_DEFAULT_TILE_URL],
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
      positionOptions: {
        enableHighAccuracy: true,
      },
      // One-shot geolocation only. Do not keep tracking while the user moves.
      trackUserLocation: false,
      showUserLocation: true,
    });

    geolocate.on("geolocate", (e: unknown) => {
      const event = e as { coords: { latitude: number; longitude: number } };
      const { latitude, longitude } = event.coords;
      const callback = onGeolocateRef.current;
      if (callback) {
        callback({ lat: latitude, lng: longitude });
      }
    });

    map.addControl(geolocate, "top-right");

    map.doubleClickZoom.disable();

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "map-popup",
    });
    popupRef.current = popup;

    map.on("load", () => {
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          "circle-color": MEDIAN_PRICE_COLOR_EXPRESSION as any,
          "circle-radius": ["interpolate", ["linear"], ["get", "transaction_count"], 1, 6, 10, 10, 25, 16],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.9)",
          "circle-opacity": 0.92,
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
        townEl.textContent = localizeTownName(town, localeRef.current);
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

    });

    mapRef.current = map;
    lastAppliedThemeRef.current = initialIsDark;

    return () => {
      if (pendingThemeLoadListenerRef.current) {
        map.off("load", pendingThemeLoadListenerRef.current);
        pendingThemeLoadListenerRef.current = null;
      }
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

    if (lastAppliedThemeRef.current === isDarkMode) {
      return;
    }

    const applyTiles = () => {
      const source = map.getSource("onemap") as RasterSourceLike | undefined;
      if (!source || typeof source.setTiles !== "function") {
        return;
      }

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
  }, [isDarkMode]);

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

  // Update the radius circles when selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    function updateRadius() {
      const mapInstance = mapRef.current;
      if (!mapInstance) {
        return;
      }

      const source = mapInstance.getSource("radius");
      if (!isGeoJsonDataSourceLike(source)) {
        return;
      }

      if (!selectedAddressKey) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const selectedBlock = blocks.find((b) => b.addressKey === selectedAddressKey);
      if (!selectedBlock) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const features: GeoJSON.Feature[] = [
        createCircleGeoJson(selectedBlock.coordinates, 1),
        createCircleGeoJson(selectedBlock.coordinates, 2),
      ];

      source.setData({
        type: "FeatureCollection",
        features,
      });
    }

    if (map.isStyleLoaded()) {
      updateRadius();
    } else {
      void map.once("load", updateRadius);
    }
  }, [selectedAddressKey, blocks]);

  return (
    <div
      className="map-view bg-background transition-colors duration-300"
      data-testid="map-view"
      data-theme={isDarkMode ? "dark" : "light"}
      ref={containerRef}
      role="application"
      aria-label={t("map.ariaLabel")}
    />
  );
}
