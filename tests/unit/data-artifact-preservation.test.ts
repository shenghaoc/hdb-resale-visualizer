import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { AddressDetail, BlockSummary, Manifest } from "@/types/data";

function parseJson<T>(content: string): T {
  return JSON.parse(content) as T;
}

describe("Data Artifact Schema Preservation", () => {
  const manifestPath = join(process.cwd(), "public/data/manifest.json");
  const blockSummariesPath = join(process.cwd(), "public/data/block-summaries.json");

  it("keeps manifest.json present and parseable", () => {
    expect(existsSync(manifestPath)).toBe(true);
    expect(() => {
      parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));
    }).not.toThrow();
  });

  it("keeps the required manifest top-level fields", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));

    expect(manifest.schemaVersion).toBeDefined();
    expect(manifest.generatedAt).toBeDefined();
    expect(manifest.dataWindow).toBeDefined();
    expect(manifest.sources).toBeDefined();
    expect(manifest.filterOptions).toBeDefined();
    expect(manifest.counts).toBeDefined();
  });

  it("keeps manifest field types stable", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));

    expect(manifest.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.dataWindow.minMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(manifest.dataWindow.maxMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(Array.isArray(manifest.sources.resaleDatasetIds)).toBe(true);
    expect(Array.isArray(manifest.filterOptions.towns)).toBe(true);
    expect(Array.isArray(manifest.filterOptions.flatTypes)).toBe(true);
    expect(Array.isArray(manifest.filterOptions.flatModels)).toBe(true);
    expect(Number.isInteger(manifest.counts.blocks)).toBe(true);
    expect(Number.isInteger(manifest.counts.transactions)).toBe(true);
    expect(Number.isInteger(manifest.counts.towns)).toBe(true);
    expect(Number.isInteger(manifest.counts.mrtStations)).toBe(true);
  });

  it("keeps block-summaries.json present and as a JSON array", () => {
    expect(existsSync(blockSummariesPath)).toBe(true);

    const blockSummaries = parseJson<unknown>(readFileSync(blockSummariesPath, "utf-8"));
    expect(Array.isArray(blockSummaries)).toBe(true);
  });

  it("keeps block summaries aligned with the manifest block count", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );

    expect(blockSummaries.length).toBe(manifest.counts.blocks);
  });

  it("keeps required BlockSummary fields available", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );
    const firstBlock = blockSummaries[0];

    expect(firstBlock.addressKey).toBeDefined();
    expect(firstBlock.town).toBeDefined();
    expect(firstBlock.block).toBeDefined();
    expect(firstBlock.streetName).toBeDefined();
    expect(firstBlock.coordinates).toBeDefined();
    expect(firstBlock.medianPrice).toBeDefined();
    expect(firstBlock.transactionCount).toBeDefined();
    expect(firstBlock.flatTypes).toBeDefined();
    expect(firstBlock.nearestMrt).toBeDefined();
    expect("priceIqr" in firstBlock).toBe(false);
    expect("pricePerSqmMedian" in firstBlock).toBe(false);
    expect("pricePerSqftMedian" in firstBlock).toBe(false);
  });

  it("keeps block coordinates within Singapore bounds", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );

    for (const block of blockSummaries.slice(0, 10)) {
      expect(block.coordinates.lat).toBeGreaterThan(1.0);
      expect(block.coordinates.lat).toBeLessThan(1.6);
      expect(block.coordinates.lng).toBeGreaterThan(103.5);
      expect(block.coordinates.lng).toBeLessThan(104.1);
    }
  });

  it("keeps nearestMrt structured correctly when present", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );
    const sampleBlock = blockSummaries.find((block) => block.nearestMrt !== null);

    expect(sampleBlock).toBeTruthy();
    expect(sampleBlock?.nearestMrt?.stationName).toBeTruthy();
    expect(typeof sampleBlock?.nearestMrt?.distanceMeters).toBe("number");
  });

  it("keeps detail summary metrics available outside the startup summary artifact", () => {
    const blockSummaries = parseJson<BlockSummary[]>(
      readFileSync(blockSummariesPath, "utf-8"),
    );
    const firstBlock = blockSummaries[0];
    const detailPath = join(
      process.cwd(),
      "public/data/details",
      `${firstBlock.addressKey}.json`,
    );
    const detail = parseJson<AddressDetail>(readFileSync(detailPath, "utf-8"));

    expect(detail.summary.addressKey).toBe(firstBlock.addressKey);
    expect(detail.summary.priceIqr).toBeDefined();
    expect(detail.summary.pricePerSqmMedian).toBeDefined();
    expect("priceIqr" in firstBlock).toBe(false);
  });

  it("keeps details and trend artifact directories present", () => {
    expect(existsSync(join(process.cwd(), "public/data/details"))).toBe(true);
    expect(existsSync(join(process.cwd(), "public/data/trends"))).toBe(true);
    expect(
      existsSync(join(process.cwd(), "public/data/trends/town-flat-type.json")),
    ).toBe(true);
  });
});
