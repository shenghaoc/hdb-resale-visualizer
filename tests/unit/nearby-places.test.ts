import { describe, expect, it, vi } from "vite-plus/test";
import type { PublicData } from "../../functions/_lib/public-data";
import { onRequestGet } from "../../functions/api/nearby-places";
import {
  canonicalNearbyPlacesParams,
  isNeonSpatialEnabled,
  MAX_NEARBY_CENTER_KEYS,
  MAX_NEARBY_CACHE_KEYS,
  parseNearbyPlacesRequest,
  snapNearbyCenter,
} from "../../shared/nearby-places";
import { createNeonPublicData } from "../../worker/public-data-neon";
import { NEARBY_SPATIAL_SQL, queryNearbyPlaces } from "../../worker/nearby-spatial-query";
import { matchApiRoute } from "../../worker/api-route-match";

const url = (suffix: string) => new URL("https://example.com/api/nearby-places" + suffix);
const valid = "?lat=1.35&lng=103.75&radius=800&limit=25&types=mrt_exit,mrt_station";
const fetchResult = (publicData: PublicData, suffix = valid) =>
  onRequestGet({
    publicData,
    request: new Request(url(suffix)),
    params: {},
  });

describe("bounded PostGIS nearby endpoint", () => {
  it("does not activate from an absent or false release flag", () => {
    expect(isNeonSpatialEnabled(undefined)).toBe(false);
    expect(isNeonSpatialEnabled("false")).toBe(false);
    expect(isNeonSpatialEnabled("true")).toBe(true);
  });
  it("parses and canonicalizes input independently of type ordering", () => {
    const parsed = parseNearbyPlacesRequest(url(valid));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request).toEqual({
      lat: 1.35,
      lng: 103.75,
      radiusMeters: 1000,
      limit: 25,
      kinds: ["mrt_station", "mrt_exit"],
    });
    expect(canonicalNearbyPlacesParams(parsed.request).toString()).toBe(
      "lat=1.35&lng=103.75&radius=1000&types=mrt_station%2Cmrt_exit",
    );
  });

  it("snaps nearby raw coordinates to exactly the same SQL centre and cache key", () => {
    const first = parseNearbyPlacesRequest(url("?lat=1.350001&lng=103.750001&radius=100"));
    const second = parseNearbyPlacesRequest(url("?lat=1.350049&lng=103.750049&radius=100"));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.request.lat).toBe(1.35);
    expect(first.request.lng).toBe(103.75);
    expect(second.request).toEqual(first.request);
    expect(canonicalNearbyPlacesParams(first.request).toString()).toBe(
      canonicalNearbyPlacesParams(second.request).toString(),
    );
    expect(snapNearbyCenter(1.350049, 103.750049)).toEqual({ lat: 1.35, lng: 103.75 });
  });

  it("has a finite documented upper bound for the canonical cache key space", () => {
    expect(MAX_NEARBY_CENTER_KEYS).toBe(4_001 * 6_001);
    expect(MAX_NEARBY_CACHE_KEYS).toBe(1_008_420_042);
    expect(Number.isSafeInteger(MAX_NEARBY_CACHE_KEYS)).toBe(true);
  });

  it("buckets radii upward and collapses equivalent requests onto one SQL/cache key", () => {
    const first = parseNearbyPlacesRequest(url("?lat=1.350001&lng=103.750001&radius=101"));
    const second = parseNearbyPlacesRequest(
      url("?lat=1.350049&lng=103.750049&radius=249&limit=25"),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.request.radiusMeters).toBe(250);
    expect(second.request).toEqual(first.request);
    expect(canonicalNearbyPlacesParams(first.request).toString()).toBe(
      canonicalNearbyPlacesParams(second.request).toString(),
    );
    expect(canonicalNearbyPlacesParams(first.request).get("limit")).toBeNull();
  });

  it.each([
    "",
    "?lat=&lng=103.75",
    "?lat=1.35&lng=103.75&radius=0",
    "?lat=1.35&lng=103.75&radius=3000",
    "?lat=1.35&lng=103.75&limit=26",
    "?lat=1.35&lng=103.75&limit=5",
    "?lat=1.35&lng=103.75&types=mrt_station,mrt_station",
    "?lat=1.35&lng=103.75&types=school",
    "?lat=1.35&lng=103.75&lat=1.36",
    "?lat=1.35&lng=103.75&other=hello",
    "?lat=1e309&lng=103.75",
    "?lat=2.5&lng=103.75",
  ])("rejects malformed or unbounded input: %s", (suffix) => {
    expect(parseNearbyPlacesRequest(url(suffix)).ok).toBe(false);
  });

  it("allows the default MRT-only query and single-type block queries", () => {
    expect(parseNearbyPlacesRequest(url("?lat=1.35&lng=103.75"))).toMatchObject({
      ok: true,
      request: { kinds: ["mrt_station", "mrt_exit"], limit: 25, radiusMeters: 1000 },
    });
    expect(parseNearbyPlacesRequest(url("?lat=1.35&lng=103.75&types=hdb_block"))).toMatchObject({
      ok: true,
      request: { kinds: ["hdb_block"] },
    });
  });

  it("returns a clear no-store error on D1 rollback, without faking an empty POI set", async () => {
    const response = await fetchResult({} as PublicData);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("only dispatches a bounded parameterized PostGIS query", async () => {
    const query = vi.fn(async (_sql: string, _params: readonly unknown[]) => [
      {
        id: "mrt_geojson:mrt_station:BUKIT BATOK MRT STATION",
        kind: "mrt_station",
        name: "BUKIT BATOK MRT STATION",
        lat: 1.349,
        lng: 103.749,
        address_key: null,
        distance_meters: 151.2,
      },
    ]);
    const data = createNeonPublicData(query);
    const response = await fetchResult(data);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      radiusMeters: 1000,
      distanceBasis: "straight-line",
      places: [{ kind: "mrt_station", distanceMeters: 151.2, addressKey: null }],
    });
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("ST_DWithin");
    expect(sql).toContain("public.poi_locations");
    expect(sql).toContain("public.blocks");
    expect(sql).toContain("ORDER BY distance_meters");
    expect(params).toEqual([1.35, 103.75, 1000, ["mrt_station", "mrt_exit"], 25]);
    expect(sql).not.toContain("103.75");
  });

  it("groups MRT exits in SQL by the official station name before LIMIT", async () => {
    const fakeQuery = vi.fn(async (_sql: string, _params: readonly unknown[]) => [
      {
        id: "mrt_geojson:mrt_exit:21437",
        kind: "mrt_exit",
        name: "BUGIS MRT STATION (E)",
        station_name: "BUGIS MRT STATION",
        exit_code: "E",
        lat: 1.3,
        lng: 103.86,
        address_key: null,
        distance_meters: 250.3,
      },
    ]);
    const places = await queryNearbyPlaces(fakeQuery, {
      lat: 1.3,
      lng: 103.86,
      radiusMeters: 1500,
      limit: 25,
      kinds: ["mrt_exit"],
    });
    expect(places).toEqual([
      {
        id: "mrt_geojson:mrt_exit:21437",
        kind: "mrt_exit",
        name: "BUGIS MRT STATION (E)",
        stationName: "BUGIS MRT STATION",
        exitCode: "E",
        lat: 1.3,
        lng: 103.86,
        addressKey: null,
        distanceMeters: 250.3,
      },
    ]);
    expect(NEARBY_SPATIAL_SQL).toContain("p.source_properties->>'STATION_NA'");
    expect(NEARBY_SPATIAL_SQL).toContain("p.source_properties->>'EXIT_CODE'");
    expect(NEARBY_SPATIAL_SQL).toContain("ROW_NUMBER() OVER");
    expect(NEARBY_SPATIAL_SQL.indexOf("WHERE station_rank=1")).toBeLessThan(
      NEARBY_SPATIAL_SQL.lastIndexOf("LIMIT $5"),
    );
    expect(fakeQuery).toHaveBeenCalledOnce();
  });

  it("routes GET and rejects POST without falling back to assets", () => {
    expect(matchApiRoute(url(valid), "GET")).toMatchObject({
      kind: "handler",
      routeId: "nearby-places",
    });
    expect(matchApiRoute(url(valid), "POST")).toMatchObject({
      kind: "method_not_allowed",
      allow: ["GET"],
    });
  });
});
