import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapFitBounds } from "@/hooks/useMapFitBounds";
import { SINGAPORE_BOUNDS } from "@/shared/lib/constants";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { BlockSummary } from "@/types/data";

function createMapStub() {
  return {
    fitBounds: vi.fn(),
  } as unknown as MapLibreMap & { fitBounds: ReturnType<typeof vi.fn> };
}

function makeBlock(lat: number, lng: number): BlockSummary {
  return {
    addressKey: `block-${lat}-${lng}`,
    town: "BEDOK",
    block: "1",
    streetName: "BEDOK NTH AVE 1",
    coordinates: { lat, lng },
    medianPrice: 500_000,
    pricePerSqmMedian: 5556,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-12",
    availableDateRange: ["2020-01", "2024-12"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: null,
  };
}

describe("useMapFitBounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when map is null", () => {
    // Should not throw
    renderHook(() =>
      useMapFitBounds({
        map: null,
        blocks: [makeBlock(1.33, 103.92)],
        townFilter: null,
        autoFitKey: null,
        prefersReducedMotion: false,
      }),
    );
  });

  it("does nothing when blocks is empty", () => {
    const map = createMapStub();

    renderHook(() =>
      useMapFitBounds({
        map,
        blocks: [],
        townFilter: "BEDOK",
        autoFitKey: null,
        prefersReducedMotion: false,
      }),
    );

    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("fits to SINGAPORE_BOUNDS when no townFilter or autoFitKey", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92), makeBlock(1.37, 103.85)];

    renderHook(() =>
      useMapFitBounds({
        map,
        blocks,
        townFilter: null,
        autoFitKey: null,
        prefersReducedMotion: false,
      }),
    );

    expect(map.fitBounds).toHaveBeenCalledWith(SINGAPORE_BOUNDS, expect.any(Object));
  });

  it("fits to block bounds when townFilter is set", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92), makeBlock(1.37, 103.85)];

    renderHook(() =>
      useMapFitBounds({
        map,
        blocks,
        townFilter: "BEDOK",
        autoFitKey: null,
        prefersReducedMotion: false,
      }),
    );

    const call = map.fitBounds.mock.calls[0];
    const bounds = call![0] as [[number, number], [number, number]];
    // [sw, ne] = [[minLng, minLat], [maxLng, maxLat]]
    expect(bounds[0][0]).toBeCloseTo(103.85); // minLng
    expect(bounds[0][1]).toBeCloseTo(1.33);   // minLat
    expect(bounds[1][0]).toBeCloseTo(103.92); // maxLng
    expect(bounds[1][1]).toBeCloseTo(1.37);   // maxLat
  });

  it("fits to block bounds when autoFitKey is set", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92)];

    renderHook(() =>
      useMapFitBounds({
        map,
        blocks,
        townFilter: null,
        autoFitKey: "some-key",
        prefersReducedMotion: false,
      }),
    );

    const call = map.fitBounds.mock.calls[0];
    const bounds = call![0] as [[number, number], [number, number]];
    expect(bounds[0][0]).toBeCloseTo(103.92);
    expect(bounds[0][1]).toBeCloseTo(1.33);
  });

  it("uses duration 0 when prefersReducedMotion is true", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92)];

    renderHook(() =>
      useMapFitBounds({
        map,
        blocks,
        townFilter: "BEDOK",
        autoFitKey: null,
        prefersReducedMotion: true,
      }),
    );

    const options = map.fitBounds.mock.calls[0]![1] as { duration: number };
    expect(options.duration).toBe(0);
  });

  it("uses non-zero duration when prefersReducedMotion is false", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92)];

    renderHook(() =>
      useMapFitBounds({
        map,
        blocks,
        townFilter: "BEDOK",
        autoFitKey: null,
        prefersReducedMotion: false,
      }),
    );

    const options = map.fitBounds.mock.calls[0]![1] as { duration: number };
    expect(options.duration).toBeGreaterThan(0);
  });

  it("re-fits when townFilter changes", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92)];

    const { rerender } = renderHook(
      ({ townFilter }: { townFilter: string | null }) =>
        useMapFitBounds({ map, blocks, townFilter, autoFitKey: null, prefersReducedMotion: false }),
      { initialProps: { townFilter: null as string | null } },
    );

    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    rerender({ townFilter: "BEDOK" });

    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("re-fits when autoFitKey changes", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92)];

    const { rerender } = renderHook(
      ({ autoFitKey }: { autoFitKey: string | null }) =>
        useMapFitBounds({ map, blocks, townFilter: null, autoFitKey, prefersReducedMotion: false }),
      { initialProps: { autoFitKey: null as string | null } },
    );

    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    rerender({ autoFitKey: "key-a" });

    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("does not re-fit when unrelated props change (stable filter, same blocks)", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92)];

    const { rerender } = renderHook(
      ({ prefersReducedMotion }: { prefersReducedMotion: boolean }) =>
        useMapFitBounds({
          map,
          blocks,
          townFilter: "BEDOK",
          autoFitKey: null,
          prefersReducedMotion,
        }),
      { initialProps: { prefersReducedMotion: false } },
    );

    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    rerender({ prefersReducedMotion: true });

    // prefersReducedMotion is not a fit trigger, so no additional call
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("handles single-block degenerate bounds (one point)", () => {
    const map = createMapStub();
    const blocks = [makeBlock(1.33, 103.92)];

    renderHook(() =>
      useMapFitBounds({
        map,
        blocks,
        townFilter: "BEDOK",
        autoFitKey: null,
        prefersReducedMotion: false,
      }),
    );

    const call = map.fitBounds.mock.calls[0];
    const bounds = call![0] as [[number, number], [number, number]];
    // For a single block, min and max should be the same point
    expect(bounds[0]).toEqual([103.92, 1.33]);
    expect(bounds[1]).toEqual([103.92, 1.33]);
  });
});
