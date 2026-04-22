import { describe, expect, it } from "vitest";
import { buildMrtStationsGeoJson, haversineDistanceMeters, makeAddressKey } from "../../scripts/lib/pipeline";
import { buildFixtureArtifacts, fixtureGeocodes, fixtureMrtExits } from "../fixtures/pipeline";

describe("pipeline artifacts", () => {
  it("builds summaries, detail files, and town trends", () => {
    const artifacts = buildFixtureArtifacts();

    expect(artifacts.manifest.counts.blocks).toBe(2);
    expect(artifacts.blockSummaries[0]?.addressKey).toBe(
      makeAddressKey("BEDOK", "101", "BEDOK NTH AVE 4"),
    );
    expect(artifacts.blockSummaries[0]?.displayName).toBe("BEDOK NORTH GREEN");
    expect(
      artifacts.details[makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10")]?.summary.displayName,
    ).toBeNull();
    expect(artifacts.details[makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10")]).toBeTruthy();
    expect(artifacts.townFlatTypeTrend).toHaveLength(3);
  });

  it("computes station distance in meters", () => {
    const distance = haversineDistanceMeters(
      { lat: fixtureGeocodes["ang-mo-kio-406-ang-mo-kio-ave-10"].lat, lng: fixtureGeocodes["ang-mo-kio-406-ang-mo-kio-ave-10"].lng },
      { lat: 1.3691, lng: 103.8491 },
    );

    expect(distance).toBeLessThan(20);
  });

  it("aggregates MRT exits into station markers without changing nearest-station distance", () => {
    const stations = buildMrtStationsGeoJson(fixtureMrtExits);
    const angMoKioStation = stations.features.find(
      (feature) => feature.properties.stationName === "ANG MO KIO MRT STATION",
    );
    const artifacts = buildFixtureArtifacts();
    const nearestMrt =
      artifacts.details[makeAddressKey("ANG MO KIO", "406", "ANG MO KIO AVE 10")]?.summary.nearestMrt;

    expect(stations.features).toHaveLength(2);
    expect(angMoKioStation?.geometry.coordinates[0]).toBeCloseTo(103.84985, 5);
    expect(angMoKioStation?.geometry.coordinates[1]).toBeCloseTo(1.3698, 5);
    expect(angMoKioStation?.properties).toMatchObject({
      stationName: "ANG MO KIO MRT STATION",
      color: "#d11141",
      lines: ["NSL"],
      isInterchange: false,
    });
    expect(nearestMrt).toEqual({
      stationName: "ANG MO KIO MRT STATION",
      distanceMeters: 16,
    });
  });
});
