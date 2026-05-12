import fs from "node:fs/promises";
import path from "node:path";
import { CRITICAL_DATA_ARTIFACT_PATHS } from "../artifactContract";
import { type GeneratedArtifacts, townToFilename } from "../pipeline";

const PUBLIC_DATA_DIR = path.join(process.cwd(), "public", "data");
const BLOCKS_DIR = path.join(PUBLIC_DATA_DIR, "blocks");
const DETAILS_DIR = path.join(PUBLIC_DATA_DIR, "details");
const COMPARISONS_DIR = path.join(PUBLIC_DATA_DIR, "comparisons");
const TRENDS_DIR = path.join(PUBLIC_DATA_DIR, path.dirname(CRITICAL_DATA_ARTIFACT_PATHS.townFlatTypeTrend));

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

export async function ensureDataDirectories() {
  await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
  await fs.mkdir(DETAILS_DIR, { recursive: true });
  await fs.mkdir(TRENDS_DIR, { recursive: true });
}

export async function writeGeneratedArtifacts(artifacts: GeneratedArtifacts, mrtGeoJson: unknown) {
  console.log("Writing generated artifacts to public/data/...");
  
  await writeJson(path.join(PUBLIC_DATA_DIR, CRITICAL_DATA_ARTIFACT_PATHS.manifest), artifacts.manifest);
  await writeJson(path.join(PUBLIC_DATA_DIR, CRITICAL_DATA_ARTIFACT_PATHS.blockSummaries), artifacts.blockSummaries);
  await writeJson(path.join(PUBLIC_DATA_DIR, CRITICAL_DATA_ARTIFACT_PATHS.townFlatTypeTrend), artifacts.townFlatTypeTrend);
  await writeJson(path.join(PUBLIC_DATA_DIR, CRITICAL_DATA_ARTIFACT_PATHS.mrtExits), mrtGeoJson);
  
  // Station GeoJSON is built by sync-data or pipeline but we write it here
  // Actually, artifacts.mrtStations is not in GeneratedArtifacts yet, let's check pipeline.ts
  // pipeline.ts has buildMrtStationsGeoJson
}

export async function writeTownBlockFiles(blocksByTown: Record<string, unknown>) {
  await fs.rm(BLOCKS_DIR, { recursive: true, force: true });
  await fs.mkdir(BLOCKS_DIR, { recursive: true });
  for (const [town, blocks] of Object.entries(blocksByTown)) {
    await writeJson(path.join(BLOCKS_DIR, `${townToFilename(town)}.json`), blocks);
  }
  console.log(`Generated ${Object.keys(blocksByTown).length} town-indexed block files.`);
}

export async function writeDetailFiles(details: Record<string, unknown>) {
  await fs.rm(DETAILS_DIR, { recursive: true, force: true });
  await fs.mkdir(DETAILS_DIR, { recursive: true });
  for (const [addressKey, detail] of Object.entries(details)) {
    await writeJson(path.join(DETAILS_DIR, `${addressKey}.json`), detail);
  }
  console.log(`Generated ${Object.keys(details).length} detail files.`);
}

export async function writeComparisonFiles(comparisons?: Record<string, unknown>) {
  await fs.rm(COMPARISONS_DIR, { recursive: true, force: true });
  if (comparisons) {
    await fs.mkdir(COMPARISONS_DIR, { recursive: true });
    for (const [addressKey, comparison] of Object.entries(comparisons)) {
      await writeJson(path.join(COMPARISONS_DIR, `${addressKey}.json`), comparison);
    }
    console.log(`Generated ${Object.keys(comparisons).length} comparison artifacts.`);
  }
}
