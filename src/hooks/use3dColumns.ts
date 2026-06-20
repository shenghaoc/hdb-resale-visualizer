import { useCallback, useMemo, useState } from "react";
import type { HeatmapMode } from "@/hooks/usePriceHeatmap";

/**
 * Local UI state for the 3D price-column view. Mirrors `usePriceHeatmap` so the
 * map controls share a consistent shape. The metric (`mode`) reuses the same
 * price / $-per-sqm switch as the heatmap.
 */
export function use3dColumns() {
  const [columns3dEnabled, setColumns3dEnabled] = useState(false);
  const [columns3dMode, setColumns3dMode] = useState<HeatmapMode>("price");

  const toggleColumns3d = useCallback(() => setColumns3dEnabled((v) => !v), []);

  return useMemo(
    () => ({
      columns3dEnabled,
      columns3dMode,
      toggleColumns3d,
      setColumns3dMode,
    }),
    [columns3dEnabled, columns3dMode, toggleColumns3d],
  );
}
