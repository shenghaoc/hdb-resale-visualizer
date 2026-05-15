import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { DATA_BASE_PATH } from "@/lib/constants";
import { isGeoJsonDataSourceLike } from "@/types/map";

export function useAmenityGeoSync({
  map,
  mrtStationsEnabled,
  mrtExitsEnabled,
}: {
  map: MapLibreMap | null;
  mrtStationsEnabled: boolean;
  mrtExitsEnabled: boolean;
}) {
  const [stationsGeoJson, setStationsGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [exitsGeoJson, setExitsGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    if (mrtStationsEnabled && !stationsGeoJson) {
      fetch(`${DATA_BASE_PATH}/mrt-stations.geojson`)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load stations: ${r.status}`);
          return r.json();
        })
        .then((data: GeoJSON.FeatureCollection) => setStationsGeoJson(data))
        .catch(console.error);
    }
  }, [mrtStationsEnabled, stationsGeoJson]);

  useEffect(() => {
    if (mrtExitsEnabled && !exitsGeoJson) {
      fetch(`${DATA_BASE_PATH}/mrt-exits.geojson`)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load exits: ${r.status}`);
          return r.json();
        })
        .then((data: GeoJSON.FeatureCollection) => setExitsGeoJson(data))
        .catch(console.error);
    }
  }, [mrtExitsEnabled, exitsGeoJson]);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    if (stationsGeoJson) {
      const source = map.getSource("mrt-stations");
      if (isGeoJsonDataSourceLike(source)) {
        source.setData(stationsGeoJson);
      }
    }
  }, [map, stationsGeoJson, mrtStationsEnabled]);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    if (exitsGeoJson) {
      const source = map.getSource("mrt-exits");
      if (isGeoJsonDataSourceLike(source)) {
        source.setData(exitsGeoJson);
      }
    }
  }, [map, exitsGeoJson, mrtExitsEnabled]);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    
    // Check if layer exists before setting visibility to avoid errors if map style is reloading
    if (map.getLayer("mrt-stations-points")) {
      const visibility = mrtStationsEnabled ? "visible" : "none";
      map.setLayoutProperty("mrt-stations-points", "visibility", visibility);
      map.setLayoutProperty("mrt-stations-labels", "visibility", visibility);
    }

    if (map.getLayer("mrt-exits-points")) {
      map.setLayoutProperty("mrt-exits-points", "visibility", mrtExitsEnabled ? "visible" : "none");
    }
  }, [map, mrtStationsEnabled, mrtExitsEnabled]);
}
