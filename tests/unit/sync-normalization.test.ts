import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GeocodeCacheFile, GeocodeEntry } from "../../scripts/lib/pipeline";
import {
  normalizeAmenityGeoJson,
  normalizeMrtFeatures,
  normalizePropertyRows,
  normalizeResaleRows,
  normalizeSchoolRows,
  normalizeSupermarketRows,
  rekeyPropertyInfo,
} from "../../scripts/lib/sync/normalization";

const GEOCODE_ENDPOINT = new URL("https://example.test/api/common/elastic/search");

const resaleBase = {
  month: "2026-01",
  town: "BEDOK",
  flat_type: "4 ROOM",
  block: "123",
  street_name: "EXAMPLE ROAD",
  storey_range: "01 TO 03",
  floor_area_sqm: "120",
  flat_model: "MODEL A",
  lease_commence_date: "1990",
  resale_price: "800000",
  remaining_lease: "63 years",
};

function emptyGeocodeCache(): GeocodeCacheFile {
  return { version: 1, updatedAt: "1970-01-01T00:00:00.000Z", entries: {} };
}

function geocodeHit(searchValue: string): GeocodeEntry {
  return {
    lat: 1.3521,
    lng: 103.8198,
    postalCode: "560101",
    displayName: searchValue,
    searchValue,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonFetch(body: unknown) {
  const requestedUrls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    requestedUrls.push(requestUrl(input));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requestedUrls };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resale sync normalization", () => {
  it("canonicalizes legacy multi-generation flat-type spellings before ingestion", () => {
    const transactions = normalizeResaleRows([
      { ...resaleBase, flat_type: "MULTI GENERATION" },
      { ...resaleBase, flat_type: " multi-generation " },
    ]);

    expect(transactions.map((transaction) => transaction.flatType)).toEqual([
      "MULTI-GENERATION",
      "MULTI-GENERATION",
    ]);
  });

  it("derives stable address keys and unit prices from messy source text", () => {
    const [transaction] = normalizeResaleRows([
      {
        ...resaleBase,
        month: " 2026-01 ",
        town: "  bedok ",
        block: " 123a ",
        street_name: "bedok  south   ave 2",
        storey_range: " 04 to 06 ",
        flat_model: " improved ",
        remaining_lease: " 63 years 4 months ",
      },
    ]);

    expect(transaction).toMatchObject({
      id: "bedok-123a-bedok-south-ave-2-2026-01-0",
      month: "2026-01",
      town: "BEDOK",
      block: "123A",
      streetName: "BEDOK SOUTH AVE 2",
      storeyRange: "04 TO 06",
      flatModel: "IMPROVED",
      addressKey: "bedok-123a-bedok-south-ave-2",
      floorAreaSqm: 120,
      resalePrice: 800000,
      leaseCommenceDate: 1990,
      remainingLease: "63 years 4 months",
      pricePerSqm: 6666.67,
      pricePerSqft: 619.35,
    });
  });

  it("keeps later valid sales when earlier rows fail validation, preserving source indexes", () => {
    const currentYear = new Date().getFullYear();
    const transactions = normalizeResaleRows([
      { ...resaleBase, street_name: undefined as unknown as string },
      { ...resaleBase, floor_area_sqm: "not-a-number" },
      { ...resaleBase, resale_price: "Infinity" },
      { ...resaleBase, lease_commence_date: "nope" },
      { ...resaleBase, remaining_lease: "   " },
    ]);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.id).toBe("bedok-123-example-road-2026-01-4");
    expect(transactions[0]?.remainingLease).toBe(`${Math.max(0, 99 - (currentYear - 1990))} years`);
  });
});

