import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { API_BASE_PATH } from "@/shared/lib/constants";
import { getStationDetails } from "@shared/mrt-station-details";
import { isGeoJsonDataSourceLike } from "@/types/map";

function enrichMrtFeaturesWithLineColors(
  collection: FeatureCollection,
  stationNameProperty: "stationName" | "STATION_NA",
): FeatureCollection {
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

async function fetchFeatureCollection(
  url: string,
  label: string,
  signal: AbortSignal,
): Promise<FeatureCollection> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status}`);
  }
  return (await response.json()) as FeatureCollection;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

export function useAmenityGeoSync({
  map,
  mrtEnabled,
}: {
  map: MapLibreMap | null;
  mrtEnabled: boolean;
}) {
  const [stationsGeoJson, setStationsGeoJson] = useState<FeatureCollection | null>(null);
  const [exitsGeoJson, setExitsGeoJson] = useState<FeatureCollection | null>(null);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [exitsLoading, setExitsLoading] = useState(false);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [exitsError, setExitsError] = useState<string | null>(null);

  useEffect(() => {
    if (!mrtEnabled) {
      setStationsLoading(false);
      return;
    }
    if (stationsGeoJson) return;

    const controller = new AbortController();
    let active = true;
    setStationsLoading(true);
    setStationsError(null);

    void fetchFeatureCollection(`${API_BASE_PATH}/mrt-stations`, "stations", controller.signal)
      .then((data: FeatureCollection) => {
        if (!active) return;
        setStationsGeoJson(enrichMrtFeaturesWithLineColors(data, "stationName"));
        setStationsLoading(false);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setStationsError(error instanceof Error ? error.message : "Failed to load MRT stations");
        setStationsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [mrtEnabled, stationsGeoJson]);

  useEffect(() => {
    if (!mrtEnabled) {
      setExitsLoading(false);
      return;
    }
    if (exitsGeoJson) return;

    const controller = new AbortController();
    let active = true;
    setExitsLoading(true);
    setExitsError(null);

    void fetchFeatureCollection(`${API_BASE_PATH}/mrt-exits`, "exits", controller.signal)
      .then((data: FeatureCollection) => {
        if (!active) return;
        setExitsGeoJson(enrichMrtFeaturesWithLineColors(data, "STATION_NA"));
        setExitsLoading(false);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setExitsError(error instanceof Error ? error.message : "Failed to load MRT exits");
        setExitsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [mrtEnabled, exitsGeoJson]);

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

      const visible = mrtEnabled ? "visible" : "none";

      if (map.getLayer("mrt-stations-points")) {
        map.setLayoutProperty("mrt-stations-points", "visibility", visible);
        map.setLayoutProperty("mrt-stations-labels", "visibility", visible);
      }

      if (map.getLayer("mrt-exits-points")) {
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
  }, [map, mrtEnabled]);

  return {
    error: stationsError ?? exitsError,
    isLoading: mrtEnabled && (stationsLoading || exitsLoading),
    stationsFailed: mrtEnabled && stationsError !== null,
    exitsFailed: mrtEnabled && exitsError !== null,
  };
}
