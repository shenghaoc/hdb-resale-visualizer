import { describe, expect, it, vi } from "vite-plus/test";
import { withPublicDataCache } from "../../worker/public-data-cache";

function setup() {
  const storage = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => storage.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      storage.set(request.url, response.clone());
    }),
  };
  let json = '{"generatedAt":"v1"}';
  const first = vi.fn(async () => ({ json }));
  const db = { prepare: vi.fn(() => ({ first })) };
  const respond = vi.fn(
    async () =>
      new Response(JSON.stringify({ version: json }), {
        headers: { "cache-control": "public, max-age=60" },
      }),
  );
  return {
    cache,
    db,
    respond,
    storage,
    setVersion: (value: string) => {
      json = value;
    },
  };
}

describe("public data shared cache", () => {
  it("MISS reads version twice; HIT avoids every D1 read and the handler", async () => {
    const { cache, db, respond } = setup();
    const request = new Request("https://example.com/api/block-summaries");
    expect(
      (await withPublicDataCache(request, db, cache, respond)).headers.get("x-data-cache"),
    ).toBe("MISS");
    expect(db.prepare).toHaveBeenCalledTimes(2);
    db.prepare.mockClear();
    expect(
      (await withPublicDataCache(request, db, cache, respond)).headers.get("x-data-cache"),
    ).toBe("HIT");
    expect(db.prepare).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledOnce();
  });
  it("isolates query parameters and discovers new version after pointer expiry", async () => {
    const { cache, db, respond, storage, setVersion } = setup();
    const request = new Request("https://example.com/api/search?q=bedok&flatType=4");
    await withPublicDataCache(request, db, cache, respond);
    await withPublicDataCache(
      new Request("https://example.com/api/search?q=bedok&flatType=5"),
      db,
      cache,
      respond,
    );
    expect(respond).toHaveBeenCalledTimes(2);
    storage.delete("https://example.com/__public-data-cache/v1/pointer");
    setVersion('{"generatedAt":"v2"}');
    const next = await withPublicDataCache(request, db, cache, respond);
    expect(next.headers.get("x-data-cache")).toBe("MISS");
    expect(await next.text()).toContain("v2");
    expect(respond).toHaveBeenCalledTimes(3);
  });
  it.each([
    "https://example.com/api/shortlist/secret",
    "https://example.com/api/comparable-transactions",
  ])("bypasses private/POST endpoints %s", async (url) => {
    const { cache, db, respond } = setup();
    await withPublicDataCache(new Request(url), db, cache, respond);
    expect(cache.match).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });
  it("never stores errors or responses spanning a version change", async () => {
    const { cache, db, setVersion } = setup();
    const request = new Request("https://example.com/api/suggest?q=bedok");
    await withPublicDataCache(
      request,
      db,
      cache,
      async () => new Response("error", { status: 500 }),
    );
    expect(cache.put).not.toHaveBeenCalled();
    await withPublicDataCache(request, db, cache, async () => {
      setVersion("v2");
      return new Response("ok", { headers: { "cache-control": "public" } });
    });
    expect(cache.put).not.toHaveBeenCalled();
  });
  it("cache put failure returns the fetched response without repeating D1 work", async () => {
    const { cache, db, respond } = setup();
    cache.put.mockRejectedValue(new Error("cache unavailable"));
    expect(
      (
        await withPublicDataCache(
          new Request("https://example.com/api/manifest"),
          db,
          cache,
          respond,
        )
      ).status,
    ).toBe(200);
    expect(respond).toHaveBeenCalledOnce();
  });
});

it("ignores unrelated params on full datasets and canonicalizes validated numeric search parameters", async () => {
  const { cache, db, respond } = setup();
  await withPublicDataCache(
    new Request("https://example.com/api/block-summaries?nonce=1"),
    db,
    cache,
    respond,
  );
  db.prepare.mockClear();
  await withPublicDataCache(
    new Request("https://example.com/api/block-summaries?nonce=2"),
    db,
    cache,
    respond,
  );
  expect(db.prepare).not.toHaveBeenCalled();
  await withPublicDataCache(
    new Request("https://example.com/api/search?town=BEDOK&budgetMax=0500000"),
    db,
    cache,
    respond,
  );
  db.prepare.mockClear();
  await withPublicDataCache(
    new Request("https://example.com/api/search?nonce=3&budgetMax=500000&town=BEDOK"),
    db,
    cache,
    respond,
  );
  expect(db.prepare).not.toHaveBeenCalled();
});
