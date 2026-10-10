import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { GeocodeCacheFile } from "../../scripts/lib/pipeline";
import {
  normalizeSchoolRows,
  normalizeSupermarketRows,
} from "../../scripts/lib/sync/normalization";
import { resetUpstreamThrottleForTests } from "../../scripts/lib/sync/rate-limits";

// OneMap Search needs an access token, and credentials only ever go to the official endpoint
// (scripts/lib/sync/geocode.ts), so these tests use it with a token and a mocked fetch.
const GEOCODE_ENDPOINT = new URL("https://www.onemap.gov.sg/api/common/elastic/search");

function emptyGeocodeCache(): GeocodeCacheFile {
  return { version: 1, updatedAt: "1970-01-01T00:00:00.000Z", entries: {} };
}

function jsonResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("amenity geocode failures", () => {
  beforeEach(() => {
    vi.stubEnv("ONEMAP_TOKEN", "fixture-token");
    vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "1");
    resetUpstreamThrottleForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetUpstreamThrottleForTests();
  });

  it("skips a school whose geocode throws and still keeps later schools", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>down</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              LATITUDE: "1.3521",
              LONGITUDE: "103.8198",
              ADDRESS: "2 EXAMPLE ROAD",
              POSTAL: "222222",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const cache = emptyGeocodeCache();

    const result = await normalizeSchoolRows(
      [
        {
          school_name: "Fail Primary",
          mainlevel_code: "PRIMARY",
          postal_code: "111111",
        },
        {
          school_name: "Direct Primary",
          mainlevel_code: "PRIMARY",
          latitude: "1.31",
          longitude: "103.84",
        },
        {
          school_name: "Ok Primary",
          mainlevel_code: "PRIMARY",
          postal_code: "222222",
        },
      ],
      cache,
      { skipGeocoding: false, geocodeEndpoint: GEOCODE_ENDPOINT },
    );

    expect(result).toEqual({
      schools: [
        { name: "Direct Primary", lat: 1.31, lng: 103.84, mainLevelCode: "PRIMARY" },
        { name: "Ok Primary", lat: 1.3521, lng: 103.8198, mainLevelCode: "PRIMARY" },
      ],
      geocodedCount: 1,
    });
    expect(cache.entries["school:FAIL PRIMARY:111111"]).toBeUndefined();
    expect(cache.entries["school:OK PRIMARY:222222"]).toMatchObject({
      lat: 1.3521,
      lng: 103.8198,
      searchValue: "222222 SINGAPORE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const warnings = warnSpy.mock.calls.map(([message]) => String(message));
    expect(
      warnings.some((message) => message.includes("School geocode failed for Fail Primary")),
    ).toBe(true);
    expect(warnings.some((message) => message.includes("geocoding failed"))).toBe(true);
    expect(warnings.some((message) => message.includes("geocoding disabled"))).toBe(false);
  });

  it("skips a supermarket whose geocode throws and still geocodes the next row", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "nope" }, 400))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              LATITUDE: "1.29",
              LONGITUDE: "103.85",
              BUILDING: "FAIRPRICE",
              POSTAL: "444444",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const cache = emptyGeocodeCache();

    const result = await normalizeSupermarketRows(
      [
        { licensee_name: "Fail Mart", postal_code: "333333" },
        { licensee_name: "Ok Mart", postal_code: "444444" },
      ],
      cache,
      { skipGeocoding: false, geocodeEndpoint: GEOCODE_ENDPOINT },
    );

    expect(result).toEqual({
      supermarkets: [{ name: "Ok Mart", lat: 1.29, lng: 103.85 }],
      geocodedCount: 1,
    });
    expect(cache.entries["supermarket:333333"]).toBeUndefined();
    expect(cache.entries["supermarket:444444"]).toMatchObject({
      lat: 1.29,
      lng: 103.85,
      displayName: "FAIRPRICE",
      searchValue: "444444 SINGAPORE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const warnings = warnSpy.mock.calls.map(([message]) => String(message));
    expect(
      warnings.some((message) => message.includes("1/2") && message.includes("geocoding failed")),
    ).toBe(true);
    expect(warnings.some((message) => message.includes("geocoding disabled"))).toBe(false);
  });
});
