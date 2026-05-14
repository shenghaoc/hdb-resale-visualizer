import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapLayers } from "@/hooks/useMapLayers";
import type { Map as MapLibreMap } from "maplibre-gl";

type EventHandler = (...args: unknown[]) => void;

function createMapStub({ styleLoaded = true, blocksSourceExists = false } = {}) {
  const handlers = new Map<string, EventHandler[]>();
  const onceHandlers = new Map<string, EventHandler>();

  const stub = {
    isStyleLoaded: vi.fn(() => styleLoaded),
    getSource: vi.fn((id: string) => (id === "blocks" && blocksSourceExists ? {} : undefined)),
    addSource: vi.fn(),
    addLayer: vi.fn(),
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
    // Helper: trigger a registered event
    emit(event: string, ...args: unknown[]) {
      for (const h of handlers.get(event) ?? []) h(...args);
      const onceH = onceHandlers.get(event);
      if (onceH) {
        onceHandlers.delete(event);
        onceH(...args);
      }
    },
    _handlers: handlers,
    _onceHandlers: onceHandlers,
  };

  return stub as unknown as MapLibreMap & typeof stub;
}

const EXPECTED_SOURCES = ["radius", "blocks"];
const EXPECTED_LAYERS = [
  "radius-fill",
  "radius-outline",
  "clusters",
  "cluster-count",
  "unclustered-point",
  "selected-point",
  "selected-point-label",
];

describe("useMapLayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when map is null", () => {
    renderHook(() => useMapLayers(null));
    // No errors thrown, nothing to assert
  });

  it("adds all sources and layers when style is already loaded", () => {
    const map = createMapStub({ styleLoaded: true });
    renderHook(() => useMapLayers(map));

    const addedSourceIds = map.addSource.mock.calls.map((c) => c[0]);
    expect(addedSourceIds).toEqual(expect.arrayContaining(EXPECTED_SOURCES));

    const addedLayerIds = map.addLayer.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(addedLayerIds).toEqual(expect.arrayContaining(EXPECTED_LAYERS));
    expect(addedLayerIds).toHaveLength(EXPECTED_LAYERS.length);
  });

  it("registers styledata listener and adds layers when it fires", () => {
    const map = createMapStub({ styleLoaded: false });
    renderHook(() => useMapLayers(map));

    // Before styledata fires, layers should not have been added
    expect(map.addSource).not.toHaveBeenCalled();

    // Simulate style becoming loaded then firing styledata
    (map.isStyleLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    map.emit("styledata");

    const addedSourceIds = map.addSource.mock.calls.map((c) => c[0]);
    expect(addedSourceIds).toEqual(expect.arrayContaining(EXPECTED_SOURCES));
  });

  it("registers once('load') listener when style not loaded, and adds layers on load", () => {
    const map = createMapStub({ styleLoaded: false });
    renderHook(() => useMapLayers(map));

    expect(map.once).toHaveBeenCalledWith("load", expect.any(Function));
    expect(map.addSource).not.toHaveBeenCalled();

    // Simulate load event
    (map.isStyleLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    map.emit("load");

    const addedSourceIds = map.addSource.mock.calls.map((c) => c[0]);
    expect(addedSourceIds).toEqual(expect.arrayContaining(EXPECTED_SOURCES));
  });

  it("skips layer setup when blocks source already exists (idempotency guard)", () => {
    const map = createMapStub({ styleLoaded: true, blocksSourceExists: true });
    renderHook(() => useMapLayers(map));

    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
  });

  it("removes styledata listener on unmount", () => {
    const map = createMapStub({ styleLoaded: true });
    const { unmount } = renderHook(() => useMapLayers(map));

    unmount();

    expect(map.off).toHaveBeenCalledWith("styledata", expect.any(Function));
  });

  it("removes load listener on unmount", () => {
    const map = createMapStub({ styleLoaded: false });
    const { unmount } = renderHook(() => useMapLayers(map));

    unmount();

    expect(map.off).toHaveBeenCalledWith("load", expect.any(Function));
  });

  it("does not add layers on styledata if blocks source exists from a prior styledata", () => {
    const map = createMapStub({ styleLoaded: false });
    renderHook(() => useMapLayers(map));

    // First styledata — style loaded, blocks source does not yet exist
    (map.isStyleLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    map.emit("styledata");

    const firstAddSourceCount = map.addSource.mock.calls.length;
    expect(firstAddSourceCount).toBeGreaterThan(0);

    // Second styledata — blocks source now "exists"
    (map.getSource as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === "blocks" ? {} : undefined,
    );
    map.emit("styledata");

    // No additional addSource calls
    expect(map.addSource.mock.calls.length).toBe(firstAddSourceCount);
  });

  it("configures blocks source with clustering enabled", () => {
    const map = createMapStub({ styleLoaded: true });
    renderHook(() => useMapLayers(map));

    const blocksSourceCall = map.addSource.mock.calls.find((c) => c[0] === "blocks");
    expect(blocksSourceCall).toBeDefined();
    const blocksSourceSpec = blocksSourceCall![1] as { cluster: boolean; clusterRadius: number };
    expect(blocksSourceSpec.cluster).toBe(true);
    expect(blocksSourceSpec.clusterRadius).toBeGreaterThan(0);
  });

  it("configures selected-point layer with address_key filter", () => {
    const map = createMapStub({ styleLoaded: true });
    renderHook(() => useMapLayers(map));

    const selectedLayerCall = map.addLayer.mock.calls.find(
      (c) => (c[0] as { id: string }).id === "selected-point",
    );
    expect(selectedLayerCall).toBeDefined();
    const spec = selectedLayerCall![0] as { filter: unknown[] };
    expect(spec.filter).toEqual(["==", ["get", "address_key"], ""]);
  });
});
