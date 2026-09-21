import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { onRequestGet as detailsHandler } from "../../functions/api/details/[addressKey]";
import { onRequestGet as comparisonsHandler } from "../../functions/api/comparisons/[addressKey]";
import { onRequestGet as manifestHandler } from "../../functions/api/manifest";
import { onRequestGet as mrtStationsHandler } from "../../functions/api/mrt-stations";
import { onRequestGet as mrtExitsHandler } from "../../functions/api/mrt-exits";
import { onRequestGet as blocksByTownHandler } from "../../functions/api/blocks/[town]";

async function pagesCtx(
  handler: (ctx: never) => Response | Promise<Response>,
  opts: { db: unknown; params?: Record<string, string | string[]> },
): Promise<Response> {
  return handler({
    request: new Request("http://localhost/api"),
    env: { DB: opts.db },
    params: opts.params ?? {},
  } as never);
}

function jsonFirstDb(row: { json: string } | null, options: { throwOnRead?: boolean } = {}) {
  const first = async () => {
    if (options.throwOnRead) {
      throw new Error("d1 unavailable");
    }
    return row;
  };
  const statement = {
    bind: () => ({ first }),
    first,
  };
  return {
    prepare: () => statement,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JSON-blob GET handlers", () => {
  it.each([
    {
      name: "manifest",
      handler: manifestHandler,
      missing: "manifest not synced yet",
    },
    {
      name: "mrt-stations",
      handler: mrtStationsHandler,
      missing: "MRT stations not synced yet",
    },
    {
      name: "mrt-exits",
      handler: mrtExitsHandler,
      missing: "MRT exits not synced yet",
    },
  ] as const)("$name returns 404 when the blob is missing", async ({ handler, missing }) => {
    const response = await pagesCtx(handler, { db: jsonFirstDb(null) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: missing });
  });

  it.each([
    { name: "manifest", handler: manifestHandler },
    { name: "mrt-stations", handler: mrtStationsHandler },
    { name: "mrt-exits", handler: mrtExitsHandler },
  ] as const)("$name returns 500 for corrupt stored JSON", async ({ handler }) => {
    const response = await pagesCtx(handler, { db: jsonFirstDb({ json: "{not-json" }) });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("returns 500 when D1 throws", async () => {
    const response = await pagesCtx(manifestHandler, {
      db: jsonFirstDb(null, { throwOnRead: true }),
    });
    expect(response.status).toBe(500);
  });

  it("returns the parsed manifest blob on success", async () => {
    const payload = { schemaVersion: "2.0.0" };
    const response = await pagesCtx(manifestHandler, {
      db: jsonFirstDb({ json: JSON.stringify(payload) }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    await expect(response.json()).resolves.toEqual(payload);
  });
});

describe("/api/details/:addressKey", () => {
  it("requires an addressKey slug", async () => {
    const response = await pagesCtx(detailsHandler, { db: jsonFirstDb(null), params: {} });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "addressKey required" });
  });

  it("returns 404 when the block is missing", async () => {
    const response = await pagesCtx(detailsHandler, {
      db: jsonFirstDb(null),
      params: { addressKey: "missing-block" },
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns 500 when stored detail JSON is corrupt", async () => {
    const response = await pagesCtx(detailsHandler, {
      db: jsonFirstDb({ json: "not-json" }),
      params: { addressKey: ["ang-mo-kio-123a.json"] },
    });
    expect(response.status).toBe(500);
  });

  it("returns the stored detail payload", async () => {
    const payload = { summary: { addressKey: "ang-mo-kio-123a" } };
    const response = await pagesCtx(detailsHandler, {
      db: jsonFirstDb({ json: JSON.stringify(payload) }),
      params: { addressKey: "ang-mo-kio-123a" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(payload);
  });
});

describe("/api/comparisons/:addressKey", () => {
  it("returns 404 when comparison data is missing", async () => {
    const response = await pagesCtx(comparisonsHandler, {
      db: jsonFirstDb(null),
      params: { addressKey: "missing-block" },
    });
    expect(response.status).toBe(404);
  });

  it("returns 500 when stored comparison JSON is corrupt", async () => {
    const response = await pagesCtx(comparisonsHandler, {
      db: jsonFirstDb({ json: "{bad" }),
      params: { addressKey: "ang-mo-kio-123a" },
    });
    expect(response.status).toBe(500);
  });
});

describe("/api/blocks/:town", () => {
  it("rejects a missing town slug", async () => {
    const response = await pagesCtx(blocksByTownHandler, { db: jsonFirstDb(null), params: {} });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "town filename required" });
  });

  it("queries the canonical KALLANG/WHAMPOA town for its hyphenated slug", async () => {
    let boundTown: unknown;
    const db = {
      prepare: () => ({
        bind: (...args: unknown[]) => {
          boundTown = args[0];
          return {
            all: async () => ({ results: [] }),
          };
        },
      }),
    };

    const response = await pagesCtx(blocksByTownHandler, {
      db,
      params: { town: "kallang-whampoa.json" },
    });

    expect(response.status).toBe(200);
    expect(boundTown).toBe("KALLANG/WHAMPOA");
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns 500 when the town query throws", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => {
            throw new Error("d1 unavailable");
          },
        }),
      }),
    };
    const response = await pagesCtx(blocksByTownHandler, {
      db,
      params: { town: "bedok" },
    });
    expect(response.status).toBe(500);
  });
});
