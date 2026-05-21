import { describe, expect, it } from "vitest";
import {
  buildArtifacts,
  estimateWalkingTimeSeconds,
  pickNearestStations,
  walkingTimeLookupKey,
} from "../../scripts/lib/pipeline";
import {
  fixtureGeocodes,
  fixtureMrtExits,
  fixturePropertyInfo,
  fixtureTransactions,
} from "../fixtures/pipeline";

function buildWithWalkingTimes(walkingTimes?: Map<string, number>) {
  return buildArtifacts({
    transactions: fixtureTransactions,
    propertyInfo: fixturePropertyInfo,
    mrtExits: fixtureMrtExits,
    geocodes: fixtureGeocodes,
    walkingTimes,
    metadata: {
      resaleCollectionId: "189",
      resaleDatasetIds: ["fixture"],
      propertyDatasetId: "fixture-property",
      mrtDatasetId: "fixture-mrt",
      lastUpdatedAt: "2026-04-19T02:10:00+08:00",
    },
  });
}

describe("walking-time fallback", () => {
  it("estimates walking time from distance when no routing lookup is provided", () => {
    const artifacts = buildWithWalkingTimes(undefined);
    const angMoKio = artifacts.blockSummaries.find(
      (block) => block.addressKey === "ang-mo-kio-406-ang-mo-kio-ave-10",
    );
    expect(angMoKio?.nearestMrt).toBeTruthy();
    // 16 m / 1.25 m/s ≈ 13 s
    expect(angMoKio?.nearestMrt?.walkingTimeSeconds).toBe(13);
    expect(angMoKio?.nearestMrt?.distanceMeters).toBe(16);

    // Fallback applies to every nearby station too.
    for (const nearby of angMoKio?.nearbyMrts ?? []) {
      expect(nearby.walkingTimeSeconds).toBe(estimateWalkingTimeSeconds(nearby.distanceMeters));
    }
  });

  it("uses the routing lookup when present and falls back per-pair when missing", () => {
    const angMoKioKey = "ang-mo-kio-406-ang-mo-kio-ave-10";
    const bedokKey = "bedok-101-bedok-nth-ave-4";
    const walkingTimes = new Map<string, number>([
      [walkingTimeLookupKey(angMoKioKey, "ANG MO KIO MRT STATION"), 240],
      // BEDOK NORTH stays absent, exercising per-pair fallback within a single run.
    ]);
    const artifacts = buildWithWalkingTimes(walkingTimes);

    const angMoKio = artifacts.blockSummaries.find((block) => block.addressKey === angMoKioKey);
    expect(angMoKio?.nearestMrt?.walkingTimeSeconds).toBe(240);

    const bedok = artifacts.blockSummaries.find((block) => block.addressKey === bedokKey);
    expect(bedok?.nearestMrt?.walkingTimeSeconds).toBe(
      estimateWalkingTimeSeconds(bedok!.nearestMrt!.distanceMeters),
    );
  });

  it("estimateWalkingTimeSeconds rounds at the conservative 1.25 m/s pedestrian pace", () => {
    expect(estimateWalkingTimeSeconds(0)).toBe(0);
    expect(estimateWalkingTimeSeconds(100)).toBe(80);
    expect(estimateWalkingTimeSeconds(790)).toBe(632);
  });

  it("pickNearestStations returns the closest exit per station up to the requested limit", () => {
    const picks = pickNearestStations(
      { lat: fixtureGeocodes[`ang-mo-kio-406-ang-mo-kio-ave-10`].lat, lng: fixtureGeocodes[`ang-mo-kio-406-ang-mo-kio-ave-10`].lng },
      fixtureMrtExits,
      3,
    );
    expect(picks).toHaveLength(2);
    expect(picks[0].stationName).toBe("ANG MO KIO MRT STATION");
    // The closer of the two ANG MO KIO exits should be selected (lat 1.3691, lng 103.8491).
    expect(picks[0].exitLat).toBeCloseTo(1.3691, 4);
    expect(picks[0].exitLng).toBeCloseTo(103.8491, 4);
  });
});
