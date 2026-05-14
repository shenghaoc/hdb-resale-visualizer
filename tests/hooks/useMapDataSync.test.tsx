import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapDataSync } from "@/hooks/useMapDataSync";
import type { Map as MapLibreMap } from "maplibre-gl";
import { HEATMAP_SOURCE_ID } from "@/lib/priceHeatmap";

type EventHandler = (...args: unknown[]) => void;

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const POPULATED_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.8, 1.3] },
      properties: {},
    },
  ],
};

function createMapStub({
  styleLoaded = true,
  hasBothSources = true,
}: { styleLoaded?: boolean; hasBothSources?: boolean } = {}) {
  const handlers = new Map<string, EventHandler[]>();
  const onceHandlers = new Map<string, EventHandler>();

  const blocksSource = { setData: vi.fn() };
  const heatmapSource = { setData: vi.fn() };

  const stub = {
    isStyleLoaded: vi.fn(() => styleLoaded),
    getSource: vi.fn((id: string) => {
      if (id === "blocks" && hasBothSources) return blocksSource;
      if (id === HEATMAP_SOURCE_ID && hasBothSources) return heatmapSource;
      return undefined;
    }),
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    off: vi.fn((event: string, handler: EventHandler) => {
      const list = handlers.get(event) ?? [];
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }),
    once: vi.fn((event: string, handler: EventHandler) => {
      onceHandlers.set(event, handler);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const h of handlers.get(event) ?? []) h(...args);
      const onceH = onceHandlers.get(event);
      if (onceH) {
        onceHandlers.delete(event);
        onceH(...args);
      }
    },
    blocksSource,
    heatmapSource,
    _handlers: handlers,
  };

  return stub as unknown as MapLibreMap & typeof stub;
}

describe("useMapDataSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when map is null", () => {
    // Should not throw
    renderHook(() =>
      useMapDataSync({ map: null, geoJson: EMPTY_GEOJSON, priceHeatmapEnabled: false }),
    );
  });

  it("calls setData on blocks source immediately when style is loaded", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON, priceHeatmapEnabled: false }),
    );

    expect(map.blocksSource.setData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("defers setData to load event when style is not yet loaded", () => {
    const map = createMapStub({ styleLoaded: false });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON, priceHeatmapEnabled: false }),
    );

    expect(map.blocksSource.setData).not.toHaveBeenCalled();

    (map.isStyleLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    map.emit("load");

    expect(map.blocksSource.setData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("calls setData again on styledata events", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON, priceHeatmapEnabled: false }),
    );

    map.emit("styledata");
    map.emit("styledata");

    // Once on mount + twice from styledata
    expect(map.blocksSource.setData).toHaveBeenCalledTimes(3);
  });

  it("does not call setData on blocks source when source does not exist", () => {
    const map = createMapStub({ styleLoaded: true, hasBothSources: false });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON, priceHeatmapEnabled: false }),
    );

    expect(map.blocksSource.setData).not.toHaveBeenCalled();
  });

  it("removes event listeners on unmount", () => {
    const map = createMapStub({ styleLoaded: true });

    const { unmount } = renderHook(() =>
      useMapDataSync({ map, geoJson: EMPTY_GEOJSON, priceHeatmapEnabled: false }),
    );

    unmount();

    expect(map.off).toHaveBeenCalledWith("load", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("styledata", expect.any(Function));
  });

  it("syncs heatmap source when priceHeatmapEnabled is true", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON, priceHeatmapEnabled: true }),
    );

    expect(map.heatmapSource.setData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("does not sync heatmap source when priceHeatmapEnabled is false", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON, priceHeatmapEnabled: false }),
    );

    expect(map.heatmapSource.setData).not.toHaveBeenCalled();
  });

  it("updates blocks source when geoJson prop changes", () => {
    const map = createMapStub({ styleLoaded: true });

    const { rerender } = renderHook(
      ({ geoJson }: { geoJson: GeoJSON.FeatureCollection }) =>
        useMapDataSync({ map, geoJson, priceHeatmapEnabled: false }),
      { initialProps: { geoJson: EMPTY_GEOJSON } },
    );

    expect(map.blocksSource.setData).toHaveBeenCalledWith(EMPTY_GEOJSON);

    rerender({ geoJson: POPULATED_GEOJSON });

    expect(map.blocksSource.setData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("removes heatmap listeners when priceHeatmapEnabled switches to false", () => {
    const map = createMapStub({ styleLoaded: true });

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useMapDataSync({ map, geoJson: EMPTY_GEOJSON, priceHeatmapEnabled: enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });

    // off should have been called for the heatmap effect cleanup
    expect(map.off).toHaveBeenCalled();
  });
});
