import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  ColorSpecification,
  DataDrivenPropertyValueSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import {
  MEDIAN_PRICE_COLOR_EXPRESSION,
  PRICE_PER_SQM_COLOR_EXPRESSION,
} from "@/shared/lib/constants";
import type { HeatmapMode } from "@/hooks/usePriceHeatmap";

/**
 * MapLibre layer/source IDs for the 3D price-column extrusion managed by this
 * module. Kept separate from the flat-marker layers so the 3D mode can be added
 * and removed independently without disturbing the rest of the style.
 */
export const COLUMNS_3D_LAYER_ID = "price-columns-3d";
export const COLUMNS_3D_SOURCE_ID = "price-columns-3d-source";

/**
 * Camera pitch (degrees) applied when 3D columns are enabled so the extruded
 * "price skyline" is readable. 0° is a flat top-down view.
 */
export const COLUMNS_3D_PITCH = 50;

/**
 * Extrusion height range, in metres, mapped from the active price metric.
 * A small floor keeps low-priced blocks visible as short columns rather than
 * disappearing into the basemap.
 */
const COLUMNS_3D_MIN_HEIGHT = 20;
const COLUMNS_3D_MAX_HEIGHT = 600;

/**
 * Half the side length of each block's square footprint, expressed in degrees
 * (~20 m). Longitude compression at Singapore's latitude (cos ≈ 0.9997) is
 * negligible, so a single constant is used for both axes.
 */
const COLUMN_HALF_SIDE_DEG = 0.00018;

/**
 * Builds the data-driven `fill-extrusion-height` expression for the active
 * metric. Exported for unit testing.
 */
export function buildColumnHeightExpression(
  mode: HeatmapMode,
): DataDrivenPropertyValueSpecification<number> {
  return mode === "perSqm"
    ? [
        "interpolate",
        ["linear"],
        ["get", "price_per_sqm_median"],
        3000,
        COLUMNS_3D_MIN_HEIGHT,
        13000,
        COLUMNS_3D_MAX_HEIGHT,
      ]
    : [
        "interpolate",
        ["linear"],
        ["get", "median_price"],
        300_000,
        COLUMNS_3D_MIN_HEIGHT,
        1_500_000,
        COLUMNS_3D_MAX_HEIGHT,
      ];
}

/**
 * Returns the colour expression for the active metric, reusing the same price
 * ramps as the flat markers and legend so the 3D view stays consistent.
 */
export function buildColumnColorExpression(
  mode: HeatmapMode,
): DataDrivenPropertyValueSpecification<ColorSpecification> {
  return mode === "perSqm" ? PRICE_PER_SQM_COLOR_EXPRESSION : MEDIAN_PRICE_COLOR_EXPRESSION;
}

/**
 * Converts a point FeatureCollection of blocks (as produced by `toGeoJson`)
 * into square Polygon footprints suitable for `fill-extrusion`. The price
 * properties are carried through unchanged so the paint expressions can derive
 * height and colour. Non-point features are skipped defensively.
 */
export function pointsToColumnPolygons(data: FeatureCollection): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];

  for (const feature of data.features) {
    if (feature.geometry?.type !== "Point") continue;
    const [lng, lat] = feature.geometry.coordinates;
    if (typeof lng !== "number" || typeof lat !== "number") continue;

    const west = lng - COLUMN_HALF_SIDE_DEG;
    const east = lng + COLUMN_HALF_SIDE_DEG;
    const south = lat - COLUMN_HALF_SIDE_DEG;
    const north = lat + COLUMN_HALF_SIDE_DEG;

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
      properties: feature.properties ?? {},
    });
  }

  return { type: "FeatureCollection", features };
}

/**
 * Reports whether the 3D column layer is currently present in the map style.
 */
export function isColumns3dLayerPresent(map: MapLibreMap): boolean {
  return Boolean(map.getLayer(COLUMNS_3D_LAYER_ID));
}

/**
 * Adds the 3D price-column source + layer. Safe to call repeatedly: when the
 * layer already exists only the metric-driven paint properties are updated, so
 * switching between price and $/sqm modes does not rebuild the geometry.
 */
export function addColumns3dLayer(
  map: MapLibreMap,
  polygons: FeatureCollection<Polygon>,
  mode: HeatmapMode,
): void {
  if (isColumns3dLayerPresent(map)) {
    map.setPaintProperty(
      COLUMNS_3D_LAYER_ID,
      "fill-extrusion-height",
      buildColumnHeightExpression(mode),
    );
    map.setPaintProperty(
      COLUMNS_3D_LAYER_ID,
      "fill-extrusion-color",
      buildColumnColorExpression(mode),
    );
    return;
  }

  if (!map.getSource(COLUMNS_3D_SOURCE_ID)) {
    map.addSource(COLUMNS_3D_SOURCE_ID, {
      type: "geojson",
      data: polygons,
    });
  }

  map.addLayer({
    id: COLUMNS_3D_LAYER_ID,
    type: "fill-extrusion",
    source: COLUMNS_3D_SOURCE_ID,
    paint: {
      "fill-extrusion-color": buildColumnColorExpression(mode),
      "fill-extrusion-height": buildColumnHeightExpression(mode),
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.85,
    },
  });
}

/**
 * Removes the 3D column layer and its dedicated source. Safe to call when the
 * layer does not exist.
 */
export function removeColumns3dLayer(map: MapLibreMap): void {
  if (map.getLayer(COLUMNS_3D_LAYER_ID)) {
    map.removeLayer(COLUMNS_3D_LAYER_ID);
  }
  if (map.getSource(COLUMNS_3D_SOURCE_ID)) {
    map.removeSource(COLUMNS_3D_SOURCE_ID);
  }
}
