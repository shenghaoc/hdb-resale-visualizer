import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * MapLibre heatmap layer IDs managed by this module.
 * Kept in a dedicated module so MapView can add/remove layers by ID without
 * tight coupling to the control component.
 */
export const HEATMAP_LAYER_ID = "price-heatmap";
export const HEATMAP_SOURCE_ID = "price-heatmap-source";

/**
 * Checks whether the heatmap layer is currently present in the map style.
 */
export function isHeatmapLayerPresent(map: MapLibreMap): boolean {
  return Boolean(map.getLayer(HEATMAP_LAYER_ID));
}

/**
 * Adds the price heatmap source + layer to the map **before** the blocks layer
 * so that block markers appear on top.  Safe to call multiple times -- it is
 * a no-op when the layer already exists.
 *
 * The heatmap uses the same `median_price` property that already lives on
 * each block feature in the "blocks" GeoJSON source, so no extra data is
 * required at runtime.
 *
 * A dedicated non-clustered GeoJSON source (`HEATMAP_SOURCE_ID`) is created
 * so that the heatmap renders from individual points rather than cluster
 * aggregates.
 */
export function addPriceHeatmapLayer(
  map: MapLibreMap,
  opacity: number,
  data: GeoJSON.FeatureCollection,
): void {
  if (isHeatmapLayerPresent(map)) return;

  // Create a dedicated non-clustered source for the heatmap.
  // Clustering collapses individual points which results in a sparse heatmap.
  if (!map.getSource(HEATMAP_SOURCE_ID)) {
    map.addSource(HEATMAP_SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  map.addLayer(
    {
      id: HEATMAP_LAYER_ID,
      type: "heatmap",
      source: HEATMAP_SOURCE_ID,
      maxzoom: 17,
      paint: {
        // Weight each point by its median_price.  Normalise to 0-1 against
        // the expected Singapore HDB price range (400 K - 1.5 M).
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", "median_price"],
          400_000, 0,
          1_500_000, 1,
        ],
        // Intensity ramps up as you zoom in so the heat field stays legible.
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9, 0.6,
          15, 2,
        ],
        // HSL color ramp: cool teal to amber to deep red (mirrors the existing
        // MEDIAN_PRICE_COLOR_STOPS palette to stay visually coherent).
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,   "rgba(0,0,0,0)",
          0.1, "rgba(58,138,111,0)",
          0.2, "rgba(58,138,111,0.4)",
          0.4, "rgba(155,179,104,0.7)",
          0.6, "rgba(212,164,78,0.8)",
          0.8, "rgba(217,119,87,0.9)",
          1,   "rgba(168,50,50,1)",
        ],
        // Radius shrinks with lower zoom levels so it doesn't bleed over
        // the entire island when zoomed out.
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,  20,
          13, 35,
          15, 50,
        ],
        "heatmap-opacity": opacity,
      },
    },
    // Insert **before** the block marker layers so markers stay on top.
    map.getLayer("clusters") ? "clusters" : undefined,
  );
}

/**
 * Removes the heatmap layer (and its dedicated source) from the map.
 * Safe to call when the layer does not exist.
 */
export function removePriceHeatmapLayer(map: MapLibreMap): void {
  if (map.getLayer(HEATMAP_LAYER_ID)) {
    map.removeLayer(HEATMAP_LAYER_ID);
  }
  if (map.getSource(HEATMAP_SOURCE_ID)) {
    map.removeSource(HEATMAP_SOURCE_ID);
  }
}

/**
 * Updates the opacity of an already-present heatmap layer.
 * Uses `setPaintProperty` (no full re-render) for smooth animation.
 */
export function setHeatmapOpacity(map: MapLibreMap, opacity: number): void {
  if (map.getLayer(HEATMAP_LAYER_ID)) {
    map.setPaintProperty(HEATMAP_LAYER_ID, "heatmap-opacity", opacity);
  }
}
