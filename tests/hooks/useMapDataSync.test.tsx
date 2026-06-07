import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapDataSync } from "@/hooks/useMapDataSync";
import type { Map as MapLibreMap } from "maplibre-gl";

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
  layerOrder = ["primary-school-markers", "primary-school-labels", "selected-point"],
}: { styleLoaded?: boolean; hasBothSources?: boolean; layerOrder?: string[] } = {}) {
  const handlers = new Map<string, EventHandler[]>();
  const onceHandlers = new Map<string, EventHandler[]>();
  const currentLayerOrder = [...layerOrder];

  const blocksSetData = vi.fn();
  const schoolSetData = vi.fn();

  const stub = {
    isStyleLoaded: vi.fn(() => styleLoaded),
    getSource: vi.fn((id: string) => {
      // Return a fresh object each call to match MapLibre's behavior of
      // returning new source instances after style changes, enabling
      // identity-based change detection in hooks.
      if (id === "blocks" && hasBothSources) return { setData: blocksSetData };
      if (id === "primary-schools" && hasBothSources) return { setData: schoolSetData };
      return undefined;
    }),
    getLayer: vi.fn((id: string) => (currentLayerOrder.includes(id) ? {} : undefined)),
    getStyle: vi.fn(() => ({
      version: 8,
      sources: {},
      layers: currentLayerOrder.map((id) => ({ id })),
    })),
    setLayoutProperty: vi.fn(),
    getLayoutProperty: vi.fn(() => undefined),
    moveLayer: vi.fn((id: string, before?: string) => {
      const currentIndex = currentLayerOrder.indexOf(id);
      if (currentIndex === -1) return;
      currentLayerOrder.splice(currentIndex, 1);

      const nextIndex = before ? currentLayerOrder.indexOf(before) : -1;
      currentLayerOrder.splice(nextIndex >= 0 ? nextIndex : currentLayerOrder.length, 0, id);
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
    blocksSetData,
    schoolSetData,
    currentLayerOrder,
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
      useMapDataSync({ map: null, geoJson: EMPTY_GEOJSON }),
    );
  });

  it("calls setData on blocks source immediately when style is loaded", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON }),
    );

    expect(map.blocksSetData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("defers setData to load event when style is not yet loaded", () => {
    const map = createMapStub({ styleLoaded: false });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON }),
    );

    expect(map.blocksSetData).not.toHaveBeenCalled();

    (map.isStyleLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    map.emit("load");

    expect(map.blocksSetData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("calls setData again on styledata events", () => {
    const map = createMapStub({ styleLoaded: true });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON }),
    );

    map.emit("styledata");
    map.emit("styledata");

    // Once on mount + twice from styledata
    expect(map.blocksSetData).toHaveBeenCalledTimes(3);
  });

  it("does not call setData on blocks source when source does not exist", () => {
    const map = createMapStub({ styleLoaded: true, hasBothSources: false });

    renderHook(() =>
      useMapDataSync({ map, geoJson: POPULATED_GEOJSON }),
    );

    expect(map.blocksSetData).not.toHaveBeenCalled();
  });

  it("removes event listeners on unmount", () => {
    const map = createMapStub({ styleLoaded: true });

    const { unmount } = renderHook(() =>
      useMapDataSync({ map, geoJson: EMPTY_GEOJSON }),
    );

    unmount();

    expect(map.off).toHaveBeenCalledWith("load", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("styledata", expect.any(Function));
  });

  it("updates blocks source when geoJson prop changes", () => {
    const map = createMapStub({ styleLoaded: true });

    const { rerender } = renderHook(
      ({ geoJson }: { geoJson: GeoJSON.FeatureCollection }) =>
        useMapDataSync({ map, geoJson }),
      { initialProps: { geoJson: EMPTY_GEOJSON } },
    );

    expect(map.blocksSetData).toHaveBeenCalledWith(EMPTY_GEOJSON);

    rerender({ geoJson: POPULATED_GEOJSON });

    expect(map.blocksSetData).toHaveBeenCalledWith(POPULATED_GEOJSON);
  });

  it("syncs primary school overlay data and visibility", () => {
    const map = createMapStub({ styleLoaded: true });
    const schoolsGeoJson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.8, 1.3] },
          properties: { name: "TEST PRIMARY SCHOOL" },
        },
      ],
    };

    renderHook(() =>
      useMapDataSync({
        map,
        geoJson: EMPTY_GEOJSON,
        primarySchoolsGeoJson: schoolsGeoJson,
        schoolOverlayEnabled: true,
      }),
    );

    expect(map.schoolSetData).toHaveBeenCalledWith(schoolsGeoJson);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "primary-school-markers",
      "visibility",
      "visible",
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "primary-school-labels",
      "visibility",
      "visible",
    );
    expect(map.moveLayer).not.toHaveBeenCalled();
  });

  it("moves primary school layers only when they are out of order", () => {
    const map = createMapStub({
      styleLoaded: true,
      layerOrder: ["selected-point", "primary-school-labels", "primary-school-markers"],
    });
    const schoolsGeoJson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.8, 1.3] },
          properties: { name: "TEST PRIMARY SCHOOL" },
        },
      ],
    };

    renderHook(() =>
      useMapDataSync({
        map,
        geoJson: EMPTY_GEOJSON,
        primarySchoolsGeoJson: schoolsGeoJson,
        schoolOverlayEnabled: true,
      }),
    );

    expect(map.moveLayer).toHaveBeenCalledWith("primary-school-markers", "selected-point");
    expect(map.moveLayer).toHaveBeenCalledWith("primary-school-labels", "selected-point");
    expect(map.currentLayerOrder).toEqual([
      "primary-school-markers",
      "primary-school-labels",
      "selected-point",
    ]);

    (map.moveLayer as ReturnType<typeof vi.fn>).mockClear();
    map.emit("styledata");

    expect(map.moveLayer).not.toHaveBeenCalled();
  });
});
