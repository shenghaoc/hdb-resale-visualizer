import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale, Translator } from "@/lib/i18n";
import { useMapInteractions } from "@/hooks/useMapInteractions";
import { useMapLayers } from "@/hooks/useMapLayers";
import type { Map as MapLibreMap, Popup } from "maplibre-gl";

type LoadHandler = () => void;
type RegisteredHandlers = {
  mapClick?: (event: { point: { x: number; y: number } }) => void;
};

function createComposableMapStub() {
  let styleLoaded = false;
  const onceHandlers = new Map<string, LoadHandler>();
  const existingLayers = new Set<string>();
  const handlers: RegisteredHandlers = {};

  const mapStub = {
    on: vi.fn(
      (
        eventName: string,
        layerOrHandler: string | ((event: unknown) => void),
        maybeHandler?: (event: unknown) => void,
      ) => {
        if (eventName === "click" && typeof layerOrHandler !== "string") {
          handlers.mapClick = layerOrHandler as (event: { point: { x: number; y: number } }) => void;
        }
        if (eventName === "click" && typeof layerOrHandler === "string" && maybeHandler) {
          return mapStub;
        }
        return mapStub;
      },
    ),
    off: vi.fn(),
    once: vi.fn((eventName: string, handler: () => void) => {
      onceHandlers.set(eventName, handler);
      return mapStub;
    }),
    isStyleLoaded: vi.fn(() => styleLoaded),
    addSource: vi.fn(),
    addLayer: vi.fn((layer: { id: string }) => {
      existingLayers.add(layer.id);
      return mapStub;
    }),
    getLayer: vi.fn((layerId: string) => (existingLayers.has(layerId) ? { id: layerId } : undefined)),
    queryRenderedFeatures: vi.fn(() => []),
    getCanvas: vi.fn(() => ({ style: { cursor: "" } })),
    getSource: vi.fn(() => undefined),
    easeTo: vi.fn(),
    getZoom: vi.fn(() => 11),
  };

  return {
    map: mapStub as unknown as MapLibreMap,
    queryRenderedFeatures: mapStub.queryRenderedFeatures,
    mapClickHandler: () => handlers.mapClick,
    triggerLoad: () => {
      styleLoaded = true;
      const loadHandler = onceHandlers.get("load");
      loadHandler?.();
      onceHandlers.delete("load");
    },
    hasLayer: (layerId: string) => existingLayers.has(layerId),
  };
}

function createPopupStub(): Popup {
  const popupChain = {
    setLngLat: vi.fn(),
    setDOMContent: vi.fn(),
    addTo: vi.fn(),
    remove: vi.fn(),
  };
  popupChain.setLngLat.mockReturnValue(popupChain);
  popupChain.setDOMContent.mockReturnValue(popupChain);
  popupChain.addTo.mockReturnValue(popupChain);
  return popupChain as unknown as Popup;
}

const locale: Locale = "en-SG";
const t: Translator = (key) => key;

describe("map interaction flow integration", () => {
  const onSelect = vi.fn();
  const onMapInteract = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guards map click queries before layers load, then restores normal background-click behavior", () => {
    const mapStub = createComposableMapStub();

    renderHook(() => {
      useMapLayers(mapStub.map);
      useMapInteractions({
        map: mapStub.map,
        popup: createPopupStub(),
        onSelect,
        onMapInteract,
        t,
        locale,
        prefersReducedMotion: false,
      });
    });

    const clickHandler = mapStub.mapClickHandler();
    expect(clickHandler).toBeDefined();

    clickHandler?.({ point: { x: 4, y: 5 } });
    expect(mapStub.queryRenderedFeatures).not.toHaveBeenCalled();
    expect(onMapInteract).not.toHaveBeenCalled();

    act(() => {
      mapStub.triggerLoad();
    });

    expect(mapStub.hasLayer("unclustered-point")).toBe(true);
    expect(mapStub.hasLayer("clusters")).toBe(true);

    mapStub.queryRenderedFeatures.mockReturnValueOnce([]);
    clickHandler?.({ point: { x: 7, y: 8 } });
    expect(onMapInteract).toHaveBeenCalledWith("background");

    mapStub.queryRenderedFeatures.mockReturnValueOnce([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [103.8, 1.33] },
        properties: { address_key: "bedok-101-bedok-nth-ave-4" },
      },
    ]);
    clickHandler?.({ point: { x: 9, y: 10 } });

    const backgroundCalls = onMapInteract.mock.calls.filter(([arg]) => arg === "background");
    expect(backgroundCalls).toHaveLength(1);
  });
});
