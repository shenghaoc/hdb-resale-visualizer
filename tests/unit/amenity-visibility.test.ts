import { describe, expect, it } from "vite-plus/test";
import {
  shouldShowAmenityLayer,
  getAmenityMinZoom,
} from "@/features/map-explorer/amenity-visibility";

describe("amenity-visibility", () => {
  it("prevents clutter by hiding at low zoom", () => {
    expect(shouldShowAmenityLayer(10, "mrt-station")).toBe(false);
    expect(shouldShowAmenityLayer(11, "mrt-station")).toBe(true);
    expect(shouldShowAmenityLayer(11.5, "mrt-exit")).toBe(false);
    expect(shouldShowAmenityLayer(12, "mrt-exit")).toBe(true);
    expect(shouldShowAmenityLayer(12, "school")).toBe(true);
  });

  it("provides min zoom thresholds", () => {
    expect(getAmenityMinZoom("mrt-station")).toBe(11);
    expect(getAmenityMinZoom("school")).toBe(12);
  });
});
