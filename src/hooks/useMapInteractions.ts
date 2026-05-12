import { useEffect, useRef } from "react";
import type {
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapLibreEvent,
  MapMouseEvent,
  Popup,
} from "maplibre-gl";
import { formatCompactCurrency } from "@/lib/format";
import { localizeTownName } from "@/lib/i18n/domain";
import type { Locale, Translator } from "@/lib/i18n";
import { isGeoJsonDataSourceLike } from "@/types/map";

type UseMapInteractionsProps = {
  map: MapLibreMap | null;
  popup: Popup | null;
  onSelect: (addressKey: string) => void;
  onMapInteract?: (interactionType?: "background" | "feature") => void;
  t: Translator;
  locale: Locale;
  prefersReducedMotion: boolean;
};

const SELECTABLE_LAYER_IDS = ["unclustered-point", "clusters"] as const;

function isPointGeometry(geometry: GeoJSON.Geometry): geometry is GeoJSON.Point {
  return geometry.type === "Point";
}

function readProperty(properties: unknown, key: string): unknown {
  if (!properties || typeof properties !== "object" || !(key in properties)) {
    return undefined;
  }
  return (properties as Record<string, unknown>)[key];
}

function readStringProperty(properties: unknown, key: string): string | undefined {
  const value = readProperty(properties, key);
  return typeof value === "string" ? value : undefined;
}

function readNumberProperty(properties: unknown, key: string): number | undefined {
  const value = readProperty(properties, key);
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

type ClusterSourceLike = {
  getClusterExpansionZoom(clusterId: number): Promise<number>;
};

function isClusterSourceLike(source: unknown): source is ClusterSourceLike {
  return (
    !!source &&
    typeof source === "object" &&
    "getClusterExpansionZoom" in source &&
    typeof source.getClusterExpansionZoom === "function"
  );
}

export function useMapInteractions({
  map,
  popup,
  onSelect,
  onMapInteract,
  t,
  locale,
  prefersReducedMotion,
}: UseMapInteractionsProps) {
  const onSelectRef = useRef(onSelect);
  const onMapInteractRef = useRef(onMapInteract);
  const tRef = useRef(t);
  const localeRef = useRef(locale);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onMapInteractRef.current = onMapInteract;
    tRef.current = t;
    localeRef.current = locale;
  }, [onSelect, onMapInteract, t, locale]);

  useEffect(() => {
    if (!map) return;

    const handleClickUnclustered = (event: MapLayerMouseEvent) => {
      onMapInteractRef.current?.("feature");
      const feature = event.features?.[0];
      if (!feature) return;
      const addressKey = readStringProperty(feature.properties, "address_key");
      if (addressKey) {
        onSelectRef.current(addressKey);
      }
    };

    const handleClickCluster = (event: MapLayerMouseEvent) => {
      onMapInteractRef.current?.("feature");
      const feature = event.features?.[0];
      if (!feature?.geometry || !isPointGeometry(feature.geometry)) return;
      const pointGeometry = feature.geometry;

      const clusterId = readNumberProperty(feature.properties, "cluster_id");
      const source = map.getSource("blocks");
      if (
        clusterId !== undefined &&
        isGeoJsonDataSourceLike(source) &&
        isClusterSourceLike(source)
      ) {
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          let container: HTMLElement;
          try {
            container = map.getContainer();
          } catch {
            return;
          }
          if (!container.isConnected) return;
          map.easeTo({
            center: pointGeometry.coordinates as [number, number],
            zoom,
            duration: prefersReducedMotion ? 0 : 260,
          });
        });
      }
    };

    const handleMouseEnterUnclustered = (event: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      if (!feature?.geometry || feature.geometry.type !== "Point" || !popup) return;

      const props = feature.properties;
      const container = document.createElement("div");

      const addressEl = document.createElement("strong");
      addressEl.textContent = readStringProperty(props, "address") ?? "";
      container.appendChild(addressEl);

      const displayName = readStringProperty(props, "display_name");
      if (displayName) {
        const nameEl = document.createElement("p");
        nameEl.textContent = displayName;
        container.appendChild(nameEl);
      }

      const townEl = document.createElement("p");
      townEl.textContent = localizeTownName(readStringProperty(props, "town") ?? "", localeRef.current);
      container.appendChild(townEl);

      const infoEl = document.createElement("p");
      const medianPrice = readNumberProperty(props, "median_price") ?? 0;
      const transactionCount = readNumberProperty(props, "transaction_count") ?? 0;
      infoEl.textContent = `${tRef.current("map.median", { value: formatCompactCurrency(medianPrice) })} · ${tRef.current("map.txns", { count: transactionCount })}`;
      container.appendChild(infoEl);

      popup.setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(container).addTo(map);
    };

    const handleMouseLeaveUnclustered = () => {
      map.getCanvas().style.cursor = "";
      popup?.remove();
    };

    const handleMouseEnterClusters = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeaveClusters = () => {
      map.getCanvas().style.cursor = "";
    };

    const handleMapClick = (event: MapMouseEvent) => {
      const queryableLayers = SELECTABLE_LAYER_IDS.filter((layerId) => map.getLayer(layerId));
      if (queryableLayers.length === 0) {
        return;
      }

      const clickedFeatures = map.queryRenderedFeatures(event.point, {
        layers: [...queryableLayers],
      });
      if (clickedFeatures.length === 0) {
        onMapInteractRef.current?.("background");
      }
    };

    const handleDblClick = (event: MapMouseEvent) => {
      onMapInteractRef.current?.("feature");
      map.easeTo({
        center: [event.lngLat.lng, event.lngLat.lat],
        zoom: Math.min(map.getZoom() + 2.2, 20),
        duration: prefersReducedMotion ? 0 : 260,
      });
    };

    const handleMoveStart = (
      event: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>,
    ) => {
      if (event.originalEvent) {
        onMapInteractRef.current?.("background");
      }
    };

    map.on("click", "unclustered-point", handleClickUnclustered);
    map.on("click", "clusters", handleClickCluster);
    map.on("mouseenter", "unclustered-point", handleMouseEnterUnclustered);
    map.on("mouseleave", "unclustered-point", handleMouseLeaveUnclustered);
    map.on("mouseenter", "clusters", handleMouseEnterClusters);
    map.on("mouseleave", "clusters", handleMouseLeaveClusters);
    map.on("click", handleMapClick);
    map.on("dblclick", handleDblClick);
    map.on("movestart", handleMoveStart);

    return () => {
      map.off("click", "unclustered-point", handleClickUnclustered);
      map.off("click", "clusters", handleClickCluster);
      map.off("mouseenter", "unclustered-point", handleMouseEnterUnclustered);
      map.off("mouseleave", "unclustered-point", handleMouseLeaveUnclustered);
      map.off("mouseenter", "clusters", handleMouseEnterClusters);
      map.off("mouseleave", "clusters", handleMouseLeaveClusters);
      map.off("click", handleMapClick);
      map.off("dblclick", handleDblClick);
      map.off("movestart", handleMoveStart);
    };
  }, [map, popup, prefersReducedMotion]);
}
