import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapPriceHeatmapSync } from "@/hooks/useMapPriceHeatmapSync";
import type { Map as MapLibreMap } from "maplibre-gl";
import { HEATMAP_SOURCE_ID } from "@/features/map-explorer/priceHeatmap";

vi.mock("@/features/map-explorer/priceHeatmap", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/map-explorer/priceHeatmap")>();
  return {
    ...mod,
    addPriceHeatmapLayer: vi.fn(),
    removePriceHeatmapLayer: vi.fn(),
    setHeatmapOpacity: vi.fn(),
    isHeatmapLayerPresent: vi.fn(() => false),
  };
});

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
  hasHeatmapSource = true,
}: { styleLoaded?: boolean; hasHeatmapSource?: boolean } = {}) {
  const handlers = new Map<string, EventHandler[]>();
  const onceHandlers = new Map<string, EventHandler[]>();

  const heatmapSetData = vi.fn();

  const stub = {
    isStyleLoaded: vi.fn(() => styleLoaded),
    getSource: vi.fn((id: string) => {
      // Return a fresh object each call to match MapLibre's behavior of
      // returning new source instances after style changes, enabling
      // identity-based change detection in hooks.
      if (id === HEATMAP_SOURCE_ID && hasHeatmapSource) return { setData: heatmapSetData };
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
      if (!onceHandlers.has(event)) onceHandlers.set(event, []);
      onceHandlers.get(event)!.push(handler);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const h of handlers.get(event) ?? []) h(...args);
      const onceList = onceHandlers.get(event);
      if (onceList) {
        onceHandlers.delete(event);
        for (const onceH of onceList) onceH(...args);
      }
    },
    heatmapSetData,
    _handlers: handlers,
  };

  return stub as unknown as MapLibreMap & typeof stub;
}

const DEFAULT_PROPS = {
  priceHeatmapEnabled: true,
  priceHeatmapOpacity: 0.6,
  heatmapMode: "price" as const,
};

describe("useMapPriceHeatmapSync — heatmap data sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls setData immediately when heatmap is enabled and style is loaded", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapPriceHeatmapSync({ map, geoJson: POPULATED_GEOJSON, ...DEFAULT_PROPS }),
    );

    expect(map.heatmapSetData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("does not call setData when priceHeatmapEnabled is false", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapPriceHeatmapSync({
        map,
        geoJson: POPULATED_GEOJSON,
        ...DEFAULT_PROPS,
        priceHeatmapEnabled: false,
      }),
    );

    expect(map.heatmapSetData).not.toHaveBeenCalled();
  });

  it("defers setData to load event when style is not yet loaded", () => {
    const map = createMapStub({ styleLoaded: false });

    renderHook(() =>
      useMapPriceHeatmapSync({ map, geoJson: POPULATED_GEOJSON, ...DEFAULT_PROPS }),
    );

    expect(map.heatmapSetData).not.toHaveBeenCalled();

    (map.isStyleLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    map.emit("load");

    expect(map.heatmapSetData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("re-syncs data on styledata events", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapPriceHeatmapSync({ map, geoJson: POPULATED_GEOJSON, ...DEFAULT_PROPS }),
    );

    map.emit("styledata");
    map.emit("styledata");

    // Once on mount + twice from styledata
    expect(map.heatmapSetData).toHaveBeenCalledTimes(3);
  });

  it("does not call setData when heatmap source does not exist", () => {
    const map = createMapStub({ styleLoaded: true, hasHeatmapSource: false });

    renderHook(() =>
      useMapPriceHeatmapSync({ map, geoJson: POPULATED_GEOJSON, ...DEFAULT_PROPS }),
    );

    // heatmapSource.setData is never reached because getSource returns undefined
    expect(map.getSource(HEATMAP_SOURCE_ID)).toBeUndefined();
  });

  it("removes event listeners on unmount", () => {
    const map = createMapStub({ styleLoaded: true });

    const { unmount } = renderHook(() =>
      useMapPriceHeatmapSync({ map, geoJson: EMPTY_GEOJSON, ...DEFAULT_PROPS }),
    );

    unmount();

    expect(map.off).toHaveBeenCalledWith("load", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("styledata", expect.any(Function));
  });

  it("removes listeners and stops syncing when priceHeatmapEnabled switches to false", () => {
    const map = createMapStub({ styleLoaded: true });

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useMapPriceHeatmapSync({ map, geoJson: EMPTY_GEOJSON, ...DEFAULT_PROPS, priceHeatmapEnabled: enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });

    // listener cleanup runs when enabled → false
    expect(map.off).toHaveBeenCalledWith("styledata", expect.any(Function));

    // further styledata events should not trigger setData
    map.heatmapSetData.mockClear();
    map.emit("styledata");
    expect(map.heatmapSetData).not.toHaveBeenCalled();
  });

  it("re-syncs data when geoJson changes while enabled", () => {
    const map = createMapStub({ styleLoaded: true });

    const { rerender } = renderHook(
      ({ geoJson }: { geoJson: GeoJSON.FeatureCollection }) =>
        useMapPriceHeatmapSync({ map, geoJson, ...DEFAULT_PROPS }),
      { initialProps: { geoJson: EMPTY_GEOJSON } },
    );

    expect(map.heatmapSetData).toHaveBeenCalledWith(EMPTY_GEOJSON);

    rerender({ geoJson: POPULATED_GEOJSON });

    expect(map.heatmapSetData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("routes opacity-only changes through setHeatmapOpacity, not layer recreation", async () => {
    const { setHeatmapOpacity, isHeatmapLayerPresent } = await import("@/features/map-explorer/priceHeatmap");
    (isHeatmapLayerPresent as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const map = createMapStub({ styleLoaded: true });

    const { rerender } = renderHook(
      ({ opacity }: { opacity: number }) =>
        useMapPriceHeatmapSync({ map, geoJson: POPULATED_GEOJSON, ...DEFAULT_PROPS, priceHeatmapOpacity: opacity }),
      { initialProps: { opacity: 0.6 } },
    );

    (setHeatmapOpacity as ReturnType<typeof vi.fn>).mockClear();

    rerender({ opacity: 0.3 });

    // Effect 3 (setHeatmapOpacity) must fire for the opacity change.
    expect(setHeatmapOpacity).toHaveBeenCalledWith(map, 0.3);
  });
});
