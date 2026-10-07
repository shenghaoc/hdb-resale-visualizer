import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
const spies = vi.hoisted(() => ({
  query: vi.fn(),
  snapshot: vi.fn(),
  close: vi.fn(),
  privateRead: vi.fn(),
}));
const probe = vi.hoisted(() => async ({ env }: { env: Env }) => {
  const row = await env.DB.prepare("SELECT json FROM manifest WHERE id = 1").first<{
    json: string;
  }>();
  return new Response(row?.json, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
  });
});
vi.mock("../../worker/neon-transport", () => ({
  createNeonPublicTransport: () => ({
    query: spies.query,
    snapshot: spies.snapshot,
    close: spies.close,
  }),
}));
vi.mock("../../functions/api/manifest", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/block-summaries", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/blocks/[town]", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/details/[addressKey]", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/comparisons/[addressKey]", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/mrt-stations", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/mrt-exits", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/trends/town-flat-type", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/search", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/suggest", () => ({ onRequestGet: probe }));
vi.mock("../../functions/api/comparable-transactions", () => ({ onRequestPost: probe }));
vi.mock("../../functions/api/shortlist/index", () => ({
  onRequestPost: async ({ env }: { env: Env }) => {
    spies.privateRead(env.DB);
    return new Response("private", { headers: { "cache-control": "no-store" } });
  },
}));
vi.mock("../../functions/api/shortlist/[syncCode]", () => ({
  onRequestGet: async ({ env }: { env: Env }) => {
    spies.privateRead(env.DB);
    return new Response("private", { headers: { "cache-control": "no-store" } });
  },
}));
vi.mock("../../worker/og", () => ({
  handleBlockOg: (_r: Request, env: Env) => probe({ env }),
  handleCompareOg: (_r: Request, env: Env) => probe({ env }),
}));
// Load the Cloudflare entry in this runtime integration test without pulling its
// WASM asset/Workers-only globals into the separate DOM TypeScript test project.
const workerEntry = "../../worker/index";
const worker = (await import(workerEntry)).default as {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
};

describe("one backend for every public data route", () => {
  const manifest = JSON.stringify({
    generatedAt: "2026-10-05",
    filterOptions: { towns: ["BEDOK"] },
  });
  const d1Read = vi.fn();
  let env: Env;
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext;
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`https://test${path}`, init), env, ctx);
  beforeEach(() => {
    vi.clearAllMocks();
    waits.length = 0;
    const d1 = {
      prepare: (sql: string) => {
        const statement = {
          bind: () => statement,
          first: async () => {
            d1Read(sql);
            return { json: manifest };
          },
          all: async () => {
            d1Read(sql);
            return { results: [] };
          },
        };
        return statement;
      },
    } as unknown as D1Database;
    env = {
      DB: d1,
      PUBLIC_DATA_BACKEND: "neon",
      HDB_PUBLIC_NEON: { connectionString: "test" },
      ASSETS: {
        fetch: async () =>
          new Response("<html></html>", { headers: { "content-type": "text/html" } }),
      },
    } as unknown as Env;
    spies.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.manifest")) return [{ json: manifest }];
      return [];
    });
    spies.snapshot.mockImplementation(async (respond: () => Promise<unknown>) => respond());
    spies.close.mockResolvedValue(undefined);
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal(
      "HTMLRewriter",
      class {
        on() {
          return this;
        }
        transform(r: Response) {
          return r;
        }
      },
    );
  });
  afterEach(async () => {
    await Promise.all(waits);
    vi.unstubAllGlobals();
  });
  const getPaths = [
    "/api/manifest",
    "/api/block-summaries",
    "/api/blocks/bedok",
    "/api/details/key",
    "/api/comparisons/key",
    "/api/trends/town-flat-type",
    "/api/mrt-stations",
    "/api/mrt-exits",
    "/api/search?town=BEDOK",
    "/api/suggest?q=bedok",
    "/og/block/key.png",
    "/og/compare/bedok/yishun.png",
    "/sitemap.xml",
    "/?town=BEDOK",
  ];
  it.each(getPaths)("selects Neon and fully rolls back %s to D1", async (path) => {
    expect((await request(path)).status).toBe(200);
    expect(spies.query).toHaveBeenCalled();
    expect(d1Read).not.toHaveBeenCalled();
    spies.query.mockClear();
    env.PUBLIC_DATA_BACKEND = "d1";
    expect((await request(path)).status).toBe(200);
    expect(d1Read).toHaveBeenCalled();
    expect(spies.query).not.toHaveBeenCalled();
  });
  it.each([
    { method: "HEAD" },
    { headers: { cookie: "test-only" } },
    { headers: { authorization: "test-only" } },
  ])("does not send cache-bypassing GETs back to D1: %j", async (init) => {
    await request("/api/manifest", init as RequestInit);
    expect(spies.query).toHaveBeenCalledTimes(1);
    expect(d1Read).not.toHaveBeenCalled();
  });
  it("captures selection before an asynchronous comparable request and awaits completion before close", async () => {
    spies.query.mockImplementation(async () => {
      env.PUBLIC_DATA_BACKEND = "d1";
      await Promise.resolve();
      expect(spies.close).not.toHaveBeenCalled();
      return [{ json: manifest }];
    });
    await request("/api/comparable-transactions?adjust=time", { method: "POST" });
    expect(spies.snapshot).toHaveBeenCalledTimes(1);
    expect(spies.close).toHaveBeenCalledTimes(1);
    expect(d1Read).not.toHaveBeenCalled();
    spies.query.mockClear();
    await request("/api/comparable-transactions", { method: "POST" });
    expect(d1Read).toHaveBeenCalled();
    expect(spies.query).not.toHaveBeenCalled();
  });
  it("keeps private shortlist reads/writes on D1 without opening the public transport", async () => {
    await request("/api/shortlist", { method: "POST" });
    await request("/api/shortlist/abc123abc123abc1");
    expect(spies.privateRead.mock.calls).toEqual([[env.DB], [env.DB]]);
    expect(spies.query).not.toHaveBeenCalled();
    expect(spies.close).not.toHaveBeenCalled();
  });
  it("uses separate backend/epoch cache keys; warm hits perform zero SQL", async () => {
    const entries = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: async (r: Request) => entries.get(r.url)?.clone(),
        put: async (r: Request, v: Response) => {
          entries.set(r.url, v.clone());
        },
      },
    });
    const first = await request("/api/manifest");
    expect(first.headers.get("x-data-cache")).toBe("MISS");
    spies.query.mockClear();
    const warm = await request("/api/manifest");
    expect(warm.headers.get("x-data-cache")).toBe("HIT");
    expect(spies.query).not.toHaveBeenCalled();
    env.PUBLIC_DATA_BACKEND = "d1";
    const back = await request("/api/manifest");
    expect(back.headers.get("x-data-cache")).toBe("MISS");
    expect(d1Read).toHaveBeenCalled();
    expect([...entries.keys()].some((k) => k.includes("neon-neon-candidate-v1"))).toBe(true);
    expect([...entries.keys()].some((k) => k.includes("d1-d1-cutover-v1"))).toBe(true);
  });
  it("returns an uncached error for a Neon failure without D1 fallback", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    spies.query.mockRejectedValue(Error("Public database read failed"));
    const r = await request("/api/comparable-transactions", { method: "POST" });
    expect(r.status).toBe(500);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(d1Read).not.toHaveBeenCalled();
    expect(spies.close).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
