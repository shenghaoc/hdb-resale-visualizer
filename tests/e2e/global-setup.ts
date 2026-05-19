import "temporal-polyfill/global";
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default function globalSetup() {
  const fixtureDir = join(process.cwd(), "tests/fixtures/public-data");
  const targetDir = join(process.cwd(), "public/data");

  mkdirSync(targetDir, { recursive: true });
  cpSync(fixtureDir, targetDir, { recursive: true });
}
