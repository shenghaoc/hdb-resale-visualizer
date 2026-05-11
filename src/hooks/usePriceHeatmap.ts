import { useCallback, useMemo, useState } from "react";

export function usePriceHeatmap() {
  const [priceHeatmapEnabled, setPriceHeatmapEnabled] = useState(false);
  const [priceHeatmapOpacity, setPriceHeatmapOpacity] = useState(0.7);

  const togglePriceHeatmap = useCallback(() => setPriceHeatmapEnabled((v) => !v), []);

  return useMemo(() => ({
    priceHeatmapEnabled,
    priceHeatmapOpacity,
    togglePriceHeatmap,
    setPriceHeatmapOpacity,
  }), [priceHeatmapEnabled, priceHeatmapOpacity, togglePriceHeatmap]);
}
