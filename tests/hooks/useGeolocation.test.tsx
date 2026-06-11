import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { useGeolocation } from "@/hooks/useGeolocation";
import type { Translator } from "@/shared/lib/i18n";

describe("useGeolocation", () => {
  const t = vi.fn((key: string) => key) as unknown as Translator;

  beforeEach(() => {
    vi.useFakeTimers();
    // @ts-expect-error - mock geolocation
    global.navigator.geolocation = {
      getCurrentPosition: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should initialize with null location and not locating", () => {
    const { result } = renderHook(() => useGeolocation({ t }));
    expect(result.current.userLocation).toBeNull();
    expect(result.current.isLocating).toBe(false);
    expect(result.current.geolocationError).toBeNull();
  });

  it("should set user location on success", () => {
    const { result } = renderHook(() => useGeolocation({ t }));
    const coords = { latitude: 1.23, longitude: 103.81 };

    (
      navigator.geolocation.getCurrentPosition as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(
      (success: (pos: { coords: { latitude: number; longitude: number } }) => void) => {
        success({ coords });
      },
    );

    const onSuccess = vi.fn();
    act(() => {
      result.current.locate(onSuccess);
    });

    expect(result.current.userLocation).toEqual({ lat: 1.23, lng: 103.81 });
    expect(result.current.isLocating).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith({ lat: 1.23, lng: 103.81 });
  });

  it("should handle geolocation error", () => {
    const { result } = renderHook(() => useGeolocation({ t }));

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    (
      navigator.geolocation.getCurrentPosition as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce((_success: unknown, error: () => void) => {
      error();
    });

    const onCannotLocate = vi.fn();
    act(() => {
      result.current.locate(vi.fn(), onCannotLocate);
    });

    expect(result.current.geolocationError).toBe("app.locationFailed");
    expect(result.current.isLocating).toBe(false);
    expect(onCannotLocate).toHaveBeenCalled();
  });

  it("should prevent multiple concurrent locate calls", () => {
    const { result } = renderHook(() => useGeolocation({ t }));
    let successCallback: (pos: { coords: { latitude: number; longitude: number } }) => void;

    (
      navigator.geolocation.getCurrentPosition as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce((success: typeof successCallback) => {
      successCallback = success;
    });

    act(() => {
      result.current.locate(vi.fn());
    });

    expect(result.current.isLocating).toBe(true);
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.locate(vi.fn());
    });

    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);

    act(() => {
      successCallback({ coords: { latitude: 1, longitude: 103 } });
    });

    expect(result.current.isLocating).toBe(false);
  });

  it("should cancel pending request and ignore its resolution", () => {
    const { result } = renderHook(() => useGeolocation({ t }));
    let successCallback: (pos: { coords: { latitude: number; longitude: number } }) => void;

    (
      navigator.geolocation.getCurrentPosition as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce((success: typeof successCallback) => {
      successCallback = success;
    });

    act(() => {
      result.current.locate(vi.fn());
    });

    expect(result.current.isLocating).toBe(true);

    act(() => {
      result.current.cancelPendingRequest();
    });

    expect(result.current.isLocating).toBe(false);

    act(() => {
      successCallback({ coords: { latitude: 1, longitude: 103 } });
    });

    // Should NOT update location because request was cancelled
    expect(result.current.userLocation).toBeNull();
  });
});
