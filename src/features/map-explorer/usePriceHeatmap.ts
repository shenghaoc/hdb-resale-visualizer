import { useCallback, useMemo, useState } from "react";

export type HeatmapMode = "price" | "perSqm";

export function usePriceHeatmap() {
  const [priceHeatmapEnabled, setPriceHeatmapEnabled] = useState(false);
  const [priceHeatmapOpacity, setPriceHeatmapOpacity] = useState(0.7);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("price");

  const togglePriceHeatmap = useCallback(() => setPriceHeatmapEnabled((v) => !v), []);

  return useMemo(
    () => ({
      priceHeatmapEnabled,
      priceHeatmapOpacity,
      togglePriceHeatmap,
      setPriceHeatmapOpacity,
      heatmapMode,
      setHeatmapMode,
    }),
    [priceHeatmapEnabled, priceHeatmapOpacity, togglePriceHeatmap, heatmapMode],
  );
}
