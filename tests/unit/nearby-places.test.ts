import { describe, expect, it, vi } from "vite-plus/test";
import type { PublicData } from "../../functions/_lib/public-data";
import { onRequestGet } from "../../functions/api/nearby-places";
import {
  canonicalNearbyPlacesParams,
  parseNearbyPlacesRequest,
  parseNeonSpatialMode,
} from "../../shared/nearby-places";
import { createNeonPublicData } from "../../worker/public-data-neon";
import {
  NEARBY_BLOCK_SPATIAL_SQL,
  NEARBY_LABELLED_SQL,
  NEARBY_SPATIAL_SQL,
  queryNearbyPlaces,
} from "../../worker/nearby-spatial-query";
import { matchApiRoute } from "../../worker/api-route-match";

const url = (suffix: string) => new URL("https://example.com/api/nearby-places" + suffix);
const BLOCK = "central-area-535-upp-cross-st";
const valid = `?block=${BLOCK}`;
const fetchResult = (publicData: PublicData, suffix = valid) =>
  onRequestGet({
    publicData,
    request: new Request(url(suffix)),
    params: {},
  });

const VERSION = "ab".repeat(32);
/** The first row of the labelled statement: the publication the places were read from. */
const header = (overrides: Record<string, unknown> = {}) => ({
  row_type: "publication",
  version: VERSION,
  manifest_type: "object",
  marker: null,
  ...overrides,
});
const place = (row: Record<string, unknown>) => ({ row_type: "place", ...row });

