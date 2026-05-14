import fs from "node:fs/promises";
import path from "node:path";
import {
  assertModulePreloadBudget,
  measureModulePreloads,
  parseModulePreloadHrefs,
  readBudgetLimits,
} from "./lib/bundle-modulepreload-budget";

const DIST_DIR = path.join(process.cwd(), "dist");
const DIST_INDEX_PATH = path.join(DIST_DIR, "index.html");

async function main() {
  const html = await fs.readFile(DIST_INDEX_PATH, "utf8");
  const hrefs = parseModulePreloadHrefs(html);
  const entries = measureModulePreloads(DIST_DIR, hrefs);
  const limits = readBudgetLimits();

  assertModulePreloadBudget(entries, limits);

  const gzipTotal = entries.reduce((sum, e) => sum + e.gzipBytes, 0);
  console.log(
    `Bundle modulepreload budget passed (${entries.length} links, ${gzipTotal} B gzip total, budgets: total ≤ ${limits.gzipTotalMax} B gzip, single ≤ ${limits.gzipSingleMax} B gzip).`,
  );
}

void main();
