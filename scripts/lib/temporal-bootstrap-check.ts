import fs from "node:fs";
import path from "node:path";

const CLASSIC_POLYFILL_SCRIPT_RE =
  /<script(?![^>]*\btype\s*=\s*["']module["'])[^>]*\bsrc\s*=\s*["'][^"']*temporal-polyfill\.js["'][^>]*>/i;

export function assertTemporalBootstrap(distDir: string, indexHtml: string): void {
  const polyfillPath = path.join(distDir, "temporal-polyfill.js");
  if (!fs.existsSync(polyfillPath)) {
    throw new Error(
      `Missing ${path.relative(process.cwd(), polyfillPath)}. Run prepare:temporal-polyfill before build.`,
    );
  }

  const stats = fs.statSync(polyfillPath);
  if (stats.size < 10_000) {
    throw new Error(
      `temporal-polyfill.js looks too small (${stats.size} bytes). Expected the IIFE bundle from temporal-polyfill/global.min.js.`,
    );
  }

  if (!CLASSIC_POLYFILL_SCRIPT_RE.test(indexHtml)) {
    throw new Error(
      "dist/index.html must include a classic (non-module) script tag loading temporal-polyfill.js so Safari runs it before deferred app modules.",
    );
  }
}
