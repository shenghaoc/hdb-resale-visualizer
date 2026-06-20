import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { FeatureCollection } from "geojson";
import { useMap3dColumnsSync } from "@/hooks/useMap3dColumnsSync";
import type { Map as MapLibreMap } from "maplibre-gl";
import { COLUMNS_3D_PITCH, COLUMNS_3D_SOURCE_ID } from "@/features/map-explorer/map3dColumns";

type EventHandler = (...args: unknown[]) => void;

const POPULATED_GEOJSON: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.8, 1.3] },
      properties: { median_price: 500_000, price_per_sqm_median: 6000 },
    },
  ],
};

function createMapStub({
  styleLoaded = true,
  hasColumnsSource = true,
  hasLayer = false,
  pitch = 0,
}: {
  styleLoaded?: boolean;
  hasColumnsSource?: boolean;
  hasLayer?: boolean;
  pitch?: number;
} = {}) {
  const handlers = new Map<string, EventHandler[]>();
  const setData = vi.fn();
  let layerPresent = hasLayer;

  const stub = {
    isStyleLoaded: vi.fn(() => styleLoaded),
    getSource: vi.fn(() => (hasColumnsSource ? { setData } : undefined)),
    getLayer: vi.fn(() => (layerPresent ? { id: "layer" } : undefined)),
    addSource: vi.fn(),
    addLayer: vi.fn(() => {
      layerPresent = true;
    }),
    removeLayer: vi.fn(() => {
      layerPresent = false;
    }),
    removeSource: vi.fn(),
    setPaintProperty: vi.fn(),
    getPitch: vi.fn(() => pitch),
    easeTo: vi.fn(),
    dragRotate: { enable: vi.fn(), disable: vi.fn() },
    touchZoomRotate: { enableRotation: vi.fn(), disableRotation: vi.fn() },
    touchPitch: { enable: vi.fn(), disable: vi.fn() },
    keyboard: { enableRotation: vi.fn(), disableRotation: vi.fn() },
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    off: vi.fn((event: string, handler: EventHandler) => {
      const list = handlers.get(event) ?? [];
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }),
    once: vi.fn(),
    setData,
  };

  return stub as unknown as MapLibreMap & typeof stub;
}

const DEFAULTS = { mode: "price" as const, prefersReducedMotion: false };

describe("useMap3dColumnsSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the extrusion layer and tilts the camera when enabled", () => {
    const map = createMapStub();

    renderHook(() =>
      useMap3dColumnsSync({ map, geoJson: POPULATED_GEOJSON, enabled: true, ...DEFAULTS }),
    );

    expect(map.addLayer).toHaveBeenCalled();
    expect(map.dragRotate.enable).toHaveBeenCalled();
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: COLUMNS_3D_PITCH }));
  });

  it("does not add a layer or tilt when disabled, and locks rotation back down", () => {
    const map = createMapStub();

    renderHook(() =>
      useMap3dColumnsSync({ map, geoJson: POPULATED_GEOJSON, enabled: false, ...DEFAULTS }),
    );

    expect(map.addLayer).not.toHaveBeenCalled();
    expect(map.dragRotate.disable).toHaveBeenCalled();
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 0, bearing: 0 }));
  });

  it("removes the layer when toggled off", () => {
    const map = createMapStub({ hasLayer: true });

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useMap3dColumnsSync({ map, geoJson: POPULATED_GEOJSON, enabled, ...DEFAULTS }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });

    expect(map.removeLayer).toHaveBeenCalled();
  });

  it("updates paint properties (not geometry) when only the mode changes", () => {
    const map = createMapStub({ hasLayer: true });

    const { rerender } = renderHook(
      ({ mode }: { mode: "price" | "perSqm" }) =>
        useMap3dColumnsSync({
          map,
          geoJson: POPULATED_GEOJSON,
          enabled: true,
          mode,
          prefersReducedMotion: false,
        }),
      { initialProps: { mode: "price" as "price" | "perSqm" } },
    );

    map.addLayer.mockClear();
    rerender({ mode: "perSqm" });

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      expect.any(String),
      "fill-extrusion-height",
      expect.anything(),
    );
    expect(map.addLayer).not.toHaveBeenCalled();
  });

  it("syncs polygon data into the source when geoJson changes while enabled", () => {
    const map = createMapStub();

    const { rerender } = renderHook(
      ({ geoJson }: { geoJson: FeatureCollection }) =>
        useMap3dColumnsSync({ map, geoJson, enabled: true, ...DEFAULTS }),
      {
        initialProps: { geoJson: { type: "FeatureCollection", features: [] } as FeatureCollection },
      },
    );

    map.setData.mockClear();
    rerender({ geoJson: POPULATED_GEOJSON });

    expect(map.setData).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FeatureCollection" }),
    );
  });

  it("uses an instant camera move when reduced motion is preferred", () => {
    const map = createMapStub();

    renderHook(() =>
      useMap3dColumnsSync({
        map,
        geoJson: POPULATED_GEOJSON,
        enabled: true,
        mode: "price",
        prefersReducedMotion: true,
      }),
    );

    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 }));
  });

  it("targets the dedicated 3D source id", () => {
    const map = createMapStub();
    renderHook(() =>
      useMap3dColumnsSync({ map, geoJson: POPULATED_GEOJSON, enabled: true, ...DEFAULTS }),
    );
    expect(map.getSource).toHaveBeenCalledWith(COLUMNS_3D_SOURCE_ID);
  });
});
