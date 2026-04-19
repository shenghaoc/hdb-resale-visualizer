import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, makeAddressKey } from "../../scripts/lib/pipeline";
import { buildFixtureArtifacts, fixtureGeocodes } from "../fixtures/pipeline";

describe("pipeline artifacts", () => {
  it("builds summaries, detail files, and town trends", () => {
    const artifacts = buildFixtureArtifacts();

    expect(artifacts.manifest.counts.blocks).toBe(2);
    expect(artifacts.blockSummaries[0]?.addressKey).toBe(
      makeAddressKey("BEDOK", "101", "BEDOK NTH AVE 4"),
    );
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
});
