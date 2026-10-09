/** Pins actual ingestion/shared SQL source and dependency lock bytes, never local env/data. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unexpected symlink in pinned source tree");
    return entry.isDirectory()
      ? sources(path)
      : entry.isFile() && entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}
export function executionCodeSHA256() {
  const files = [
    ...sources(resolve(root, "scripts/lib")),
    ...sources(resolve(root, "shared")),
    ...sources(resolve(root, "scripts/neon-benchmark")),
    resolve(root, "pnpm-lock.yaml"),
  ].toSorted();
  const hash = createHash("sha256");
  for (const path of files) {
    const bytes = readFileSync(path),
      name = relative(root, path);
    hash.update(`${Buffer.byteLength(name)}:${name}:${bytes.length}:`).update(bytes);
  }
  return hash.digest("hex");
}
