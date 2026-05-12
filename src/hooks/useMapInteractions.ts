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
      if (feature?.properties?.address_key) {
        onSelectRef.current(feature.properties.address_key);
      }
    };

    const handleClickCluster = (event: MapLayerMouseEvent) => {
      onMapInteractRef.current?.("feature");
      const feature = event.features?.[0];
      if (!feature?.geometry || feature.geometry.type !== "Point") return;

      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource("blocks");
      if (isGeoJsonDataSourceLike(source) && typeof clusterId === "number") {
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({
            center: feature.geometry.coordinates as [number, number],
            zoom,
          });
        });
      }
    };

    const handleMouseEnterUnclustered = (event: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      if (!feature?.geometry || feature.geometry.type !== "Point" || !popup) return;

      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const container = document.createElement("div");

      const addressEl = document.createElement("strong");
      addressEl.textContent = String(props.address ?? "");
      container.appendChild(addressEl);

      if (props.display_name) {
        const nameEl = document.createElement("p");
        nameEl.textContent = String(props.display_name);
        container.appendChild(nameEl);
      }

      const townEl = document.createElement("p");
      townEl.textContent = localizeTownName(String(props.town ?? ""), localeRef.current);
      container.appendChild(townEl);

      const infoEl = document.createElement("p");
      const medianPrice =
        typeof props.median_price === "number" ? props.median_price : Number(props.median_price ?? 0);
      const transactionCount =
        typeof props.transaction_count === "number"
          ? props.transaction_count
          : Number(props.transaction_count ?? 0);
      infoEl.textContent = `${tRef.current("map.median", { value: formatCompactCurrency(medianPrice) })} · ${tRef.current("map.txns", { count: transactionCount })}`;
      container.appendChild(infoEl);

      popup.setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(container).addTo(map);
    };

    const handleMouseLeaveUnclustered = () => {
      map.getCanvas().style.cursor = "";
      popup?.remove();
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
    map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
    map.on("click", handleMapClick);
    map.on("dblclick", handleDblClick);
    map.on("movestart", handleMoveStart);

    return () => {
      map.off("click", "unclustered-point", handleClickUnclustered);
      map.off("click", "clusters", handleClickCluster);
      map.off("mouseenter", "unclustered-point", handleMouseEnterUnclustered);
      map.off("mouseleave", "unclustered-point", handleMouseLeaveUnclustered);
      map.off("click", handleMapClick);
      map.off("dblclick", handleDblClick);
      map.off("movestart", handleMoveStart);
    };
  }, [map, popup, prefersReducedMotion]);
}
