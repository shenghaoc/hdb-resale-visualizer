import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MapView } from "@/components/MapView";
import { toGeoJson } from "@/lib/map";
import type { BlockSummary } from "@/types/data";
import type { Translator } from "@/lib/i18n";

const mapHooks = vi.hoisted(() => ({
  useMapInitialization: vi.fn(),
  useMapLayers: vi.fn(),
  useMapDataSync: vi.fn(),
  useMapFitBounds: vi.fn(),
  useMapInteractions: vi.fn(),
  useMapSelectionSync: vi.fn(),
  useMapMarkerVisibility: vi.fn(),
  useMapPriceHeatmapSync: vi.fn(),
  useAmenityGeoSync: vi.fn(),
  useMapTheme: vi.fn(),
  useMapRadiusLayer: vi.fn(),
  useDebouncedValue: vi.fn(),
}));

vi.mock("maplibre-gl", () => ({
  Popup: vi.fn(function Popup() {
    return { remove: vi.fn() };
  }),
}));

vi.mock("@/hooks/useMapInitialization", () => ({
  useMapInitialization: mapHooks.useMapInitialization,
}));
vi.mock("@/hooks/useMapLayers", () => ({ useMapLayers: mapHooks.useMapLayers }));
vi.mock("@/hooks/useMapDataSync", () => ({ useMapDataSync: mapHooks.useMapDataSync }));
vi.mock("@/hooks/useMapFitBounds", () => ({ useMapFitBounds: mapHooks.useMapFitBounds }));
vi.mock("@/hooks/useMapInteractions", () => ({
  useMapInteractions: mapHooks.useMapInteractions,
}));
vi.mock("@/hooks/useMapSelectionSync", () => ({
  useMapSelectionSync: mapHooks.useMapSelectionSync,
}));
vi.mock("@/hooks/useMapMarkerVisibility", () => ({
  useMapMarkerVisibility: mapHooks.useMapMarkerVisibility,
}));
vi.mock("@/hooks/useMapPriceHeatmapSync", () => ({
  useMapPriceHeatmapSync: mapHooks.useMapPriceHeatmapSync,
}));
vi.mock("@/hooks/useAmenityGeoSync", () => ({
  useAmenityGeoSync: mapHooks.useAmenityGeoSync,
}));
vi.mock("@/hooks/useMapTheme", () => ({ useMapTheme: mapHooks.useMapTheme }));
vi.mock("@/hooks/useMapRadiusLayer", () => ({
  useMapRadiusLayer: mapHooks.useMapRadiusLayer,
}));
vi.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: mapHooks.useDebouncedValue,
}));

const t: Translator = (key) => {
  if (key === "map.ariaLabel") return "Singapore HDB resale map";
  if (key === "map.unavailableTitle") return "Map unavailable";
  if (key === "map.unavailableDescription") return "Map failed to load.";
  return key;
};

const sampleBlock: BlockSummary = {
  addressKey: "bedok-101-bedok-nth-ave-4",
  blockNo: "101",
  street: "BEDOK NTH AVE 4",
  town: "BEDOK",
  postalCode: "460101",
  coordinates: { lat: 1.324, lng: 103.93 },
  medianPrice: 500000,
  medianPricePerSqm: 5500,
  transactionCount: 3,
  remainingLeaseYears: 70,
  nearestMrt: null,
  nearestMrtDistanceM: null,
};

const defaultProps = {
  blocks: [sampleBlock],
  selectedAddressKey: null,
  isDarkMode: false,
  onSelect: vi.fn(),
  t,
  locale: "en-SG" as const,
};

describe("MapView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapHooks.useMapInitialization.mockReturnValue({
      mapInstance: { id: "map-stub" },
      mapError: null,
    });
    mapHooks.useDebouncedValue.mockImplementation((value: unknown) => value);
  });

  it("renders the map shell and wires block data into sync hooks", () => {
    render(
      <MapView
        {...defaultProps}
        priceHeatmapEnabled={true}
        priceHeatmapOpacity={0.5}
        flatType="4 ROOM"
      />,
    );

    const mapShell = screen.getByTestId("map-view");
    expect(mapShell).toHaveAttribute("data-theme", "light");
    expect(mapShell).toHaveAttribute("role", "application");
    expect(mapShell).toHaveAccessibleName("Singapore HDB resale map");

    const expectedGeoJson = toGeoJson([sampleBlock], "4 ROOM");
    expect(mapHooks.useMapDataSync).toHaveBeenCalledWith(
      expect.objectContaining({
        geoJson: expectedGeoJson,
        priceHeatmapEnabled: true,
      }),
    );
    expect(mapHooks.useMapPriceHeatmapSync).toHaveBeenCalledWith(
      expect.objectContaining({
        geoJson: expectedGeoJson,
        priceHeatmapEnabled: true,
        priceHeatmapOpacity: 0.5,
      }),
    );
  });

  it("shows the unavailable fallback when map initialization fails", () => {
    mapHooks.useMapInitialization.mockReturnValue({
      mapInstance: null,
      mapError: new Error("WebGL unavailable"),
    });

    render(<MapView {...defaultProps} blocks={[]} isDarkMode={true} />);

    expect(screen.getByRole("status")).toHaveTextContent("Map unavailable");
    expect(screen.getByText(/map failed to load/i)).toBeInTheDocument();
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-theme", "dark");
  });
});
