import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Point } from "geojson";
import type { Locale, Translator } from "@/shared/lib/i18n";
import { useMapInteractions } from "@/hooks/useMapInteractions";
import type { Map as MapLibreMap, Popup } from "maplibre-gl";

type RegisteredHandlers = {
  mapClick?: (event: { point: { x: number; y: number } }) => void;
  clusterClick?: (event: {
    features?: Array<{
      geometry: Point;
      properties: { cluster_id: number };
    }>;
  }) => void;
};

function createMapStub() {
  const existingLayers = new Set<string>();
  const handlers: RegisteredHandlers = {};
  const container = document.createElement("div");
  document.body.appendChild(container);
  let resolveClusterZoom: (zoom: number) => void = () => undefined;
  const clusterZoomPromise = new Promise<number>((resolve) => {
    resolveClusterZoom = resolve;
  });
  const clusterSource = {
    getClusterExpansionZoom: vi.fn(() => clusterZoomPromise),
  };

  const mapStub = {
    on: vi.fn(
      (
        eventName: string,
        layerOrHandler: string | ((event: unknown) => void),
        maybeHandler?: (event: unknown) => void,
      ) => {
        if (eventName === "click" && typeof layerOrHandler !== "string") {
          handlers.mapClick = layerOrHandler as (event: {
            point: { x: number; y: number };
          }) => void;
        }
        if (eventName === "click" && layerOrHandler === "clusters" && maybeHandler) {
          handlers.clusterClick = maybeHandler as RegisteredHandlers["clusterClick"];
        }
        if (eventName === "click" && typeof layerOrHandler === "string" && maybeHandler) {
          return mapStub;
        }
        return mapStub;
      },
    ),
    off: vi.fn(),
    getLayer: vi.fn((layerId: string) =>
      existingLayers.has(layerId) ? { id: layerId } : undefined,
    ),
    queryRenderedFeatures: vi.fn<() => unknown[]>(() => []),
    getCanvas: vi.fn(() => ({ style: { cursor: "" } })),
    getContainer: vi.fn(() => container),
    getSource: vi.fn((sourceId: string) => (sourceId === "blocks" ? clusterSource : undefined)),
    easeTo: vi.fn(),
    getZoom: vi.fn(() => 11),
  };

  const setLayers = (layerIds: string[]) => {
    existingLayers.clear();
    for (const layerId of layerIds) {
      existingLayers.add(layerId);
    }
  };

  return {
    map: mapStub as unknown as MapLibreMap,
    queryRenderedFeatures: mapStub.queryRenderedFeatures,
    easeTo: mapStub.easeTo,
    mapClickHandler: () => handlers.mapClick,
    clusterClickHandler: () => handlers.clusterClick,
    resolveClusterZoom,
    setLayers,
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

describe("useMapInteractions map click guard", () => {
  const onSelect = vi.fn();
  const onMapInteract = vi.fn();

  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it("does not query features or dispatch background interaction before target layers exist", () => {
    const mapStub = createMapStub();
    mapStub.setLayers([]);

    renderHook(() =>
      useMapInteractions({
        map: mapStub.map,
        popup: createPopupStub(),
        onSelect,
        onMapInteract,
        t,
        locale,
        prefersReducedMotion: false,
      }),
    );

    const clickHandler = mapStub.mapClickHandler();
    expect(clickHandler).toBeDefined();
    clickHandler?.({ point: { x: 10, y: 10 } });

    expect(mapStub.queryRenderedFeatures).not.toHaveBeenCalled();
    expect(onMapInteract).not.toHaveBeenCalled();
  });

  it("dispatches background interaction after layers exist and no feature is hit", () => {
    const mapStub = createMapStub();
    mapStub.setLayers(["unclustered-point", "clusters"]);
    mapStub.queryRenderedFeatures.mockReturnValue([]);

    renderHook(() =>
      useMapInteractions({
        map: mapStub.map,
        popup: createPopupStub(),
        onSelect,
        onMapInteract,
        t,
        locale,
        prefersReducedMotion: false,
      }),
    );

    const clickHandler = mapStub.mapClickHandler();
    clickHandler?.({ point: { x: 11, y: 12 } });

    expect(mapStub.queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(onMapInteract).toHaveBeenCalledWith("background");
  });

  it("does not dispatch background interaction when a feature is hit", () => {
    const mapStub = createMapStub();
    mapStub.setLayers(["unclustered-point", "clusters"]);
    mapStub.queryRenderedFeatures.mockReturnValue([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [103.8, 1.33] },
        properties: { address_key: "bedok-101-bedok-nth-ave-4" },
      },
    ]);

    renderHook(() =>
      useMapInteractions({
        map: mapStub.map,
        popup: createPopupStub(),
        onSelect,
        onMapInteract,
        t,
        locale,
        prefersReducedMotion: false,
      }),
    );

    const clickHandler = mapStub.mapClickHandler();
    clickHandler?.({ point: { x: 18, y: 19 } });

    expect(mapStub.queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(onMapInteract).not.toHaveBeenCalledWith("background");
  });

  it("does not animate pending cluster expansion after cleanup", async () => {
    const mapStub = createMapStub();
    const { unmount } = renderHook(() =>
      useMapInteractions({
        map: mapStub.map,
        popup: createPopupStub(),
        onSelect,
        onMapInteract,
        t,
        locale,
        prefersReducedMotion: true,
      }),
    );

    mapStub.clusterClickHandler()?.({
      features: [
        {
          geometry: { type: "Point", coordinates: [103.8, 1.33] },
          properties: { cluster_id: 42 },
        },
      ],
    });
    unmount();

    await act(async () => {
      mapStub.resolveClusterZoom(14);
      await Promise.resolve();
    });

    expect(mapStub.easeTo).not.toHaveBeenCalled();
  });
});
