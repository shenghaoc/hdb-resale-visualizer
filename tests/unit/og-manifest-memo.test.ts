// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createPublicReadScope,
  type PublicDataCache,
  type PublicReadTransport,
} from "../../worker/public-read-backend";

vi.mock("@resvg/resvg-wasm", () => ({
  initWasm: async () => {},
  Resvg: class {
    render() {
      return { asPng: () => new Uint8Array([137, 80, 78, 71]), free: () => {} };
    }
    free() {}
  },
}));
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: {} }));
vi.mock("../../worker/Inter-Regular.ttf", () => ({ default: new ArrayBuffer(0) }));

// Load the Cloudflare-only module without pulling its WASM and font imports into the DOM TypeScript test project.
const ogModule = "../../worker/og";
const og = (await import(ogModule)) as {
  handleBlockOg: (
    request: Request,
    env: Env,
    addressKey: string,
    ctx: ExecutionContext,
    cache?: PublicDataCache | null,
  ) => Promise<Response>;
  handleCompareOg: (
    request: Request,
    env: Env,
    townA: string,
    townB: string,
    ctx: ExecutionContext,
    cache?: PublicDataCache | null,
  ) => Promise<Response>;
  resetOgManifestCacheForTests: () => void;
};

const NEON_MANIFEST = JSON.stringify({
  generatedAt: "2026-10-04T15:30:00.000Z",
  dataWindow: { minMonth: "2023-10", maxMonth: "2026-09" },
});
const D1_MANIFEST = JSON.stringify({
  generatedAt: "2026-08-29T01:37:16.797Z",
  dataWindow: { minMonth: "2023-08", maxMonth: "2026-08" },
});
const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;
const blockRequest = (key: string) => new Request(`https://example.com/og/block/${key}.png`);

/** Every image is already cached, so the only database read an OG request can make is the manifest memo's. */
function imageCache() {
  return {
    match: vi.fn(async (_request: Request) => new Response("png")),
    put: vi.fn(async () => {}),
  } satisfies PublicDataCache;
}
const versionsSeenBy = (cache: ReturnType<typeof imageCache>) =>
  cache.match.mock.calls.map(([request]) => {
    const url = new URL(request.url);
    return {
      namespace: decodeURIComponent(url.pathname.split("/")[2] ?? ""),
      version: url.searchParams.get("v"),
    };
  });

describe("OG manifest memo", () => {
  const neonManifestReads = vi.fn();
  const d1ManifestReads = vi.fn();
  const privateD1 = {
    prepare: () => ({ first: async () => d1ManifestReads() }),
  } as unknown as D1Database;

  /** A Neon request: a NEW request-scoped transport and adapter every time, like the Worker creates. */
  function neonRequestEnv(epoch = "neon-test-1") {
    const transport = (): PublicReadTransport => ({
      query: async (sql) => {
        if (!sql.endsWith("FROM public.manifest WHERE id = 1"))
          throw new Error(`the OG memo must not run: ${sql}`);
        neonManifestReads();
        return [{ json: NEON_MANIFEST }];
      },
      snapshot: (respond) => respond(),
      close: async () => {},
    });
    return createPublicReadScope(
      {
        PUBLIC_DATA_BACKEND: "neon",
        NEON_PUBLIC_CACHE_EPOCH: epoch,
        HDB_PUBLIC_NEON: {} as Hyperdrive,
        DB: privateD1,
      } as unknown as Env,
      transport,
    );
  }
  function d1RequestEnv(epoch = "d1-test-1") {
    return createPublicReadScope(
      {
        PUBLIC_DATA_BACKEND: "d1",
        D1_PUBLIC_CACHE_EPOCH: epoch,
        DB: privateD1,
      } as unknown as Env,
      () => {
        throw new Error("D1 mode must not open a Neon transport");
      },
    );
  }

  beforeEach(() => {
    og.resetOgManifestCacheForTests();
    neonManifestReads.mockReset();
    d1ManifestReads.mockReset().mockResolvedValue({ json: D1_MANIFEST });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses the manifest metadata across Neon requests even though every request has its own adapter", async () => {
    const cache = imageCache();
    const first = neonRequestEnv();
    const second = neonRequestEnv();
    expect(second.publicEnv.DB).not.toBe(first.publicEnv.DB);
    expect(second.publicEnv.PUBLIC_DATA_CACHE_NAMESPACE).toBe(
      first.publicEnv.PUBLIC_DATA_CACHE_NAMESPACE,
    );

    await og.handleBlockOg(blockRequest("a"), first.publicEnv, "a", ctx, cache);
    await og.handleBlockOg(blockRequest("b"), second.publicEnv, "b", ctx, cache);
    await og.handleCompareOg(
      new Request("https://example.com/og/compare/bedok/yishun.png"),
      neonRequestEnv().publicEnv,
      "bedok",
      "yishun",
      ctx,
      cache,
    );

    expect(cache.match).toHaveBeenCalledTimes(3);
    expect(neonManifestReads).toHaveBeenCalledTimes(1);
    expect(versionsSeenBy(cache).map((seen) => seen.version)).toEqual([
      "2026-10-04T15:30:00.000Z",
      "2026-10-04T15:30:00.000Z",
      "2026-10-04T15:30:00.000Z",
    ]);
  });

  it("never lends one backend's or epoch's manifest to another namespace", async () => {
    const cache = imageCache();
    await og.handleBlockOg(blockRequest("a"), d1RequestEnv().publicEnv, "a", ctx, cache);
    await og.handleBlockOg(blockRequest("a"), neonRequestEnv().publicEnv, "a", ctx, cache);
    await og.handleBlockOg(
      blockRequest("a"),
      neonRequestEnv("neon-test-2").publicEnv,
      "a",
      ctx,
      cache,
    );
    await og.handleBlockOg(blockRequest("a"), d1RequestEnv("d1-test-2").publicEnv, "a", ctx, cache);

    expect(versionsSeenBy(cache)).toEqual([
      { namespace: "d1-d1-test-1", version: "2026-08-29T01:37:16.797Z" },
      { namespace: "neon-neon-test-1", version: "2026-10-04T15:30:00.000Z" },
      { namespace: "neon-neon-test-2", version: "2026-10-04T15:30:00.000Z" },
      { namespace: "d1-d1-test-2", version: "2026-08-29T01:37:16.797Z" },
    ]);
    // Each namespace had to read its own backend once.
    expect(d1ManifestReads).toHaveBeenCalledTimes(2);
    expect(neonManifestReads).toHaveBeenCalledTimes(2);
  });

  it("still reads D1 once for repeated requests on D1", async () => {
    const cache = imageCache();
    for (const key of ["a", "b", "c"])
      await og.handleBlockOg(blockRequest(key), d1RequestEnv().publicEnv, key, ctx, cache);
    expect(d1ManifestReads).toHaveBeenCalledTimes(1);
    expect(neonManifestReads).not.toHaveBeenCalled();
  });

  it("re-reads the manifest once the five minute memo has expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    const cache = imageCache();
    await og.handleBlockOg(blockRequest("a"), neonRequestEnv().publicEnv, "a", ctx, cache);
    vi.setSystemTime(new Date("2026-10-07T00:04:59Z"));
    await og.handleBlockOg(blockRequest("a"), neonRequestEnv().publicEnv, "a", ctx, cache);
    expect(neonManifestReads).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-07T00:05:01Z"));
    await og.handleBlockOg(blockRequest("a"), neonRequestEnv().publicEnv, "a", ctx, cache);
    expect(neonManifestReads).toHaveBeenCalledTimes(2);
  });
});

