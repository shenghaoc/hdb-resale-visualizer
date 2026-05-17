import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const boundaryScript = path.join(repoRoot, "scripts", "check-boundaries.ts");

const tempDirs: string[] = [];

function setupWorkspace(structure: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-check-"));
  tempDirs.push(dir);

  for (const [relativePath, content] of Object.entries(structure)) {
    const targetPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf8");
  }

  return dir;
}

function runBoundaryCheck(cwd: string) {
  return spawnSync(process.execPath, [tsxCli, boundaryScript], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("check-boundaries script", () => {
  it("passes when scripts and shared modules stay outside src", () => {
    const workspace = setupWorkspace({
      "scripts/entry.ts": 'import "./lib/util";\n',
      "scripts/lib/util.ts": 'export { value } from "../../shared/value";\n',
      "shared/value.ts": "export const value = 1;\n",
      "src/runtime.ts": "export const runtimeOnly = true;\n",
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Script boundary check passed");
  });

  it("fails when script graph reaches src through relative import", () => {
    const workspace = setupWorkspace({
      "scripts/entry.ts": 'import "../src/runtime";\n',
      "src/runtime.ts": "export const runtimeOnly = true;\n",
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Script boundary check failed");
    expect(result.stderr).toContain("scripts/entry.ts");
    expect(result.stderr).toContain("reaches src/");
  });

  it("fails when script graph uses forbidden runtime aliases", () => {
    const workspace = setupWorkspace({
      "scripts/entry.ts": 'import value from "@/lib/value";\nexport default value;\n',
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot use Vite alias");
    expect(result.stderr).toContain("@/");
  });
});
