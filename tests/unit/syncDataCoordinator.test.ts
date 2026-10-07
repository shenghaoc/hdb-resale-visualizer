import { describe, expect, it, vi } from "vite-plus/test";
import type { GeocodeCacheFile } from "../../scripts/lib/pipeline";
import { fetchAmenityData, geocodeMissingAddresses } from "../../scripts/sync-data";

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

  it("flushes geocode cache to D1 in batches and on final completion", async () => {
    const geocodeCache = makeGeocodeCache();
    const missingAddresses = Array.from({ length: 251 }, (_, index) => [
      `address-${index}`,
      `${index} TEST STREET SINGAPORE`,
    ]) as [string, string][];
    const flushCacheFn = vi.fn().mockResolvedValue(undefined);

    const result = await geocodeMissingAddresses(
      {
        missingAddresses,
        geocodeCache,
        geocodeEndpoint: new URL("https://example.test/geocode"),
        skipGeocoding: false,
        concurrency: 4,
        flushCacheFn,
      },
      {
        geocodeAddressFn: vi.fn(async (searchValue: string) => ({
          lat: 1.3,
          lng: 103.8,
          postalCode: "123456",
          displayName: searchValue,
          searchValue,
        })),
        now: () => "2026-05-14T01:00:00.000Z",
      },
    );

    expect(result.geocodeFailureCount).toBe(0);
    expect(Object.keys(geocodeCache.entries)).toHaveLength(251);
    // Two flushes: one at 250 completions, one on final completion at 251.
    expect(flushCacheFn).toHaveBeenCalledTimes(2);
    expect(geocodeCache.updatedAt).toBe("2026-05-14T01:00:00.000Z");
  });

  it("keeps later addresses when earlier geocodes miss or throw", async () => {
    const geocodeCache = makeGeocodeCache();
    const geocodeAddressFn = vi.fn(async (searchValue: string) => {
      if (searchValue === "NO RESULT") return null;
      if (searchValue === "THROWS") throw new Error("onemap down");
      if (searchValue === "NON_ERROR") throw "socket reset";
      return {
        lat: 1.3,
        lng: 103.8,
        postalCode: "123456",
        displayName: searchValue,
        searchValue,
      };
    });

    const result = await geocodeMissingAddresses(
      {
        missingAddresses: [
          ["miss", "NO RESULT"],
          ["boom", "THROWS"],
          ["ok", "GOOD"],
          ["weird", "NON_ERROR"],
        ],
        geocodeCache,
        geocodeEndpoint: new URL("https://example.test/geocode"),
        skipGeocoding: false,
        concurrency: 1,
        flushCacheFn: vi.fn().mockResolvedValue(undefined),
      },
      { geocodeAddressFn, now: () => "2026-05-14T01:00:00.000Z" },
    );

    expect(result.geocodeFailureCount).toBe(3);
    expect(result.geocodeFailureSamples).toEqual([
      "NO RESULT: no geocode result",
      "THROWS: onemap down",
      "NON_ERROR: unknown error",
    ]);
    expect(geocodeCache.entries.ok).toMatchObject({ lat: 1.3, lng: 103.8, searchValue: "GOOD" });
    expect(geocodeCache.entries.miss).toBeUndefined();
    expect(geocodeCache.entries.boom).toBeUndefined();
    expect(geocodeCache.entries.weird).toBeUndefined();
  });

  it("caps geocode failure samples at five while still counting every failure", async () => {
    const result = await geocodeMissingAddresses(
      {
        missingAddresses: Array.from({ length: 6 }, (_, index) => [
          `fail-${index}`,
          `FAIL ${index}`,
        ]) as [string, string][],
        geocodeCache: makeGeocodeCache(),
        geocodeEndpoint: new URL("https://example.test/geocode"),
        skipGeocoding: false,
        concurrency: 1,
        flushCacheFn: vi.fn().mockResolvedValue(undefined),
      },
      {
        geocodeAddressFn: vi.fn(async () => null),
        now: () => "2026-05-14T01:00:00.000Z",
      },
    );

    expect(result.geocodeFailureCount).toBe(6);
    expect(result.geocodeFailureSamples).toEqual([
      "FAIL 0: no geocode result",
      "FAIL 1: no geocode result",
      "FAIL 2: no geocode result",
      "FAIL 3: no geocode result",
      "FAIL 4: no geocode result",
    ]);
  });

  it("does not geocode when the pass is skipped or the queue is empty", async () => {
    const geocodeAddressFn = vi.fn();
    const flushCacheFn = vi.fn();
    const skipped = await geocodeMissingAddresses(
      {
        missingAddresses: [["address-1", "1 TEST STREET"]],
        geocodeCache: makeGeocodeCache(),
        geocodeEndpoint: new URL("https://example.test/geocode"),
        skipGeocoding: true,
        concurrency: 2,
        flushCacheFn,
      },
      { geocodeAddressFn },
    );
    const empty = await geocodeMissingAddresses(
      {
        missingAddresses: [],
        geocodeCache: makeGeocodeCache(),
        geocodeEndpoint: new URL("https://example.test/geocode"),
        skipGeocoding: false,
        concurrency: 2,
        flushCacheFn,
      },
      { geocodeAddressFn },
    );

    expect(skipped).toEqual({ geocodeFailureCount: 0, geocodeFailureSamples: [] });
    expect(empty).toEqual({ geocodeFailureCount: 0, geocodeFailureSamples: [] });
    expect(geocodeAddressFn).not.toHaveBeenCalled();
    expect(flushCacheFn).not.toHaveBeenCalled();
  });

  it("surfaces a geocode cache flush failure instead of reporting success", async () => {
    await expect(
      geocodeMissingAddresses(
        {
          missingAddresses: [["address-1", "1 TEST STREET"]],
          geocodeCache: makeGeocodeCache(),
          geocodeEndpoint: new URL("https://example.test/geocode"),
          skipGeocoding: false,
          concurrency: 1,
          flushCacheFn: vi.fn().mockRejectedValue(new Error("d1 write failed")),
        },
        {
          geocodeAddressFn: vi.fn(async (searchValue: string) => ({
            lat: 1.3,
            lng: 103.8,
            postalCode: null,
            displayName: searchValue,
            searchValue,
          })),
          now: () => "2026-05-14T01:00:00.000Z",
        },
      ),
    ).rejects.toThrow("d1 write failed");
  });
});
