import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { isRuntimeCacheableApiGet, isShortlistApiPath } from "../../shared/pwa-api-cache";

/**
 * The Workbox plugin is inlined in vite.config.ts (the generated service worker cannot close over imports), so
 * evaluate that exact source rather than a copy of it.
 */
function inlinedCacheWillUpdate(): (args: { response: Response }) => Promise<Response | null> {
  const source = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
  const start = source.indexOf("cacheWillUpdate:");
  expect(start).toBeGreaterThan(-1);
  const body = source.indexOf("{", source.indexOf("=>", start));
  let depth = 0;
  let end = body;
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    else if (source[end] === "}" && (depth -= 1) === 0) break;
  }
  const fn = source.slice(source.indexOf("async", start), end + 1);
  return new Function(`return (${fn})`)() as ReturnType<typeof inlinedCacheWillUpdate>;
}

describe("PWA runtime cache rotation", () => {
  const config = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");

  it("uses a new runtime cache for the tightened admission rule and retires the old one", () => {
    expect(config).toContain('cacheName: "hdb-api-get-v2"');
    expect(config).not.toContain('cacheName: "hdb-api-get-v1"');
    expect(config).toContain('importScripts: ["sw-cleanup.js"]');
  });

  it("deletes exactly the retired cache when the new worker activates", async () => {
    const source = readFileSync(join(process.cwd(), "public/sw-cleanup.js"), "utf8");
    const listeners: Record<
      string,
      (event: { waitUntil: (work: Promise<unknown>) => void }) => void
    > = {};
    const deleted: string[] = [];
    new Function("self", "caches", source)(
      {
        addEventListener: (type: string, listener: (typeof listeners)[string]) =>
          (listeners[type] = listener),
      },
      {
        delete: async (name: string) => {
          deleted.push(name);
          return true;
        },
      },
    );
    expect(Object.keys(listeners)).toEqual(["activate"]);
    let pending: Promise<unknown> | undefined;
    listeners.activate({ waitUntil: (work) => (pending = work) });
    await pending;
    expect(deleted).toEqual(["hdb-api-get-v1"]);
  });
});

describe("PWA API cache policy", () => {
  it("refuses to store responses the Worker labels as bypassed or failed", async () => {
    const cacheWillUpdate = inlinedCacheWillUpdate();
    const respond = (label?: string) =>
      new Response("{}", { headers: label === undefined ? {} : { "x-data-cache": label } });
    for (const label of [
      "BYPASS",
      "BYPASS-UNREADABLE",
      "BYPASS-NO-MANIFEST",
      "BYPASS-UNSTABLE",
      "ERROR",
      "SOMETHING-ADDED-LATER",
      "",
    ])
      expect(await cacheWillUpdate({ response: respond(label) })).toBeNull();
    // An unlabelled response skipped the cache layer before the manifest was read (a request carrying cookies
    // or credentials, an oversized URL, an invalid query) or comes from a Worker that predates the header.
    expect(await cacheWillUpdate({ response: respond(undefined) })).toBeNull();
    // Only the Worker's consistent outcomes, including a stale-but-consistent hit, are stored.
    for (const label of ["MISS", "HIT", "HIT-AFTER-VERSION-READ", "HIT-STALE"]) {
      const response = respond(label);
      expect(await cacheWillUpdate({ response })).toBe(response);
    }
  });

  it("caches public API GETs and refuses shortlist reads", () => {
    expect(isRuntimeCacheableApiGet("/api/search")).toBe(true);
    expect(isRuntimeCacheableApiGet("/api/blocks/TAMPINES")).toBe(true);
    expect(isRuntimeCacheableApiGet("/api/shortlist")).toBe(false);
    expect(isRuntimeCacheableApiGet("/api/shortlist/")).toBe(false);
    expect(isRuntimeCacheableApiGet("/api/shortlist/abc123")).toBe(false);
    expect(isShortlistApiPath("/api/shortlists")).toBe(false);
    expect(isRuntimeCacheableApiGet("/api/shortlists")).toBe(true);
    expect(isRuntimeCacheableApiGet("/search")).toBe(false);
  });

  it("inlines the same shortlist exclusion in the Workbox route", () => {
    const config = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
    expect(config).toContain('pathname !== "/api/shortlist"');
    expect(config).toContain('!pathname.startsWith("/api/shortlist/")');

    const paths = [
      "/api/search",
      "/api/details/abc",
      "/api/shortlist",
      "/api/shortlist/",
      "/api/shortlist/sync-code",
      "/api/shortlists",
      "/index.html",
    ];
    for (const pathname of paths) {
      const inlined =
        pathname.startsWith("/api/") &&
        pathname !== "/api/shortlist" &&
        !pathname.startsWith("/api/shortlist/");
      expect(inlined).toBe(isRuntimeCacheableApiGet(pathname));
    }
  });
});
