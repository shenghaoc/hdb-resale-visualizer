import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  PUBLICATION_MARKER_KEY,
  stampPublicationMarker,
  type PublicationLabel,
} from "../../shared/publication-state";
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
  /** The request's public reads; the cache layer only ever reads the manifest. */
  const db = { manifestJson: vi.fn(async (): Promise<string | null> => json) };
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
  it("MISS reads version twice; HIT avoids every database read and the handler", async () => {
    const { cache, db, respond } = setup();
    const request = new Request("https://example.com/api/block-summaries");
    expect(
      (await withPublicDataCache(request, db, cache, respond)).headers.get("x-data-cache"),
    ).toBe("MISS");
    expect(db.manifestJson).toHaveBeenCalledTimes(2);
    db.manifestJson.mockClear();
    expect(
      (await withPublicDataCache(request, db, cache, respond)).headers.get("x-data-cache"),
    ).toBe("HIT");
    expect(db.manifestJson).not.toHaveBeenCalled();
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
    expect(db.manifestJson).not.toHaveBeenCalled();
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
  it("cache put failure returns the fetched response without repeating database work", async () => {
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
  db.manifestJson.mockClear();
  await withPublicDataCache(
    new Request("https://example.com/api/block-summaries?nonce=2"),
    db,
    cache,
    respond,
  );
  expect(db.manifestJson).not.toHaveBeenCalled();
  await withPublicDataCache(
    new Request("https://example.com/api/search?town=BEDOK&budgetMax=0500000"),
    db,
    cache,
    respond,
  );
  db.manifestJson.mockClear();
  await withPublicDataCache(
    new Request("https://example.com/api/search?nonce=3&budgetMax=500000&town=BEDOK"),
    db,
    cache,
    respond,
  );
  expect(db.manifestJson).not.toHaveBeenCalled();
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
    ctx.db.manifestJson.mockClear();
    const response = await withPublicDataCache(request(), ctx.db, ctx.cache, ctx.respond);
    expect(response.headers.get("x-data-cache")).toBe("HIT");
    expect(ctx.db.manifestJson).not.toHaveBeenCalled();
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
    const noManifest = { manifestJson: vi.fn(async () => null) };
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

describe("a route that answers and labels in one statement (AtomicRead)", () => {
  const request = () =>
    new Request(
      "https://example.com/api/nearby-places?lat=1.35&lng=103.75&radius=500&types=mrt_exit",
    );
  const POINTER = "https://example.com/__public-data-cache/v1/pointer";
  const VERSION = "ab".repeat(32);
  const published = { version: VERSION, state: { inProgress: false } } as const;
  const answer = () =>
    new Response('{"places":[]}', { headers: { "cache-control": "public, max-age=60" } });

  function atomicSetup(publication: PublicationLabel | null | "unlabelled" = published) {
    const base = setup();
    const atomic = vi.fn(async () => ({
      response: answer(),
      publication: publication === "unlabelled" ? undefined : publication,
    }));
    return { ...base, atomic };
  }
  const run = (ctx: ReturnType<typeof atomicSetup>) =>
    withPublicDataCache(request(), ctx.db, ctx.cache, ctx.respond, ctx.atomic);

  it("answers a miss with that one statement: no manifest read before or after, stored under the label", async () => {
    const ctx = atomicSetup();
    const response = await run(ctx);
    expect(response.headers.get("x-data-cache")).toBe("MISS");
    expect(ctx.atomic).toHaveBeenCalledTimes(1);
    expect(ctx.db.manifestJson).not.toHaveBeenCalled();
    expect(ctx.respond).not.toHaveBeenCalled();
    const keys = [...ctx.storage.keys()];
    expect(keys.some((key) => key.includes(`/v1/${VERSION}/api/nearby-places`))).toBe(true);
    expect(await ctx.storage.get(POINTER)?.clone().text()).toBe(VERSION);

    const again = await run(ctx);
    expect(again.headers.get("x-data-cache")).toBe("HIT");
    expect(ctx.atomic).toHaveBeenCalledTimes(1);
  });

  it("asks again, once, when the pointer has expired, instead of reading the manifest first", async () => {
    const ctx = atomicSetup();
    await run(ctx);
    ctx.storage.delete(POINTER);
    const response = await run(ctx);
    expect(response.headers.get("x-data-cache")).toBe("MISS");
    expect(ctx.atomic).toHaveBeenCalledTimes(2);
    expect(ctx.db.manifestJson).not.toHaveBeenCalled();
  });

  it("stores nothing for an answer that carries no label (refused, invalid or failed)", async () => {
    const ctx = atomicSetup("unlabelled");
    const response = await run(ctx);
    expect(response.headers.get("x-data-cache")).toBe("BYPASS-UNLABELLED");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ctx.cache.put).not.toHaveBeenCalled();
  });

  it("labels an absent manifest and stores nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = atomicSetup(null);
    const response = await run(ctx);
    expect(response.headers.get("x-data-cache")).toBe("BYPASS-NO-MANIFEST");
    expect(ctx.cache.put).not.toHaveBeenCalled();
  });

  it("serves the previous generation while a publication is in progress, else bypasses without storing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const base = "cd".repeat(32);
    const unfinished = (baseVersion: string | null): PublicationLabel => ({
      version: VERSION,
      state: { inProgress: true, reason: "marker", baseVersion, startedAt: null },
    });

    const ctx = atomicSetup(unfinished(base));
    ctx.storage.set(
      `https://example.com/__public-data-cache/v1/${base}/api/nearby-places?lat=1.35&lng=103.75&radius=500&types=mrt_exit`,
      new Response('{"places":["previous"]}'),
    );
    const stale = await run(ctx);
    expect(stale.headers.get("x-data-cache")).toBe("HIT-STALE");
    expect(await stale.text()).toContain("previous");
    expect(ctx.cache.put).not.toHaveBeenCalled();

    const bare = atomicSetup(unfinished(null));
    const bypass = await run(bare);
    expect(bypass.headers.get("x-data-cache")).toBe("BYPASS");
    expect(bypass.headers.get("cache-control")).toBe("no-store");
    expect(bare.cache.put).not.toHaveBeenCalled();

    const unreadable = atomicSetup({
      version: VERSION,
      state: { inProgress: true, reason: "unreadable", baseVersion: null, startedAt: null },
    });
    expect((await run(unreadable)).headers.get("x-data-cache")).toBe("BYPASS-UNREADABLE");
  });

  it("never repeats the statement: a failure of the read itself propagates, and a cache failure after it returns the answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = atomicSetup();
    failing.atomic.mockRejectedValueOnce(new Error("statement failed"));
    await expect(run(failing)).rejects.toThrow("statement failed");
    expect(failing.atomic).toHaveBeenCalledTimes(1);
    expect(failing.respond).not.toHaveBeenCalled();

    const cacheDown = atomicSetup();
    cacheDown.cache.put.mockRejectedValueOnce(new Error("cache unavailable"));
    const response = await run(cacheDown);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-data-cache")).toBe("ERROR");
    expect(cacheDown.atomic).toHaveBeenCalledTimes(1);
    expect(cacheDown.respond).not.toHaveBeenCalled();
  });

  it("is not used when the request cannot be cached at all: the plain responder runs", async () => {
    const ctx = atomicSetup();
    await withPublicDataCache(request(), ctx.db, null, ctx.respond, ctx.atomic);
    expect(ctx.respond).toHaveBeenCalledTimes(1);
    expect(ctx.atomic).not.toHaveBeenCalled();
  });
});
