import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { BlockSummary, Coordinates } from "@/types/data";
import { isGeoJsonDataSourceLike } from "@/types/map";
import type { GeographicSearchIntent } from "@/lib/filtering";

function createCircleGeoJson(center: Coordinates, radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const points = 64;
  const coords = [];
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLng = 111.32 * Math.cos((center.lat * Math.PI) / 180);
  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points;
    const rad = (angle * Math.PI) / 180;
    coords.push([
      center.lng + (radiusKm * Math.cos(rad)) / kmPerDegreeLng,
      center.lat + (radiusKm * Math.sin(rad)) / kmPerDegreeLat,
    ]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: { radius: radiusKm } };
}

export function useMapRadiusLayer(
  map: MapLibreMap | null,
  geographicIntent: GeographicSearchIntent | null | undefined,
  selectedAddressKey: string | null,
  blocksByKey: Map<string, BlockSummary>,
) {
  const radiusSignatureRef = useRef<string | null>(null);
  const radiusSourceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!map) return;

    const updateRadius = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("radius");
      if (!isGeoJsonDataSourceLike(source)) return;

      const selectedBlock = selectedAddressKey ? blocksByKey.get(selectedAddressKey) : null;
      const selectedSignature =
        geographicIntent?.type === "coordinates"
          ? `coords:${geographicIntent.coordinates.lat.toFixed(6)},${geographicIntent.coordinates.lng.toFixed(6)},${geographicIntent.radiusMeters}`
          : selectedBlock
            ? `addr:${selectedAddressKey}:${selectedBlock.coordinates.lat.toFixed(6)},${selectedBlock.coordinates.lng.toFixed(6)}`
            : "none";

      // Re-sync if either the data intent changed OR the source was replaced
      // (e.g. after a style reload that recreates map sources).
      const sourceChanged = source !== radiusSourceRef.current;
      if (selectedSignature === radiusSignatureRef.current && !sourceChanged) return;

      if (selectedSignature === "none") {
        source.setData({ type: "FeatureCollection", features: [] });
        radiusSignatureRef.current = selectedSignature;
        radiusSourceRef.current = source;
        return;
      }

      if (geographicIntent?.type === "coordinates") {
        const radiusKm = geographicIntent.radiusMeters / 1000;
        source.setData({
          type: "FeatureCollection",
          features: [createCircleGeoJson(geographicIntent.coordinates, radiusKm)],
        });
        radiusSignatureRef.current = selectedSignature;
        radiusSourceRef.current = source;
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: [
          createCircleGeoJson(selectedBlock!.coordinates, 1),
          createCircleGeoJson(selectedBlock!.coordinates, 2),
        ],
      });
      radiusSignatureRef.current = selectedSignature;
      radiusSourceRef.current = source;
    };

    if (map.isStyleLoaded()) updateRadius();
    else void map.once("load", updateRadius);
    map.on("styledata", updateRadius);

    return () => {
      map.off("load", updateRadius);
      map.off("styledata", updateRadius);
    };
  }, [blocksByKey, geographicIntent, map, selectedAddressKey]);
}
