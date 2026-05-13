import { describe, expect, it, vi } from "vitest";
import type { GeocodeCacheFile, MrtStationFeatureCollection } from "../../scripts/lib/pipeline";
import { buildFixtureArtifacts, fixtureMrtExits } from "../fixtures/pipeline";

const EMPTY_STATIONS: MrtStationFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
import {
  fetchAmenityData,
  geocodeMissingAddresses,
  validateAndWriteArtifacts,
} from "../../scripts/sync-data";

function makeGeocodeCache(): GeocodeCacheFile {
  return {
    version: 1,
    updatedAt: "1970-01-01T00:00:00.000Z",
    entries: {},
  };
}

describe("sync-data coordinator helpers", () => {
  it("continues amenity sync when one source fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await fetchAmenityData(
      makeGeocodeCache(),
      { skipGeocoding: false, geocodeEndpoint: new URL("https://example.test/geocode") },
      {
        fetchCsvRowsFn: vi
          .fn()
          .mockRejectedValueOnce(new Error("school dataset down"))
          .mockResolvedValueOnce([{ supermarket_name: "Market A" }]),
        fetchGeoJsonFn: vi
          .fn()
          .mockResolvedValueOnce({ type: "FeatureCollection", features: [{ id: "hawker" }] })
          .mockRejectedValueOnce(new Error("parks unavailable")),
        normalizeSchoolRowsFn: vi.fn(),
        normalizeAmenityGeoJsonFn: vi
          .fn()
          .mockReturnValueOnce([{ name: "MAXWELL", lat: 1.1, lng: 103.8 }]),
        normalizeSupermarketRowsFn: vi.fn().mockResolvedValue({
          supermarkets: [{ name: "NTUC", lat: 1.2, lng: 103.9 }],
          geocodedCount: 2,
        }),
        sleepFn: vi.fn(),
      },
    );

    expect(result.schools).toEqual([]);
    expect(result.hawkers).toHaveLength(1);
    expect(result.supermarkets).toHaveLength(1);
    expect(result.parks).toEqual([]);
    expect(result.geocodedCount).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it("flushes geocode cache in batches and on final completion", async () => {
    const geocodeCache = makeGeocodeCache();
    const missingAddresses = Array.from({ length: 251 }, (_, index) => [
      `address-${index}`,
      `${index} TEST STREET SINGAPORE`,
    ]) as [string, string][];
    const saveGeocodeCacheFn = vi.fn().mockResolvedValue(undefined);

    const result = await geocodeMissingAddresses(
      {
        missingAddresses,
        geocodeCache,
        geocodeEndpoint: new URL("https://example.test/geocode"),
        skipGeocoding: false,
        cachePath: "/tmp/geocodes.json",
        concurrency: 4,
      },
      {
        geocodeAddressFn: vi.fn(async (searchValue: string) => ({
          lat: 1.3,
          lng: 103.8,
          postalCode: "123456",
          displayName: searchValue,
          searchValue,
        })),
        saveGeocodeCacheFn,
        now: () => "2026-05-14T01:00:00.000Z",
      },
    );

    expect(result.geocodeFailureCount).toBe(0);
    expect(Object.keys(geocodeCache.entries)).toHaveLength(251);
    expect(saveGeocodeCacheFn).toHaveBeenCalledTimes(2);
    expect(geocodeCache.updatedAt).toBe("2026-05-14T01:00:00.000Z");
  });

  it("validates and writes all artifact groups in sequence", async () => {
    const artifacts = buildFixtureArtifacts();
    const callOrder: string[] = [];

    await validateAndWriteArtifacts(
      {
        artifacts,
        mrtGeoJson: { type: "FeatureCollection", features: [] },
        mrtExits: fixtureMrtExits,
        geocodeFailureCount: 0,
      },
      {
        validateGeneratedArtifactsFn: vi.fn(() => {
          callOrder.push("validate");
        }),
        buildMrtStationsGeoJsonFn: vi.fn((): MrtStationFeatureCollection => {
          callOrder.push("build-stations");
          return EMPTY_STATIONS;
        }),
        writeGeneratedArtifactsFn: vi.fn(async () => {
          callOrder.push("write-generated");
        }),
        writeTownBlockFilesFn: vi.fn(async () => {
          callOrder.push("write-town");
        }),
        writeComparisonFilesFn: vi.fn(async () => {
          callOrder.push("write-comparison");
        }),
        writeDetailFilesFn: vi.fn(async () => {
          callOrder.push("write-detail");
        }),
      },
    );

    expect(callOrder).toEqual([
      "validate",
      "build-stations",
      "write-generated",
      "write-town",
      "write-comparison",
      "write-detail",
    ]);
  });

  it("surfaces writer failures instead of swallowing them", async () => {
    const artifacts = buildFixtureArtifacts();

    await expect(
      validateAndWriteArtifacts(
        {
          artifacts,
          mrtGeoJson: { type: "FeatureCollection", features: [] },
          mrtExits: fixtureMrtExits,
          geocodeFailureCount: 0,
        },
        {
          buildMrtStationsGeoJsonFn: vi.fn((): MrtStationFeatureCollection => EMPTY_STATIONS),
          writeGeneratedArtifactsFn: vi.fn().mockResolvedValue(undefined),
          writeTownBlockFilesFn: vi.fn().mockResolvedValue(undefined),
          writeComparisonFilesFn: vi.fn().mockResolvedValue(undefined),
          writeDetailFilesFn: vi.fn().mockRejectedValue(new Error("disk full")),
        },
      ),
    ).rejects.toThrow("disk full");
  });
});
