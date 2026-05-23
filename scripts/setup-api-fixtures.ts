/**
 * Stages the JSON/GeoJSON fixtures under `tests/fixtures/public-data/` into
 * `public/api/` with the URL-shaped names the runtime hits (no extensions).
 *
 * Used by Playwright E2E: the production build copies `public/` into `dist/`,
 * and `vite preview` serves whatever is there. In Cloudflare Pages production,
 * Pages Functions under `functions/api/*` always win over static fallbacks
 * with the same path, so these files are dev/test-only and have no production
 * effect.
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, "tests", "fixtures", "public-data");
const API_DIR = path.join(ROOT, "public", "api");

function stripExtension(filename: string): string {
  return filename.replace(/\.(json|geojson)$/i, "");
}

async function walkAndCopy(srcDir: string, destDir: string): Promise<number> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      count += await walkAndCopy(srcPath, path.join(destDir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const destName = stripExtension(entry.name);
    await fs.copyFile(srcPath, path.join(destDir, destName));
    count += 1;
  }
  return count;
}

async function main() {
  await fs.rm(API_DIR, { recursive: true, force: true });
  const copied = await walkAndCopy(FIXTURE_DIR, API_DIR);
  console.log(`Staged ${copied} fixture files into public/api/`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
