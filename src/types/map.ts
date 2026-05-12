export type GeoJsonDataSourceLike = {
  setData(data: GeoJSON.FeatureCollection | GeoJSON.Feature): void;
};

export function isGeoJsonDataSourceLike(source: unknown): source is GeoJsonDataSourceLike {
  return !!source && typeof source === "object" && "setData" in source;
}
