import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data");

const REQUIRED_ARTIFACTS = [
  "manifest.json",
  "block-summaries.json",
  "trends/town-flat-type.json",
  "mrt-exits.geojson",
  "mrt-stations.geojson",
];

async function main() {
  const missing: string[] = [];

  for (const artifact of REQUIRED_ARTIFACTS) {
    const fullPath = path.join(DATA_DIR, artifact);
    try {
      await fs.access(fullPath);
    } catch {
      missing.push(artifact);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required data artifacts in public/data/:\n${missing.map((f) => `  - ${f}`).join("\n")}\nRun "bun run sync-data" to generate them.`,
    );
  }

  console.log(
    `Data artifact check passed (${REQUIRED_ARTIFACTS.length} files verified).`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
