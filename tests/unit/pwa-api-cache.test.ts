import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { isRuntimeCacheableApiGet, isShortlistApiPath } from "../../shared/pwa-api-cache";

describe("PWA API cache policy", () => {
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
