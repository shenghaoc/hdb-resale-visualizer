import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MAP_GLYPHS_URL } from "@/shared/lib/constants";
import { useMapInitialization } from "@/hooks/useMapInitialization";

const maplibreMocks = vi.hoisted(() => {
  const mapFactory = vi.fn();
  const geolocateOn = vi.fn();

  return {
    mapFactory,
    mapConstructor: vi.fn(function Map(...args: unknown[]) {
      return mapFactory(...args);
    }),
    navigationControlConstructor: vi.fn(function NavigationControl() {
      return {};
    }),
    geolocateControlConstructor: vi.fn(function GeolocateControl() {
      return {
        on: geolocateOn,
      };
    }),
    geolocateOn,
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: maplibreMocks.mapConstructor,
    NavigationControl: maplibreMocks.navigationControlConstructor,
    GeolocateControl: maplibreMocks.geolocateControlConstructor,
  },
}));

function createContainerRef() {
  return { current: document.createElement("div") };
}

function createMapStub() {
  return {
    addControl: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    doubleClickZoom: {
      disable: vi.fn(),
    },
    remove: vi.fn(),
  };
}

describe("useMapInitialization", () => {
  let mapStub: ReturnType<typeof createMapStub>;

  beforeEach(() => {
    vi.clearAllMocks();
    mapStub = createMapStub();
    maplibreMocks.mapFactory.mockImplementation(() => mapStub);
  });

  it("initializes MapLibre with configured glyphs and controls", async () => {
    const onGeolocate = vi.fn();
    const containerRef = createContainerRef();

    const { result, unmount } = renderHook(() =>
      useMapInitialization({
        containerRef,
        isDarkMode: false,
        onGeolocate,
      }),
    );

    await waitFor(() => expect(result.current.mapInstance).toBe(mapStub));

    expect(result.current.mapError).toBeNull();
    expect(maplibreMocks.mapConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        container: containerRef.current,
        style: expect.objectContaining({
          glyphs: MAP_GLYPHS_URL,
        }),
      }),
    );
    expect(maplibreMocks.navigationControlConstructor).toHaveBeenCalledTimes(1);
    expect(maplibreMocks.geolocateControlConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        positionOptions: { enableHighAccuracy: true },
      }),
    );
    expect(mapStub.addControl).toHaveBeenCalledTimes(2);
    expect(mapStub.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(mapStub.doubleClickZoom.disable).toHaveBeenCalledTimes(1);

    const geolocateHandler = maplibreMocks.geolocateOn.mock.calls.find(
      ([event]) => event === "geolocate",
    )?.[1];
    expect(geolocateHandler).toBeDefined();
    geolocateHandler?.({
      coords: {
        latitude: 1.31,
        longitude: 103.85,
      },
    } as GeolocationPosition);

    expect(onGeolocate).toHaveBeenCalledWith({ lat: 1.31, lng: 103.85 });

    unmount();

    expect(mapStub.off).toHaveBeenCalledWith("error", expect.any(Function));
    expect(mapStub.remove).toHaveBeenCalledTimes(1);
  });

  it("reports MapLibre construction failures instead of throwing", async () => {
    const containerRef = createContainerRef();
    maplibreMocks.mapFactory.mockImplementationOnce(() => {
      throw new Error("Failed to initialize WebGL");
    });

    const { result } = renderHook(() =>
      useMapInitialization({
        containerRef,
        isDarkMode: false,
      }),
    );

    await waitFor(() => expect(result.current.mapError).toBe("Failed to initialize WebGL"));

    expect(result.current.mapInstance).toBeNull();
    expect(maplibreMocks.mapConstructor).toHaveBeenCalledTimes(1);
    expect(mapStub.addControl).not.toHaveBeenCalled();
  });

  it("falls back when MapLibre emits a fatal renderer error after construction", async () => {
    const containerRef = createContainerRef();

    const { result } = renderHook(() =>
      useMapInitialization({
        containerRef,
        isDarkMode: false,
      }),
    );

    await waitFor(() => expect(result.current.mapInstance).toBe(mapStub));

    const errorHandler = mapStub.on.mock.calls.find(([event]) => event === "error")?.[1];
    expect(errorHandler).toBeDefined();

    act(() => {
      errorHandler?.({ error: new Error("Could not compile fragment shader") });
    });

    await waitFor(() => expect(result.current.mapError).toBe("Could not compile fragment shader"));

    expect(result.current.mapInstance).toBeNull();
    expect(mapStub.off).toHaveBeenCalledWith("error", errorHandler);
    expect(mapStub.remove).toHaveBeenCalledTimes(1);
  });

  it("keeps the map active for non-fatal MapLibre resource errors", async () => {
    const containerRef = createContainerRef();

    const { result } = renderHook(() =>
      useMapInitialization({
        containerRef,
        isDarkMode: false,
      }),
    );

    await waitFor(() => expect(result.current.mapInstance).toBe(mapStub));

    const errorHandler = mapStub.on.mock.calls.find(([event]) => event === "error")?.[1];
    expect(errorHandler).toBeDefined();

    act(() => {
      errorHandler?.({ error: new Error("Failed to fetch glyph range") });
    });

    expect(result.current.mapInstance).toBe(mapStub);
    expect(result.current.mapError).toBeNull();
    expect(mapStub.remove).not.toHaveBeenCalled();
  });
});
