import { describe, expect, it } from "vitest";
import {
  classifyPrimarySchoolDistance,
  getPrimarySchoolsForOverlay,
  primarySchoolsToGeoJson,
} from "@/lib/school-proximity";

describe("school proximity logic", () => {
  it("classifies primary school distance bands at the 1km and 2km boundaries", () => {
    expect(classifyPrimarySchoolDistance(0)).toBe("within1km");
    expect(classifyPrimarySchoolDistance(1_000)).toBe("within1km");
    expect(classifyPrimarySchoolDistance(1_001)).toBe("within2km");
    expect(classifyPrimarySchoolDistance(2_000)).toBe("within2km");
    expect(classifyPrimarySchoolDistance(2_001)).toBe("beyond2km");
  });

  it("returns null for invalid distances", () => {
    expect(classifyPrimarySchoolDistance(-1)).toBeNull();
    expect(classifyPrimarySchoolDistance(Number.NaN)).toBeNull();
    expect(classifyPrimarySchoolDistance(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("keeps only nearby schools that have generated coordinates for the map overlay", () => {
    const schools = getPrimarySchoolsForOverlay([
      {
        name: "ALPHA PRIMARY SCHOOL",
        distanceMeters: 800,
        coordinates: { lat: 1.3, lng: 103.8 },
      },
      {
        name: "BETA PRIMARY SCHOOL",
        distanceMeters: 1_500,
        coordinates: { lat: 1.31, lng: 103.81 },
      },
      {
        name: "NO COORDINATES PRIMARY SCHOOL",
        distanceMeters: 900,
      },
      {
        name: "DISTANT PRIMARY SCHOOL",
        distanceMeters: 2_500,
        coordinates: { lat: 1.32, lng: 103.82 },
      },
    ]);

    expect(schools).toEqual([
      {
        name: "ALPHA PRIMARY SCHOOL",
        distanceMeters: 800,
        coordinates: { lat: 1.3, lng: 103.8 },
        distanceBand: "within1km",
      },
      {
        name: "BETA PRIMARY SCHOOL",
        distanceMeters: 1_500,
        coordinates: { lat: 1.31, lng: 103.81 },
        distanceBand: "within2km",
      },
    ]);
  });

  it("converts overlay schools to map features without changing their order", () => {
    const geoJson = primarySchoolsToGeoJson([
      {
        name: "ALPHA PRIMARY SCHOOL",
        distanceMeters: 800,
        coordinates: { lat: 1.3, lng: 103.8 },
        distanceBand: "within1km",
      },
    ]);

    expect(geoJson.features).toEqual([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [103.8, 1.3] },
        properties: {
          name: "ALPHA PRIMARY SCHOOL",
          distance_meters: 800,
          distance_band: "within1km",
        },
      },
    ]);
  });
});
