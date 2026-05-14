import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertModulePreloadBudget,
  DEFAULT_MODULEPRELOAD_GZIP_SINGLE_MAX,
  DEFAULT_MODULEPRELOAD_GZIP_TOTAL_MAX,
  measureModulePreloads,
  parseModulePreloadHrefs,
} from "../scripts/lib/bundle-modulepreload-budget";

describe("parseModulePreloadHrefs", () => {
  it("collects hrefs from Vite-style index.html", () => {
    const html = `
    <link rel="modulepreload" crossorigin href="/assets/a.js">
    <link rel='modulepreload' href='/assets/b.js'>
    `;
    expect(parseModulePreloadHrefs(html)).toEqual(["/assets/a.js", "/assets/b.js"]);
  });

  it("returns empty when no modulepreload links", () => {
    expect(parseModulePreloadHrefs("<html></html>")).toEqual([]);
  });
});

describe("assertModulePreloadBudget", () => {
  it("throws when gzip total exceeds limit", () => {
    const entries = [
      { href: "/a.js", resolvedPath: "/x/a.js", rawBytes: 100, gzipBytes: 60_000 },
      { href: "/b.js", resolvedPath: "/x/b.js", rawBytes: 100, gzipBytes: 60_000 },
    ];
    expect(() =>
      assertModulePreloadBudget(entries, { gzipTotalMax: 100_000, gzipSingleMax: 96 * 1024 }),
    ).toThrow(/gzip total 120000 B exceeds budget 100000 B/);
  });

  it("throws when a single preload exceeds gzip single limit", () => {
    const entries = [
      { href: "/big.js", resolvedPath: "/x/big.js", rawBytes: 500_000, gzipBytes: 100_000 },
    ];
    expect(() =>
      assertModulePreloadBudget(entries, {
        gzipTotalMax: DEFAULT_MODULEPRELOAD_GZIP_TOTAL_MAX,
        gzipSingleMax: 50_000,
      }),
    ).toThrow(/Largest modulepreload exceeds gzip budget/);
  });

  it("passes for fixture-sized totals", () => {
    const entries = [
      { href: "/a.js", resolvedPath: "/x/a.js", rawBytes: 10_000, gzipBytes: 4000 },
      { href: "/b.js", resolvedPath: "/x/b.js", rawBytes: 70_000, gzipBytes: 22_000 },
    ];
    expect(() =>
      assertModulePreloadBudget(entries, {
        gzipTotalMax: DEFAULT_MODULEPRELOAD_GZIP_TOTAL_MAX,
        gzipSingleMax: DEFAULT_MODULEPRELOAD_GZIP_SINGLE_MAX,
      }),
    ).not.toThrow();
  });
});

describe("measureModulePreloads", () => {
  it("reads files and reports gzip sizes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
    try {
      fs.mkdirSync(path.join(dir, "assets"));
      const p = path.join(dir, "assets", "chunk.js");
      fs.writeFileSync(p, "console.log('x'.repeat(2000));");
      const entries = measureModulePreloads(dir, ["/assets/chunk.js"]);
      expect(entries).toHaveLength(1);
      expect(entries[0].href).toBe("/assets/chunk.js");
      expect(entries[0].rawBytes).toBeGreaterThan(0);
      expect(entries[0].gzipBytes).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects path traversal in href", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
    try {
      expect(() => measureModulePreloads(dir, ["/../etc/passwd"])).toThrow(/suspicious modulepreload href/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
