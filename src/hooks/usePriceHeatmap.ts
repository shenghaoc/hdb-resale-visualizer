import { useState } from "react";

export function usePriceHeatmap() {
  const [priceHeatmapEnabled, setPriceHeatmapEnabled] = useState(false);
  const [priceHeatmapOpacity, setPriceHeatmapOpacity] = useState(0.7);

  return {
    priceHeatmapEnabled,
    priceHeatmapOpacity,
    togglePriceHeatmap: () => setPriceHeatmapEnabled((v) => !v),
    setPriceHeatmapOpacity,
  };
}
