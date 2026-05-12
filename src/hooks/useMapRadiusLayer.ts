import { useEffect, type RefObject } from "react";
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
  mapRef: RefObject<MapLibreMap | null>,
  geographicIntent: GeographicSearchIntent | null | undefined,
  selectedAddressKey: string | null,
  blocksByKey: Map<string, BlockSummary>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateRadius = () => {
      const source = map.getSource("radius");
      if (!isGeoJsonDataSourceLike(source)) return;

      if (geographicIntent?.type === "coordinates") {
        const radiusKm = geographicIntent.radiusMeters / 1000;
        source.setData({
          type: "FeatureCollection",
          features: [createCircleGeoJson(geographicIntent.coordinates, radiusKm)],
        });
        return;
      }

      const selectedBlock = selectedAddressKey ? blocksByKey.get(selectedAddressKey) : null;
      if (!selectedBlock) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: [createCircleGeoJson(selectedBlock.coordinates, 1), createCircleGeoJson(selectedBlock.coordinates, 2)],
      });
    };

    if (map.isStyleLoaded()) updateRadius();
    else void map.once("load", updateRadius);

    return () => {
      map.off("load", updateRadius);
    };
    // Note: `mapRef` is a RefObject whose `.current` mutations do not trigger
    // re-renders. This effect relies on the parent component causing a
    // re-render (e.g., via state updates) once the map instance is ready.
  }, [blocksByKey, geographicIntent, mapRef, selectedAddressKey]);
}
