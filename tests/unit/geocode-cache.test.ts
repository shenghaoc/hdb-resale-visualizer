import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GeocodeCacheFile, GeocodeEntry } from "../../scripts/lib/pipeline";
import type { D1Client } from "../../scripts/lib/sync/d1";
import {
  geocodeAddress,
  loadGeocodeCache,
  saveGeocodeCacheEntries,
} from "../../scripts/lib/sync/geocode";

const ENDPOINT = new URL("https://example.test/api/common/elastic/search");

type SavedGeocodeRow = { key: string; entry: GeocodeEntry };

type BatchInsertCall = {
  table: string;
  columns: string[];
  rows: SavedGeocodeRow[];
  upsert?: boolean;
  mapRow: (row: SavedGeocodeRow) => unknown[];
};

function cacheWith(entries: GeocodeCacheFile["entries"]): GeocodeCacheFile {
  return { version: 1, updatedAt: "1970-01-01T00:00:00.000Z", entries };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geocode cache persistence", () => {
  it("rebuilds cache entries from D1 columns without treating the load time as freshness", async () => {
    let sql = "";
    const db = {
      query: async (statement: { sql: string }) => {
        sql = statement.sql;
        return [
          {
            cache_key: "school:RIVER VALLEY PRIMARY:560101",
            lat: 1.3521,
            lng: 103.8198,
            postal_code: null,
            display_name: null,
            search_value: "560101 SINGAPORE",
          },
          {
            cache_key: "block:bedok-123",
            lat: 1.32,
            lng: 103.93,
            postal_code: "460123",
            display_name: "123 EXAMPLE ROAD",
            search_value: "123 EXAMPLE ROAD SINGAPORE",
          },
        ];
      },
    } as unknown as D1Client;

    const cache = await loadGeocodeCache(db);

    expect(sql).toContain("FROM geocode_cache");
    expect(sql).toContain("postal_code");
    expect(cache.version).toBe(1);
    expect(cache.updatedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(cache.entries["school:RIVER VALLEY PRIMARY:560101"]).toEqual({
      lat: 1.3521,
      lng: 103.8198,
      postalCode: null,
      displayName: null,
      searchValue: "560101 SINGAPORE",
    });
    expect(cache.entries["block:bedok-123"]).toEqual({
      lat: 1.32,
      lng: 103.93,
      postalCode: "460123",
      displayName: "123 EXAMPLE ROAD",
      searchValue: "123 EXAMPLE ROAD SINGAPORE",
    });
  });

  it("does not write when every requested key is missing from the in-memory cache", async () => {
    const batchInsert = vi.fn();
    const db = { batchInsert } as unknown as D1Client;

    await saveGeocodeCacheEntries(db, cacheWith({}), ["missing-key"], "2026-09-23T00:00:00.000Z");

    expect(batchInsert).not.toHaveBeenCalled();
  });

  it("upserts only the keys that were filled during this run", async () => {
    const calls: BatchInsertCall[] = [];
    const db = {
      batchInsert: async (options: BatchInsertCall) => {
        calls.push(options);
      },
    } as unknown as D1Client;
    const entry: GeocodeEntry = {
      lat: 1.29,
      lng: 103.85,
      postalCode: null,
      displayName: "FAIRPRICE",
      searchValue: "560101 SINGAPORE",
    };

    await saveGeocodeCacheEntries(
      db,
      cacheWith({ "supermarket:560101": entry, untouched: { ...entry, searchValue: "other" } }),
      ["missing", "supermarket:560101"],
      "2026-09-23T00:00:00.000Z",
    );

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.table).toBe("geocode_cache");
    expect(call?.upsert).toBe(true);
    expect(call?.columns).toEqual([
      "cache_key",
      "lat",
      "lng",
      "postal_code",
      "display_name",
      "search_value",
      "updated_at",
    ]);
    expect(call?.rows.map((row) => row.key)).toEqual(["supermarket:560101"]);
    expect(call?.mapRow(call.rows[0]!)).toEqual([
      "supermarket:560101",
      1.29,
      103.85,
      null,
      "FAIRPRICE",
      "560101 SINGAPORE",
      "2026-09-23T00:00:00.000Z",
    ]);
  });
});

describe("geocodeAddress", () => {
  it("requests the first OneMap page and maps the first hit", async () => {
    let requestedHref = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requestedHref =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        return new Response(
          JSON.stringify({
            found: "1",
            results: [
              {
                LATITUDE: "1.3521",
                LONGITUDE: "103.8198",
                BUILDING: "NIL",
                ADDRESS: "123 EXAMPLE ROAD",
                POSTAL: "NIL",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const match = await geocodeAddress("123 EXAMPLE ROAD SINGAPORE", ENDPOINT);

    const requested = new URL(requestedHref);
    expect(requested.origin).toBe(ENDPOINT.origin);
    expect(requested.pathname).toBe(ENDPOINT.pathname);
    expect(requested.searchParams.get("searchVal")).toBe("123 EXAMPLE ROAD SINGAPORE");
    expect(requested.searchParams.get("returnGeom")).toBe("Y");
    expect(requested.searchParams.get("getAddrDetails")).toBe("Y");
    expect(requested.searchParams.get("pageNum")).toBe("1");
    expect(match).toEqual({
      lat: 1.3521,
      lng: 103.8198,
      postalCode: null,
      displayName: "NIL",
      searchValue: "123 EXAMPLE ROAD SINGAPORE",
    });
  });

  it("uses ADDRESS when BUILDING is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                LATITUDE: "1.3000",
                LONGITUDE: "103.8000",
                ADDRESS: "10 MARKET STREET",
                POSTAL: "S088256",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await expect(geocodeAddress("088256 SINGAPORE", ENDPOINT)).resolves.toMatchObject({
      postalCode: "088256",
      displayName: "10 MARKET STREET",
    });
  });

  it("returns null when OneMap finds no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ found: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(geocodeAddress("NOWHERE SINGAPORE", ENDPOINT)).resolves.toBeNull();
  });

  it("rejects a non-JSON payload instead of caching it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("<html>maintenance</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }),
    );

    await expect(geocodeAddress("123 EXAMPLE ROAD", ENDPOINT)).rejects.toThrow(/Expected JSON/);
  });

  it("rejects a hit that is missing coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ results: [{ LATITUDE: 1.3, LONGITUDE: "103.8" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(geocodeAddress("123 EXAMPLE ROAD", ENDPOINT)).rejects.toThrow();
  });
});