describe("property sync normalization", () => {
  it("drops invalid property rows and stores blank numerics as null", () => {
    const rows = normalizePropertyRows([
      { blk_no: " 10 ", street: "example road" },
      {
        blk_no: " 22a ",
        street: "  market  street ",
        max_floor_lvl: " ",
        year_completed: "nope",
        total_dwelling_units: "0",
      },
    ]);

    expect(rows).toEqual([
      {
        addressKey: "unknown-22a-market-street",
        block: "22A",
        streetName: "MARKET STREET",
        maxFloorLevel: null,
        yearCompleted: null,
        totalDwellingUnits: 0,
      },
    ]);
  });

  it("rekeys property rows from known transactions without mutating the input", () => {
    const propertyRows = normalizePropertyRows([
      {
        blk_no: "123",
        street: "example road",
        max_floor_lvl: "12",
        year_completed: "1990",
        total_dwelling_units: "80",
      },
      {
        blk_no: "9",
        street: "other road",
        max_floor_lvl: "4",
        year_completed: "1980",
        total_dwelling_units: "20",
      },
    ]);
    const [matched, unmatched] = propertyRows;
    const transactions = normalizeResaleRows([resaleBase]);

    const rekeyed = rekeyPropertyInfo(propertyRows, transactions);

    expect(rekeyed[0]?.addressKey).toBe("bedok-123-example-road");
    expect(rekeyed[1]?.addressKey).toBe("unknown-9-other-road");
    expect(matched?.addressKey).toBe("unknown-123-example-road");
    expect(unmatched?.addressKey).toBe("unknown-9-other-road");
  });
});

describe("amenity geojson normalization", () => {
  it("keeps point features and reads longitude before latitude", () => {
    const exits = normalizeMrtFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.9, 1.32] },
          properties: { STATION_NA: "  bedok  " },
        },
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [103.9, 1.32] },
          properties: { STATION_NA: "DROPPED" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.9, 1.32] },
          properties: {},
        },
      ],
    });

    expect(exits).toEqual([{ stationName: "BEDOK", lng: 103.9, lat: 1.32 }]);
  });

  it("prefers NAME, then name, then Unknown", () => {
    const amenities = normalizeAmenityGeoJson({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.1, 1.1] },
          properties: { NAME: "Maxwell", name: "ignored" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.2, 1.2] },
          properties: { name: "East Coast" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.3, 1.3] },
          properties: {},
        },
        { type: "Feature", geometry: null, properties: { NAME: "dropped" } },
      ],
    });

    expect(amenities).toEqual([
      { name: "Maxwell", lat: 1.1, lng: 103.1 },
      { name: "East Coast", lat: 1.2, lng: 103.2 },
      { name: "Unknown", lat: 1.3, lng: 103.3 },
    ]);
  });
});

