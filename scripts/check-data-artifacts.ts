import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data");

const REQUIRED_FILES = [
  "manifest.json",
  "block-summaries.json",
  "trends/town-flat-type.json",
  "mrt-exits.geojson",
  "mrt-stations.geojson",
];

const REQUIRED_DIRS = ["blocks", "details"];

async function main() {
  const missing: string[] = [];
  const emptyDirs: string[] = [];

  for (const file of REQUIRED_FILES) {
    const fullPath = path.join(DATA_DIR, file);
    try {
      await fs.access(fullPath);
    } catch {
      missing.push(file);
    }
  }

  for (const dir of REQUIRED_DIRS) {
    const fullPath = path.join(DATA_DIR, dir);
    try {
      const entries = await fs.readdir(fullPath);
      if (entries.length === 0) {
        emptyDirs.push(dir);
      }
    } catch {
      missing.push(`${dir}/`);
    }
  }

  const errors: string[] = [];
  if (missing.length > 0) {
    errors.push(`Missing:\n${missing.map((f) => `  - ${f}`).join("\n")}`);
  }
  if (emptyDirs.length > 0) {
    errors.push(`Empty directories:\n${emptyDirs.map((d) => `  - ${d}/`).join("\n")}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Data artifact check failed in public/data/:\n${errors.join("\n")}\nRun "bun run sync-data" to generate them.`,
    );
  }

  console.log(
    `Data artifact check passed (${REQUIRED_FILES.length} files, ${REQUIRED_DIRS.length} directories verified).`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
