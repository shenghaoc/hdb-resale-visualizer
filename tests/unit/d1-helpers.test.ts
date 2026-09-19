import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  parseSlugParam,
  readBodyWithLimit,
  rowToBlockSummary,
  type BlockRow,
} from "../../functions/_lib/d1";

describe("readBodyWithLimit", () => {
  it("returns a 400 response when the request body reader cannot be acquired", async () => {
    const request = {
      headers: new Headers({ "content-length": "1" }),
      body: {
        getReader() {
          throw new TypeError("stream is locked");
        },
      },
    } as unknown as Request;

    const result = await readBodyWithLimit(request, 1024);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    await expect((result as Response).json()).resolves.toEqual({ error: "Bad Request" });
  });

  it("requires a finite content-length and rejects oversized declared payloads", async () => {
    const missing = await readBodyWithLimit(
      { headers: new Headers(), body: null } as unknown as Request,
      8,
    );
    expect(missing).toBeInstanceOf(Response);
    expect((missing as Response).status).toBe(411);

    const oversized = await readBodyWithLimit(
      {
        headers: new Headers({ "content-length": "9" }),
        body: { getReader: () => ({ read: async () => ({ done: true }) }) },
      } as unknown as Request,
      8,
    );
    expect(oversized).toBeInstanceOf(Response);
    expect((oversized as Response).status).toBe(413);

    const invalid = await readBodyWithLimit(
      {
        headers: new Headers({ "content-length": "nope" }),
        body: { getReader: () => ({ read: async () => ({ done: true }) }) },
      } as unknown as Request,
      8,
    );
    expect(invalid).toBeInstanceOf(Response);
    expect((invalid as Response).status).toBe(413);
  });

  it("returns the decoded body when the declared size is within the limit", async () => {
    const body = '{"ok":true}';
    const result = await readBodyWithLimit(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-length": String(body.length) },
        body,
      }),
      1024,
    );

    expect(result).toBe(body);
  });

  it("stops reading once the actual body exceeds the byte limit", async () => {
    const chunks = [new Uint8Array(5).fill(1), new Uint8Array(5).fill(2)];
    let index = 0;
    const result = await readBodyWithLimit(
      {
        headers: new Headers({ "content-length": "8" }),
        body: {
          getReader() {
            return {
              async read() {
                if (index >= chunks.length) return { done: true, value: undefined };
                return { done: false, value: chunks[index++] };
              },
              async cancel() {},
            };
          },
        },
      } as unknown as Request,
      8,
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });
});

describe("parseSlugParam", () => {
  it("returns null for a missing or empty path parameter", () => {
    expect(parseSlugParam({}, "town")).toBeNull();
    expect(parseSlugParam({ town: "" }, "town")).toBeNull();
    expect(parseSlugParam({ town: [] }, "town")).toBeNull();
  });

  it("uses the first array value and strips a trailing .json extension", () => {
    expect(parseSlugParam({ town: ["bedok.json", "ignored"] }, "town")).toBe("bedok");
    expect(parseSlugParam({ addressKey: "blk-1-bedok-north.json" }, "addressKey")).toBe(
      "blk-1-bedok-north",
    );
    expect(parseSlugParam({ town: "tampines" }, "town")).toBe("tampines");
  });
});

describe("rowToBlockSummary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function row(overrides: Partial<BlockRow> = {}): BlockRow {
    return {
      address_key: "bedok-1-bedok-north-ave-1",
      town: "BEDOK",
      block: "1",
      street_name: "BEDOK NORTH AVE 1",
      display_name: null,
      lat: 1.33,
      lng: 103.93,
      median_price: 500_000,
      price_per_sqm_median: 5_000,
      transaction_count: 12,
      floor_area_min: 80,
      floor_area_max: 100,
      lease_commence_year: 1990,
      latest_month: "2026-01",
      available_min_month: "2020-01",
      available_max_month: "2026-01",
      flat_types_json: '["4 ROOM"]',
      flat_models_json: '["MODEL A"]',
      median_price_by_flat_type_json: '{"4 ROOM":520000}',
      median_price_per_sqm_by_flat_type_json: null,
      nearest_mrt_json: '{"stationName":"Bedok","distanceMeters":400}',
      nearby_mrts_json: "[]",
      postal_code: "460001",
      ...overrides,
    };
  }

  it("maps a well-formed D1 row onto the BlockSummary contract", () => {
    expect(rowToBlockSummary(row())).toMatchObject({
      addressKey: "bedok-1-bedok-north-ave-1",
      town: "BEDOK",
      floorAreaRange: [80, 100],
      leaseCommenceRange: [1990, 1990],
      availableDateRange: ["2020-01", "2026-01"],
      flatTypes: ["4 ROOM"],
      medianPriceByFlatType: { "4 ROOM": 520_000 },
      nearestMrt: { stationName: "Bedok", distanceMeters: 400 },
      nearbyMrts: [],
    });
  });

  it("falls back instead of throwing when JSON blobs are corrupt or empty", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = rowToBlockSummary(
      row({
        flat_types_json: "not-json",
        flat_models_json: "",
        median_price_by_flat_type_json: "{",
        nearest_mrt_json: "null-ish",
        nearby_mrts_json: null,
        flat_type_cohorts_json: "[]",
      }),
    );

    expect(summary.flatTypes).toEqual([]);
    expect(summary.flatModels).toEqual([]);
    expect(summary.medianPriceByFlatType).toBeUndefined();
    expect(summary.nearestMrt).toBeNull();
    expect(summary.nearbyMrts).toEqual([]);
    expect(summary.flatTypeCohorts).toEqual([]);
  });
});
