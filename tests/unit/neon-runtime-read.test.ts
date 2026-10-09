import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { buildSearchQuery, parseSearchRequest } from "../../functions/_lib/search";
import { resetStationNamesCacheForTests } from "../../functions/_lib/suggest";
import { createPublicReadAdapter } from "../../scripts/neon-benchmark/runtime-read-adapter.mjs";
import {
  compilePublicRead,
  createPublicReadDb,
} from "../../scripts/neon-benchmark/runtime-read-sql";
import { rowToBlockSummary } from "../../shared/d1-block-row";
import {
  PublicTraceCollector,
  minimizePublicTailEvent,
  type PublicTraceAllowlist,
} from "../../scripts/neon-benchmark/runtime-trace";

const block = {
  address_key: "1-bedok-north",
  town: "BEDOK",
  block: "1",
  street_name: "BEDOK NORTH",
  display_name: null,
  lat: 1.3,
  lng: 103.9,
  median_price: 500000.75,
  price_per_sqm_median: 5000,
  transaction_count: 5,
  floor_area_min: 80,
  floor_area_max: 110,
  lease_commence_year: 1990,
  latest_month: "2026-09",
  available_min_month: "1990-01",
  available_max_month: "2026-09",
  postal_code: "460001",
  flat_types_json: '["4 ROOM"]',
  flat_models_json: '["Model A"]',
  median_price_by_flat_type_json: '{"4 ROOM":500000.75}',
  median_price_per_sqm_by_flat_type_json: null,
  nearest_mrt_json: null,
  nearby_mrts_json: "[]",
  flat_type_cohorts_json:
    '{"4 ROOM":{"transactionCount":5,"floorAreaRange":[80,110],"flatModels":["Model A"],"latestMonth":"2026-09"}}',
};
function fixture(cacheEnabled = false) {
  let manifest = JSON.stringify({ generatedAt: "v1", counts: { blocks: 1 } });
  const storage = new Map<string, Response>();
  const cache = {
    match: async (r: Request) => storage.get(r.url)?.clone(),
    put: async (r: Request, value: Response) => {
      storage.set(r.url, value.clone());
    },
  };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("public.manifest")) return [{ json: manifest }];
    if (sql.includes("public.block_details"))
      return [{ json: '{"addressKey":"1-bedok-north","transactions":[]}' }];
    if (sql.includes("public.comparisons"))
      return [{ json: '{"addressKey":"1-bedok-north","percentile":42}' }];
    if (sql.includes("public.mrt_geojson"))
      return [{ json: '{"type":"FeatureCollection","features":[]}' }];
    if (sql.includes("public.town_flat_type_trends"))
      return [
        {
          town: "BEDOK",
          flat_type: "4 ROOM",
          month: "2026-09",
          median_price: 500000,
          median_price_per_sqm: 5000,
          transaction_count: 5,
        },
      ];
    if (sql.includes("COUNT(*)")) return [{ total_count: 1, populated_count: 1 }];
    return [block];
  });
  return {
    query,
    adapter: createPublicReadAdapter(query, cacheEnabled ? cache : null),
    storage,
    setManifest: (value: string) => {
      manifest = value;
    },
  };
}
const request = (path: string) => new Request(`https://replay.example${path}`);
beforeEach(() => {
  resetStationNamesCacheForTests();
});
describe("isolated native public read adapter", () => {
  it.each(["/api/block-summaries", "/api/blocks/bedok", "/api/search?town=BEDOK"])(
    "preserves block contract at %s",
    async (path) => {
      const f = fixture();
      const response = await f.adapter(request(path));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(path.includes("search") ? (body as { blocks: unknown[] }).blocks : body).toEqual([
        JSON.parse(JSON.stringify(rowToBlockSummary(block))),
      ]);
      expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=3600");
      expect(f.query.mock.calls[0][0]).toContain("flat_types_json::text AS flat_types_json");
    },
  );
  it.each([
    ["/api/manifest", { generatedAt: "v1", counts: { blocks: 1 } }],
    ["/api/details/1-bedok-north", { addressKey: "1-bedok-north", transactions: [] }],
    ["/api/comparisons/1-bedok-north", { addressKey: "1-bedok-north", percentile: 42 }],
    ["/api/mrt-stations", { type: "FeatureCollection", features: [] }],
    ["/api/mrt-exits", { type: "FeatureCollection", features: [] }],
  ])("returns the actual JSON document at %s", async (path, expected) => {
    const response = await fixture().adapter(request(path));
    expect(await response.json()).toEqual(expected);
  });
  it("preserves trend field names", async () => {
    const response = await fixture().adapter(request("/api/trends/town-flat-type"));
    expect(await response.json()).toEqual([
      {
        town: "BEDOK",
        flatType: "4 ROOM",
        month: "2026-09",
        medianPrice: 500000,
        medianPricePerSqm: 5000,
        transactionCount: 5,
      },
    ]);
  });
  // Main answers suggest from bounded name matches on every request; the cached block dictionary this rehearsal
  // was first written against was prototyped and deliberately left out (docs/architecture/public-read-backend.md).
  // Only the MRT station names are still kept for the life of the isolate.
  it("uses real ranking over per-request name matches, with an isolate hit for the station names on another query", async () => {
    const f = fixture(true);
    const reads = (table: string) =>
      f.query.mock.calls.filter(([sql]) => sql.includes(`public.${table}`));
    const body = (await (await f.adapter(request("/api/suggest?q=bedok"))).json()) as {
      suggestions: unknown[];
    };
    expect(body.suggestions).toContainEqual({ group: "town", label: "Bedok", town: "BEDOK" });
    // Towns, streets and blocks each ask for their prefix matches and their substring matches.
    expect(reads("blocks")).toHaveLength(6);
    expect(reads("mrt_geojson")).toHaveLength(1);
    f.query.mockClear();
    await f.adapter(request("/api/suggest?q=bedok+north"));
    // No block dictionary is remembered, so the same six reads run again; the station names are already in
    // memory. The outer cache reads the manifest before and after.
    expect(reads("blocks")).toHaveLength(6);
    expect(reads("mrt_geojson")).toHaveLength(0);
    expect(reads("manifest")).toHaveLength(2);
  });
  it("never pages or scans the blocks table for suggest, however many blocks exist", async () => {
    const blocks = Array.from({ length: 5001 }, (_, i) => ({
      town: "BEDOK",
      street_name: "BEDOK NORTH",
      address_key: String(i).padStart(6, "0"),
      block: String(i),
      postal_code: null,
    }));
    const sent: string[] = [];
    const query = vi.fn(async (sql: string) => {
      sent.push(sql);
      if (sql.includes("public.mrt_geojson")) return [{ json: '{"features":[]}' }];
      // A bounded name match: however many blocks match, the statement itself returns at most 20.
      expect(sql).toContain("LIMIT 20");
      return blocks.slice(0, 20);
    });
    const response = await createPublicReadAdapter(query, null)(request("/api/suggest?q=bedok"));
    expect(response.status).toBe(200);
    // Each group's 20 prefix matches already fill its cap, so no substring read follows.
    expect(sent.filter((sql) => sql.includes("FROM public.blocks"))).toHaveLength(3);
    expect(sent.some((sql) => sql.includes('address_key COLLATE "C" >'))).toBe(false);
    expect(query).toHaveBeenCalledTimes(4); // No outer Cache API: three bounded name reads plus the MRT exits.
  });
  it("warm public hits and canonical search equivalents execute zero queries", async () => {
    const f = fixture(true);
    await f.adapter(request("/api/search?town=BEDOK&budgetMax=0500000"));
    f.query.mockClear();
    const response = await f.adapter(request("/api/search?budgetMax=500000&town=BEDOK"));
    expect(response.headers.get("x-data-cache")).toBe("HIT");
    expect(f.query).not.toHaveBeenCalled();
  });
  it("discovers the new manifest after pointer removal and does not share errors", async () => {
    const f = fixture(true);
    await f.adapter(request("/api/manifest"));
    f.storage.delete("https://replay.example/__public-data-cache/v1/pointer");
    f.setManifest('{"generatedAt":"v2","counts":{"blocks":1}}');
    const response = await f.adapter(request("/api/manifest"));
    expect(((await response.json()) as { generatedAt: string }).generatedAt).toBe("v2");
    const bad = await f.adapter(request("/api/suggest?q=x"));
    expect(bad.status).toBe(400);
    expect([...f.storage.keys()].some((key) => key.includes("q=x"))).toBe(false);
  });
  it.each([
    ["/api/shortlist/private", "GET", {}],
    ["/api/comparable-transactions", "POST", {}],
    ["/api/manifest", "GET", { cookie: "secret" }],
    ["/api/manifest", "GET", { authorization: "secret" }],
  ])("rejects excluded requests before SQL: %s", async (path, method, headers) => {
    const f = fixture(true);
    const response = await f.adapter(
      new Request(`https://replay.example${path}`, { method, headers }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(f.query).not.toHaveBeenCalled();
  });
  it("rejects unknown/mutating SQL and excess/missing bindings before transport", async () => {
    const query = vi.fn(async () => []);
    const db = createPublicReadDb(query);
    await expect(db.prepare("DELETE FROM blocks").all()).rejects.toThrow("allowlist");
    await expect(
      db.prepare("SELECT json FROM manifest WHERE id = 1; DELETE FROM manifest").all(),
    ).rejects.toThrow("allowlist");
    expect(() => compilePublicRead("SELECT json FROM comparisons WHERE address_key = ?")).toThrow(
      "Missing",
    );
    expect(() => compilePublicRead("SELECT json FROM manifest WHERE id = 1", [1])).toThrow(
      "Unexpected",
    );
    expect(query).not.toHaveBeenCalled();
  });
  it("ports every selected-type refinement without changing bound values or integer truncation", () => {
    const parsed = parseSearchRequest(
      new URL(
        "https://x/api/search?town=BEDOK&flatType=4%20ROOM&budgetMin=450000.5&budgetMax=600000&flatModel=model+a&areaMin=90&areaMax=105&mrtMax=1000&remainingLeaseMin=50&startMonth=2025-01&endMonth=2026-09",
      ),
    );
    if (!parsed.ok) throw Error("Invalid fixture");
    const source = buildSearchQuery(parsed.request, 2026);
    const port = compilePublicRead(
      `SELECT blocks.* FROM blocks ${source.whereSql} ORDER BY address_key LIMIT ?`,
      [...source.bindings, 2001],
    );
    expect(port.sql).toContain("trunc(");
    expect(port.sql).toContain("jsonb_array_elements_text");
    expect(port.sql).toContain("::text[]");
    expect(port.sql).not.toContain("json_extract");
    expect(port.params).toContainEqual(["4 ROOM", "floorAreaRange", "1"]);
    expect(port.params).toContainEqual(["4 ROOM", "floorAreaRange", "0"]);
    expect(port.params).toContainEqual(["4 ROOM", "flatModels"]);
    expect(port.params).toContainEqual(["4 ROOM", "latestMonth"]);
    expect(port.params.at(-1)).toBe(2001);
    expect(port.params).toContain(450000.5);
    expect(port.sql).toContain('ORDER BY address_key COLLATE "C"');
  });
  it("keeps a truthful unavailable-cohort search response", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("COUNT(*)")) return [{ total_count: 2, populated_count: 1 }];
      expect(sql).toContain("WHERE 0 = 1");
      return [];
    });
    const response = await createPublicReadAdapter(
      query,
      null,
    )(request("/api/search?flatType=4%20ROOM&areaMin=90"));
    expect(await response.json()).toEqual({
      blocks: [],
      truncated: false,
      limit: 2000,
      cohortMetadataAvailable: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });
});

