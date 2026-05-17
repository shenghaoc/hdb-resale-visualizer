import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT_DIR = process.cwd();
const CHECK_BOUNDARIES_SCRIPT = path.join(ROOT_DIR, "scripts/check-boundaries.ts");
const TSX_BIN = path.join(ROOT_DIR, "node_modules/.bin/tsx");

const tempWorkspaces: string[] = [];

function makeWorkspace(files: Record<string, string>): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "check-boundaries-"));
  tempWorkspaces.push(workspace);

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, "utf8");
  }

  return workspace;
}

function runBoundaryCheck(workspace: string) {
  return spawnSync(TSX_BIN, [CHECK_BOUNDARIES_SCRIPT], {
    cwd: workspace,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

afterEach(() => {
  for (const workspace of tempWorkspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("check-boundaries", () => {
  it("allows scripts to import local script and shared modules", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import { double } from "./lib/math";
        import { baseValue } from "../shared/value";

        export const computedValue = double(baseValue);
      `,
      "scripts/lib/math.ts": `
        export function double(value: number): number {
          return value * 2;
        }
      `,
      "shared/value.ts": `
        export const baseValue = 21;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Script boundary check passed");
  });

  it("rejects direct relative imports from scripts into src", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import { runtimeValue } from "../src/runtime";

        export const value = runtimeValue;
      `,
      "src/runtime.ts": `
        export const runtimeValue = "browser-only";
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Script boundary check failed:");
    expect(result.stderr).toContain("scripts/check.ts");
    expect(result.stderr).toContain("Node-executed import graph reaches src/");
    expect(result.stderr).toContain("src/runtime.ts");
  });

  it("rejects transitive shared imports that reach src", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import { sharedValue } from "../shared/leaky";

        export const value = sharedValue;
      `,
      "shared/leaky.ts": `
        export { runtimeValue as sharedValue } from "../src/runtime";
      `,
      "src/runtime.ts": `
        export const runtimeValue = "browser-only";
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shared/leaky.ts");
    expect(result.stderr).toContain("Node-executed import graph reaches src/");
    expect(result.stderr).toContain("src/runtime.ts");
  });

  it("rejects Vite aliases in static, dynamic, and require imports", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import "@/lib/data";

        void import("@shared/runtime");
        require("@/legacy");
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Vite alias "@/"');
    expect(result.stderr).toContain('Vite alias "@shared/"');
  });
});
