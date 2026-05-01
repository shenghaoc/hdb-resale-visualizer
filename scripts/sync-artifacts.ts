import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(PUBLIC_DIR, "data");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const CACHE_DIR = path.join(ROOT, ".cache", "artifact-sync");
const ARCHIVE_PATH = path.join(CACHE_DIR, "public-data.tar.gz");
const DEFAULT_OBJECT_KEY = "hdb-resale-visualizer/public-data.tar.gz";

type Command = "download" | "upload";

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")}`));
    });
  });
}

async function ensureArchiveDirectory() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function ensurePublicDirectory() {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
}

async function createArchive() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      "public/data/manifest.json is missing. Run `bun run sync-data` before uploading artifacts.",
    );
  }

  await ensureArchiveDirectory();
  await runCommand("tar", ["-czf", ARCHIVE_PATH, "-C", PUBLIC_DIR, "data"]);
}

async function downloadArchiveFromPublicUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact archive from ${url}: ${response.status}`);
  }

  const bytes = await response.arrayBuffer();
  await ensureArchiveDirectory();
  await fs.writeFile(ARCHIVE_PATH, Buffer.from(bytes));
}

async function downloadArchiveWithWrangler(bucket: string, key: string) {
  await ensureArchiveDirectory();
  await runCommand("bunx", [
    "wrangler",
    "r2",
    "object",
    "get",
    `${bucket}/${key}`,
    "--file",
    ARCHIVE_PATH,
    "--remote",
  ]);
}

async function extractArchive() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await ensurePublicDirectory();
  await runCommand("tar", ["-xzf", ARCHIVE_PATH, "-C", PUBLIC_DIR]);

  if (!existsSync(MANIFEST_PATH)) {
    throw new Error("Artifact archive extracted, but public/data/manifest.json is still missing.");
  }
}

async function download() {
  const publicUrl = getEnv("R2_ARTIFACTS_PUBLIC_URL");
  const bucket = getEnv("R2_ARTIFACTS_BUCKET");
  const key = getEnv("R2_ARTIFACTS_OBJECT_KEY") ?? DEFAULT_OBJECT_KEY;

  if (publicUrl) {
    console.log(`Downloading artifact archive from ${publicUrl}...`);
    await downloadArchiveFromPublicUrl(publicUrl);
  } else if (bucket) {
    console.log(`Downloading artifact archive from R2 object ${bucket}/${key}...`);
    await downloadArchiveWithWrangler(bucket, key);
  } else {
    throw new Error(
      "Missing artifact source. Set R2_ARTIFACTS_PUBLIC_URL, or set R2_ARTIFACTS_BUCKET (plus Cloudflare auth).",
    );
  }

  await extractArchive();
  console.log("Artifacts downloaded into public/data.");
}

async function upload() {
  const bucket = getEnv("R2_ARTIFACTS_BUCKET");
  const key = getEnv("R2_ARTIFACTS_OBJECT_KEY") ?? DEFAULT_OBJECT_KEY;

  if (!bucket) {
    throw new Error("R2_ARTIFACTS_BUCKET is required for uploads.");
  }

  await createArchive();
  console.log(`Uploading artifact archive to R2 object ${bucket}/${key}...`);
  await runCommand("bunx", [
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    ARCHIVE_PATH,
    "--content-type",
    "application/gzip",
    "--remote",
  ]);
  console.log("Artifacts uploaded.");
}

async function main() {
  const command = process.argv[2] as Command | undefined;

  if (command !== "download" && command !== "upload") {
    throw new Error("Usage: tsx scripts/sync-artifacts.ts <download|upload>");
  }

  if (command === "download") {
    await download();
    return;
  }

  await upload();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
