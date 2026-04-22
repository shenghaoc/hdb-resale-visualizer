import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

interface Manifest {
  schemaVersion: string;
  generatedAt: string;
  dataWindow: {
    minMonth: string;
    maxMonth: string;
  };
  sources: {
    resaleCollectionId: string;
    resaleDatasetIds: string[];
    propertyDatasetId: string;
    mrtDatasetId: string;
    lastUpdatedAt: string;
  };
  counts: {
    blocks: number;
    transactions: number;
    towns: number;
    mrtStations: number;
  };
}

function parseJson<T>(content: string): T {
  return JSON.parse(content) as T;
}

describe("Stale Data Artifacts", () => {
  const manifestPath = join(process.cwd(), "public/data/manifest.json");

  it("keeps generatedAt within 1 day of the test reference date", () => {
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));
    const generatedAt = new Date(manifest.generatedAt);
    const currentDate = new Date("2026-04-22");
    const diffDays =
      (currentDate.getTime() - generatedAt.getTime()) / (24 * 60 * 60 * 1000);

    expect(diffDays).toBeLessThanOrEqual(1);
  });

  it("keeps generatedAt after the source lastUpdatedAt timestamp", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));

    expect(new Date(manifest.generatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(manifest.sources.lastUpdatedAt).getTime(),
    );
  });

  it("keeps transaction count at or above the expected fresh snapshot floor", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));

    expect(manifest.counts.transactions).toBeGreaterThanOrEqual(975349);
  });

  it("keeps dataWindow.maxMonth aligned with the latest expected month", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));

    expect(manifest.dataWindow.maxMonth).toBe("2026-04");
  });

  it("preserves the manifest schema fields", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));

    expect(manifest.schemaVersion).toBeDefined();
    expect(manifest.generatedAt).toBeDefined();
    expect(manifest.dataWindow.minMonth).toBeDefined();
    expect(manifest.dataWindow.maxMonth).toBeDefined();
    expect(manifest.sources.lastUpdatedAt).toBeDefined();
    expect(manifest.counts.blocks).toBe(9702);
  });

  it("documents the current fresh-data counterexample", () => {
    const manifest = parseJson<Manifest>(readFileSync(manifestPath, "utf-8"));
    const generatedAt = new Date(manifest.generatedAt);
    const currentDate = new Date("2026-04-22");
    const diffDays =
      (currentDate.getTime() - generatedAt.getTime()) / (24 * 60 * 60 * 1000);

    console.log("\n=== STALE DATA COUNTEREXAMPLE ===");
    console.log(`generatedAt: ${manifest.generatedAt}`);
    console.log("Current date: 2026-04-22");
    console.log(`Days since generation: ${diffDays.toFixed(2)}`);
    console.log(`Transaction count: ${manifest.counts.transactions}`);
    console.log(`Source lastUpdatedAt: ${manifest.sources.lastUpdatedAt}`);
    console.log("=================================\n");

    expect(diffDays).toBeLessThanOrEqual(1);
  });
});
