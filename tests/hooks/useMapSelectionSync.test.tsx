import { renderHook } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vite-plus/test";
import { useMapSelectionSync } from "@/features/map-explorer/useMapSelectionSync";
import type { BlockSummary } from "@/types/data";

const selectedBlock: BlockSummary = {
  addressKey: "bedok-108-lengkong-tiga",
  town: "BEDOK",
  block: "108",
  streetName: "LENGKONG TIGA",
  coordinates: { lat: 1.3246, lng: 103.9101 },
  medianPrice: 1_188_000,
  pricePerSqmMedian: 7_920,
  transactionCount: 7,
  floorAreaRange: [146, 154],
  leaseCommenceRange: [1988, 1988],
  latestMonth: "2025-09",
  availableDateRange: ["1993-01", "2025-09"],
  flatTypes: ["EXECUTIVE"],
  flatModels: ["MAISONETTE"],
  nearestMrt: null,
  postalCode: "410108",
};

function createMapStub(width: number) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { configurable: true, value: width });

  const stub = {
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn(() => ({})),
    setFilter: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    easeTo: vi.fn(),
    getZoom: vi.fn(() => 11),
    getContainer: vi.fn(() => container),
  };

  return stub as unknown as MapLibreMap & typeof stub;
}

describe("useMapSelectionSync", () => {
  it("brings a newly selected block into the unobscured desktop map area", () => {
    const map = createMapStub(1_200);
    type SelectionProps = {
      selectedAddressKey: string | null;
      block: BlockSummary | null;
    };
    const initialProps: SelectionProps = { selectedAddressKey: null, block: null };
    const { rerender } = renderHook(
      ({ selectedAddressKey, block }: SelectionProps) =>
        useMapSelectionSync({
          map,
          selectedAddressKey,
          selectedBlock: block,
          townFilter: "BEDOK",
          autoFitKey: null,
          prefersReducedMotion: false,
        }),
      { initialProps },
    );

    rerender({ selectedAddressKey: selectedBlock.addressKey, block: selectedBlock });

    expect(map.easeTo).toHaveBeenCalledWith({
      center: [selectedBlock.coordinates.lng, selectedBlock.coordinates.lat],
      zoom: 14,
      offset: [204, -4],
      duration: 450,
    });
  });

  it("uses compact padding and reduced motion on mobile", () => {
    const map = createMapStub(390);

    renderHook(() =>
      useMapSelectionSync({
        map,
        selectedAddressKey: selectedBlock.addressKey,
        selectedBlock,
        townFilter: null,
        autoFitKey: null,
        prefersReducedMotion: true,
      }),
    );

    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: [0, -44],
        duration: 0,
      }),
    );
  });

  it("lets a simultaneous explicit fit-bounds request win", () => {
    const map = createMapStub(1_200);
    type SelectionAndFitProps = {
      selectedAddressKey: string | null;
      block: BlockSummary | null;
      townFilter: string | null;
    };
    const initialProps: SelectionAndFitProps = {
      selectedAddressKey: null,
      block: null,
      townFilter: null,
    };
    const { rerender } = renderHook(
      ({ selectedAddressKey, block, townFilter }: SelectionAndFitProps) =>
        useMapSelectionSync({
          map,
          selectedAddressKey,
          selectedBlock: block,
          townFilter,
          autoFitKey: null,
          prefersReducedMotion: false,
        }),
      { initialProps },
    );

    rerender({
      selectedAddressKey: selectedBlock.addressKey,
      block: selectedBlock,
      townFilter: "BEDOK",
    });

    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("prioritizes a global result selection when it clears the town fit", () => {
    const map = createMapStub(1_200);
    type GlobalSelectionProps = {
      selectedAddressKey: string | null;
      block: BlockSummary | null;
      townFilter: string | null;
    };
    const initialProps: GlobalSelectionProps = {
      selectedAddressKey: null,
      block: null,
      townFilter: "BEDOK",
    };
    const { rerender } = renderHook(
      ({ selectedAddressKey, block, townFilter }: GlobalSelectionProps) =>
        useMapSelectionSync({
          map,
          selectedAddressKey,
          selectedBlock: block,
          townFilter,
          autoFitKey: null,
          prefersReducedMotion: false,
        }),
      { initialProps },
    );

    rerender({
      selectedAddressKey: selectedBlock.addressKey,
      block: selectedBlock,
      townFilter: null,
    });

    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [selectedBlock.coordinates.lng, selectedBlock.coordinates.lat],
      }),
    );
  });

  it("keeps yielding to a pending explicit fit when selected block data arrives", () => {
    const map = createMapStub(1_200);
    type PendingSelectionProps = {
      block: BlockSummary | null;
    };
    const { rerender } = renderHook(
      ({ block }: PendingSelectionProps) =>
        useMapSelectionSync({
          map,
          selectedAddressKey: selectedBlock.addressKey,
          selectedBlock: block,
          townFilter: "BEDOK",
          autoFitKey: null,
          prefersReducedMotion: false,
        }),
      { initialProps: { block: null } as PendingSelectionProps },
    );

    rerender({ block: selectedBlock });

    expect(map.easeTo).not.toHaveBeenCalled();
  });
});
