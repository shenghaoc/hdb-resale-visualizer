import { renderHook, waitFor } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useAmenityGeoSync } from "@/features/map-explorer/useAmenityGeoSync";

type EventHandler = (...args: unknown[]) => void;

function createMapStub() {
  const handlers = new Map<string, EventHandler[]>();
  const layers = new Set(["mrt-stations-points", "mrt-stations-labels", "mrt-exits-points"]);

  const stub = {
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    getSource: vi.fn(),
    setLayoutProperty: vi.fn(),
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
    getZoom: vi.fn(() => 10.2),
  };

  return stub as unknown as MapLibreMap & typeof stub;
}

describe("useAmenityGeoSync", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps enabled MRT station and exit layers layout-visible together", () => {
    const map = createMapStub();

    renderHook(() =>
      useAmenityGeoSync({
        map,
        mrtEnabled: true,
      }),
    );

    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "mrt-stations-points",
      "visibility",
      "visible",
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "mrt-stations-labels",
      "visibility",
      "visible",
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith("mrt-exits-points", "visibility", "visible");
    expect(map.getZoom).not.toHaveBeenCalled();
  });

  it("sets station and exit visibility to none when MRT is disabled", () => {
    const map = createMapStub();

    renderHook(() =>
      useAmenityGeoSync({
        map,
        mrtEnabled: false,
      }),
    );

    expect(map.setLayoutProperty).toHaveBeenCalledWith("mrt-stations-points", "visibility", "none");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("mrt-stations-labels", "visibility", "none");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("mrt-exits-points", "visibility", "none");
  });

  it("skips setLayoutProperty for layers not present in the map", () => {
    const map = createMapStub();
    map.getLayer = vi.fn(() => undefined);

    renderHook(() =>
      useAmenityGeoSync({
        map,
        mrtEnabled: true,
      }),
    );

    expect(map.setLayoutProperty).not.toHaveBeenCalled();
  });

  it("reports loading and a partial failure when only MRT exits fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith("/mrt-exits")) {
          return Promise.reject(new Error("Exit service unavailable"));
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [103.85, 1.29] },
                properties: { stationName: "City Hall" },
              },
            ],
          }),
        });
      }),
    );

    const { result } = renderHook(() =>
      useAmenityGeoSync({
        map: createMapStub(),
        mrtEnabled: true,
      }),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stationsFailed).toBe(false);
    expect(result.current.exitsFailed).toBe(true);
    expect(result.current.error).toBe("Exit service unavailable");
  });

  it("stops reporting loading when MRT is switched off mid-request and refetches when switched back on", () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const map = createMapStub();

    const { result, rerender } = renderHook(
      ({ mrtEnabled }) => useAmenityGeoSync({ map, mrtEnabled }),
      { initialProps: { mrtEnabled: true } },
    );

    expect(result.current.isLoading).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender({ mrtEnabled: false });
    expect(result.current.isLoading).toBe(false);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);

    rerender({ mrtEnabled: true });
    expect(result.current.isLoading).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("clears a failure and retries when MRT is switched off and on again", async () => {
    let stationAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith("/mrt-stations")) {
          stationAttempts += 1;
          if (stationAttempts === 1) {
            return Promise.reject(new Error("Station service unavailable"));
          }
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ type: "FeatureCollection", features: [] }),
        });
      }),
    );
    const map = createMapStub();

    const { result, rerender } = renderHook(
      ({ mrtEnabled }) => useAmenityGeoSync({ map, mrtEnabled }),
      { initialProps: { mrtEnabled: true } },
    );

    await waitFor(() => expect(result.current.stationsFailed).toBe(true));
    expect(result.current.error).toBe("Station service unavailable");

    rerender({ mrtEnabled: false });
    expect(result.current.stationsFailed).toBe(false);
    expect(result.current.isLoading).toBe(false);

    rerender({ mrtEnabled: true });
    await waitFor(() => expect(stationAttempts).toBe(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stationsFailed).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
