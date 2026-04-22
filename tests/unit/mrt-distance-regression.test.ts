import { describe, expect, it } from "vitest";
import { haversineDistanceMeters } from "../../scripts/lib/pipeline";

interface MrtExit {
  stationName: string;
  lat: number;
  lng: number;
}

interface NearestMrt {
  stationName: string;
  distanceMeters: number;
}

function selectNearestMrt(
  blockCoords: { lat: number; lng: number },
  exits: MrtExit[],
): NearestMrt | null {
  let nearestMrt: NearestMrt | null = null;
  let bestDistance = Infinity;

  for (const exit of exits) {
    const distance = haversineDistanceMeters(blockCoords, {
      lat: exit.lat,
      lng: exit.lng,
    });

    if (distance < bestDistance) {
      bestDistance = distance;
      nearestMrt = {
        stationName: exit.stationName,
        distanceMeters: Math.round(distance),
      };
    }
  }

  return nearestMrt;
}

function createExitAtDistance(
  stationName: string,
  blockCoords: { lat: number; lng: number },
  distanceMeters: number,
  bearing: number = 0,
): MrtExit {
  const earthRadius = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const toDeg = (radians: number) => (radians * 180) / Math.PI;

  const angularDistance = distanceMeters / earthRadius;
  const bearingRad = toRad(bearing);
  const lat1 = toRad(blockCoords.lat);
  const lng1 = toRad(blockCoords.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    stationName,
    lat: toDeg(lat2),
    lng: toDeg(lng2),
  };
}

describe("MRT Distance Comparison Bug", () => {
  const blockCoords = { lat: 1.3521, lng: 103.8198 };

  it("selects the true nearest station when exits are within 1 meter", () => {
    const exitA = createExitAtDistance("Station A", blockCoords, 450.6, 0);
    const exitB = createExitAtDistance("Station B", blockCoords, 450.9, 90);

    const distanceA = haversineDistanceMeters(blockCoords, exitA);
    const distanceB = haversineDistanceMeters(blockCoords, exitB);
    const result = selectNearestMrt(blockCoords, [exitA, exitB]);

    expect(distanceA).toBeLessThan(distanceB);
    expect(result?.stationName).toBe("Station A");
  });

  it("does not invert ordering when the farther exit is processed later", () => {
    const exitA = createExitAtDistance("Station A", blockCoords, 450.6, 0);
    const exitB = createExitAtDistance("Station B", blockCoords, 450.9, 90);

    const result = selectNearestMrt(blockCoords, [exitA, exitB]);

    expect(result?.stationName).toBe("Station A");
  });

  it("does not invert ordering when the farther exit is processed first", () => {
    const exitA = createExitAtDistance("Station A", blockCoords, 450.6, 0);
    const exitB = createExitAtDistance("Station B", blockCoords, 450.9, 90);

    const result = selectNearestMrt(blockCoords, [exitB, exitA]);

    expect(result?.stationName).toBe("Station A");
  });

  it("keeps rounded distance only in the final payload", () => {
    const exitA = createExitAtDistance("Station A", blockCoords, 450.6, 0);
    const result = selectNearestMrt(blockCoords, [exitA]);

    expect(result).toEqual({
      stationName: "Station A",
      distanceMeters: 451,
    });
  });

  it("documents the fixed close-distance counterexample", () => {
    const exitA = createExitAtDistance("Station A", blockCoords, 450.6, 0);
    const exitB = createExitAtDistance("Station B", blockCoords, 450.9, 90);

    const distanceA = haversineDistanceMeters(blockCoords, exitA);
    const distanceB = haversineDistanceMeters(blockCoords, exitB);
    const result = selectNearestMrt(blockCoords, [exitA, exitB]);

    console.log("\n=== MRT DISTANCE COMPARISON BUG COUNTEREXAMPLE ===");
    console.log(`Block coordinates: (${blockCoords.lat}, ${blockCoords.lng})`);
    console.log(`Station A: ${distanceA.toFixed(2)}m (rounds to ${Math.round(distanceA)}m)`);
    console.log(`Station B: ${distanceB.toFixed(2)}m (rounds to ${Math.round(distanceB)}m)`);
    console.log(`Selected station: ${result?.stationName} (${result?.distanceMeters}m)`);
    console.log("===================================================\n");

    expect(result?.stationName).toBe("Station A");
  });
});