describe("OG cards when the manifest read is degraded", () => {
  /** What `SELECT * FROM blocks WHERE address_key = ?` returns: everything `rowToBlockSummary` reads. */
  const blockRow = {
    address_key: "bedok-1-test-st",
    town: "BEDOK",
    block: "1",
    street_name: "TEST ST",
    display_name: null,
    lat: 1.3,
    lng: 103.9,
    median_price: 500000,
    price_per_sqm_median: 5000,
    transaction_count: 3,
    floor_area_min: 80,
    floor_area_max: 100,
    lease_commence_year: 1990,
    latest_month: "2026-08",
    available_min_month: "2020-01",
    available_max_month: "2026-08",
    flat_types_json: '["4 ROOM"]',
    flat_models_json: '["Improved"]',
    median_price_by_flat_type_json: null,
    median_price_per_sqm_by_flat_type_json: null,
    flat_type_cohorts_json: null,
    nearest_mrt_json: null,
    nearby_mrts_json: null,
    postal_code: null,
  };
  const manifestReads = vi.fn();

  function d1Request(manifest: () => unknown) {
    const DB = {
      prepare: (sql: string) => ({
        first: async () => {
          manifestReads(sql);
          return manifest();
        },
        bind: () => ({ first: async () => blockRow }),
      }),
    } as unknown as D1Database;
    return createPublicReadScope(
      { PUBLIC_DATA_BACKEND: "d1", D1_PUBLIC_CACHE_EPOCH: "d1-test-1", DB } as unknown as Env,
      () => {
        throw new Error("D1 mode must not open a Neon transport");
      },
    ).publicEnv;
  }
  /** An image cache that misses, so every request renders and tries to store. */
  const missingCache = () => ({
    match: vi.fn(async (_request: Request) => undefined),
    put: vi.fn(async (_request: Request, _response: Response) => {}),
  });

  beforeEach(() => {
    og.resetOgManifestCacheForTests();
    manifestReads.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["a missing manifest row", () => null],
    ["an unparseable manifest", () => ({ json: "not json" })],
    ["a manifest without generatedAt or dataWindow", () => ({ json: "{}" })],
    [
      "a manifest with a generatedAt but no dataWindow",
      () => ({ json: JSON.stringify({ generatedAt: "2026-10-04T15:30:00.000Z" }) }),
    ],
    [
      "a manifest with a dataWindow but no generatedAt",
      () => ({
        json: JSON.stringify({ dataWindow: { minMonth: "2023-10", maxMonth: "2026-09" } }),
      }),
    ],
  ])("neither remembers nor stores anything for %s", async (_label, manifest) => {
    const cache = missingCache();
    for (const key of ["a", "b"]) {
      const response = await og.handleBlockOg(
        blockRequest(key),
        d1Request(manifest),
        key,
        ctx,
        cache,
      );
      expect(response.status).toBe(200);
    }
    // Not remembered: a bad read must not pin placeholder cards for the whole memo interval...
    expect(manifestReads).toHaveBeenCalledTimes(2);
    // ...and a card rendered under the placeholder version is not stored, because that key never changes.
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("does remember and store a complete read", async () => {
    const cache = missingCache();
    const complete = () => ({ json: NEON_MANIFEST });
    for (const key of ["a", "b"])
      await og.handleBlockOg(blockRequest(key), d1Request(complete), key, ctx, cache);
    expect(manifestReads).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(2);
  });
});
