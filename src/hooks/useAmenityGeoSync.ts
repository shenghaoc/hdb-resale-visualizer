import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { DATA_BASE_PATH } from "@/lib/constants";
import { getStationDetails } from "@/lib/mrt-station-details";
import { isGeoJsonDataSourceLike } from "@/types/map";

function enrichMrtFeaturesWithLineColors(
  collection: GeoJSON.FeatureCollection,
  stationNameProperty: "stationName" | "STATION_NA",
): GeoJSON.FeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const properties = feature.properties ?? {};
      const stationName = String(properties[stationNameProperty] ?? "");
      const { color } = getStationDetails(stationName);

      return {
        ...feature,
        properties: {
          ...properties,
          color,
        },
      };
    }),
  };
}

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mrtStationsEnabled && !stationsGeoJson) {
      fetch(`${DATA_BASE_PATH}/mrt-stations.geojson`)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load stations: ${r.status}`);
          return r.json();
        })
        .then((data: GeoJSON.FeatureCollection) =>
          setStationsGeoJson(enrichMrtFeaturesWithLineColors(data, "stationName")),
        )
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load MRT stations"));
    }
  }, [mrtStationsEnabled, stationsGeoJson]);

  useEffect(() => {
    if (mrtExitsEnabled && !exitsGeoJson) {
      fetch(`${DATA_BASE_PATH}/mrt-exits.geojson`)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load exits: ${r.status}`);
          return r.json();
        })
        .then((data: GeoJSON.FeatureCollection) =>
          setExitsGeoJson(enrichMrtFeaturesWithLineColors(data, "STATION_NA")),
        )
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load MRT exits"));
    }
  }, [mrtExitsEnabled, exitsGeoJson]);

  // Sync station data to map source with deferred-apply
  useEffect(() => {
    if (!map || !stationsGeoJson) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("mrt-stations");
      if (isGeoJsonDataSourceLike(source)) {
        source.setData(stationsGeoJson);
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      void map.once("load", apply);
    }
    map.on("styledata", apply);

    return () => {
      map.off("load", apply);
      map.off("styledata", apply);
    };
  }, [map, stationsGeoJson]);

  // Sync exit data to map source with deferred-apply
  useEffect(() => {
    if (!map || !exitsGeoJson) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("mrt-exits");
      if (isGeoJsonDataSourceLike(source)) {
        source.setData(exitsGeoJson);
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      void map.once("load", apply);
    }
    map.on("styledata", apply);

    return () => {
      map.off("load", apply);
      map.off("styledata", apply);
    };
  }, [map, exitsGeoJson]);

  // Sync visibility with deferred-apply; layer minzoom owns zoom gating.
  useEffect(() => {
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;

      if (map.getLayer("mrt-stations-points")) {
        const visible = mrtStationsEnabled ? "visible" : "none";
        map.setLayoutProperty("mrt-stations-points", "visibility", visible);
        map.setLayoutProperty("mrt-stations-labels", "visibility", visible);
      }

      if (map.getLayer("mrt-exits-points")) {
        const visible = mrtExitsEnabled ? "visible" : "none";
        map.setLayoutProperty("mrt-exits-points", "visibility", visible);
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      void map.once("load", apply);
    }
    map.on("styledata", apply);

    return () => {
      map.off("load", apply);
      map.off("styledata", apply);
    };
  }, [map, mrtStationsEnabled, mrtExitsEnabled]);

  return { error };
}