describe("school sync normalization", () => {
  const schoolOptions = { skipGeocoding: true, geocodeEndpoint: GEOCODE_ENDPOINT };

  it("keeps only primary schools and uses supplied coordinates before the cache", () => {
    const cache = emptyGeocodeCache();
    cache.entries["school:CACHED PRIMARY:560101"] = geocodeHit("cached");

    return expect(
      normalizeSchoolRows(
        [
          {
            school_name: "  River Valley Primary ",
            mainlevel_code: " primary ",
            latitude: "1.30",
            longitude: "103.80",
            postal_code: "560101",
          },
          {
            school_name: "Secondary School",
            mainlevel_code: "SECONDARY",
            latitude: "1.31",
            longitude: "103.81",
          },
          { school_name: "   ", mainlevel_code: "PRIMARY", latitude: "1", longitude: "103" },
          { school_name: "Missing level" },
        ],
        cache,
        schoolOptions,
      ),
    ).resolves.toEqual({
      schools: [{ name: "River Valley Primary", lat: 1.3, lng: 103.8, mainLevelCode: "PRIMARY" }],
      geocodedCount: 0,
    });
  });

  it("uses a cached postal key even when geocoding is disabled", async () => {
    const cache = emptyGeocodeCache();
    cache.entries["school:RIVER VALLEY PRIMARY:560101"] = geocodeHit("560101 SINGAPORE");
    const { fetchMock } = jsonFetch({ results: [] });

    const result = await normalizeSchoolRows(
      [
        {
          school_name: "River Valley Primary",
          mainlevel_code: "PRIMARY",
          postal_code: "560101",
          address: "1 Example Road",
        },
      ],
      cache,
      schoolOptions,
    );

    expect(result.schools).toEqual([
      {
        name: "River Valley Primary",
        lat: 1.3521,
        lng: 103.8198,
        mainLevelCode: "PRIMARY",
      },
    ]);
    expect(result.geocodedCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to an address cache key when a postal code is present", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = emptyGeocodeCache();
    cache.entries["school:RIVER VALLEY PRIMARY:1 EXAMPLE ROAD"] = geocodeHit("address");

    const result = await normalizeSchoolRows(
      [
        {
          school_name: "River Valley Primary",
          mainlevel_code: "PRIMARY",
          postal_code: "560101",
          address: "1 Example Road",
        },
      ],
      cache,
      schoolOptions,
    );

    expect(result.schools).toEqual([]);
    expect(
      warnSpy.mock.calls.some(([message]) => String(message).includes("geocoding disabled")),
    ).toBe(true);
  });

  it("geocodes by postal code and stores the result under that cache key", async () => {
    const { requestedUrls } = jsonFetch({
      found: 1,
      results: [
        {
          LATITUDE: "1.3521",
          LONGITUDE: "103.8198",
          ADDRESS: "1 EXAMPLE ROAD",
          POSTAL: "560101",
        },
      ],
    });
    const cache = emptyGeocodeCache();

    const result = await normalizeSchoolRows(
      [
        {
          school_name: "River Valley Primary",
          mainlevel_code: "PRIMARY",
          postal_code: "S560101",
          address: "1 Example Road",
          latitude: "nope",
          longitude: "103.8",
        },
      ],
      cache,
      { skipGeocoding: false, geocodeEndpoint: GEOCODE_ENDPOINT },
    );

    expect(result).toEqual({
      schools: [
        { name: "River Valley Primary", lat: 1.3521, lng: 103.8198, mainLevelCode: "PRIMARY" },
      ],
      geocodedCount: 1,
    });
    expect(cache.entries["school:RIVER VALLEY PRIMARY:560101"]).toMatchObject({
      lat: 1.3521,
      lng: 103.8198,
      postalCode: "560101",
      searchValue: "560101 SINGAPORE",
    });
    expect(requestedUrls[0]).toContain("searchVal=560101+SINGAPORE");
  });

  it("skips a school when geocoding returns no match", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    jsonFetch({ results: [] });

    const result = await normalizeSchoolRows(
      [
        {
          school_name: "River Valley Primary",
          mainlevel_code: "PRIMARY",
          address: "1 Example Road",
          postal_code: "NIL",
        },
      ],
      emptyGeocodeCache(),
      { skipGeocoding: false, geocodeEndpoint: GEOCODE_ENDPOINT },
    );

    expect(result).toEqual({ schools: [], geocodedCount: 0 });
    expect(
      warnSpy.mock.calls.some(([message]) =>
        String(message).includes(
          "no result for River Valley Primary (search: 1 Example Road SINGAPORE)",
        ),
      ),
    ).toBe(true);
    expect(
      warnSpy.mock.calls.some(([message]) => String(message).includes("geocoding failed")),
    ).toBe(true);
  });
});

describe("supermarket sync normalization", () => {
  it("reuses a cached address key when geocoding is disabled", async () => {
    const cache = emptyGeocodeCache();
    cache.entries["supermarket:10 MARKET STREET"] = geocodeHit("10 MARKET STREET SINGAPORE");

    const result = await normalizeSupermarketRows(
      [
        {
          licensee_name: "  NTUC  ",
          block_house_num: "10",
          street_name: "market street",
          postal_code: "NIL",
        },
        { licensee_name: "   " },
      ],
      cache,
      { skipGeocoding: true, geocodeEndpoint: GEOCODE_ENDPOINT },
    );

    expect(result).toEqual({
      supermarkets: [{ name: "NTUC", lat: 1.3521, lng: 103.8198 }],
      geocodedCount: 0,
    });
  });

  it("geocodes an uncached supermarket by postal code and records the new cache entry", async () => {
    jsonFetch({
      results: [
        {
          LATITUDE: "1.29",
          LONGITUDE: "103.85",
          BUILDING: "FAIRPRICE",
          POSTAL: "560101",
        },
      ],
    });
    const cache = emptyGeocodeCache();

    const result = await normalizeSupermarketRows(
      [
        {
          licensee_name: "FairPrice",
          postal_code: "560101",
          street_name: "unused when postal exists",
        },
      ],
      cache,
      { skipGeocoding: false, geocodeEndpoint: GEOCODE_ENDPOINT },
    );

    expect(result).toEqual({
      supermarkets: [{ name: "FairPrice", lat: 1.29, lng: 103.85 }],
      geocodedCount: 1,
    });
    expect(cache.entries["supermarket:560101"]?.searchValue).toBe("560101 SINGAPORE");
  });
});
