import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/** Match each `<link ...>` tag; preload detection is done per-tag so attribute order is flexible. */
const LINK_TAG_RE = /<link\b[^>]*>/gi;

/** `rel="modulepreload"` / `rel = 'modulepreload'`; `(?<![...])rel` avoids matching `data-rel`. */
const REL_MODULEPRELOAD_RE = /(?<![a-zA-Z0-9_-])rel\s*=\s*["']modulepreload["']/i;

/** `href="..."` with optional spaces around `=`; negative lookbehind avoids `data-href`. */
const HREF_ATTR_RE = /(?<![a-zA-Z0-9_-])href\s*=\s*["']([^"']+)["']/i;

export type ModulePreloadEntry = {
  readonly href: string;
  readonly resolvedPath: string;
  readonly rawBytes: number;
  readonly gzipBytes: number;
};

/** Sum of gzip sizes of current fixture build preloads (~27 KiB); heavy vendors push this over ~300 KiB if mis-preloaded. */
export const DEFAULT_MODULEPRELOAD_GZIP_TOTAL_MAX = 220 * 1024;

/** Any single preloaded script above this is almost certainly a mistaken eager preload (e.g. maplibre ~270 KiB gzip). */
export const DEFAULT_MODULEPRELOAD_GZIP_SINGLE_MAX = 96 * 1024;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readBudgetLimits(): {
  gzipTotalMax: number;
  gzipSingleMax: number;
} {
  return {
    gzipTotalMax: parsePositiveIntEnv(
      "BUNDLE_MODULEPRELOAD_GZIP_TOTAL_MAX",
      DEFAULT_MODULEPRELOAD_GZIP_TOTAL_MAX,
    ),
    gzipSingleMax: parsePositiveIntEnv(
      "BUNDLE_MODULEPRELOAD_GZIP_SINGLE_MAX",
      DEFAULT_MODULEPRELOAD_GZIP_SINGLE_MAX,
    ),
  };
}

export function parseModulePreloadHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const match of html.matchAll(LINK_TAG_RE)) {
    const tag = match[0];
    if (!REL_MODULEPRELOAD_RE.test(tag)) continue;
    const hrefMatch = tag.match(HREF_ATTR_RE);
    const href = hrefMatch?.[1];
    if (typeof href === "string" && href.length > 0) {
      hrefs.push(href);
    }
  }
  return hrefs;
}

function hrefToDistPath(distDir: string, href: string): string {
  const trimmed = href.trim();
  const relative = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  if (relative.includes("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to resolve suspicious modulepreload href: ${href}`);
  }
  return path.join(distDir, relative);
}

export function measureModulePreloads(distDir: string, hrefs: readonly string[]): ModulePreloadEntry[] {
  return hrefs.map((href) => {
    const resolvedPath = hrefToDistPath(distDir, href);
    try {
      const buf = fs.readFileSync(resolvedPath);
      const gzipBytes = zlib.gzipSync(buf).length;
      return {
        href,
        resolvedPath,
        rawBytes: buf.length,
        gzipBytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read or gzip modulepreload ${href} (${resolvedPath}): ${message}`, {
        cause: err,
      });
    }
  });
}

export function assertModulePreloadBudget(
  entries: readonly ModulePreloadEntry[],
  limits: { gzipTotalMax: number; gzipSingleMax: number },
): void {
  const gzipTotal = entries.reduce((sum, e) => sum + e.gzipBytes, 0);
  const gzipSingle = entries.reduce((max, e) => Math.max(max, e.gzipBytes), 0);

  if (gzipSingle > limits.gzipSingleMax) {
    const worst = entries.reduce((a, b) => (b.gzipBytes > a.gzipBytes ? b : a));
    throw new Error(
      `Largest modulepreload exceeds gzip budget (${limits.gzipSingleMax} B): ${worst.href} → ${worst.gzipBytes} B gzip (${worst.rawBytes} B raw).`,
    );
  }

  if (gzipTotal > limits.gzipTotalMax) {
    const lines = entries
      .map((e) => `  ${e.href}: ${e.gzipBytes} B gzip (${e.rawBytes} B raw)`)
      .join("\n");
    throw new Error(
      `Modulepreload gzip total ${gzipTotal} B exceeds budget ${limits.gzipTotalMax} B.\n${lines}`,
    );
  }
}
