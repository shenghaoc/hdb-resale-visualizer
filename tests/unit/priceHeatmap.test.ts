import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addPriceHeatmapLayer,
  removePriceHeatmapLayer,
  setHeatmapOpacity,
  isHeatmapLayerPresent,
  HEATMAP_LAYER_ID,
  HEATMAP_SOURCE_ID,
} from "../../src/lib/priceHeatmap";

function createMockMap(options: { hasLayer?: boolean; hasSource?: boolean; hasClusters?: boolean } = {}) {
  const { hasLayer = false, hasSource = false, hasClusters = true } = options;
  return {
    getLayer: vi.fn((id: string) => {
      if (id === HEATMAP_LAYER_ID) return hasLayer ? {} : undefined;
      if (id === "clusters") return hasClusters ? {} : undefined;
      return undefined;
    }),
    getSource: vi.fn((id: string) => {
      if (id === HEATMAP_SOURCE_ID) return hasSource ? {} : undefined;
      return undefined;
    }),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    setPaintProperty: vi.fn(),
  } as unknown as ReturnType<typeof createMockMap>;
}

type MockMap = ReturnType<typeof createMockMap>;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

describe("priceHeatmap", () => {
  let mockMap: MockMap;

  beforeEach(() => {
    mockMap = createMockMap();
  });

  describe("isHeatmapLayerPresent", () => {
    it("returns true when the heatmap layer exists", () => {
      const map = createMockMap({ hasLayer: true });
      expect(isHeatmapLayerPresent(map as never)).toBe(true);
    });

    it("returns false when the heatmap layer does not exist", () => {
      const map = createMockMap({ hasLayer: false });
      expect(isHeatmapLayerPresent(map as never)).toBe(false);
    });
  });

  describe("addPriceHeatmapLayer", () => {
    it("creates source and layer when not present", () => {
      addPriceHeatmapLayer(mockMap as never, 0.7, EMPTY_FC);

      expect(mockMap.addSource).toHaveBeenCalledWith(HEATMAP_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FC,
      });
      expect(mockMap.addLayer).toHaveBeenCalledTimes(1);
      const addLayerCall = (mockMap.addLayer as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(addLayerCall[0].id).toBe(HEATMAP_LAYER_ID);
      expect(addLayerCall[0].paint["heatmap-opacity"]).toBe(0.7);
      // beforeId should be "clusters" since hasClusters defaults to true
      expect(addLayerCall[1]).toBe("clusters");
    });

    it("is a no-op when layer already exists", () => {
      const map = createMockMap({ hasLayer: true });
      addPriceHeatmapLayer(map as never, 0.7, EMPTY_FC);

      expect(map.addSource).not.toHaveBeenCalled();
      expect(map.addLayer).not.toHaveBeenCalled();
    });

    it("handles missing clusters layer gracefully", () => {
      const map = createMockMap({ hasClusters: false });
      addPriceHeatmapLayer(map as never, 0.5, EMPTY_FC);

      expect(map.addLayer).toHaveBeenCalledTimes(1);
      const addLayerCall = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(addLayerCall[1]).toBeUndefined();
    });
  });

  describe("removePriceHeatmapLayer", () => {
    it("removes layer and source when present", () => {
      const map = createMockMap({ hasLayer: true, hasSource: true });
      removePriceHeatmapLayer(map as never);

      expect(map.removeLayer).toHaveBeenCalledWith(HEATMAP_LAYER_ID);
      expect(map.removeSource).toHaveBeenCalledWith(HEATMAP_SOURCE_ID);
    });

    it("is safe when layer does not exist", () => {
      const map = createMockMap({ hasLayer: false, hasSource: false });
      removePriceHeatmapLayer(map as never);

      expect(map.removeLayer).not.toHaveBeenCalled();
      expect(map.removeSource).not.toHaveBeenCalled();
    });
  });

  describe("setHeatmapOpacity", () => {
    it("calls setPaintProperty when layer exists", () => {
      const map = createMockMap({ hasLayer: true });
      setHeatmapOpacity(map as never, 0.5);

      expect(map.setPaintProperty).toHaveBeenCalledWith(HEATMAP_LAYER_ID, "heatmap-opacity", 0.5);
    });

    it("is safe when layer does not exist", () => {
      const map = createMockMap({ hasLayer: false });
      setHeatmapOpacity(map as never, 0.5);

      expect(map.setPaintProperty).not.toHaveBeenCalled();
    });
  });
});
