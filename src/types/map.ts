import type { FeatureCollection, Feature } from "geojson";

export type GeoJsonDataSourceLike = {
  setData(data: FeatureCollection | Feature): void;
};

export function isGeoJsonDataSourceLike(source: unknown): source is GeoJsonDataSourceLike {
  return !!source && typeof source === "object" && "setData" in source;
}
