import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { BlockSummary } from "@/types/data";
import { haversineDistanceMeters } from "../../scripts/lib/pipeline";

function parseJson<T>(content: string): T {
  return JSON.parse(content) as T;
}

describe("MRT Distance Calculation Preservation", () => {
  const blockSummariesPath = join(process.cwd(), "public/data/block-summaries.json");

  it("keeps haversine accurate for known distances", () => {
    const point1 = { lat: 1.3521, lng: 103.8198 };
    const point2 = { lat: 1.3521, lng: 103.8208 };

    const distance = haversineDistanceMeters(point1, point2);

    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });

  it("keeps haversine symmetric", () => {
    const pointA = { lat: 1.3521, lng: 103.8198 };
    const pointB = { lat: 1.3621, lng: 103.8298 };

    expect(haversineDistanceMeters(pointA, pointB)).toBeCloseTo(
      haversineDistanceMeters(pointB, pointA),
      10,
    );
  });

  it("keeps distanceMeters stored as integers in summaries", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );

    for (const block of blockSummaries.filter((b) => b.nearestMrt !== null).slice(0, 100)) {
      expect(Number.isInteger(block.nearestMrt?.distanceMeters)).toBe(true);
    }
  });

  it("keeps nearestMrt non-null for at least some blocks", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );

    expect(blockSummaries.some((b) => b.nearestMrt !== null)).toBe(true);
  });

  it("keeps nearestMrt structure stable when present", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );
    const sampleBlock = blockSummaries.find((b) => b.nearestMrt !== null);

    expect(sampleBlock?.nearestMrt?.stationName).toBeTruthy();
    expect(typeof sampleBlock?.nearestMrt?.distanceMeters).toBe("number");
  });

  it("keeps MRT station names and distances reasonable for Singapore", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );

    for (const block of blockSummaries.filter((b) => b.nearestMrt !== null).slice(0, 100)) {
      expect(block.nearestMrt?.stationName.length).toBeGreaterThan(0);
      expect(block.nearestMrt?.distanceMeters).toBeGreaterThan(0);
      expect(block.nearestMrt?.distanceMeters).toBeLessThan(5000);
    }
  });
});