describe("bounded PostGIS nearby endpoint", () => {
  it.each([
    [undefined, "off"],
    ["off", "off"],
    ["blocks", "blocks"],
    ["", "off"],
    ["true", "off"],
    ["BLOCKS", "off"],
    ["coordinates", "off"],
    ["blocks ", "off"],
  ])("NEON_SPATIAL_MODE=%j is the mode %s", (value, mode) => {
    expect(parseNeonSpatialMode(value)).toBe(mode);
  });

  it("accepts a block address key and fixes the radius, limit and kinds itself", () => {
    const parsed = parseNearbyPlacesRequest(url(valid));
    expect(parsed).toEqual({
      ok: true,
      request: { block: BLOCK, radiusMeters: 1500, limit: 25, kinds: ["mrt_exit"] },
    });
    if (!parsed.ok) return;
    expect(canonicalNearbyPlacesParams(parsed.request).toString()).toBe(`block=${BLOCK}`);
    expect(parseNearbyPlacesRequest(url("?block=bedok-10d-bedok-sth-ave-2")).ok).toBe(true);
  });

  it.each([
    "?lat=1.35&lng=103.75",
    "?lat=1.35&lng=103.75&radius=1500&limit=25&types=mrt_exit",
    `?block=${BLOCK}&lat=1.35&lng=103.75`,
    `?block=${BLOCK}&lat=1.35`,
    "?lng=103.75",
  ])("refuses a request that carries coordinates: %s", (suffix) => {
    const parsed = parseNearbyPlacesRequest(url(suffix));
    expect(parsed).toEqual({
      ok: false,
      error: "Coordinate searches are not available; pass block=<address key>",
    });
  });

  it.each([
    "",
    "?block=",
    `?block=${BLOCK}&block=bedok-1-x`,
    `?block=${BLOCK}&radius=1500`,
    `?block=${BLOCK}&limit=25`,
    `?block=${BLOCK}&types=mrt_exit`,
    `?block=${BLOCK}&other=hello`,
    "?block=Central-Area-535",
    "?block=central%20area",
    "?block=central--area",
    "?block=-central",
    "?block=central_area",
    "?block=%27%3B%20DROP%20TABLE%20blocks",
    `?block=${"a".repeat(121)}`,
    `?address_key=${BLOCK}`,
  ])("rejects anything but exactly one well-formed block key: %s", (suffix) => {
    expect(parseNearbyPlacesRequest(url(suffix)).ok).toBe(false);
  });

  it("answers a coordinate request with 400 and sends nothing", async () => {
    const query = vi.fn(async () => []);
    const response = await fetchResult(
      createNeonPublicData(query),
      "?lat=1.35&lng=103.75&radius=1500&types=mrt_exit",
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Coordinate searches are not available; pass block=<address key>",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("returns a clear no-store error on D1 rollback, without faking an empty POI set", async () => {
    const response = await fetchResult({} as PublicData);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("only dispatches a bounded parameterized PostGIS query", async () => {
    const query = vi.fn(async (_sql: string, _params: readonly unknown[]) => [
      header(),
      place({
        id: "mrt_geojson:mrt_station:BUKIT BATOK MRT STATION",
        kind: "mrt_station",
        name: "BUKIT BATOK MRT STATION",
        lat: 1.349,
        lng: 103.749,
        address_key: null,
        distance_meters: 151.2,
      }),
    ]);
    const data = createNeonPublicData(query);
    const response = await fetchResult(data);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      block: BLOCK,
      radiusMeters: 1500,
      limit: 25,
      types: ["mrt_exit"],
      distanceBasis: "straight-line",
      places: [{ kind: "mrt_station", distanceMeters: 151.2, addressKey: null }],
    });
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toBe(NEARBY_LABELLED_SQL);
    expect(sql).toContain("ST_DWithin");
    expect(sql).toContain("public.poi_locations");
    expect(sql).toContain("public.blocks");
    expect(sql).toContain("ORDER BY distance_meters");
    // The block's key is a bound parameter; its coordinates come from the statement's own lookup.
    expect(params).toEqual([BLOCK, 1500, ["mrt_exit"], 25]);
    expect(sql).not.toContain(BLOCK);
    expect(sql).toContain(
      "FROM public.block_locations AS origin WHERE origin.address_key = $1::text",
    );
  });

  it("groups MRT exits in SQL by the official station name before LIMIT", async () => {
    const fakeQuery = vi.fn(async (_sql: string, _params: readonly unknown[]) => [
      header(),
      place({
        id: "mrt_geojson:mrt_exit:21437",
        kind: "mrt_exit",
        name: "BUGIS MRT STATION (E)",
        station_name: "BUGIS MRT STATION",
        exit_code: "E",
        lat: 1.3,
        lng: 103.86,
        address_key: null,
        distance_meters: 250.3,
      }),
    ]);
    const { places } = await queryNearbyPlaces(fakeQuery, {
      block: BLOCK,
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

  describe("one labelled statement per cache miss", () => {
    const request = {
      block: BLOCK,
      radiusMeters: 1500,
      limit: 25,
      kinds: ["mrt_exit"],
    } as const;
    const exitRow = place({
      id: "mrt_geojson:mrt_exit:1",
      kind: "mrt_exit",
      name: "X (A)",
      station_name: "X",
      exit_code: "A",
      lat: 1.3,
      lng: 103.86,
      address_key: null,
      distance_meters: 10,
    });
    const read = (rows: Record<string, unknown>[]) =>
      queryNearbyPlaces(async () => rows, { ...request, kinds: [...request.kinds] });

    it("is the verified query with only its centre and parameter numbers changed", () => {
      // sql/neon/verify_nearby_spatial_sql.sql checks NEARBY_SPATIAL_SQL against a brute-force oracle. The block
      // statement must be that text with the centre taken from the block's stored location and nothing else.
      const pointCentre =
        "  SELECT ST_SetSRID(ST_MakePoint($2::double precision,$1::double precision),4326)::geography AS point";
      const blockCentre =
        "  SELECT origin.location::geography AS point FROM public.block_locations AS origin WHERE origin.address_key = $1::text";
      expect(NEARBY_SPATIAL_SQL).toContain(pointCentre);
      expect(NEARBY_BLOCK_SPATIAL_SQL).toContain(blockCentre);
      const renumbered = NEARBY_SPATIAL_SQL.replace(pointCentre, blockCentre)
        .replaceAll("$3::double precision", "$2::double precision")
        .replaceAll("$4::text[]", "$3::text[]")
        .replace("LIMIT $5", "LIMIT $4");
      expect(NEARBY_BLOCK_SPATIAL_SQL).toBe(renumbered);
    });

    it("embeds the block query verbatim and binds exactly its four parameters", () => {
      expect(NEARBY_LABELLED_SQL).toContain(NEARBY_BLOCK_SPATIAL_SQL);
      expect([...new Set(NEARBY_LABELLED_SQL.match(/\$\d+/g))].sort()).toEqual([
        "$1",
        "$2",
        "$3",
        "$4",
      ]);
      // No coordinate is ever bound or written into the statement the Worker sends.
      expect(NEARBY_LABELLED_SQL).not.toContain("ST_MakePoint");
      // Read only, and the wrapper adds nothing but the manifest lookup and the ordering.
      expect(NEARBY_LABELLED_SQL.replace(NEARBY_BLOCK_SPATIAL_SQL, "")).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|COPY)\b/i,
      );
      expect(NEARBY_LABELLED_SQL).toContain("FROM public.manifest WHERE id = 1");
      // The publication header sorts first, then the places in the verified order.
      expect(NEARBY_LABELLED_SQL).toContain(
        'ORDER BY (row_type <> \'publication\'), distance_meters ASC, kind COLLATE "C" ASC, id COLLATE "C" ASC',
      );
    });

    it("labels the places with the publication that the same statement read", async () => {
      const result = await read([header(), exitRow]);
      expect(result.places).toHaveLength(1);
      expect(result.publication).toEqual({ version: VERSION, state: { inProgress: false } });
    });

    it("reports a publication in progress with its base generation, from the marker alone", async () => {
      const base = "cd".repeat(32);
      const marker = JSON.stringify({
        baseVersion: base,
        startedAt: "2026-10-10T01:00:00.000Z",
        owner: "run-1",
      });
      const result = await read([header({ marker }), exitRow]);
      expect(result.publication).toEqual({
        version: VERSION,
        state: {
          inProgress: true,
          reason: "marker",
          baseVersion: base,
          startedAt: "2026-10-10T01:00:00.000Z",
        },
      });
      // A marker with no usable base is still "in progress", with nothing to fall back to.
      const bare = await read([header({ marker: "null" }), exitRow]);
      expect(bare.publication?.state).toMatchObject({
        inProgress: true,
        reason: "marker",
        baseVersion: null,
      });
    });

    it("treats a manifest that is not a JSON object as unreadable", async () => {
      const result = await read([header({ manifest_type: "array" }), exitRow]);
      expect(result.publication?.state).toMatchObject({ inProgress: true, reason: "unreadable" });
    });

    it("returns no publication, and still the places, when the database stores no manifest", async () => {
      const result = await read([exitRow]);
      expect(result.publication).toBeNull();
      expect(result.places).toHaveLength(1);
    });

    it("returns an empty list with a label when nothing is nearby (the header row is the only row)", async () => {
      const result = await read([header()]);
      expect(result.places).toEqual([]);
      expect(result.publication?.version).toBe(VERSION);
    });

    it.each([
      ["a version that is not a SHA-256", header({ version: "not-a-hash" })],
      ["an upper-case version", header({ version: VERSION.toUpperCase() })],
      ["a missing version", header({ version: undefined })],
    ])("refuses %s rather than labelling the answer with it", async (_name, bad) => {
      await expect(read([bad, exitRow])).rejects.toThrow("Malformed publication label");
    });

    it("hands the route's response and the label to the cache layer from one statement", async () => {
      const query = vi.fn(async (_sql: string, _params: readonly unknown[]) => [header(), exitRow]);
      const { readNearbyPlaces } = await import("../../functions/api/nearby-places");
      const result = await readNearbyPlaces({
        publicData: createNeonPublicData(query),
        request: new Request(url(valid)),
        params: {},
      });
      expect(result.response.status).toBe(200);
      expect(result.publication).toEqual({ version: VERSION, state: { inProgress: false } });
      expect(query).toHaveBeenCalledOnce();
    });

    it("asks for admission only once the request is valid and answerable, and sends nothing if refused", async () => {
      const { readNearbyPlaces } = await import("../../functions/api/nearby-places");
      const admit = vi.fn(async () => null as Response | null);
      const query = vi.fn(async (_sql: string, _params: readonly unknown[]) => [header(), exitRow]);
      const context = (suffix: string, publicData: PublicData) => ({
        publicData,
        request: new Request(url(suffix)),
        params: {},
      });

      await readNearbyPlaces(context("?block=Not_A_Key", createNeonPublicData(query)), admit);
      await readNearbyPlaces(context(valid, {} as PublicData), admit); // a backend without PostGIS
      expect(admit).not.toHaveBeenCalled();

      const ok = await readNearbyPlaces(context(valid, createNeonPublicData(query)), admit);
      expect(ok.response.status).toBe(200);
      expect(admit).toHaveBeenCalledOnce();
      expect(query).toHaveBeenCalledOnce();

      query.mockClear();
      const busy = new Response("busy", { status: 503 });
      admit.mockResolvedValueOnce(busy);
      const refused = await readNearbyPlaces(context(valid, createNeonPublicData(query)), admit);
      expect(refused.response).toBe(busy);
      expect(refused.publication).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    });

    it("gives no label for answers that no statement produced", async () => {
      const { readNearbyPlaces } = await import("../../functions/api/nearby-places");
      const invalid = await readNearbyPlaces({
        publicData: {} as PublicData,
        request: new Request(url("?block=Not_A_Key")),
        params: {},
      });
      expect(invalid.response.status).toBe(400);
      expect(invalid.publication).toBeUndefined();

      const unavailable = await readNearbyPlaces({
        publicData: {} as PublicData,
        request: new Request(url(valid)),
        params: {},
      });
      expect(unavailable.response.status).toBe(503);
      expect(unavailable.publication).toBeUndefined();

      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const failed = await readNearbyPlaces({
        publicData: createNeonPublicData(async () => {
          throw new Error("boom");
        }),
        request: new Request(url(valid)),
        params: {},
      });
      expect(failed.response.status).toBe(500);
      expect(failed.publication).toBeUndefined();
      log.mockRestore();
    });
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
