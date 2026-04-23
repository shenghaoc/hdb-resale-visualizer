import fs from "node:fs/promises";
import path from "node:path";

const DIST_INDEX_PATH = path.join(process.cwd(), "dist", "index.html");
const FORBIDDEN_PRELOAD_PATTERNS = [/echarts/i, /maplibre/i, /TrendChart/i, /MapView/i];

async function main() {
  const html = await fs.readFile(DIST_INDEX_PATH, "utf8");
  const preloadMatches = [...html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g)];
  const preloadHrefs = preloadMatches
    .map((match) => match[1])
    .filter((href): href is string => typeof href === "string");
  const forbiddenPreloads = preloadHrefs.filter((href) =>
    FORBIDDEN_PRELOAD_PATTERNS.some((pattern) => pattern.test(href)),
  );

  if (forbiddenPreloads.length > 0) {
    throw new Error(
      `Unexpected lazy chunk preloads in dist/index.html: ${forbiddenPreloads.join(", ")}`,
    );
  }

  console.log(
    `Bundle preload check passed (${preloadHrefs.length} modulepreload links scanned).`,
  );
}

void main();
