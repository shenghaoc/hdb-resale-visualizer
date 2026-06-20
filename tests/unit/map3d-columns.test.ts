import { describe, expect, it } from "vite-plus/test";
import type { FeatureCollection } from "geojson";
import {
  buildColumnColorExpression,
  buildColumnHeightExpression,
  pointsToColumnPolygons,
} from "@/features/map-explorer/map3dColumns";
import {
  MEDIAN_PRICE_COLOR_EXPRESSION,
  PRICE_PER_SQM_COLOR_EXPRESSION,
} from "@/shared/lib/constants";

const POINTS: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.8, 1.3] },
      properties: { address_key: "a", median_price: 500_000, price_per_sqm_median: 6000 },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.9, 1.35] },
      properties: { address_key: "b", median_price: 900_000, price_per_sqm_median: 9000 },
    },
  ],
};

describe("pointsToColumnPolygons", () => {
  it("converts each point into a closed square polygon centred on the point", () => {
    const result = pointsToColumnPolygons(POINTS);

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(2);

    const [first] = result.features;
    expect(first.geometry.type).toBe("Polygon");

    const ring = first.geometry.coordinates[0];
    // 5 vertices = 4 corners + closing vertex.
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);

    // The polygon should bracket the original point on both axes.
    const lngs = ring.map((c) => c[0]);
    const lats = ring.map((c) => c[1]);
    expect(Math.min(...lngs)).toBeLessThan(103.8);
    expect(Math.max(...lngs)).toBeGreaterThan(103.8);
    expect(Math.min(...lats)).toBeLessThan(1.3);
    expect(Math.max(...lats)).toBeGreaterThan(1.3);
  });

  it("carries the price properties through unchanged for paint expressions", () => {
    const result = pointsToColumnPolygons(POINTS);
    expect(result.features[1].properties).toMatchObject({
      address_key: "b",
      median_price: 900_000,
      price_per_sqm_median: 9000,
    });
  });

  it("returns an empty collection for empty input", () => {
    expect(pointsToColumnPolygons({ type: "FeatureCollection", features: [] }).features).toEqual(
      [],
    );
  });

  it("skips non-point geometries defensively", () => {
    const mixed: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [103.8, 1.3],
              [103.9, 1.35],
            ],
          },
          properties: {},
        },
        ...POINTS.features,
      ],
    };
    expect(pointsToColumnPolygons(mixed).features).toHaveLength(2);
  });
});

describe("buildColumnHeightExpression", () => {
  it("drives height from median_price in price mode", () => {
    const expr = buildColumnHeightExpression("price");
    expect(expr).toContain("interpolate");
    expect(JSON.stringify(expr)).toContain("median_price");
  });

  it("drives height from price_per_sqm_median in perSqm mode", () => {
    const expr = buildColumnHeightExpression("perSqm");
    expect(JSON.stringify(expr)).toContain("price_per_sqm_median");
  });
});

describe("buildColumnColorExpression", () => {
  it("reuses the shared price ramps so 3D matches the flat markers", () => {
    expect(buildColumnColorExpression("price")).toBe(MEDIAN_PRICE_COLOR_EXPRESSION);
    expect(buildColumnColorExpression("perSqm")).toBe(PRICE_PER_SQM_COLOR_EXPRESSION);
  });
});
