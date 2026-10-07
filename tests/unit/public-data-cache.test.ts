import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PUBLICATION_MARKER_KEY, stampPublicationMarker } from "../../shared/publication-state";
import {
  resetPublicDataCacheWarningsForTests,
  withPublicDataCache,
} from "../../worker/public-data-cache";

/** Stamps the marker onto a manifest the way the publisher does, for tests that need a marked manifest. */
const stamped = (json: string) =>
  stampPublicationMarker(json, "2026-10-07T01:00:00.000Z", "owner-a");

beforeEach(() => {
  resetPublicDataCacheWarningsForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    const spanning = await withPublicDataCache(request, db, cache, async () => {
      setVersion("v2");
      return new Response("ok", { headers: { "cache-control": "public" } });
    });
    expect(cache.put).not.toHaveBeenCalled();
    // The manifest changed while the handler ran, so the response may mix generations: nobody downstream
    // (browser, service worker) may keep it either.
    expect(spanning.headers.get("x-data-cache")).toBe("BYPASS-UNSTABLE");
    expect(spanning.headers.get("cache-control")).toBe("no-store");
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

describe("while a D1 publication is in progress", () => {
  const request = () => new Request("https://example.com/api/blocks/BEDOK");
  const POINTER = "https://example.com/__public-data-cache/v1/pointer";

  /** A cached generation 1, then the publisher stamps the marker over the still-visible old manifest. */
  async function publicationStarted() {
    const ctx = setup();
    await withPublicDataCache(request(), ctx.db, ctx.cache, ctx.respond);
    const putsBefore = ctx.cache.put.mock.calls.length;
    ctx.setVersion(await stamped('{"generatedAt":"v1"}'));
    ctx.storage.delete(POINTER); // the 60 s version pointer has expired
    ctx.respond.mockClear();
    ctx.cache.put.mockClear();
    return { ...ctx, putsBefore };
  }

  it("serves the cached previous generation and stores nothing", async () => {
    const { cache, db, respond } = await publicationStarted();
    const response = await withPublicDataCache(request(), db, cache, respond);
    expect(response.headers.get("x-data-cache")).toBe("HIT-STALE");
    expect(await response.json()).toEqual({ version: '{"generatedAt":"v1"}' });
    expect(respond).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("computes uncached URLs from the database but never stores them, or a pointer", async () => {
    const { cache, db, respond, storage } = await publicationStarted();
    const keysBefore = [...storage.keys()].sort();
    const response = await withPublicDataCache(
      new Request("https://example.com/api/blocks/YISHUN"),
      db,
      cache,
      respond,
    );
    expect(response.headers.get("x-data-cache")).toBe("BYPASS");
    expect(response.status).toBe(200);
    // Computed while the tables may be half replaced: no browser or service worker should keep it either.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(respond).toHaveBeenCalledOnce();
    expect(cache.put).not.toHaveBeenCalled();
    expect([...storage.keys()].sort()).toEqual(keysBefore);
  });

  it("still answers from the pointer without touching D1 while the previous generation is cached", async () => {
    const ctx = setup();
    await withPublicDataCache(request(), ctx.db, ctx.cache, ctx.respond); // pointer + data stored
    ctx.setVersion(await stamped('{"generatedAt":"v1"}'));
    ctx.db.prepare.mockClear();
    const response = await withPublicDataCache(request(), ctx.db, ctx.cache, ctx.respond);
    expect(response.headers.get("x-data-cache")).toBe("HIT");
    expect(ctx.db.prepare).not.toHaveBeenCalled();
  });

  it("does not store a response whose handler ran while the publication began", async () => {
    const { cache, db, setVersion } = setup();
    const marked = await stamped('{"generatedAt":"v1"}');
    const response = await withPublicDataCache(request(), db, cache, async () => {
      setVersion(marked); // the publisher stamps the marker after the first manifest read
      return new Response("ok", { headers: { "cache-control": "public, max-age=60" } });
    });
    expect(response.headers.get("x-data-cache")).toBe("BYPASS-UNSTABLE");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("caches normally again once the final manifest write has replaced the marked manifest", async () => {
    const ctx = await publicationStarted();
    ctx.setVersion('{"generatedAt":"v2"}');
    const fresh = await withPublicDataCache(request(), ctx.db, ctx.cache, ctx.respond);
    expect(fresh.headers.get("x-data-cache")).toBe("MISS");
    expect(ctx.cache.put).toHaveBeenCalledTimes(2); // the data entry and the version pointer
  });

  it("never guesses a base: a marker without a usable one bypasses the cache", async () => {
    for (const marker of [{ baseVersion: "nope" }, {}]) {
      const { cache, db, respond, setVersion } = setup();
      setVersion(JSON.stringify({ generatedAt: "v1", [PUBLICATION_MARKER_KEY]: marker }));
      const response = await withPublicDataCache(request(), db, cache, respond);
      expect(response.headers.get("x-data-cache")).toBe("BYPASS");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(cache.put).not.toHaveBeenCalled();
      expect(cache.match).toHaveBeenCalledTimes(1); // only the pointer lookup; no data lookup was attempted
    }
  });

  it("labels the absence of any manifest, and stores nothing, so nobody downstream keeps it", async () => {
    const { cache, respond } = setup();
    const noManifest = { prepare: vi.fn(() => ({ first: async () => null })) };
    const response = await withPublicDataCache(request(), noManifest, cache, respond);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-data-cache")).toBe("BYPASS-NO-MANIFEST");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("labels a manifest it cannot read differently from a publication in progress", async () => {
    for (const unreadable of ["not json", "[]", "null"]) {
      const { cache, db, respond, setVersion } = setup();
      setVersion(unreadable);
      const response = await withPublicDataCache(request(), db, cache, respond);
      expect(response.headers.get("x-data-cache")).toBe("BYPASS-UNREADABLE");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it("says so in the logs, once per interval, with fixed text only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T01:00:00Z"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cache, db, respond, setVersion } = setup();
    setVersion(await stamped('{"generatedAt":"v1"}'));
    for (const town of ["BEDOK", "YISHUN", "CLEMENTI"])
      await withPublicDataCache(
        new Request(`https://example.com/api/blocks/${town}`),
        db,
        cache,
        respond,
      );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("publication is marked in progress");
    expect(String(warn.mock.calls[0]?.[0])).not.toMatch(/BEDOK|YISHUN|CLEMENTI|owner-a/);

    vi.setSystemTime(new Date("2026-10-07T01:09:59Z"));
    await withPublicDataCache(request(), db, cache, respond);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-07T01:10:01Z"));
    await withPublicDataCache(request(), db, cache, respond);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("labels the response and logs the error's name, never its message, when the cache itself fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cache, db, respond } = setup();
    cache.match.mockRejectedValueOnce(
      Object.assign(new Error("detail that must not be logged"), { name: "CacheUnavailable" }),
    );
    const response = await withPublicDataCache(request(), db, cache, respond);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-data-cache")).toBe("ERROR");
    // It may have been computed from half-replaced tables, so nothing downstream may keep it.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(String(warn.mock.calls[0]?.[0])).toContain("CacheUnavailable");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("detail that must not be logged");
  });
});