const allow: PublicTraceAllowlist = {
  addresses: new Set(["1-bedok-north"]),
  townSlugs: new Set(["bedok"]),
  towns: new Set(["BEDOK"]),
  flatTypes: new Set(["4 ROOM"]),
  flatModels: new Set(["MODEL A"]),
  suggestionQueries: new Set(["bedok", "bedok north"]),
};
const tail = (
  url = "https://prod.example/api/manifest",
  headers: Record<string, unknown> = {},
) => ({
  eventTimestamp: 101000,
  event: {
    request: { method: "GET", url, headers, cf: { colo: "SIN", clientTcpRtt: 42, ip: "private" } },
    body: "private",
  },
  logs: [{ message: "private" }],
});
describe("minimal trace privacy and hard stops", () => {
  it("drops all identity and ignored query fields; keeps actual canonical semantics", () => {
    const result = minimizePublicTailEvent(
      tail("https://prod.example/api/search?town=BEDOK&budgetMax=0500000&session=private", {
        "user-agent": "private",
        referer: "private",
        "x-forwarded-for": "private",
      }),
      allow,
      100000,
    );
    expect(result).toEqual({
      ok: true,
      event: {
        path: "/api/search",
        query: "budgetMax=500000&town=BEDOK",
        offsetMs: 1000,
        pop: "SIN",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each([
    tail("https://x/api/shortlist/private"),
    tail("https://x/api/manifest", { Cookie: "private" }),
    tail("https://x/api/manifest", { AUTHORIZATION: "private" }),
    tail("https://x/api/suggest?q=private-person"),
  ])("rejects private/unapproved input", (raw) => {
    expect(minimizePublicTailEvent(raw, allow, 100000).ok).toBe(false);
  });
  it("rejects missing eligibility metadata and non-GETs", () => {
    expect(
      minimizePublicTailEvent(
        {
          eventTimestamp: 101000,
          event: { request: { method: "GET", url: "https://x/api/manifest" } },
        },
        allow,
        100000,
      ).ok,
    ).toBe(false);
    const raw = tail();
    raw.event.request.method = "POST";
    expect(minimizePublicTailEvent(raw, allow, 100000).ok).toBe(false);
  });
  it("deduplicates into weighted second buckets and stops exactly at the eligible cap", () => {
    const c = new PublicTraceCollector(allow, 100000, {
      maximumEligible: 2,
      maximumBytes: 2048,
      maximumMs: 10000,
    });
    expect(c.accept(tail(), 1000)).toBe(true);
    expect(c.accept(tail(), 1001)).toBe(true);
    expect(c.groups).toHaveLength(1);
    expect(c.groups[0].buckets).toEqual([{ offsetSecond: 1, count: 2 }]);
    expect(c.stopReason).toBe("eligible-limit");
    expect(c.accept(tail(), 1002)).toBe(false);
    expect(c.eligible).toBe(2);
  });
  it("never writes an event that exceeds output/time limits", () => {
    const c = new PublicTraceCollector(allow, 100000, {
      maximumEligible: 500,
      maximumBytes: 1100,
      maximumMs: 10000,
    });
    expect(c.accept(tail(), 1000)).toBe(false);
    expect(c.eligible).toBe(0);
    expect(c.stopReason).toBe("output-byte-limit");
    const timed = new PublicTraceCollector(allow, 100000, {
      maximumEligible: 500,
      maximumBytes: 2048,
      maximumMs: 1000,
    });
    expect(timed.accept(tail(), 1000)).toBe(false);
    expect(timed.stopReason).toBe("time-limit");
  });
});
